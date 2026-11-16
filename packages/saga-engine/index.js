/**
 * @module @continuity/saga-engine
 * Prepare-First, Commit-Last Saga Orchestrator Across Independent Providers.
 *
 * Core Principles Enforced (Part VIII §9 & Part IX §10):
 * 1. Distributed providers are NEVER misrepresented as one ACID transaction.
 * 2. Prepare / Hold precedes Approval; Approval precedes Commit; Commit & Verification
 *    precede releasing any original commitment (when a replacement provider is used).
 * 3. Timeout after dispatch enters `UNKNOWN` -> `RECONCILING` without blind retry.
 * 4. Partial failure mid-saga halts remaining operations, preserves original unreplaced
 *    commitments, and NEVER triggers automatic paid/irreversible compensations without
 *    explicit user authorization.
 */

import { ApprovalEngine } from "../approval-engine/index.js";
import {
  deriveIdempotencyKey,
  OP_STATES,
  OperationLedger,
  reconcileOperationOutcome,
} from "../outcome-reconciliation/index.js";

export class SagaCoordinator {
  /**
   * @param {object} params
   * @param {import("../mission-graph/index.js").MissionGraph} params.graph
   * @param {ApprovalEngine} [params.approvalEngine]
   * @param {OperationLedger} [params.ledger]
   * @param {import("../proof-verifier/index.js").ReceiptVerifier} [params.receiptVerifier]
   */
  constructor({ graph, approvalEngine, ledger, receiptVerifier }) {
    this.graph = graph;
    this.approvalEngine = approvalEngine || new ApprovalEngine();
    this.ledger = ledger || new OperationLedger();
    this.receiptVerifier = receiptVerifier || null;
    this._executing = false;
  }

  static summarizeExecution(execResult) {
    const ops = Array.isArray(execResult?.operations) ? execResult.operations : [];
    const committedOps = ops.filter((o) => o.state === OP_STATES.COMMITTED);
    return Object.freeze({
      status: execResult?.status || "UNKNOWN",
      committedCount: committedOps.length,
      haltedCount: Array.isArray(execResult?.haltedOperationIds) ? execResult.haltedOperationIds.length : 0,
      verifiedSignatureCount: committedOps.filter(
        (o) => o.proof_verification?.level === "VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE",
      ).length,
      totalCommittedSpendEur: Number(
        committedOps
          .reduce(
            (s, o) =>
              s + Number(o.base_price_eur || 0) + Number(o.change_fee_eur || 0) + Number(o.cancellation_penalty_eur || 0),
            0,
          )
          .toFixed(2),
      ),
    });
  }

