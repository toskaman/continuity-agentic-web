import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../../../skills/agentify-website/runtime/actions.js";
import { App } from "../script.js";
import { registerActions } from "../site-actions.js";

test("PowerFlow site-actions register cleanly and update smart-meter energization schedule", () => {
  const registry = new ActionRegistry();
  const scope = { base: "http://localhost:8084", network: "powerflow_grid" };
  registerActions({ register: (def) => registry.register(scope, def) });
  assert.equal(registry.catalog(scope).length, 3);

  const st = App.page.getState();
  const ok = App.page.confirmDateShift({
    activationRef: "PFW-9921",
    targetDate: "2026-11-20",
    expectedVersion: st.version,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.activation.scheduledDate, "2026-11-20");
});
