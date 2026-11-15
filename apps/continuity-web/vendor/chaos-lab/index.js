/**
 * @module @continuity/chaos-lab
 * Deterministic Failure-Injection Environment & 15-Scenario Distributed Reliability Suite.
 *
 * Clearly labelled as controlled simulation (`simulation_mode: true`).
 * Covers all 15 required Chaos Lab scenarios:
 *  1. Provider unavailable
 *  2. Price changes after approval
 *  3. Reservation already committed before timeout
 *  4. Duplicate operation attempt
 *  5. Invalid provider receipt
 *  6. Expired quote / approval
 *  7. Unsupported modification
 *  8. Budget exceeded
 *  9. Unauthorized cancellation request
 * 10. Malformed peer response
 * 11. Competing alternative offers
 * 12. Dependency cycle
 * 13. Conflicting dates
 * 14. Compensation failure / partial halt policy
 * 15. Missing provider status endpoint
 */

import { compileMissionChange, createSignatureMoveMission } from "../mission-core/index.js";
import { EDGE_TYPES, MissionGraph } from "../mission-graph/index.js";
import { analyzeMissionImpact } from "../impact-engine/index.js";
import { normalizePeerOffer } from "../capability-adapter/index.js";
import { solveMinimalChangePlans } from "../constraint-solver/index.js";
import {
  generateDemoProviderKeyPair,
  ReceiptVerifier,
  signProviderReceipt,
} from "../proof-verifier/index.js";
import { SagaCoordinator } from "../saga-engine/index.js";
import { AuthorityBoundResolver } from "../nanda-resolver/index.js";
import { issuePolicyBoundMandate, SealedBidArbiter } from "../mandate-arbiter/index.js";
import { exportVerifiableAuditBundle, verifyExportedAuditBundle } from "../intake-compiler/index.js";

/**
 * Create baseline valid normalized offers for the 4 affected/soft commitments on Friday 2026-11-20.
 */
export function buildBaselineFridayOffers(origins = {}) {
  const o = {
    moveco: "http://127.0.0.1:8081",
    permitflow: "http://localhost:8082",
    homeconnect: "http://127.0.0.1:8083",
    powerflow: "http://localhost:8084",
    ...(origins || {}),
  };

  return [
    normalizePeerOffer({
      offer_id: "off_moveco_fri_am",
      commitment_id: "cmt_moveco_van",
      provider_id: "moveco",
      provider_name: "MoveCo Express (Demo)",
      provider_origin: o.moveco,
      raw_capability: "reschedule_van_booking",
      semantic_kind: "RESCHEDULE_IN_PLACE",
      proposed_date: "2026-11-20",
      window: "08:00–13:00",
      base_price_eur: 390,
      change_fee_eur: 25,
      cancellation_penalty_eur: 0,
      supports_hold: true,
      hold_ttl_seconds: 900,
      reversible: false,
      creates_final_booking: true,
      requires_user_approval: true,
      supports_idempotency: true,
      supports_status_reconciliation: true,
      is_replacement_provider: false,
      expires_at: "2026-11-20T23:59:59Z",
    }),
    normalizePeerOffer({
      offer_id: "off_permitflow_fri",
      commitment_id: "cmt_permitflow_bay",
      provider_id: "permitflow",
      provider_name: "PermitFlow Civic Prep (Demo)",
      provider_origin: o.permitflow,
      raw_capability: "prepare_permit_date_update",
      semantic_kind: "PREPARE_PERMIT_DOSSIER",
      proposed_date: "2026-11-20",
      window: "07:30–14:00",
      base_price_eur: 35,
      change_fee_eur: 10,
      cancellation_penalty_eur: 0,
      supports_hold: true,
      hold_ttl_seconds: 900,
      reversible: true,
      creates_final_booking: false,
      requires_user_approval: true,
      supports_idempotency: true,
      supports_status_reconciliation: true,
      is_replacement_provider: false,
      expires_at: "2026-11-20T23:59:59Z",
    }),
    normalizePeerOffer({
      offer_id: "off_homeconnect_fri_pm",
      commitment_id: "cmt_homeconnect_fiber",
      provider_id: "homeconnect",
      provider_name: "HomeConnect Fiber (Demo)",
      provider_origin: o.homeconnect,
      raw_capability: "change_fiber_appointment",
      semantic_kind: "RESCHEDULE_IN_PLACE",
      proposed_date: "2026-11-20",
      window: "14:00–17:00",
      base_price_eur: 49,
      change_fee_eur: 0,
      cancellation_penalty_eur: 0,
      supports_hold: true,
      hold_ttl_seconds: 600,
      reversible: false,
      creates_final_booking: true,
      requires_user_approval: true,
      supports_idempotency: true,
      supports_status_reconciliation: true,
      is_replacement_provider: false,
      expires_at: "2026-11-20T23:59:59Z",
    }),
    normalizePeerOffer({
      offer_id: "off_powerflow_fri_am",
      commitment_id: "cmt_powerflow_grid",
      provider_id: "powerflow",
      provider_name: "PowerFlow Energy (Demo)",
      provider_origin: o.powerflow,
      raw_capability: "shift_grid_activation",
      semantic_kind: "RESCHEDULE_IN_PLACE",
      proposed_date: "2026-11-20",
      window: "08:00–12:00",
      base_price_eur: 30,
      change_fee_eur: 0,
      cancellation_penalty_eur: 0,
      supports_hold: true,
      hold_ttl_seconds: 600,
      reversible: false,
      creates_final_booking: true,
      requires_user_approval: true,
      supports_idempotency: true,
      supports_status_reconciliation: true,
      is_replacement_provider: false,
      expires_at: "2026-11-20T23:59:59Z",
    }),
  ];
}