  /**
   * Stage 1: Prepare all operations in a chosen Minimal-Change Plan.
   * Requests temporary holds where supported by the provider contract; never commits or cancels originals.
   *
   * @param {object} params
   * @param {string} params.missionId
   * @param {Record<string, any>} params.plan - Selected plan from `solveMinimalChangePlans`
   * @param {number} params.maximumBudgetEur
   * @param {Record<string, any>} params.providerClients - Map of `providerId -> { prepareHold?, executeCommit, queryStatus, compensate? }`
   * @param {string} [params.nowIso]
   */
  async preparePlan({ missionId, plan, maximumBudgetEur, providerClients, nowIso, mandateSha256, signal }) {
    if (!plan || !Array.isArray(plan.operations)) {
      throw new Error("preparePlan requires a valid plan with operations[].");
    }
    if (!Number.isFinite(Number(maximumBudgetEur)) || Number(maximumBudgetEur) <= 0) {
      throw new Error("preparePlan requires a positive finite maximumBudgetEur.");
    }
    const now = nowIso || new Date().toISOString();
    const defaultExpiry = new Date(Date.parse(now) + 15 * 60 * 1000).toISOString();
    const preparedOperations = [];
    const placedHoldRefs = [];

    for (const item of plan.operations) {
      signal?.throwIfAborted?.();
      const offer = item.offer;
      const opId = `op_${missionId}_${item.commitment_id}_${offer.offer_id}`;
      const idempotencyKey = await deriveIdempotencyKey({
        missionId,
        commitmentId: item.commitment_id,
        offerId: offer.offer_id,
        proposedDate: offer.proposed_date,
      });

      const opSpec = {
        mission_id: missionId,
        operation_id: opId,
        idempotency_key: idempotencyKey,
        ...(mandateSha256 ? { mandate_sha256: String(mandateSha256) } : {}),
        commitment_id: item.commitment_id,
        commitment_title: item.commitment_title,
        original_booking_ref: item.original_booking_ref,
        original_date: item.original_date,
        provider_id: offer.provider_id,
        provider_name: offer.provider_name,
        provider_origin: offer.provider_origin,
        capability: offer.raw_capability,
        semantic_kind: offer.semantic_kind,
        proposed_date: offer.proposed_date,
        window: offer.window,
        base_price_eur: offer.base_price_eur,
        change_fee_eur: offer.change_fee_eur,
        cancellation_penalty_eur: offer.cancellation_penalty_eur,
        expected_total_eur: Number(
          (
            Number(offer.base_price_eur)
            + Number(offer.change_fee_eur || 0)
            + Number(offer.cancellation_penalty_eur || 0)
          ).toFixed(2),
        ),
        maximum_budget_eur: maximumBudgetEur,
        supports_hold: offer.supports_hold,
        supports_idempotency: offer.supports_idempotency,
        supports_status_reconciliation: offer.supports_status_reconciliation,
        reversible: offer.reversible,
        is_replacement_provider: offer.is_replacement_provider,
        expires_at: offer.expires_at || defaultExpiry,
        arguments: {
          booking_ref: item.original_booking_ref,
          new_date: offer.proposed_date,
          window: offer.window,
          offer_id: offer.offer_id,
          expected_total_eur: Number(
            (
              Number(offer.base_price_eur)
              + Number(offer.change_fee_eur || 0)
              + Number(offer.cancellation_penalty_eur || 0)
            ).toFixed(2),
          ),
          idempotency_key: idempotencyKey,
        },
      };

      this.ledger.createOperation({ ...opSpec, created_at: now });
      this.ledger.transition(opId, OP_STATES.PROPOSED, "Included in selected minimal-change plan", {
        updated_at: now,
      });

      const client = providerClients[offer.provider_id];
      let holdInfo = null;

      if (offer.supports_hold && client && typeof client.prepareHold === "function") {
        const tHold0 = performance.now();
        const holdRes = await client.prepareHold({
          commitmentId: item.commitment_id,
          bookingRef: item.original_booking_ref,
          offerId: offer.offer_id,
          proposedDate: offer.proposed_date,
          window: offer.window,
          idempotencyKey,
        });
        const holdElapsedMs = Number((performance.now() - tHold0).toFixed(2));
        if (!holdRes.ok) {
          this.ledger.transition(opId, OP_STATES.FAILED, `Hold preparation refused: ${holdRes.reason}`, {
            updated_at: now,
          });
          this.graph.updateNode(item.commitment_id, { visual_state: "FAILED" });
          // Clean up any temporary holds placed in earlier steps of this same preparePlan call!
          const rolledBackHoldIds = [];
          for (const prev of placedHoldRefs) {
            try {
              const prevClient = providerClients[prev.providerId];
              if (typeof prevClient?.releaseHold === "function") {
                await prevClient.releaseHold({ holdId: prev.holdId, bookingRef: prev.bookingRef });
              }
              this.ledger.transition(prev.opId, OP_STATES.COMPENSATION_PENDING, "Rolling back partial pre-commit hold", {
                updated_at: now,
              });
              this.ledger.transition(prev.opId, OP_STATES.COMPENSATED, "Released partial hold after downstream refusal", {
                updated_at: now,
              });
              this.graph.updateNode(prev.commitmentId, { visual_state: "UNCHANGED" });
              rolledBackHoldIds.push(prev.holdId);
            } catch {}
          }
          return {
            ok: false,
            failedOperationId: opId,
            rolledBackHoldIds,
            reason: `Preparation failed at ${offer.provider_name}: ${holdRes.reason}. Original reservations remain completely untouched.`,
            operations: this.ledger.getAllOperations(),
          };
        }
        holdInfo = holdRes;
        opSpec.expires_at = holdRes.expires_at || opSpec.expires_at;
        opSpec.arguments.hold_id = holdRes.hold_id;
        placedHoldRefs.push({
          opId,
          commitmentId: item.commitment_id,
          providerId: offer.provider_id,
          holdId: holdRes.hold_id,
          bookingRef: item.original_booking_ref,
        });
        this.ledger.transition(
          opId,
          OP_STATES.PREPARED,
          `Temporary slot hold ${holdRes.hold_id} secured (original booking ${item.original_booking_ref} kept intact)`,
          { hold_id: holdRes.hold_id, hold_elapsed_ms: holdElapsedMs, expires_at: opSpec.expires_at, updated_at: now },
        );
      } else {
        this.ledger.transition(
          opId,
          OP_STATES.PREPARED,
          "Quote & preconditions verified (provider does not use separate slot hold; original booking kept intact)",
          { updated_at: now },
        );
      }

      this.ledger.transition(opId, OP_STATES.AWAITING_APPROVAL, "Ready for explicit bound user approval", {
        updated_at: now,
      });
      this.graph.updateNode(item.commitment_id, { visual_state: "AWAITING_APPROVAL" });
      preparedOperations.push({ ...this.ledger.getOperation(opId), holdInfo });
    }

    return {
      ok: true,
      operations: preparedOperations,
    };
  }

