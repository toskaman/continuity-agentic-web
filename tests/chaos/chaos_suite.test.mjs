import assert from "node:assert/strict";
import test from "node:test";
import { CHAOS_SCENARIOS, runAllChaosScenarios } from "../../packages/chaos-lab/index.js";

test("Chaos Lab executes all 36 deterministic failure scenarios and passes every invariant", async () => {
  assert.equal(CHAOS_SCENARIOS.length, 36);
  const report = await runAllChaosScenarios();
  assert.equal(report.simulation_mode, true);
  assert.equal(report.total, 36);
  for (const r of report.results) {
    assert.equal(r.passed, true, `${r.id} failed: ${r.evidence}`);
  }
  assert.equal(report.passed, 36);
  assert.equal(report.failed, 0);
});