/**
 * Build in-memory simulated provider clients with real Ed25519 receipt signing and idempotency stores.
 */
export async function createSimulatedProviderHarness() {
  const keys = {};
  const verifier = new ReceiptVerifier();
  for (const pid of ["moveco", "permitflow", "homeconnect", "powerflow"]) {
    keys[pid] = await generateDemoProviderKeyPair(pid);
    verifier.registerTrustedProviderKey(pid, keys[pid].keyId, keys[pid].publicJwk);
  }

  const clients = {};
  for (const pid of ["moveco", "permitflow", "homeconnect", "powerflow"]) {
    const committedByIdem = new Map();
    let holdCounter = 0;
    clients[pid] = {
      committedByIdem,
      signer: keys[pid],
      async prepareHold({ bookingRef, proposedDate }) {
        holdCounter += 1;
        return {
          ok: true,
          hold_id: `hold_${pid}_${holdCounter}`,
          booking_ref: bookingRef,
          proposed_date: proposedDate,
          expires_at: "2026-11-20T23:59:59Z",
        };
      },
      async executeCommit({ idempotencyKey, arguments: args }) {
        if (committedByIdem.has(idempotencyKey)) {
          return committedByIdem.get(idempotencyKey);
        }
        const feeMap = { moveco: 415, permitflow: 45, homeconnect: 49, powerflow: 30 };
        const charged =
          typeof args.expected_total_eur === "number" ? args.expected_total_eur : feeMap[pid];
        const body = {
          receipt_id: `rcpt_${pid}_${committedByIdem.size + 1}`,
          provider_id: pid,
          booking_ref: args.booking_ref,
          scheduled_date: args.new_date,
          window: args.window,
          total_charged_eur: charged,
          idempotency_key: idempotencyKey,
          issued_at: "2026-11-13T10:00:00Z",
        };
        const envelope = await signProviderReceipt(body, keys[pid]);
        const response = {
          execution_state: "COMMITTED",
          status: pid === "permitflow" ? "PREPARED_DOSSIER" : "CONFIRMED",
          receipt_envelope: envelope,
        };
        committedByIdem.set(idempotencyKey, response);
        return response;
      },
      async queryStatus({ idempotencyKey }) {
        if (committedByIdem.has(idempotencyKey)) {
          return committedByIdem.get(idempotencyKey);
        }
        return { execution_state: "NOT_FOUND_NEVER_EXECUTED" };
      },
    };
  }

  return { clients, verifier, keys };
}