  /**
   * Stage 1b (Safe Reversibility): Explicitly release all prepared pre-commit slot holds
   * at €0.00 cost while keeping original reservations untouched on their baseline dates.
   * Refuses if any operation has already entered `COMMITTED` or `UNKNOWN`.
   *
   * @param {object} [params]
   * @param {Record<string, any>} [params.providerClients]
   * @param {string} [params.reason]
   * @param {string} [params.nowIso]
   */
  async releasePreparedHolds(params = {}) {
    const now = params.nowIso || new Date().toISOString();
    const providerClients = params.providerClients || {};
    const reason = params.reason || "Visitor explicitly released pre-commit holds; original bookings kept untouched.";
    const allOps = this.ledger.getAllOperations();

    if (allOps.some((op) => op.state === OP_STATES.COMMITTED || op.state === OP_STATES.UNKNOWN)) {
      return {
        ok: false,
        reason: "Cannot bulk-release pre-commit holds after commit dispatch has begun.",
        releasedOperationIds: [],
      };
    }

    const releasedIds = [];
    for (const op of allOps) {
      if (op.state !== OP_STATES.AWAITING_APPROVAL && op.state !== OP_STATES.PREPARED) {
        continue;
      }
      this.ledger.transition(
        op.operation_id,
        OP_STATES.COMPENSATION_PENDING,
        "Releasing temporary pre-commit hold at visitor request",
        { updated_at: now },
      );

      const client = providerClients[op.provider_id];
      if (op.hold_id && client && typeof client.releaseHold === "function") {
        try {
          await client.releaseHold({
            holdId: op.hold_id,
            bookingRef: op.original_booking_ref,
          });
        } catch (err) {
          this.ledger.transition(
            op.operation_id,
            OP_STATES.NEEDS_USER,
            `Hold release transport error (${err.message}); original booking ${op.original_booking_ref} remains uncommitted.`,
            { updated_at: now },
          );
          continue;
        }
      }

      this.ledger.transition(
        op.operation_id,
        OP_STATES.COMPENSATED,
        reason,
        {
          evidence_summary: `${op.original_booking_ref} preserved untouched on ${op.original_date} (€0.00 fee)`,
          updated_at: now,
        },
      );
      this.graph.updateNode(op.commitment_id, { visual_state: "UNCHANGED" });
      releasedIds.push(op.operation_id);
    }

    return {
      ok: true,
      feeChargedEur: 0,
      releasedOperationIds: releasedIds,
      operations: this.ledger.getAllOperations(),
      history: this.ledger.getHistory(),
    };
  }

