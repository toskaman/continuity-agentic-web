import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
import {
  createPeerBrowserDomainEngine,
  verifySignedReceiptHandoff,
} from "../../packages/cross-origin-bridge/index.js";
import {
  compileUnstructuredIntake,
  createScenarioMission,
  exportMissionToIcs,
  exportVerifiableAuditBundle,
  SAMPLE_RAW_CONFIRMATION_EMAILS,
} from "../../packages/intake-compiler/index.js";
import { MissionGraph } from "../../packages/mission-graph/index.js";
import { auditOpenAgenticSite } from "../../packages/nanda-resolver/index.js";
import { OperationLedger } from "../../packages/outcome-reconciliation/index.js";
import {
  buildSanitizedPeerBoundaryRequest,
  issuePolicyBoundMandate,
  runAdversarialBypassAudit,
  SealedBidArbiter,
} from "../../packages/mandate-arbiter/index.js";
import { compileMissionChange, createSignatureMoveMission } from "../../packages/mission-core/index.js";
import {
  convertAgentFrameworkToHoconBundle,
  SAMPLE_GOOGLE_ADK_CONFIG,
} from "../../packages/adk-hocon-converter/index.js";
import { exposeActionsToWebMcp } from "../../packages/webmcp-adapter/index.js";
import { App } from "../../apps/continuity-web/script.js";
import { startAllEcosystemServers } from "../../scripts/serve_ecosystem.mjs";

test("V2.1 — Imported email bookings require provider confirmation before execution", async () => {
  const imp = await App.page.importCustomSchedule(SAMPLE_RAW_CONFIRMATION_EMAILS);
  assert.equal(imp.ok, true);
  assert.equal(imp.format, "emails");
  assert.equal(imp.commitmentsCount, 5);
  assert.equal(imp.inferredEdgesCount, 4);

  const prep = await App.page.analyzeAndPrepareChange(imp.suggestedPrompt);
  assert.equal(prep.ok, true);
  assert.ok(prep.plans.length >= 1);
  assert.ok(prep.unaffectedCommitmentsCount >= 1); // Multi-day eSIM + earlier PCR preserved

  const state = App.page.getState();
  const commit = await App.page.commitPreparedPackage({
    planId: state.selectedPlanId,
    expectedVersion: state.version,
    expectedTotalEur: state.selectedPlanSummary.metrics.totalMissionCostEur,
  });
  assert.equal(commit.ok, false);
  assert.equal(App.page.preparedOps.length, 0);
  const playbook = App.page.getTransitionPlaybook();
  assert.equal(playbook.agenticStepsCount, 0);
  assert.ok(playbook.steps.every((step) => step.currentState === "AWAITING_PROVIDER_CONFIRMATION" && !step.receiptVerified));
  assert.equal(App.page.canDownloadUpdatedCalendar, false);
});

