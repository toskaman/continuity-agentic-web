/**
 * @module @continuity/outcome-reconciliation
 * 14-State Explicit Operation State Machine, Idempotency Key Generator, and
 * Post-Dispatch / Unknown-Outcome Reconciliation Engine.
 *
 * Core Reliability Guarantees:
 * 1. Central transition matrix rejects all invalid state jumps.
 * 2. Timeout/disconnect after dispatch NEVER blindly retries — transitions to `UNKNOWN`,
 *    queries provider status using `operation_id` / `idempotency_key`, and reconciles.
 * 3. Reconciler checks provider receipt + date + amount + mission invariants: an apparent
 *    HTTP 200 whose committed price violates the user's approval or mission budget is
 *    flagged `NEEDS_USER` rather than falsely reported as mission success.
 */

import {
  canonicalizeJson,
  sanitizeJson,
  sha256Hex,
  sha256PureHex,
  timingSafeEqualHex,
} from "../shared-schemas/index.js";

const GENESIS_CHAIN_HASH = "0".repeat(64);
const MAX_LEDGER_HISTORY = 4096;

export const OP_STATES = Object.freeze({
  DRAFT: "DRAFT",
  PROPOSED: "PROPOSED",
  PREPARED: "PREPARED",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  APPROVED: "APPROVED",
  DISPATCHED: "DISPATCHED",
  UNKNOWN: "UNKNOWN",
  RECONCILING: "RECONCILING",
  COMMITTED: "COMMITTED",
  FAILED: "FAILED",
  COMPENSATION_PENDING: "COMPENSATION_PENDING",
  COMPENSATED: "COMPENSATED",
  PARTIAL: "PARTIAL",
  NEEDS_USER: "NEEDS_USER",
});

/**
 * Valid directed transitions for the operation state machine.
 */
export const VALID_STATE_TRANSITIONS = Object.freeze({
  DRAFT: new Set(["PROPOSED", "FAILED"]),
  PROPOSED: new Set(["PREPARED", "AWAITING_APPROVAL", "FAILED"]),
  PREPARED: new Set(["AWAITING_APPROVAL", "COMPENSATION_PENDING", "FAILED", "NEEDS_USER"]),
  AWAITING_APPROVAL: new Set(["APPROVED", "COMPENSATION_PENDING", "FAILED", "PROPOSED"]),
  APPROVED: new Set(["DISPATCHED", "FAILED", "AWAITING_APPROVAL"]),
  DISPATCHED: new Set(["COMMITTED", "UNKNOWN", "FAILED", "NEEDS_USER"]),
  UNKNOWN: new Set(["RECONCILING", "NEEDS_USER"]),
  RECONCILING: new Set(["COMMITTED", "FAILED", "UNKNOWN", "NEEDS_USER"]),
  COMMITTED: new Set(["COMPENSATION_PENDING", "PARTIAL"]),
  FAILED: new Set(["PROPOSED", "NEEDS_USER"]),
  COMPENSATION_PENDING: new Set(["COMPENSATED", "NEEDS_USER", "UNKNOWN"]),
  COMPENSATED: new Set([]),
  PARTIAL: new Set(["NEEDS_USER", "COMPENSATION_PENDING"]),
  NEEDS_USER: new Set(["PROPOSED", "AWAITING_APPROVAL", "RECONCILING", "COMPENSATION_PENDING"]),
});

/**
 * Compute deterministic idempotency key for a specific mission change operation.
 * @param {object} spec
 * @param {string} spec.missionId
 * @param {string} spec.commitmentId
 * @param {string} spec.offerId
 * @param {string} spec.proposedDate
 */
export async function deriveIdempotencyKey({ missionId, commitmentId, offerId, proposedDate }) {
  const raw = canonicalizeJson({
    domain: "continuity-idem-v1",
    missionId,
    commitmentId,
    offerId,
    proposedDate,
  });
  const digest = await sha256Hex(raw);
  return `idem_${commitmentId}_${digest.slice(0, 20)}`;
}

