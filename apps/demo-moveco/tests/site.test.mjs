import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../../../skills/agentify-website/runtime/actions.js";
import { App } from "../script.js";
import { registerActions } from "../site-actions.js";

test("MoveCo site-actions register cleanly, hold slot, and enforce expectedVersion on reschedule", () => {
  const registry = new ActionRegistry();
  const scope = { base: "http://127.0.0.1:8081", network: "moveco_dispatch" };
  registerActions({ register: (def) => registry.register(scope, def) });
  assert.equal(registry.catalog(scope).length, 3);

  const holdRes = App.page.holdSlot("2026-11-20");
  assert.equal(holdRes.ok, true);
  assert.equal(holdRes.hold.originalBookingPreserved, true);

  const badVer = App.page.confirmReschedule({
    bookingRef: "MC-8841",
    targetDate: "2026-11-20",
    expectedVersion: 1,
  });
  assert.equal(badVer.ok, false);

  const okRes = App.page.confirmReschedule({
    bookingRef: "MC-8841",
    targetDate: "2026-11-20",
    expectedVersion: holdRes.version,
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.receipt.newDate, "2026-11-20");
});
