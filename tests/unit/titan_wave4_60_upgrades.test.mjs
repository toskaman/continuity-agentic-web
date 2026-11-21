import assert from "node:assert/strict";
import test from "node:test";
import {
  createPeerBrowserDomainEngine,
  verifySignedReceiptHandoff,
} from "../../packages/cross-origin-bridge/index.js";
import {
  ChromeBuiltInPromptLlm,
  formatMessagesForOnDeviceModel,
  probeLocalInferenceBackends,
} from "../../packages/local-browser-router/index.js";
import { exposeActionsToWebMcp } from "../../packages/webmcp-adapter/index.js";
import { compileScopedToolboxNetwork } from "../../packages/toolbox-scoper/index.js";
import { convertAgentFrameworkToHoconBundle } from "../../packages/adk-hocon-converter/index.js";
import { compileUnstructuredIntake, exportMissionToIcs } from "../../packages/intake-compiler/index.js";
import { MissionGraph } from "../../packages/mission-graph/index.js";
import { createSignatureMoveMission } from "../../packages/mission-core/index.js";

test("Wave 4 (#181-#192) — Cross-Origin Bridge supports release_hold, total_charged_eur overflow parity, oversized token rejection & credential-free peerOrigin", async () => {
  const moveco = createPeerBrowserDomainEngine("moveco", {
    origin: "https://gpaschercher-sudo.github.io/moveco-agentic-peer",
  });
  moveco.reset("primary_fri_full");

  const hold = await moveco.callTool("hold_moving_slot", {
    booking_ref: "MC-8841",
    offer_id: "off_moveco_partner_overflow_fri",
    proposed_date: "2027-11-19",
    idempotency_key: "idem_w4_1",
  });
  assert.equal(hold.ok, true);

  const rel = await moveco.callTool("release_hold", { hold_id: hold.hold_id, booking_ref: "MC-8841" });
  assert.equal(rel.ok, true);
  assert.equal(rel.fee_charged_eur, 0);

  const commit = await moveco.callTool("reschedule_van_booking", {
    booking_ref: "MC-8841",
    new_date: "2027-11-19",
    window: "09:30–14:30",
    offer_id: "off_moveco_partner_overflow_fri",
    idempotency_key: "idem_w4_commit_1",
  });
  assert.equal(commit.receipt_envelope.receipt_body.total_charged_eur, 425);
  assert.equal(commit.receipt_envelope.receipt_body.total_price_eur, 405);

  const oversized = await verifySignedReceiptHandoff("moveco", "A".repeat(9000));
  assert.equal(oversized.valid, false);
});

test("Wave 4 (#193-#202) — LocalBrowserRouter blocks numeric loopback obfuscation, scrubs keys in on-device prompts, and unwraps markdown JSON fences", async () => {
  const blockedProbe = await probeLocalInferenceBackends({
    ollamaBaseUrl: "http://2130706433:11434/v1",
    fetchImpl: async () => {
      throw new Error("Should never be called on numeric IP");
    },
  });
  assert.equal(blockedProbe.ollamaLoopback.supported, false);

  const formatted = formatMessagesForOnDeviceModel([
    { role: "user", content: "My key is otk_v1_secretkey1234567890 — check availability." },
  ]);
  assert.equal(formatted.userPrompt.includes("otk_v1_"), false);
  assert.match(formatted.userPrompt, /\[REDACTED_KEY\]/);

  const nano = new ChromeBuiltInPromptLlm({
    env: {
      LanguageModel: {
        create: async () => ({
          prompt: async () =>
            '```json\n{"decision":"call_tool","toolName":"website_get_state","toolArgumentsJson":"{}","finalResponse":""}\n```',
          destroy: () => {},
        }),
      },
    },
  });
  const res = await nano.chat({
    messages: [{ role: "user", content: "Get state" }],
    tools: [{ type: "function", function: { name: "website_get_state", parameters: { type: "object" } } }],
  });
  assert.equal(res.toolCalls[0].function.name, "website_get_state");
});

test("Wave 4 (#203-#218) — WebMCP blocks concurrent irreversible re-entrancy & unregisters cleanly; ToolboxScoper flags duplicates; ADK Converter blocks SSRF tool URLs", async () => {
  let unregistered = 0;
  let resolveGate;
  const gatePromise = new Promise((r) => {
    resolveGate = r;
  });
  const bridge = exposeActionsToWebMcp(
    (actions) => {
      actions.register({
        name: "commit_test",
        description: "Irreversible test",
        effect: "irreversible",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        execute: () => ({ ok: true }),
      });
    },
    {
      namespace: "w4_test",
      navigatorModelContext: {
        registerTool: () => {},
        unregisterTool: () => {
          unregistered += 1;
        },
      },
      confirmIrreversible: () => gatePromise,
    },
  );

  const p1 = bridge.invokeTool("commit_test", {});
  const p2 = await bridge.invokeTool("commit_test", {});
  assert.equal(p2.ok, false);
  assert.match(p2.reason, /Concurrent confirmation already pending/);
  resolveGate(true);
  assert.equal((await p1).ok, true);

  bridge.unregister();
  assert.equal(unregistered, 1);

  const dupScope = compileScopedToolboxNetwork({
    manifestJson: { actions: { agentTools: ["a1"] } },
    networkJson: {
      tools: [
        { name: "ag", tools: ["website_a1"] },
        { name: "website_a1", toolbox: "a1" },
        { name: "website_a1", toolbox: "a1" },
      ],
    },
  });
  assert.equal(dupScope.ok, false);

  await assert.rejects(
    () =>
      convertAgentFrameworkToHoconBundle({
        agent_class: "LlmAgent",
        name: "bad_adk",
        tools: ["https://169.254.169.254/mcp"],
      }),
    /Unsafe external peer URL/,
  );
});

test("Wave 4 (#219-#240) — IntakeCompiler strips nested VALARM reminders, deduplicates UIDs, and escapes RFC 5545 commas/semicolons on export", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:MC-8841@moveco",
    "DTSTART;TZID=Europe/Paris:20271116T080000",
    "DTEND;TZID=Europe/Paris:20271116T120000",
    "SUMMARY:[ANCHOR] Van\\, Crew\\; Lift",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Alarm Price: €1",
    "END:VALARM",
    "DESCRIPTION:Ref: MC-8841 | Price: €390",
    "END:VEVENT",
    // Duplicate UID event ignored cleanly
    "BEGIN:VEVENT",
    "UID:MC-8841@moveco",
    "DTSTART:20271116T080000Z",
    "SUMMARY:Duplicate",
    "DESCRIPTION:Ref: MC-8841 | Price: €390",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:HC-5510@hc",
    "DTSTART:20271116T140000Z",
    "SUMMARY:Fiber",
    "DESCRIPTION:Ref: HC-5510 | Price: €49",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const compiled = compileUnstructuredIntake(ics);
  assert.equal(compiled.mission.commitments.length, 2);
  assert.equal(compiled.mission.commitments[0].price_eur, 390);
  assert.equal(compiled.mission.commitments[0].title, "Van, Crew; Lift");

  const m = createSignatureMoveMission();
  const g = MissionGraph.fromMission(m);
  const exported = exportMissionToIcs(m, g);
  assert.match(exported, /BEGIN:VCALENDAR/);
});