test("V2.2 — Multi-Domain Scenarios (Outpatient Surgery & Product Launch Expo) + RFC 5545 .ics round-trip + Audit Bundle", async () => {
  for (const scenarioId of ["outpatient_surgery", "product_launch_expo"]) {
    const sw = await App.page.switchScenario(scenarioId);
    assert.equal(sw.ok, true);

    const prep = await App.page.analyzeAndPrepareChange("Shift primary date from Tuesday to Friday.");
    assert.equal(prep.ok, true);
    assert.ok(prep.minimumFeasibleBudgetEur > 0);

    // Counterfactual budget sensitivity check: dropping budget below baseline cleanly rejects without mutating bookings
    const tight = await App.page.recalculateWithBudgetCeiling(10);
    assert.equal(tight.ok, false);

    // Restoring generous budget restores feasibility
    const restored = await App.page.recalculateWithBudgetCeiling(sw.baselineTotalEur + 200);
    assert.equal(restored.ok, true);
  }

  // Export .ics and re-import via RFC 5545 parser
  const m = createScenarioMission("outpatient_surgery");
  const g = MissionGraph.fromMission(m);
  const icsText = exportMissionToIcs(m, g, []);
  assert.match(icsText, /BEGIN:VCALENDAR/);
  assert.match(icsText, /BEGIN:VEVENT/);

  const roundTrip = compileUnstructuredIntake(icsText);
  assert.equal(roundTrip.ok, true);
  assert.equal(roundTrip.format, "ics");
  assert.equal(roundTrip.mission.commitments.length, 5);

  const relocation = createSignatureMoveMission();
  const relocationGraph = MissionGraph.fromMission(relocation);
  const movingCrew = {
    commitment_id: "cmt_moveco_van",
    original_booking_ref: "MC-8841",
    state: "AWAITING_APPROVAL",
    proposed_date: "2026-11-20",
    window: "09:30–14:30",
    provider_name: "Overflow Crew (Demo)",
  };
  const crewEvent = (operation) => exportMissionToIcs(relocation, relocationGraph, [operation]).split("BEGIN:VEVENT")[1];
  const pending = crewEvent(movingCrew);
  assert.match(pending, /DTSTART:20261117T080000/);
  assert.match(pending, /DTEND:20261117T130000/);
  assert.match(pending, /LOCATION:MoveCo Express/);
  assert.doesNotMatch(pending, /20261120|Overflow Crew/);
  assert.match(crewEvent({ ...movingCrew, state: "NEEDS_USER" }), /STATUS:TENTATIVE/);

  const digest = "a".repeat(64);
  const result = {
    ...movingCrew,
    state: "COMMITTED",
    receipt_envelope: { receipt_body: { booking_ref: "MC-OVERFLOW" }, proof: { payload_sha256: digest } },
  };
  const unverified = crewEvent(result);
  assert.match(unverified, /RECEIPT UNVERIFIED/);
  assert.doesNotMatch(unverified, /MC-OVERFLOW|payload SHA-256/);
  const verified = crewEvent({ ...result, proof_verification: { valid: true, trusted: true, payload_sha256: digest } });
  assert.match(verified, /DTSTART:20261120T093000/);
  assert.match(verified, /DTEND:20261120T143000/);
  assert.match(verified, /LOCATION:Overflow Crew \(Demo\)/);
  assert.match(verified, /Ref: MC-OVERFLOW/);
  assert.ok(verified.includes(`Verified demo receipt payload SHA-256: ${digest}`));
  assert.equal(verified.match(/^UID:.*$/m)[0], pending.match(/^UID:.*$/m)[0]);

  const bundle = await exportVerifiableAuditBundle({
    mission: m,
    selectedPlan: null,
    operations: [],
    auditLog: [],
  });
  assert.equal(bundle.schema, "continuity-verifiable-audit-bundle/v1");
  assert.equal(bundle.bundle_integrity.bundle_sha256.length, 64);

  await App.page.resetMission({ resetToDefaultScenario: true });
});

test("V2.3 — Cross-Origin Browser Bridge Engine signs verifiable Ed25519 receipt handoffs & rejects tampering", async () => {
  const savedEntries = new Map();
  const options = {
    origin: "https://gpaschercher-sudo.github.io/moveco-agentic-peer",
    sessionStorage: {
      getItem: (name) => savedEntries.get(name),
      setItem: (name, value) => savedEntries.set(name, value),
    },
  };
  const moveco = createPeerBrowserDomainEngine("moveco", options);
  moveco.reset("primary_fri_full");

  const quote = await moveco.callTool("get_moving_quote", {
    booking_ref: "MC-8841",
    target_date: "2026-11-20",
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.primary_refused, true);
  assert.equal(quote.offers[0].offer_id, "off_moveco_partner_overflow_fri");

  const hold = await moveco.callTool("hold_moving_slot", {
    booking_ref: "MC-8841",
    offer_id: "off_moveco_partner_overflow_fri",
    proposed_date: "2026-11-20",
    idempotency_key: "idem_bridge_hold_1",
  });
  assert.equal(hold.ok, true);
  assert.equal(hold.original_booking_preserved, true);

  const commit = await moveco.callTool("reschedule_van_booking", {
    booking_ref: "MC-8841",
    new_date: "2026-11-20",
    window: "09:30–14:30",
    offer_id: "off_moveco_partner_overflow_fri",
    hold_id: hold.hold_id,
    idempotency_key: "idem_bridge_commit_1",
  });
  assert.equal(commit.ok, true);
  assert.ok(commit.handoff_token);

  // Verify signed cross-tab handoff token
  const okHandoff = await verifySignedReceiptHandoff("moveco", commit.handoff_token);
  assert.equal(okHandoff.valid, true);
  assert.equal(okHandoff.receiptBody.scheduled_date, "2026-11-20");

  const restored = createPeerBrowserDomainEngine("moveco", options);
  const observed = await restored.callTool("get_booking_status", { idempotency_key: "idem_bridge_commit_1" });
  assert.equal(observed.execution_state, "COMMITTED");
  assert.deepEqual(observed.receipt_envelope, commit.receipt_envelope);

  // Reject wrong expectedProviderId
  const wrongProv = await verifySignedReceiptHandoff("permitflow", commit.handoff_token);
  assert.equal(wrongProv.valid, false);
});

test("V2.4 — WebMCP Adapter enforces JSON Schema & mandatory human confirmation on irreversible tools", async () => {
  let executed = 0;
  const bridge = exposeActionsToWebMcp(
    (actions) => {
      actions.register({
        name: "read_ping",
        description: "Safe read tool",
        effect: "read",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: () => ({ pong: true }),
      });
      actions.register({
        name: "commit_order",
        description: "Irreversible order commit",
        effect: "irreversible",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["amount"],
          properties: { amount: { type: "number", minimum: 1 } },
        },
        execute: (args) => {
          executed += 1;
          return { ok: true, charged: args.amount };
        },
      });
    },
    {
      namespace: "testsite",
      confirmIrreversible: async (_def, args) => args.amount <= 500,
    },
  );

  assert.equal(bridge.registeredTools.length, 2);
  const pong = await bridge.invokeTool("read_ping", {});
  assert.equal(pong.pong, true);

  // Denied by confirmation callback -> must NOT execute handler
  const denied = await bridge.invokeTool("commit_order", { amount: 900 });
  assert.equal(denied.ok, false);
  assert.equal(denied.cancelled, true);
  assert.equal(executed, 0);

  // Approved by confirmation callback -> executes handler
  const approved = await bridge.invokeTool("commit_order", { amount: 250 });
  assert.equal(approved.ok, true);
  assert.equal(executed, 1);
});

