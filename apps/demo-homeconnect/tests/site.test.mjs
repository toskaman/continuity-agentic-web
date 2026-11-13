import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../../../skills/agentify-website/runtime/actions.js";
import { App } from "../script.js";
import { registerActions } from "../site-actions.js";

test("HomeConnect site-actions register cleanly and reschedule fiber appointment", () => {
  const registry = new ActionRegistry();
  const scope = { base: "http://127.0.0.1:8083", network: "homeconnect_scheduler" };
  registerActions({ register: (def) => registry.register(scope, def) });
  assert.equal(registry.catalog(scope).length, 3);

  const hold = App.page.holdWindow("2026-11-20");
  assert.equal(hold.ok, true);

  const ok = App.page.confirmAppointmentChange({
    appointmentRef: "HC-5510",
    targetDate: "2026-11-20",
    expectedVersion: hold.version,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.appointment.scheduledDate, "2026-11-20");
});
