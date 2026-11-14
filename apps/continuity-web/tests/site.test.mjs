import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../../../skills/agentify-website/runtime/actions.js";
import { App } from "../script.js";
import { registerActions } from "../site-actions.js";
import { AssistantMount } from "../site.js";

test("CONTINUITY site-actions register cleanly and run full analyze -> select -> commit lifecycle", async () => {
  await App.page.resetMission({ resetToDefaultScenario: true });

  const registry = new ActionRegistry();
  const scope = { base: "http://127.0.0.1:8080", network: "continuity_coordinator" };
  registerActions({ register: (def) => registry.register(scope, def) });

  const catalog = registry.catalog(scope);
  assert.deepEqual(
    catalog.map((c) => c.name),
    [
      "get_mission_state",
      "switch_or_import_mission",
      "analyze_and_prepare_change",
      "select_change_plan",
      "commit_prepared_change_package",
      "audit_open_agentic_site",
    ],
  );

  // 1. Read initial mission state
  const state0 = App.page.getState();
  assert.equal(state0.graph.nodes.length, 6);

  // 2. Analyze & prepare Friday shift
  const prep = await App.page.analyzeAndPrepareChange(
    "Move my relocation from Tuesday to Friday under €700 without cancelling anything.",
  );
  assert.equal(prep.ok, true);
  assert.equal(prep.targetDate, "2026-11-20");
  assert.equal(prep.unaffectedCommitmentsCount, 3);
  assert.ok(prep.paretoFrontierCount >= 1);

  // 3. Verify confirmation dialog details BEFORE commit
  const state1 = App.page.getState();
  const dialogArgs = {
    planId: state1.selectedPlanId,
    expectedVersion: state1.version,
    expectedTotalEur: state1.selectedPlanSummary.metrics.totalMissionCostEur,
  };
  const details = AssistantMount.reviewDetails("commit_prepared_change_package", dialogArgs);
  assert.ok(!details.refusal);
  assert.match(details["Projected Total Cost"], /€649\.00/);

  // 4. Stale expectedVersion is refused without side effect
  const staleCheck = AssistantMount.reviewDetails("commit_prepared_change_package", {
    ...dialogArgs,
    expectedVersion: 999,
  });
  assert.ok(staleCheck.refusal);

  // 5. Commit prepared package and verify receipts
  const commitRes = await App.page.commitPreparedPackage(dialogArgs);
  assert.equal(commitRes.ok, true);
  assert.equal(commitRes.sagaStatus, "ALL_COMMITTED_AND_VERIFIED");
  assert.equal(commitRes.committedCount, 3);
  assert.equal(commitRes.preservedCount, 3);
});