/**
 * Append-only ledger & state-machine guard for operations in a mission change plan.
 */
export class OperationLedger {
  constructor() {
    /** @type {Map<string, Record<string, any>>} */
    this.operations = new Map();
    /** @type {Array<Record<string, any>>} */
    this.history = [];
  }

  /**
   * Register a new operation in `DRAFT` state.
   * @param {Record<string, any>} opInit
   */
  createOperation(opInit) {
    const clean = sanitizeJson(opInit);
    if (!clean.operation_id || typeof clean.operation_id !== "string" || clean.operation_id.length > 160) {
      throw new Error("Valid operation_id (<= 160 chars) is required.");
    }
    if (this.operations.has(clean.operation_id)) {
      throw new Error(`Duplicate operation_id "${clean.operation_id}" rejected.`);
    }
    const now = clean.created_at || new Date().toISOString();
    const record = {
      ...clean,
      state: OP_STATES.DRAFT,
      attempts: 0,
      created_at: now,
      updated_at: now,
    };
    this.operations.set(record.operation_id, record);
    this._recordEvent(record.operation_id, null, OP_STATES.DRAFT, "Operation initialized", now);
    return sanitizeJson(record);
  }

  /**
   * Perform a validated state transition and append immutable audit entry.
   * @param {string} operationId
   * @param {string} nextState
   * @param {string} reason
   * @param {Record<string, any>} [patch]
   */
  transition(operationId, nextState, reason, patch = {}) {
    const record = this.operations.get(operationId);
    if (!record) {
      throw new Error(`Operation "${operationId}" does not exist.`);
    }
    const allowed = VALID_STATE_TRANSITIONS[record.state];
    if (!allowed || !allowed.has(nextState)) {
      const err = new Error(
        `Invalid operation state transition for "${operationId}": ${record.state} -> ${nextState} is forbidden.`,
      );
      err.code = "INVALID_STATE_TRANSITION";
      throw err;
    }
    const prevState = record.state;
    const now = patch.updated_at || new Date().toISOString();
    const updated = sanitizeJson({
      ...record,
      ...patch,
      state: nextState,
      updated_at: now,
    });
    this.operations.set(operationId, updated);
    this._recordEvent(operationId, prevState, nextState, reason, now, patch.evidence_summary);
    return sanitizeJson(updated);
  }

  _recordEvent(operationId, fromState, toState, reason, timestamp, evidenceSummary) {
    if (this.history.length >= MAX_LEDGER_HISTORY) {
      throw new Error(`OperationLedger history limit (${MAX_LEDGER_HISTORY}) reached.`);
    }
    const prevHash =
      this.history.length > 0
        ? this.history[this.history.length - 1].entry_hash
        : GENESIS_CHAIN_HASH;
    const eventCore = {
      seq: this.history.length + 1,
      prev_hash: prevHash,
      operation_id: operationId,
      from_state: fromState,
      to_state: toState,
      reason: String(reason),
      ...(evidenceSummary ? { evidence_summary: evidenceSummary } : {}),
      timestamp,
    };
    const entryHash = sha256PureHex(canonicalizeJson(eventCore));
    this.history.push({
      ...eventCore,
      entry_hash: entryHash,
    });
  }