test("V2.5 — Live Open Agentic Web MVP 0.2 & Project NANDA Auditor passes 9/9 checks across all 5 ecosystem sites", async () => {
  const eco = await startAllEcosystemServers({
    continuity: 0,
    moveco: 0,
    permitflow: 0,
    homeconnect: 0,
    powerflow: 0,
  });
  try {
    const allUrls = [
      eco.coordinator.origin(),
      ...Object.values(eco.peers).map((p) => p.origin()),
    ];
    for (const url of allUrls) {
      const report = await auditOpenAgenticSite(url);
      assert.equal(report.ok, true, `Expected ${url} to pass conformance audit: ${JSON.stringify(report.checks)}`);
      assert.equal(report.passedCount, 9);
      assert.equal(report.totalChecks, 9);
    }
  } finally {
    await eco.stopAll();
  }
});

test("V2.6 — Mandate Arbiter enforces immutable SHA-256 mandates, integer-cent Nash bargaining, zero floor leaks, and denies all 4 bypasses", async () => {
  const mission = createSignatureMoveMission();
  const { proposal } = compileMissionChange("Move relocation from Tuesday to Friday below €700.", mission);
  const mandate = await issuePolicyBoundMandate(mission, proposal);

  assert.equal(mandate.ceiling_cents, 70000);
  assert.equal(mandate.mandate_sha256.length, 64);

  // Outbound boundary request strips budget & free text
  const outbound = buildSanitizedPeerBoundaryRequest({
    booking_ref: "MC-8841",
    target_date: "2026-11-20",
    maximum_budget_eur: 700,
    sly_data: { secret: "123" },
  });
  assert.deepEqual(Object.keys(outbound), ["booking_ref", "target_date"]);

  const arbiter = new SealedBidArbiter(mandate, 46600); // €466.00 slice allowance
  const bid1 = await arbiter.commitSealedBid({
    providerId: "moveco_overflow",
    providerName: "MoveCo Overflow",
    askCents: 43000,
    floorCents: 38000,
  });
  assert.equal(bid1.ok, true);
  assert.equal("floorCents" in bid1, false);

  const bid2 = await arbiter.commitSealedBid({
    providerId: "expensive_carrier",
    providerName: "Expensive Carrier",
    askCents: 54000,
    floorCents: 49500, // > 46600 slice allowance -> must return NO_AGREEMENT without leaking 49500!
  });
  assert.equal(bid2.ok, true);

  const resolved = arbiter.resolveNashBargaining();
  const win = resolved.outcomes.find((o) => o.provider_id === "moveco_overflow");
  const noDeal = resolved.outcomes.find((o) => o.provider_id === "expensive_carrier");

  // floor((min(46600, 43000) + 38000) / 2) = floor(81000 / 2) = 40500 cents (€405.00)
  assert.equal(win.status, "AGREEMENT_REACHED");
  assert.equal(win.compromise_cents, 40500);
  assert.equal(win.compromise_eur, 405);
  assert.equal("floorCents" in win, false);

  assert.equal(noDeal.status, "NO_AGREEMENT");
  assert.equal(noDeal.compromise_cents, null);
  assert.equal(JSON.stringify(noDeal).includes("495"), false);

  const bypassReport = runAdversarialBypassAudit(mandate, arbiter);
  assert.equal(bypassReport.allDenied, true);
  assert.equal(bypassReport.results.length, 4);
});

