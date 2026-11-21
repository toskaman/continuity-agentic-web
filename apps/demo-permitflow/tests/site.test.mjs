import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../../../skills/agentify-website/runtime/actions.js";
import { App } from "../script.js";
import { registerActions } from "../site-actions.js";

test("PermitFlow site-actions register cleanly and update prepared demonstration dossier", () => {
  const registry = new ActionRegistry();
  const scope = { base: "http://localhost:8082", network: "permitflow_advisor" };
  registerActions({ register: (def) => registry.register(scope, def) });
  assert.equal(registry.catalog(scope).length, 3);

  const st = App.page.getState();
  assert.match(st.simulationDisclosure, /never modifies official municipal permits/i);

  const upd = App.page.updatePreparedDossier({
    dossierRef: "PF-2049",
    targetDate: "2027-11-19",
    expectedVersion: st.version,
  });
  assert.equal(upd.ok, true);
  assert.equal(upd.dossier.scheduledDate, "2027-11-19");
});