  /**
   * Stage 2: Record explicit human approvals cryptographically bound to each exact operation.
   * @param {Array<string>} operationIds
   * @param {{ nowIso?: string, approvedBy?: string }} [meta]
   */
  async approvePreparedOperations(operationIds, meta = {}) {
    const now = meta.nowIso || new Date().toISOString();
    const approvals = [];

    for (const opId of operationIds) {
      const op = this.ledger.getOperation(opId);
      if (!op) {
        throw new Error(`Cannot approve unknown operation "${opId}".`);
      }
      const bound = await this.approvalEngine.createBoundApproval(op, {
        nowIso: now,
        approvedBy: meta.approvedBy || "human_visitor",
      });
      this.ledger.transition(
        opId,
        OP_STATES.APPROVED,
        `Bound user approval recorded (${bound.approval_id})`,
        {
          approval_id: bound.approval_id,
          approval_hash: bound.approval_hash,
          updated_at: now,
        },
      );
      approvals.push(bound);
    }

    return approvals;
  }

  /**
   * Stage 3: Execute approved operations sequentially with approval verification,
   * unknown-outcome reconciliation, and non-destructive partial-failure handling.
   *
   * @param {object} params
   * @param {Array<{ operationId: string, approvalId: string, currentOpOverride?: Record<string, any> }>} params.approvedItems
   * @param {Record<string, any>} params.providerClients
   * @param {string} [params.nowIso]
   */
  async executeApprovedSaga({ approvedItems, providerClients, nowIso, signal }) {
    if (this._executing) {
      throw new Error("Concurrent executeApprovedSaga re-entrancy blocked.");
    }
    this._executing = true;
    try {
      return await this._executeApprovedSagaInner({ approvedItems, providerClients, nowIso, signal });
    } finally {
      this._executing = false;
    }
  }