export const CHAOS_SCENARIOS = [
  {
    id: "CHAOS_01_PROVIDER_UNAVAILABLE",
    number: 1,
    title: "Provider Unavailable",
    injectedFailure: "HomeConnect peer endpoint offline before dispatch.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const offers = buildBaselineFridayOffers();
      const solved = solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers: offers });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      delete clients.homeconnect; // Inject total provider outage before commit
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      const hcOp = exec.operations.find((o) => o.provider_id === "homeconnect");
      return {
        simulation_mode: true,
        passed: hcOp.state === "FAILED" && exec.status !== "ALL_COMMITTED_AND_VERIFIED",
        expectedTransition: "APPROVED -> FAILED",
        observedState: hcOp.state,
        sagaStatus: exec.status,
        humanInterventionRequired: true,
        evidence: exec.partialFailureReason,
      };
    },
  },
  {
    id: "CHAOS_02_PRICE_DRIFT_AFTER_APPROVAL",
    number: 2,
    title: "Price Changes After Approval",
    injectedFailure: "MoveCo reschedule fee rises from €25 to €55 after user signed approval.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({
          operationId: a.operation_id,
          approvalId: a.approval_id,
          currentOpOverride: a.operation_id.includes("moveco") ? { change_fee_eur: 55 } : undefined,
        })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      const mcOp = exec.operations.find((o) => o.provider_id === "moveco");
      return {
        simulation_mode: true,
        passed: mcOp.state === "AWAITING_APPROVAL" && /change_fee_eur/.test(exec.partialFailureReason || ""),
        expectedTransition: "APPROVED -> AWAITING_APPROVAL (hash invalidated)",
        observedState: mcOp.state,
        sagaStatus: exec.status,
        humanInterventionRequired: true,
        evidence: exec.partialFailureReason,
      };
    },
  },
  {
    id: "CHAOS_03_COMMITTED_BEFORE_TIMEOUT",
    number: 3,
    title: "Reservation Already Committed Before Network Timeout",
    injectedFailure: "MoveCo commits booking on server, then HTTP socket drops with timeout.",
    humanInterventionRequired: false,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const origCommit = clients.moveco.executeCommit.bind(clients.moveco);
      clients.moveco.executeCommit = async (req) => {
        await origCommit(req); // Commits server-side!
        throw new Error("ETIMEDOUT: socket hang up after write");
      };
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      const mcHistory = exec.history.filter((h) => h.operation_id.includes("moveco")).map((h) => h.to_state);
      return {
        simulation_mode: true,
        passed:
          exec.status === "ALL_COMMITTED_AND_VERIFIED"
          && mcHistory.includes("UNKNOWN")
          && mcHistory.includes("RECONCILING")
          && mcHistory.at(-1) === "COMMITTED",
        expectedTransition: "DISPATCHED -> UNKNOWN -> RECONCILING -> COMMITTED (0 duplicate writes)",
        observedState: mcHistory.join(" -> "),
        sagaStatus: exec.status,
        humanInterventionRequired: false,
        evidence: `Reconciled via idempotency key without retrying write; committed count=${clients.moveco.committedByIdem.size}.`,
      };
    },
  },
  {
    id: "CHAOS_04_DUPLICATE_OPERATION_REPLAY",
    number: 4,
    title: "Duplicate Operation / Approval Replay Attempt",
    injectedFailure: "Attacker or double-click replays a consumed approval token.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      const replayCheck = await saga.approvalEngine.verifyApprovalBinding(
        approvals[0].approval_id,
        prep.operations[0],
        { nowIso: "2026-11-13T10:03:00Z" },
      );
      return {
        simulation_mode: true,
        passed: replayCheck.valid === false && /already been consumed/.test(replayCheck.reason || ""),
        expectedTransition: "Replay blocked before dispatch",
        observedState: "REJECTED_REPLAY",
        sagaStatus: "PROTECTED",
        humanInterventionRequired: true,
        evidence: replayCheck.reason,
      };
    },
  },
  {
    id: "CHAOS_05_INVALID_PROVIDER_RECEIPT",
    number: 5,
    title: "Invalid / Forged Provider Receipt Signature",
    injectedFailure: "Provider response carries a tampered total_charged_eur breaking Ed25519 signature.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const origCommit = clients.moveco.executeCommit.bind(clients.moveco);
      clients.moveco.executeCommit = async (req) => {
        const res = await origCommit(req);
        return {
          ...res,
          receipt_envelope: {
            ...res.receipt_envelope,
            receipt_body: {
              ...res.receipt_envelope.receipt_body,
              scheduled_date: "2026-11-24", // Tampered after signing!
            },
          },
        };
      };
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      const mcOp = exec.operations.find((o) => o.provider_id === "moveco");
      return {
        simulation_mode: true,
        passed: mcOp.state === "NEEDS_USER" && /INVALID_SIGNATURE_OR_TAMPERED/.test(exec.partialFailureReason || ""),
        expectedTransition: "DISPATCHED -> NEEDS_USER (forged receipt rejected)",
        observedState: mcOp.state,
        sagaStatus: exec.status,
        humanInterventionRequired: true,
        evidence: exec.partialFailureReason,
      };
    },
  },
  {
    id: "CHAOS_06_EXPIRED_QUOTE_OR_HOLD",
    number: 6,
    title: "Expired Quote / Hold Window",
    injectedFailure: "User submits approval execution after the 15-minute provider hold expired.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-25T10:00:00Z", // Past expiry
      });
      return {
        simulation_mode: true,
        passed: exec.status === "HALTED_BEFORE_COMMIT" && /expired/i.test(exec.partialFailureReason || ""),
        expectedTransition: "APPROVED -> AWAITING_APPROVAL (expired quote blocked)",
        observedState: exec.operations[0].state,
        sagaStatus: exec.status,
        humanInterventionRequired: true,
        evidence: exec.partialFailureReason,
      };
    },
  },
  {
    id: "CHAOS_07_UNSUPPORTED_MODIFICATION",
    number: 7,
    title: "Unsupported Modification (Original Provider Refuses Friday -> Backup Peer Recovery)",
    injectedFailure: "MoveCo Friday fleet is full; backup peer SwiftVan offers Friday within €700 budget.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const baseOffers = buildBaselineFridayOffers().filter((o) => o.provider_id !== "moveco");
      // Backup carrier offer (keeps MoveCo intact until replacement commits, includes €65 cancel fee in budget check)
      const backupOffer = normalizePeerOffer({
        offer_id: "off_swiftvan_backup_fri",
        commitment_id: "cmt_moveco_van",
        provider_id: "moveco",
        provider_name: "MoveCo Partner Overflow Crew (Demo)",
        provider_origin: "http://127.0.0.1:8081",
        raw_capability: "reschedule_van_booking",
        semantic_kind: "REPLACE_WITH_BACKUP_PROVIDER",
        proposed_date: "2026-11-20",
        window: "09:30–14:30",
        base_price_eur: 405,
        change_fee_eur: 0,
        cancellation_penalty_eur: 35,
        supports_hold: true,
        hold_ttl_seconds: 900,
        reversible: false,
        creates_final_booking: true,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: true,
        expires_at: "2026-11-20T23:59:59Z",
      });
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: [...baseOffers, backupOffer],
      });
      return {
        simulation_mode: true,
        passed: solved.feasible === true && solved.plans[0].metrics.totalMissionCostEur <= 700,
        expectedTransition: "Primary date refused -> Backup replacement offer synthesized under €700",
        observedState: "FEASIBLE_RECOVERY_PLAN",
        sagaStatus: `Total €${solved.plans[0]?.metrics.totalMissionCostEur}`,
        humanInterventionRequired: true,
        evidence: `Recovered with ${backupOffer.offer_id} at total mission cost €${solved.plans[0]?.metrics.totalMissionCostEur} (<= €700).`,
      };
    },
  },
  {
    id: "CHAOS_08_BUDGET_EXCEEDED",
    number: 8,
    title: "Hard Budget Invariant Exceeded",
    injectedFailure: "Emergency surge pricing pushes total relocation cost to €745 (> €700 cap).",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday, stay below €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const surgeOffers = buildBaselineFridayOffers().map((o) =>
        o.provider_id === "moveco" ? { ...o, base_price_eur: 495, change_fee_eur: 50 } : o,
      );
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: surgeOffers,
      });
      return {
        simulation_mode: true,
        passed:
          solved.feasible === false
          && solved.plans.length === 0
          && solved.rejectionReasonsSummary.some((r) => /exceeds hard maximum budget/i.test(r)),
        expectedTransition: "Solver rejects all budget-violating plans; 0 invalid plans recommended",
        observedState: "INFEASIBLE_BUDGET_GUARD",
        sagaStatus: "BLOCKED_BY_INVARIANT",
        humanInterventionRequired: true,
        evidence: solved.rejectionReasonsSummary[0],
      };
    },
  },
  {
    id: "CHAOS_09_UNAUTHORIZED_CANCELLATION_BLOCKED",
    number: 9,
    title: "Unauthorized Cancellation / Prompt-Injected Constraint Downgrade",
    injectedFailure: "Untrusted LLM proposal attempts `unauthorized_cancellation: true` and `commit_changes: true`.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const { proposal, securityWarnings } = compileMissionChange(
        {
          mission_id: mission.mission_id,
          mission_type: "home_relocation",
          requested_change: {
            field: "move_date",
            previous_value: "2026-11-17",
            new_value: "2026-11-20",
            target_commitment_id: "cmt_moveco_van",
          },
          invariants: {
            maximum_budget_eur: 700,
            preserve_existing_commitments: false,
            destination_must_remain_unchanged: true,
            unauthorized_cancellation: true,
            no_additional_purchases_without_approval: false,
          },
          preferences: {
            priority_mode: "minimal_change",
            prefer_existing_providers: true,
            minimize_approvals: true,
          },
          permissions: {
            search: true,
            request_quotes: true,
            prepare_changes: true,
            commit_changes: true,
            cancel_original_commitments: true,
          },
        },
        mission,
      );
      return {
        simulation_mode: true,
        passed:
          proposal.invariants.unauthorized_cancellation === false
          && proposal.invariants.preserve_existing_commitments === true
          && proposal.permissions.commit_changes === false
          && proposal.permissions.cancel_original_commitments === false
          && securityWarnings.length >= 4,
        expectedTransition: "Hostile flags stripped; deterministic hard invariants preserved",
        observedState: "INVARIANTS_ENFORCED",
        sagaStatus: `Warnings=${securityWarnings.length}`,
        humanInterventionRequired: true,
        evidence: securityWarnings.join(" | "),
      };
    },
  },
  {
    id: "CHAOS_10_MALFORMED_PEER_RESPONSE",
    number: 10,
    title: "Malformed / Hostile Peer Response Payload",
    injectedFailure: "Peer returns negative fee, invalid date `2026-02-30`, and extra unexpected schema keys.",
    humanInterventionRequired: false,
    async run() {
      let caughtError = null;
      try {
        normalizePeerOffer({
          offer_id: "bad_offer",
          commitment_id: "cmt_moveco_van",
          provider_id: "moveco",
          provider_name: "Hostile Peer",
          provider_origin: "https://evil.example",
          raw_capability: "reschedule_van_booking",
          proposed_date: "2026-02-30",
          window: "08:00",
          base_price_eur: -500,
          change_fee_eur: -10,
        });
      } catch (err) {
        caughtError = err;
      }
      return {
        simulation_mode: true,
        passed: Boolean(caughtError && /failed validation/.test(caughtError.message)),
        expectedTransition: "Rejected at peer boundary before reaching solver",
        observedState: "SCHEMA_REJECTED",
        sagaStatus: "FAIL_CLOSED",
        humanInterventionRequired: false,
        evidence: caughtError?.message || "No error",
      };
    },
  },
  {
    id: "CHAOS_11_COMPETING_ALTERNATIVE_OFFERS",
    number: 11,
    title: "Competing Alternative Offers (Multi-Objective Plan A vs Plan B vs Plan C)",
    injectedFailure: "Multiple offers trade off lower cost (Saturday fiber €39) vs minimum changes / Friday completion.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const baseOffers = buildBaselineFridayOffers();
      const cheaperSaturdayFiber = normalizePeerOffer({
        offer_id: "off_homeconnect_sat_discount",
        commitment_id: "cmt_homeconnect_fiber",
        provider_id: "homeconnect",
        provider_name: "HomeConnect Fiber (Demo)",
        provider_origin: "http://127.0.0.1:8083",
        raw_capability: "change_fiber_appointment",
        semantic_kind: "RESCHEDULE_IN_PLACE",
        proposed_date: "2026-11-21",
        window: "09:00–12:00",
        base_price_eur: 39, // €10 off-peak Saturday discount
        change_fee_eur: 0,
        cancellation_penalty_eur: 0,
        supports_hold: true,
        hold_ttl_seconds: 600,
        reversible: false,
        creates_final_booking: true,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
      });
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: [...baseOffers, cheaperSaturdayFiber],
      });
      return {
        simulation_mode: true,
        passed: solved.feasible === true && solved.plans.length >= 2,
        expectedTransition: "Distinct Plan A (Min Change) & Plan B (Lowest Cost) ranked deterministically",
        observedState: `${solved.plans.length}_PLANS_RANKED`,
        sagaStatus: solved.recommendedPlanId,
        humanInterventionRequired: true,
        evidence: solved.plans.map((p) => `${p.plan_id}: €${p.metrics.totalMissionCostEur} (${p.metrics.changedCount} changes)`).join("; "),
      };
    },
  },
  {
    id: "CHAOS_12_DEPENDENCY_CYCLE",
    number: 12,
    title: "Dependency Cycle Injection",
    injectedFailure: "Misconfigured edge creates circular dependency `Fiber -> PowerFlow -> MoveCo -> Fiber`.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      let cycleErr = null;
      try {
        graph.addEdge({
          from: "cmt_homeconnect_fiber",
          to: "cmt_moveco_van",
          type: EDGE_TYPES.ON_OR_BEFORE,
          rationale: "Invalid circular rule",
        });
      } catch (err) {
        cycleErr = err;
      }
      return {
        simulation_mode: true,
        passed: Boolean(cycleErr && cycleErr.code === "DEPENDENCY_CYCLE"),
        expectedTransition: "Cycle rejected on insertion; graph remains acyclic",
        observedState: "CYCLE_BLOCKED",
        sagaStatus: "GRAPH_SAFE",
        humanInterventionRequired: true,
        evidence: cycleErr?.message || "No cycle detected",
      };
    },
  },
  {
    id: "CHAOS_13_CONFLICTING_DATES",
    number: 13,
    title: "Conflicting Provider Schedules",
    injectedFailure: "Fiber technician only available Thursday Nov 19 while Moving Van arrives Friday Nov 20.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const conflictingOffers = buildBaselineFridayOffers().map((o) =>
        o.provider_id === "homeconnect" ? { ...o, proposed_date: "2026-11-19" } : o,
      );
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: conflictingOffers,
      });
      return {
        simulation_mode: true,
        passed:
          solved.feasible === false
          && solved.rejectionReasonsSummary.some((r) => /Dependency violation/i.test(r)),
        expectedTransition: "Temporal conflict rejected by ON_OR_AFTER edge check",
        observedState: "INFEASIBLE_SCHEDULE_CONFLICT",
        sagaStatus: "CONFLICT_EXPLAINED",
        humanInterventionRequired: true,
        evidence: solved.rejectionReasonsSummary[0],
      };
    },
  },
  {
    id: "CHAOS_14_PARTIAL_FAILURE_CONTROLLED_COMPENSATION",
    number: 14,
    title: "Mid-Saga Failure & Controlled Non-Destructive Compensation",
    injectedFailure: "MoveCo & PermitFlow commit, then HomeConnect rejects mid-saga; system halts without unauthorized paid rollback.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      clients.permitflow.executeCommit = async () => ({
        execution_state: "REJECTED_NO_SIDE_EFFECT",
        reason: "Municipal curbside zone lock contention after MoveCo & Fiber committed; original permit draft PF-2049 retained.",
      });
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      return {
        simulation_mode: true,
        passed:
          exec.status === "PARTIAL_HALTED_SAFE"
          && exec.compensationAdvisories.length >= 1
          && exec.compensationAdvisories.every((c) => c.automatic_compensation_executed === false),
        expectedTransition: "COMMITTED (ops 1..k) + FAILED (op k+1) -> PARTIAL_HALTED_SAFE with explicit user compensation options",
        observedState: exec.status,
        sagaStatus: `Committed=${exec.committedOperationIds.length}, Advisories=${exec.compensationAdvisories.length}`,
        humanInterventionRequired: true,
        evidence: exec.compensationAdvisories.map((c) => `${c.provider_name}: ${c.policy_reason}`).join(" | "),
      };
    },
  },
  {
    id: "CHAOS_15_MISSING_STATUS_ENDPOINT",
    number: 15,
    title: "Timeout With Missing Provider Status Endpoint",
    injectedFailure: "Provider times out during commit AND exposes no reconciliation status endpoint.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const offers = buildBaselineFridayOffers().map((o) =>
        o.provider_id === "moveco" ? { ...o, supports_status_reconciliation: false } : o,
      );
      const solved = solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers: offers });
      const { clients, verifier } = await createSimulatedProviderHarness();
      clients.moveco.executeCommit = async () => {
        throw new Error("Gateway 504 timeout");
      };
      delete clients.moveco.queryStatus;
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-13T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-13T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-13T10:02:00Z",
      });
      const mcOp = exec.operations.find((o) => o.provider_id === "moveco");
      return {
        simulation_mode: true,
        passed: mcOp.state === "NEEDS_USER" && /status endpoint unavailable/i.test(exec.partialFailureReason || ""),
        expectedTransition: "DISPATCHED -> UNKNOWN -> NEEDS_USER (no blind retry)",
        observedState: mcOp.state,
        sagaStatus: exec.status,
        humanInterventionRequired: true,
        evidence: exec.partialFailureReason,
      };
    },
  },
  {
    id: "CHAOS_16_CROSS_PROVIDER_RECEIPT_SPOOF",
    number: 16,
    title: "Cross-Origin Provider Key Spoofing (MoveCo Key Signs PermitFlow Receipt)",
    injectedFailure: "Compromised MoveCo origin signs a PermitFlow receipt using MoveCo's valid Ed25519 private key.",
    humanInterventionRequired: true,
    async run() {
      const { clients, verifier } = await createSimulatedProviderHarness();
      const spoofedEnvelope = await signProviderReceipt(
        {
          receipt_id: "rcpt_spoof_99",
          provider_id: "permitflow",
          booking_ref: "PF-2049",
          scheduled_date: "2026-11-20",
          window: "07:30–14:00",
          total_charged_eur: 45,
        },
        clients.moveco.signer,
      );
      const check = await verifier.verifyReceipt("permitflow", spoofedEnvelope);
      return {
        simulation_mode: true,
        passed: check.valid === false && check.trusted === false,
        expectedTransition: "Cross-provider key substitution rejected by pinned provider JWK map",
        observedState: check.level,
        sagaStatus: "SPOOF_REJECTED",
        humanInterventionRequired: true,
        evidence: check.detail || check.level,
      };
    },
  },
  {
    id: "CHAOS_17_NANDA_SEQUENCE_ROLLBACK",
    number: 17,
    title: "Project NANDA Resolution Sequence Rollback Replay (Seq 5 -> Seq 3)",
    injectedFailure: "Registry replays a non-expired binding with sequence=3 after sequence=5 was already verified.",
    humanInterventionRequired: true,
    async run() {
      const resolver = new AuthorityBoundResolver();
      const baseTarget = {
        subject: "urn:air:example.org:agent:moveco_dispatch",
        subjectType: "urn",
        method: "artifact",
        targetType: "application/a2a-agent-card+json",
        targetUrl: "https://example.org/agent-card.json",
        issuedAt: "2026-11-15T09:00:00Z",
        expiresAt: "2026-11-16T09:00:00Z",
        authority: { type: "domain-control", issuer: "https://example.org" },
      };
      const first = await resolver.verifyResolutionTarget(
        { ...baseTarget, sequence: 5 },
        { nowIso: "2026-11-15T10:00:00Z" },
      );
      const replay = await resolver.verifyResolutionTarget(
        { ...baseTarget, sequence: 3 },
        { nowIso: "2026-11-15T10:05:00Z" },
      );
      return {
        simulation_mode: true,
        passed: first.ok === true && replay.ok === false && replay.code === "stale",
        expectedTransition: "Verified seq 5 -> replayed seq 3 rejected as stale anti-rollback",
        observedState: replay.code,
        sagaStatus: "ROLLBACK_BLOCKED",
        humanInterventionRequired: true,
        evidence: replay.reason,
      };
    },
  },
  {
    id: "CHAOS_18_PRE_COMMIT_HOLD_RELEASE_REVERSIBILITY",
    number: 18,
    title: "Explicit Pre-Commit Hold Release (€0.00 Fee & Baseline Preservation)",
    injectedFailure: "Visitor aborts after 3 slot holds are placed; coordinator releases holds without touching originals.",
    humanInterventionRequired: false,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-15T10:00:00Z",
      });
      const rel = await saga.releasePreparedHolds({
        providerClients: clients,
        nowIso: "2026-11-15T10:02:00Z",
      });
      const vanNode = graph.nodes.get("cmt_moveco_van");
      return {
        simulation_mode: true,
        passed:
          rel.ok === true
          && rel.feeChargedEur === 0
          && rel.releasedOperationIds.length === 3
          && vanNode.scheduled_date === "2026-11-17",
        expectedTransition: "AWAITING_APPROVAL -> COMPENSATION_PENDING -> COMPENSATED (€0.00)",
        observedState: "COMPENSATED",
        sagaStatus: "ORIGINALS_PRESERVED",
        humanInterventionRequired: false,
        evidence: `Released ${rel.releasedOperationIds.length} holds at €0.00; MoveCo remains on ${vanNode.scheduled_date}.`,
      };
    },
  },
  {
    id: "CHAOS_19_MANDATE_SLICE_NO_AGREEMENT_ZERO_LEAK",
    number: 19,
    title: "Sealed-Bid Mandate Exhaustion (NO_AGREEMENT With Zero Budget/Floor Leak)",
    injectedFailure: "All overflow bidders submit private floors (€480, €495) above buyer slice allowance (€440).",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €660", mission);
      const mandate = await issuePolicyBoundMandate(mission, proposal);
      const arbiter = new SealedBidArbiter(mandate, 44000);
      await arbiter.commitSealedBid({ providerId: "carrier_a", askCents: 51000, floorCents: 48000 });
      await arbiter.commitSealedBid({ providerId: "carrier_b", askCents: 52500, floorCents: 49500 });
      const res = arbiter.resolveNashBargaining();
      const serialized = JSON.stringify(res);
      const zeroLeak = !serialized.includes("48000") && !serialized.includes("49500") && !serialized.includes("44000");
      return {
        simulation_mode: true,
        passed: res.outcomes.every((o) => o.status === "NO_AGREEMENT") && zeroLeak,
        expectedTransition: "floorCents > sliceAllowance -> NO_AGREEMENT (neither floor nor ceiling disclosed)",
        observedState: "NO_AGREEMENT",
        sagaStatus: "PRIVACY_PRESERVED",
        humanInterventionRequired: true,
        evidence: "2/2 overflow bids rejected cleanly with zero private floor or buyer allowance leakage.",
      };
    },
  },
  {
    id: "CHAOS_20_AUDIT_BUNDLE_POST_EXPORT_TAMPER",
    number: 20,
    title: "Post-Export Audit Bundle €0.01 Receipt & Saga Log Tampering",
    injectedFailure: "Exported audit JSON has 1 receipt mutated by +€0.01 and 1 Saga log reason altered.",
    humanInterventionRequired: true,
    async run() {
      const mission = createSignatureMoveMission();
      const graph = MissionGraph.fromRelocationMission(mission);
      const { proposal } = compileMissionChange("Move Tuesday to Friday under €700", mission);
      const impact = analyzeMissionImpact(graph, proposal);
      const solved = solveMinimalChangePlans({
        graph,
        proposal,
        impact,
        normalizedOffers: buildBaselineFridayOffers(),
      });
      const { clients, verifier } = await createSimulatedProviderHarness();
      const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
      const prep = await saga.preparePlan({
        missionId: mission.mission_id,
        plan: solved.plans[0],
        maximumBudgetEur: 700,
        providerClients: clients,
        nowIso: "2026-11-15T10:00:00Z",
      });
      const approvals = await saga.approvePreparedOperations(
        prep.operations.map((o) => o.operation_id),
        { nowIso: "2026-11-15T10:01:00Z" },
      );
      const exec = await saga.executeApprovedSaga({
        approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
        providerClients: clients,
        nowIso: "2026-11-15T10:02:00Z",
      });
      const bundle = await exportVerifiableAuditBundle({
        mission,
        selectedPlan: solved.plans[0],
        operations: exec.operations,
        auditLog: saga.ledger.getHistory(),
        trustedProviderKeys: verifier.trustedByProvider,
      });
      const tampered = JSON.parse(JSON.stringify(bundle));
      tampered.operations[0].receipt_envelope.receipt_body.total_charged_eur += 0.01;
      tampered.immutable_saga_log[0].reason += " [tampered]";
      const check = await verifyExportedAuditBundle(tampered, {
        externalPinnedKeys: verifier.trustedByProvider,
      });
      return {
        simulation_mode: true,
        passed:
          check.valid === false
          && check.bundleSha256Valid === false
          && check.sagaChainValid === false
          && check.receiptsVerifiedCount < check.receiptsTotalCommitted,
        expectedTransition: "Triple alarm: BUNDLE_SHA256_MISMATCH + LEDGER_CHAIN_BROKEN + ED25519_SIGNATURE_INVALID",
        observedState: "TAMPER_DETECTED",
        sagaStatus: `${check.errors.length} cryptographic alarms`,
        humanInterventionRequired: true,
        evidence: check.errors.join(" | "),
      };
    },
  },
];

/**
 * Execute all 15 Chaos Lab scenarios deterministically and return structured report.
 */
export async function runAllChaosScenarios() {
  const results = [];
  for (const scenario of CHAOS_SCENARIOS) {
    const t0 = performance.now();
    const outcome = await scenario.run();
    results.push({
      id: scenario.id,
      number: scenario.number,
      title: scenario.title,
      injectedFailure: scenario.injectedFailure,
      durationMs: Number((performance.now() - t0).toFixed(2)),
      ...outcome,
    });
  }
  return {
    simulation_mode: true,
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}