  /**
   * Verify cryptographic tamper-evidence across an exported Saga event log.
   * Rejects modified reasons, reordered sequence numbers, or broken `prev_hash` links.
   *
   * @param {Array<Record<string, any>>} history
   */
  static verifyChainIntegrity(history) {
    if (!Array.isArray(history)) {
      return { valid: false, verifiedEntries: 0, brokenAtSeq: 0, reason: "History is not an array." };
    }
    let expectedPrev = GENESIS_CHAIN_HASH;
    for (let i = 0; i < history.length; i++) {
      const item = history[i];
      if (
        !item
        || item.seq !== i + 1
        || typeof item.prev_hash !== "string"
        || !timingSafeEqualHex(item.prev_hash, expectedPrev)
      ) {
        return {
          valid: false,
          verifiedEntries: i,
          brokenAtSeq: i + 1,
          reason: `Chain linkage broken at seq #${i + 1}.`,
        };
      }
      const { entry_hash, ...core } = item;
      const recomputed = sha256PureHex(canonicalizeJson(core));
      if (typeof entry_hash !== "string" || !timingSafeEqualHex(entry_hash, recomputed)) {
        return {
          valid: false,
          verifiedEntries: i,
          brokenAtSeq: i + 1,
          reason: `SHA-256 entry_hash mismatch at seq #${i + 1} (tampering detected).`,
        };
      }
      expectedPrev = entry_hash;
    }
    return {
      valid: true,
      verifiedEntries: history.length,
      headHash: expectedPrev,
      brokenAtSeq: null,
    };
  }

  getOperation(operationId) {
    const rec = this.operations.get(operationId);
    return rec ? sanitizeJson(rec) : null;
  }

  getAllOperations() {
    return Array.from(this.operations.values()).map((r) => sanitizeJson(r));
  }

  getHistory() {
    return sanitizeJson(this.history);
  }

  exportCompactMerkleTip() {
    const length = this.history.length;
    const headHash = length > 0 ? this.history[length - 1].entry_hash : GENESIS_CHAIN_HASH;
    return Object.freeze({
      length,
      headHash,
      genesisAnchored: length === 0 || this.history[0]?.prev_hash === GENESIS_CHAIN_HASH,
    });
  }
}

/**
 * Reconcile an operation's expected approved specification against observed provider state & receipt.
 *
 * @param {object} params
 * @param {Record<string, any>} params.expectedOp - Approved operation specification
 * @param {Record<string, any>} params.providerStatus - Result from provider's status / commit endpoint
 * @param {import("../proof-verifier/index.js").ReceiptVerifier} [params.receiptVerifier]
 * @returns {Promise<{
 *   outcomeState: string,
 *   safeToRetry: boolean,
 *   verified: boolean,
 *   proofResult: Record<string, any> | null,
 *   discrepancies: string[],
 *   summary: string
 * }>}
 */