  async _executeApprovedSagaInner({ approvedItems, providerClients, nowIso, signal }) {
    const now = nowIso || new Date().toISOString();
    const committed = [];
    const halted = [];
    let partialFailureReason = null;

    for (let i = 0; i < approvedItems.length; i++) {
      signal?.throwIfAborted?.();
      const { operationId, approvalId, currentOpOverride } = approvedItems[i];
      const storedOp = this.ledger.getOperation(operationId);
      if (!storedOp) {
        throw new Error(`Operation "${operationId}" missing from ledger.`);
      }

      const candidateOp = currentOpOverride ? { ...storedOp, ...currentOpOverride } : storedOp;

      // 1. Verify cryptographic approval binding BEFORE dispatching any network write
      const bindingCheck = await this.approvalEngine.verifyApprovalBinding(approvalId, candidateOp, {
        nowIso: now,
        consume: true,
      });

      if (!bindingCheck.valid) {
        this.ledger.transition(
          operationId,
          OP_STATES.AWAITING_APPROVAL,
          `Execution blocked: ${bindingCheck.reason}`,
          { updated_at: now },
        );
        this.graph.updateNode(storedOp.commitment_id, { visual_state: "AWAITING_APPROVAL" });
        partialFailureReason = bindingCheck.reason;
        halted.push(...approvedItems.slice(i).map((x) => x.operationId));
        break;
      }

      // 2. Dispatch to independent provider
      const client = providerClients[storedOp.provider_id];
      if (!client || typeof client.executeCommit !== "function") {
        this.ledger.transition(
          operationId,
          OP_STATES.FAILED,
          `Provider client "${storedOp.provider_id}" unavailable before dispatch.`,
          { updated_at: now },
        );
        this.graph.updateNode(storedOp.commitment_id, { visual_state: "FAILED" });
        partialFailureReason = `Provider "${storedOp.provider_name}" unavailable.`;
        halted.push(...approvedItems.slice(i + 1).map((x) => x.operationId));
        break;
      }

      this.ledger.transition(operationId, OP_STATES.DISPATCHED, "Dispatched with idempotency key", {
        attempts: storedOp.attempts + 1,
        updated_at: now,
      });

      let dispatchResponse = null;
      let timedOutOrDisconnected = false;

      try {
        dispatchResponse = await client.executeCommit({
          operationId,
          idempotencyKey: storedOp.idempotency_key,
          commitmentId: storedOp.commitment_id,
          arguments: storedOp.arguments,
        });
      } catch (err) {
        timedOutOrDisconnected = true;
        this.ledger.transition(
          operationId,
          OP_STATES.UNKNOWN,
          `Transport timeout/disconnect after dispatch (${err.message}); never blindly retrying.`,
          { updated_at: now },
        );
        this.graph.updateNode(storedOp.commitment_id, { visual_state: "UNKNOWN" });
      }

      // 3. If outcome is UNKNOWN, run explicit reconciliation via status endpoint
      if (timedOutOrDisconnected) {
        if (!storedOp.supports_status_reconciliation || typeof client.queryStatus !== "function") {
          this.ledger.transition(
            operationId,
            OP_STATES.NEEDS_USER,
            "Provider lacks status reconciliation endpoint after timeout — halting for human verification.",
            { updated_at: now },
          );
          this.graph.updateNode(storedOp.commitment_id, { visual_state: "NEEDS_USER" });
          partialFailureReason = `Outcome unknown at ${storedOp.provider_name}; status endpoint unavailable.`;
          halted.push(...approvedItems.slice(i + 1).map((x) => x.operationId));
          break;
        }

        this.ledger.transition(
          operationId,
          OP_STATES.RECONCILING,
          `Querying provider status for idempotency_key ${storedOp.idempotency_key}`,
          { updated_at: now },
        );

        let statusPayload = null;
        try {
          statusPayload = await client.queryStatus({
            idempotencyKey: storedOp.idempotency_key,
            bookingRef: storedOp.original_booking_ref,
          });
        } catch {
          statusPayload = null;
        }

        const reconciled = await reconcileOperationOutcome({
          expectedOp: storedOp,
          providerStatus: statusPayload,
          receiptVerifier: this.receiptVerifier,
        });

        if (reconciled.outcomeState === OP_STATES.COMMITTED) {
          this._markNodeAndOpCommitted(storedOp, statusPayload, reconciled, now);
          committed.push(operationId);
          continue;
        }

        if (reconciled.outcomeState === OP_STATES.FAILED && reconciled.safeToRetry) {
          this.ledger.transition(operationId, OP_STATES.FAILED, reconciled.summary, { updated_at: now });
          this.graph.updateNode(storedOp.commitment_id, { visual_state: "FAILED" });
          partialFailureReason = reconciled.summary;
          halted.push(...approvedItems.slice(i + 1).map((x) => x.operationId));
          break;
        }

        this.ledger.transition(operationId, OP_STATES.NEEDS_USER, reconciled.summary, {
          discrepancies: reconciled.discrepancies,
          updated_at: now,
        });
        this.graph.updateNode(storedOp.commitment_id, { visual_state: "NEEDS_USER" });
        partialFailureReason = reconciled.summary;
        halted.push(...approvedItems.slice(i + 1).map((x) => x.operationId));
        break;
      }

      // 4. Normal response path: still reconcile receipt, date, amount, and signature!
      const reconciled = await reconcileOperationOutcome({
        expectedOp: storedOp,
        providerStatus: dispatchResponse,
        receiptVerifier: this.receiptVerifier,
      });

      if (reconciled.outcomeState === OP_STATES.COMMITTED) {
        this._markNodeAndOpCommitted(storedOp, dispatchResponse, reconciled, now);
        committed.push(operationId);
      } else {
        const targetState =
          reconciled.outcomeState === OP_STATES.FAILED ? OP_STATES.FAILED : OP_STATES.NEEDS_USER;
        this.ledger.transition(operationId, targetState, reconciled.summary, {
          discrepancies: reconciled.discrepancies,
          updated_at: now,
        });
        this.graph.updateNode(storedOp.commitment_id, {
          visual_state: targetState === OP_STATES.FAILED ? "FAILED" : "NEEDS_USER",
        });
        partialFailureReason = reconciled.summary;
        halted.push(...approvedItems.slice(i + 1).map((x) => x.operationId));
        break;
      }
    }

    // Build Compensation Advisory if partial failure happened after >=1 commit.
    // Rule: NEVER auto-compensate operations with fees or irreversibility; surface explicit options.
    const compensationAdvisories = [];
    if (partialFailureReason && committed.length > 0) {
      for (const committedOpId of committed) {
        const op = this.ledger.getOperation(committedOpId);
        compensationAdvisories.push({
          operation_id: committedOpId,
          commitment_id: op.commitment_id,
          provider_name: op.provider_name,
          reversible: op.reversible,
          automatic_compensation_executed: false,
          policy_reason: op.reversible
            ? "Reversible dossier update; requires explicit user confirmation before rolling back."
            : "Irreversible provider modification; automatic rollback forbidden to prevent unauthorized fees.",
        });
      }
    }

    return {
      status:
        partialFailureReason === null
          ? "ALL_COMMITTED_AND_VERIFIED"
          : committed.length > 0
            ? "PARTIAL_HALTED_SAFE"
            : "HALTED_BEFORE_COMMIT",
      committedOperationIds: committed,
      haltedOperationIds: halted,
      partialFailureReason,
      compensationAdvisories,
      operations: this.ledger.getAllOperations(),
      history: this.ledger.getHistory(),
    };
  }