test("V2.7 — OperationLedger SHA-256 cryptographic hash chain verifies intact Saga history and detects 1-byte tampering", () => {
  const ledger = new OperationLedger();
  ledger.createOperation({ operation_id: "op_chain_1", commitment_id: "cmt_1" });
  ledger.transition("op_chain_1", "PROPOSED", "Solver proposed Friday");
  ledger.transition("op_chain_1", "PREPARED", "15-min slot hold locked");

  const intact = ledger.getHistory();
  const verifyOk = OperationLedger.verifyChainIntegrity(intact);
  assert.equal(verifyOk.valid, true);
  assert.equal(verifyOk.verifiedEntries, 3);

  // Tamper 1 character in seq #2 reason
  const tampered = JSON.parse(JSON.stringify(intact));
  tampered[1].reason = "Solver proposed Saturday";
  const verifyBad = OperationLedger.verifyChainIntegrity(tampered);
  assert.equal(verifyBad.valid, false);
  assert.equal(verifyBad.brokenAtSeq, 2);
});

test("V2.8 — Google ADK -> Open Agentic Web HOCON Converter preserves 3-agent hierarchy, scrubs leaked keys, and rejects cycles", async () => {
  const conv = await convertAgentFrameworkToHoconBundle(SAMPLE_GOOGLE_ADK_CONFIG);
  assert.equal(conv.ok, true);
  assert.equal(conv.equivalenceReport.sourceFramework, "Google ADK");
  assert.equal(conv.equivalenceReport.emittedAgentsCount, 3);
  assert.equal(conv.manifestJson.networks[0].front_man, "campus_relocation_concierge");
  assert.equal(conv.manifestJson.llm_router.mock, false);
  assert.equal(conv.manifestJson.allowed_peers.length, 2);

  // Credential scrubbing check
  const withSecret = await convertAgentFrameworkToHoconBundle({
    agent_class: "LlmAgent",
    name: "leaky_agent",
    instruction: "Never expose sk-1234567890abcdefghijklmnop in prompts.",
  });
  assert.equal(withSecret.equivalenceReport.credentialsRedactedCount, 1);
  assert.equal(withSecret.networkJson.tools[0].instructions.includes("sk-12345"), false);

  // Delegation cycle rejection check
  await assert.rejects(
    () =>
      convertAgentFrameworkToHoconBundle({
        agent_class: "LlmAgent",
        name: "root_bot",
        sub_agents: [
          {
            agent_class: "LlmAgent",
            name: "child_bot",
            sub_agents: [{ agent_class: "LlmAgent", name: "root_bot" }],
          },
        ],
      }),
    /cycle rejected/i,
  );
});

test("V2.9 — Direct Graph Node Pinning allows compatible locks and refuses conflicting SAME_DAY_REQUIRED locks", async () => {
  await App.page.resetMission({ resetToDefaultScenario: true });
  await App.page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday under €700.");

  // Pinning PowerFlow Tuesday (compatible prerequisite) keeps plan feasible
  const okPin = await App.page.togglePinCommitment("cmt_powerflow_grid");
  assert.equal(okPin.ok, true);

  // Pinning PermitFlow Curbside Bay to Tuesday while Van moves to Friday violates SAME_DAY_REQUIRED -> cleanly rejected!
  const conflictPin = await App.page.togglePinCommitment("cmt_permitflow_bay");
  assert.equal(conflictPin.ok, false);
  assert.match(conflictPin.reason, /Curbside loading bay permit/i);

  // Unpinning restores feasibility immediately
  const unpin = await App.page.togglePinCommitment("cmt_permitflow_bay");
  assert.equal(unpin.ok, true);

  await App.page.resetMission({ resetToDefaultScenario: true });
});

test("V2.10 — Standalone Open Agentic Web & NANDA Submission CLI (continuity-audit) validates live origins with exit code 0", async () => {
  const eco = await startAllEcosystemServers({
    continuity: 0,
    moveco: 0,
    permitflow: 0,
    homeconnect: 0,
    powerflow: 0,
  });
  try {
    const cliPath = path.join(REPO_ROOT, "packages", "nanda-resolver", "cli.mjs");
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "--json",
      eco.coordinator.origin(),
      eco.peers.moveco.origin(),
    ]);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.sitesAudited, 2);
    assert.equal(parsed.reports[0].passedCount, 9);
    assert.equal(parsed.reports[0].corsAllowOrigin, "*");
  } finally {
    await eco.stopAll();
  }
});
