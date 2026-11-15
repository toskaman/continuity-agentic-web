import assert from "node:assert/strict";
import test from "node:test";
import { buildBaselineFridayOffers } from "../../packages/chaos-lab/index.js";
import { solveMinimalChangePlans } from "../../packages/constraint-solver/index.js";
import { analyzeMissionImpact } from "../../packages/impact-engine/index.js";
import { createScenarioMission } from "../../packages/intake-compiler/index.js";
import { compileMissionChange, createSignatureMoveMission } from "../../packages/mission-core/index.js";
import { MissionGraph } from "../../packages/mission-graph/index.js";

test("Cycle 5.1 — Solver computes exact minimum budget counterfactual relaxation (+€29.00 -> €659.00) and NSGA-II crowding distances", () => {
  const mission = createSignatureMoveMission();
  const graph = MissionGraph.fromMission(mission);
  const { proposal } = compileMissionChange(
    "Move relocation from Tuesday to Friday, keep total budget below €630.",
    mission,
  );
  const impact = analyzeMissionImpact(graph, proposal);
  const offers = buildBaselineFridayOffers();

  const infeasible = solveMinimalChangePlans({
    graph,
    proposal,
    impact,
    normalizedOffers: offers,
  });

  assert.equal(infeasible.feasible, false);
  assert.ok(infeasible.counterfactualPrescription);
  assert.equal(infeasible.counterfactualPrescription.relaxationFound, true);
  assert.equal(infeasible.counterfactualPrescription.kind, "raise_budget");
  assert.equal(infeasible.counterfactualPrescription.relaxedBudgetEur, 659);
  assert.equal(infeasible.counterfactualPrescription.deltaBudgetNeededEur, 29);

  // Applying the prescribed €649.00 ceiling immediately unlocks valid Pareto-optimal plans
  const unlocked = solveMinimalChangePlans({
    graph,
    proposal: {
      ...proposal,
      invariants: {
        ...proposal.invariants,
        maximum_budget_eur: infeasible.counterfactualPrescription.relaxedBudgetEur,
      },
    },
    impact,
    normalizedOffers: offers,
  });
  assert.equal(unlocked.feasible, true);
  assert.ok(unlocked.plans.length >= 1);
  assert.equal(unlocked.plans[0].paretoOptimal, true);
  assert.equal(unlocked.plans[0].paretoRank, 1);
  assert.ok(unlocked.plans[0].crowdingDistance !== undefined);
});

test("Cycle 5.2 — Solver identifies minimal conflicting node pin (cmt_permitflow_bay) and enforces scenario-agnostic anchor validation", () => {
  const mission = createSignatureMoveMission();
  const graph = MissionGraph.fromMission(mission);
  const { proposal } = compileMissionChange(
    "Move relocation from Tuesday to Friday below €700.",
    mission,
  );
  const impact = analyzeMissionImpact(graph, proposal);
  const offers = buildBaselineFridayOffers();

  // Pinning PermitFlow bay on Tuesday conflicts with MoveCo van on Friday (SAME_DAY_REQUIRED)
  const blockedByPin = solveMinimalChangePlans({
    graph,
    proposal,
    impact,
    normalizedOffers: offers,
    pinnedCommitmentIds: ["cmt_permitflow_bay", "cmt_powerflow_grid"],
  });

  assert.equal(blockedByPin.feasible, false);
  assert.equal(blockedByPin.counterfactualPrescription?.relaxationFound, true);
  assert.equal(blockedByPin.counterfactualPrescription?.kind, "unpin_commitments");
  assert.deepEqual(blockedByPin.counterfactualPrescription?.unpinCommitmentIds, ["cmt_permitflow_bay"]);

  // Scenario-agnostic anchor check: pinning outpatient_surgery anchor `cmt_surgery_slot` to its old date must fail
  const surgeryMission = createScenarioMission("outpatient_surgery");
  const surgeryGraph = MissionGraph.fromMission(surgeryMission);
  const { proposal: sProp } = compileMissionChange(
    "Shift outpatient surgery from Tuesday to Friday below €500.",
    surgeryMission,
  );
  const sImpact = analyzeMissionImpact(surgeryGraph, sProp);
  const pinnedAnchor = solveMinimalChangePlans({
    graph: surgeryGraph,
    proposal: sProp,
    impact: sImpact,
    normalizedOffers: [],
    pinnedCommitmentIds: [surgeryMission.anchor_commitment_id],
  });
  assert.equal(pinnedAnchor.feasible, false);
});
