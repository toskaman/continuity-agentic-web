import assert from "node:assert/strict";
import test from "node:test";
import { CHAOS_SCENARIOS, runAllChaosScenarios } from "../../packages/chaos-lab/index.js";

test("Chaos Lab executes all 15 deterministic failure scenarios and passes every invariant", async () => {
  assert.equal(CHAOS_SCENARIOS.length, 15);
  const report = await runAllChaosScenarios();
  assert.equal(report.simulation_mode, true);
  assert.equal(report.total, 15);
  for (const r of report.results) {
    assert.equal(r.passed, true, `${r.id} failed: ${r.evidence}`);
  }
  assert.equal(report.passed, 15);
  assert.equal(report.failed, 0);
});