export async function reconcileOperationOutcome({ expectedOp, providerStatus, receiptVerifier }) {
  const discrepancies = [];

  if (!providerStatus || typeof providerStatus !== "object") {
    return {
      outcomeState: OP_STATES.NEEDS_USER,
      safeToRetry: false,
      verified: false,
      proofResult: null,
      discrepancies: ["Provider reconciliation returned no structured status."],
      summary: "Provider status unavailable after unknown outcome — retaining guard and requesting human check.",
    };
  }

  // Case A: Provider explicitly confirms idempotency key was NEVER executed
  if (providerStatus.execution_state === "NOT_FOUND_NEVER_EXECUTED") {
    const safeToRetry = Boolean(expectedOp.supports_idempotency);
    return {
      outcomeState: OP_STATES.FAILED,
      safeToRetry,
      verified: true,
      proofResult: null,
      discrepancies: [],
      summary: safeToRetry
        ? "Reconciliation confirmed operation never executed on provider; safe to retry with same idempotency key."
        : "Operation not found, but provider lacks verified idempotency — manual check required before retry.",
    };
  }

  // Case B: Provider reports operation was committed — verify receipt, date, amount, booking_ref, and invariants!
  if (
    providerStatus.execution_state === "COMMITTED"
    || providerStatus.execution_state === "ALREADY_COMMITTED"
    || providerStatus.status === "CONFIRMED"
    || providerStatus.status === "PREPARED_DOSSIER"
  ) {
    let proofResult = null;
    if (receiptVerifier) {
      if (!providerStatus.receipt_envelope) {
        if (expectedOp.requires_signed_receipt !== false) {
          discrepancies.push("Missing signed receipt_envelope from provider when ReceiptVerifier is active.");
        }
      } else {
        proofResult = await receiptVerifier.verifyReceipt(
          expectedOp.provider_id,
          providerStatus.receipt_envelope,
        );
        if (!proofResult.valid) {
          discrepancies.push(`Receipt verification failed (${proofResult.level}): ${proofResult.detail}`);
        }
      }
    }

    const observedBody = providerStatus.receipt_envelope?.receipt_body || providerStatus;

    if (observedBody.provider_id && expectedOp.provider_id && observedBody.provider_id !== expectedOp.provider_id) {
      discrepancies.push(
        `Receipt provider_id "${observedBody.provider_id}" does not match expected "${expectedOp.provider_id}".`,
      );
    }

    if (
      observedBody.booking_ref
      && expectedOp.original_booking_ref
      && !expectedOp.is_replacement_provider
      && observedBody.booking_ref !== expectedOp.original_booking_ref
    ) {
      discrepancies.push(
        `Receipt booking_ref "${observedBody.booking_ref}" does not match "${expectedOp.original_booking_ref}".`,
      );
    }

    if (observedBody.scheduled_date && observedBody.scheduled_date !== expectedOp.proposed_date) {
      discrepancies.push(
        `Provider committed date ${observedBody.scheduled_date}, expected ${expectedOp.proposed_date}.`,
      );
    }

    const expectedBasePlusFeeEur =
      Number(expectedOp.base_price_eur) + Number(expectedOp.change_fee_eur || 0);
    const expectedTotalOpEur =
      expectedBasePlusFeeEur + Number(expectedOp.cancellation_penalty_eur || 0);

    if (
      typeof observedBody.total_charged_eur === "number"
      && Math.abs(observedBody.total_charged_eur - expectedTotalOpEur) > 0.01
    ) {
      discrepancies.push(
        `Provider total €${observedBody.total_charged_eur.toFixed(2)} differs from approved €${expectedTotalOpEur.toFixed(2)}.`,
      );
    } else if (
      observedBody.total_charged_eur === undefined
      && typeof observedBody.total_price_eur === "number"
      && Math.abs(observedBody.total_price_eur - expectedTotalOpEur) > 0.01
      && Math.abs(observedBody.total_price_eur - expectedBasePlusFeeEur) > 0.01
    ) {
      discrepancies.push(
        `Provider total_price_eur €${observedBody.total_price_eur.toFixed(2)} differs from approved €${expectedTotalOpEur.toFixed(2)}.`,
      );
    }

    if (
      observedBody.idempotency_key
      && expectedOp.idempotency_key
      && observedBody.idempotency_key !== expectedOp.idempotency_key
    ) {
      discrepancies.push("Returned receipt idempotency_key does not match dispatched operation.");
    }

    if (discrepancies.length > 0) {
      return {
        outcomeState: OP_STATES.NEEDS_USER,
        safeToRetry: false,
        verified: false,
        proofResult,
        discrepancies,
        summary: `Discrepancy detected during reconciliation: ${discrepancies.join(" ")}`,
      };
    }

    return {
      outcomeState: OP_STATES.COMMITTED,
      safeToRetry: false,
      verified: true,
      proofResult,
      discrepancies: [],
      summary: "Provider state, scheduled date, amount, and cryptographic receipt reconciled cleanly.",
    };
  }

  // Case C: Provider explicitly rejected before side effect
  if (providerStatus.execution_state === "REJECTED_NO_SIDE_EFFECT") {
    return {
      outcomeState: OP_STATES.FAILED,
      safeToRetry: false,
      verified: true,
      proofResult: null,
      discrepancies: [providerStatus.reason || "Provider rejected modification without side effects."],
      summary: providerStatus.reason || "Provider rejected modification; original reservation remains intact.",
    };
  }

  return {
    outcomeState: OP_STATES.NEEDS_USER,
    safeToRetry: false,
    verified: false,
    proofResult: null,
    discrepancies: ["Ambiguous provider reconciliation state."],
    summary: "Provider returned ambiguous state; halting automatic actions and requesting human review.",
  };
}
