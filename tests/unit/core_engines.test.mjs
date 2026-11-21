import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeJson, sha256Hex, validateAgainstSchema } from "../../packages/shared-schemas/index.js";
import { compileMissionChange, createSignatureMoveMission } from "../../packages/mission-core/index.js";
import { EDGE_TYPES, MissionGraph } from "../../packages/mission-graph/index.js";
import { analyzeMissionImpact } from "../../packages/impact-engine/index.js";
import { solveMinimalChangePlans } from "../../packages/constraint-solver/index.js";
import { ApprovalEngine } from "../../packages/approval-engine/index.js";
import { OP_STATES, OperationLedger } from "../../packages/outcome-reconciliation/index.js";
import { buildBaselineFridayOffers } from "../../packages/chaos-lab/index.js";

test("U1 canonicalizeJson produces identical strings regardless of key insertion order", async () => {
  const a = { z: 1, a: { d: true, c: [3, 2, 1] }, m: "hello" };
  const b = { m: "hello", a: { c: [3, 2, 1], d: true }, z: 1 };
  assert.equal(canonicalizeJson(a), canonicalizeJson(b));
  assert.equal(await sha256Hex(canonicalizeJson(a)), await sha256Hex(canonicalizeJson(b)));
});

test("U2 compileMissionChange parses the signature user prompt and enforces hard invariants", () => {
  const mission = createSignatureMoveMission();
  const prompt = [
    "My move was originally scheduled for Tuesday, but I need to move everything to Friday.",
    "Update every affected service.",
    "Keep my current reservations until replacements are secured.",
    "Maintain my total budget below €700.",
    "Do not cancel anything or approve additional fees without my confirmation.",
  ].join("\n");

  const { proposal } = compileMissionChange(prompt, mission);
  assert.equal(proposal.requested_change.previous_value, "2027-11-16");
  assert.equal(proposal.requested_change.new_value, "2027-11-19");
  assert.equal(proposal.invariants.maximum_budget_eur, 700);
  assert.equal(proposal.invariants.preserve_existing_commitments, true);
  assert.equal(proposal.invariants.unauthorized_cancellation, false);
  assert.equal(proposal.permissions.commit_changes, false);
  assert.equal(proposal.permissions.cancel_original_commitments, false);
});

test("U3 Impact Engine identifies affected Tuesday nodes and preserves Storage & Saturday Delivery untouched", () => {
  const mission = createSignatureMoveMission();
  const graph = MissionGraph.fromRelocationMission(mission);
  const { proposal } = compileMissionChange("Move from Tuesday to Friday under €700", mission);
  const impact = analyzeMissionImpact(graph, proposal);

  // Storage (Nov 15-29) and Furniture Delivery (Saturday Nov 20 >= Friday Nov 19) MUST remain unaffected
  assert.ok(impact.unaffectedIds.includes("cmt_storage_pod"));
  assert.ok(impact.unaffectedIds.includes("cmt_furniture_drop"));

  // MoveCo, PermitFlow, and HomeConnect Fiber (Tuesday < Friday) MUST be hard-affected
  assert.ok(impact.hardAffectedIds.includes("cmt_moveco_van"));
  assert.ok(impact.hardAffectedIds.includes("cmt_permitflow_bay"));
  assert.ok(impact.hardAffectedIds.includes("cmt_homeconnect_fiber"));

  // PowerFlow (Tuesday <= Friday) is evaluated as a soft candidate (can keep Tuesday or shift to Friday)
  assert.ok(impact.softCandidateIds.includes("cmt_powerflow_grid"));
  assert.equal(impact.metrics.unnecessaryOperationsAvoided, 2);
});

test("U4 Minimal-Change Solver is deterministically reproducible and preserves unaffected commitments", () => {
  const runOnce = () => {
    const mission = createSignatureMoveMission();
    const graph = MissionGraph.fromRelocationMission(mission);
    const { proposal } = compileMissionChange("Move from Tuesday to Friday under €700", mission);
    const impact = analyzeMissionImpact(graph, proposal);
    const offers = buildBaselineFridayOffers();
    return solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers: offers });
  };

  const r1 = runOnce();
  const r2 = runOnce();
  assert.equal(r1.feasible, true);
  assert.equal(r1.recommendedPlanId, r2.recommendedPlanId);
  assert.deepEqual(
    r1.plans.map((p) => ({ id: p.plan_id, sig: p.signature, metrics: p.metrics })),
    r2.plans.map((p) => ({ id: p.plan_id, sig: p.signature, metrics: p.metrics })),
  );

  // Plan A (Minimal Changes) keeps PowerFlow on Tuesday (only 3 changes instead of 4!) while staying <= €700
  const planA = r1.plans.find((p) => p.plan_id === "PLAN_A_MINIMAL_CHANGE");
  assert.ok(planA);
  assert.equal(planA.metrics.changedCount, 3);
  assert.equal(planA.metrics.unchangedCount, 3);
  assert.ok(planA.metrics.totalMissionCostEur <= 700);
});

test("U5 MissionGraph rejects dependency cycles immediately", () => {
  const mission = createSignatureMoveMission();
  const graph = MissionGraph.fromRelocationMission(mission);
  assert.throws(
    () =>
      graph.addEdge({
        from: "cmt_permitflow_bay",
        to: "cmt_moveco_van",
        type: EDGE_TYPES.SAME_DAY_REQUIRED,
        rationale: "Cyclic test",
      }),
    /Dependency cycle rejected/,
  );
});

test("U6 OperationLedger rejects invalid state transitions", () => {
  const ledger = new OperationLedger();
  ledger.createOperation({ operation_id: "op_test_1" });
  assert.throws(
    () => ledger.transition("op_test_1", OP_STATES.COMMITTED, "Illegal jump from DRAFT to COMMITTED"),
    /Invalid operation state transition/,
  );
});

test("U7 ApprovalEngine invalidates approval if date or price changes by €0.01", async () => {
  const engine = new ApprovalEngine();
  const spec = {
    mission_id: "m1",
    operation_id: "op_1",
    commitment_id: "cmt_moveco_van",
    provider_origin: "http://127.0.0.1:8081",
    provider_id: "moveco",
    capability: "reschedule_van_booking",
    arguments: { booking_ref: "MC-8841", new_date: "2027-11-19" },
    proposed_date: "2027-11-19",
    base_price_eur: 390,
    change_fee_eur: 25,
    cancellation_penalty_eur: 0,
    maximum_budget_eur: 700,
    expires_at: "2027-11-19T23:59:59Z",
  };
  const appr = await engine.createBoundApproval(spec, { nowIso: "2027-11-12T10:00:00Z" });
  const drifted = await engine.verifyApprovalBinding(
    appr.approval_id,
    { ...spec, change_fee_eur: 25.01 },
    { nowIso: "2027-11-12T10:01:00Z" },
  );
  assert.equal(drifted.valid, false);
  assert.match(drifted.reason, /change_fee_eur/);
});

test("U8 Schema validator rejects invalid calendar dates like 2026-02-30", () => {
  const res = validateAgainstSchema({ type: "string", format: "date" }, "2026-02-30");
  assert.equal(res.valid, false);
});
