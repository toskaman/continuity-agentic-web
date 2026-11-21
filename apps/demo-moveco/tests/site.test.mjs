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

  const holdRes = App.page.holdSlot("2027-11-19");
  assert.equal(holdRes.ok, true);
  assert.equal(holdRes.hold.originalBookingPreserved, true);

  const badVer = App.page.confirmReschedule({
    bookingRef: "MC-8841",
    targetDate: "2027-11-19",
    expectedVersion: 1,
  });
  assert.equal(badVer.ok, false);

  const okRes = App.page.confirmReschedule({
    bookingRef: "MC-8841",
    targetDate: "2027-11-19",
    expectedVersion: holdRes.version,
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.receipt.newDate, "2027-11-19");
});

test("Cycle 23 & 24 — PeerScriptedReplayLlm drives zero-key website_* tools and cross-origin CONTINUITY consultation on peer websites", async () => {
  const { PeerScriptedReplayLlm } = await import("../ui-kit.js");
  const llm = new PeerScriptedReplayLlm(null);
  const tools = [
    { function: { name: "website_get_moveco_state", parameters: { type: "object", properties: {} } } },
    { function: { name: "website_hold_crew_slot", parameters: { type: "object", required: ["targetDate"] } } },
    { function: { name: "continuity_coordinator", parameters: { type: "object", required: ["request"] } } },
  ];

  // Step 1: First turn reads state
  const step1 = await llm.chat({
    messages: [{ role: "user", content: "Hold Friday 2027-11-19 crew slot." }],
    tools,
  });
  assert.equal(step1.toolCalls[0].function.name, "website_get_moveco_state");

  // Step 2: Second turn places hold
  const step2 = await llm.chat({
    messages: [
      { role: "user", content: "Hold Friday 2027-11-19 crew slot." },
      { role: "tool", name: "website_get_moveco_state", content: JSON.stringify({ result: App.page.getState() }) },
    ],
    tools,
  });
  assert.equal(step2.toolCalls[0].function.name, "website_hold_crew_slot");
  assert.deepEqual(JSON.parse(step2.toolCalls[0].function.arguments), { targetDate: "2027-11-19" });

  // Step 3: Bidirectional CONTINUITY partner consultation tool call
  const step3 = await llm.chat({
    messages: [
      { role: "user", content: "How do I align fiber and parking? Ask CONTINUITY." },
      { role: "tool", name: "website_get_moveco_state", content: JSON.stringify({ result: App.page.getState() }) },
    ],
    tools,
  });
  assert.equal(step3.toolCalls[0].function.name, "continuity_coordinator");
});