  _markNodeAndOpCommitted(storedOp, providerResponse, reconciled, now) {
    const body = providerResponse?.receipt_envelope?.receipt_body || providerResponse || {};
    const newBookingRef = body.booking_ref || storedOp.original_booking_ref;
    const newStatus =
      storedOp.semantic_kind === "PREPARE_PERMIT_DOSSIER" ? "PREPARED_DOSSIER" : "CONFIRMED";

    this.ledger.transition(storedOp.operation_id, OP_STATES.COMMITTED, reconciled.summary, {
      receipt_envelope: providerResponse?.receipt_envelope || null,
      ...(providerResponse?.handoff_token ? { handoff_token: providerResponse.handoff_token } : {}),
      proof_verification: reconciled.proofResult || null,
      evidence_summary: `${newBookingRef} -> ${storedOp.proposed_date} (${reconciled.proofResult?.level || "VERIFIED_STATE"})`,
      updated_at: now,
    });

    this.graph.updateNode(storedOp.commitment_id, {
      provider_id: storedOp.provider_id,
      provider_name: storedOp.provider_name,
      provider_origin: storedOp.provider_origin,
      booking_ref: newBookingRef,
      status: newStatus,
      scheduled_date: storedOp.proposed_date,
      window: storedOp.window,
      price_eur: Number((Number(storedOp.base_price_eur) + Number(storedOp.change_fee_eur || 0)).toFixed(2)),
      visual_state: "COMMITTED",
      observed: {
        verified: true,
        last_verified_at: now,
        evidence_trust: reconciled.proofResult?.level || "UNSIGNED_PROVIDER_RESPONSE",
        receipt_id: body.receipt_id || newBookingRef,
      },
    });
  }
}
