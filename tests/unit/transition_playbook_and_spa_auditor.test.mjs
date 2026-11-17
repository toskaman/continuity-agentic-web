import assert from "node:assert/strict";
import test from "node:test";
import { ContinuityCoordinatorPage } from "../../apps/continuity-web/script.js";
import { ContinuityScriptedReplayLlm } from "../../apps/continuity-web/site.js";
import {
  SAMPLE_HYBRID_ICS_CALENDAR,
  SAMPLE_RAW_CONFIRMATION_EMAILS,
} from "../../packages/intake-compiler/index.js";
import { auditOpenAgenticSite } from "../../packages/nanda-resolver/index.js";

test("Cycle 41 & 45 — @continuity/transition-playbook separates autonomous Open Agentic Web ops from legacy Hold-First reschedule drafts and computes avoided cancel fees", async () => {
  // 1. Agentic Web Relocation Mission -> 3 autonomous Open Agentic Web ops, 0 legacy drafts
  const page = new ContinuityCoordinatorPage();
  await page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday below €700.");
  const agenticPlaybook = page.getTransitionPlaybook();
  assert.equal(agenticPlaybook.ok, true);
  assert.equal(agenticPlaybook.agenticStepsCount, 3);
  assert.equal(agenticPlaybook.legacyStepsCount, 0);
  assert.equal(agenticPlaybook.preservedCount, 3);
  assert.ok(agenticPlaybook.avoidedPenaltiesTotalEur > 0);

  // 2. Imported real-world confirmation emails (unagentified vendors) -> ordered Hold-First legacy drafts + mailto: links
  const imported = await page.importCustomSchedule(SAMPLE_RAW_CONFIRMATION_EMAILS);
  assert.equal(imported.ok, true);
  await page.analyzeAndPrepareChange(imported.suggestedPrompt);

  const hybridPlaybook = page.getTransitionPlaybook();
  assert.equal(hybridPlaybook.ok, true);
  assert.equal(hybridPlaybook.agenticStepsCount, 0);
  assert.ok(hybridPlaybook.legacyStepsCount >= 2);
  assert.equal(hybridPlaybook.steps[0].stepNumber, 1);
  assert.match(hybridPlaybook.steps[0].mailtoHref, /^mailto:\?subject=/);
  assert.match(hybridPlaybook.steps[0].messageDraft, /Hold-Before-Release/i);
  assert.match(hybridPlaybook.markdown, /# CONTINUITY — Safe Change Execution Playbook/);
});

test("Cycle 43 — auditOpenAgenticSite handles Cloudflare Pages / SPA HTTP 200 text/html fallbacks cleanly without JSON parse crashes", async () => {
  const spaFetch = async (url) => {
    const u = String(url);
    if (u === "https://spa-site.pages.dev/agent-manifest.json") {
      return new Response(
        JSON.stringify({
          brand: "SPA Agentic Site",
          networks: [{ name: "spa_net", front_man: "spa_front", hocon: "./spa_net.network.json" }],
          llm_router: { base_url: "https://api.otari.ai/api/v1" },
          peer_policy: { mode: "closed" },
          allowed_peers: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u === "https://spa-site.pages.dev/spa_net.network.json") {
      return new Response(
        JSON.stringify({
          tools: [{ name: "spa_front", instructions: "Hello", tools: [] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("action-bridge.html")) {
      return new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }
    // Simulate Cloudflare Pages returning index.html with HTTP 200 for missing JSON files
    return new Response("<!doctype html><html><body>SPA index</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };

  const report = await auditOpenAgenticSite("https://spa-site.pages.dev/", spaFetch);
  assert.equal(report.ok, true);
  assert.equal(report.passedCount, 6);
  assert.equal(report.totalChecks, 9);
  const a2aCheck = report.checks.find((c) => c.id === "NANDA-A2A");
  assert.equal(a2aCheck.status, "WARN");
  assert.match(a2aCheck.detail, /HTML SPA fallback/);
});

test("Cycle 49 — SAMPLE_HYBRID_ICS_CALENDAR preserves RFC 5545 URL & X-AGENTIC-NETWORK bindings for mixed Open Agentic Web + Legacy Vendor schedules", async () => {
  const page = new ContinuityCoordinatorPage();
  const imported = await page.importCustomSchedule(SAMPLE_HYBRID_ICS_CALENDAR);
  assert.equal(imported.ok, true);
  assert.equal(imported.format, "ics");
  assert.equal(imported.commitmentsCount, 4);

  const prep = await page.analyzeAndPrepareChange(imported.suggestedPrompt);
  assert.equal(prep.ok, true);

  const playbook = page.getTransitionPlaybook();
  assert.equal(playbook.ok, true);
  assert.equal(playbook.agenticStepsCount, 0);
  assert.equal(playbook.legacyStepsCount, 3);
  assert.equal(playbook.preservedCount, 1);
  assert.equal(playbook.avoidedPenaltiesTotalEur, 45);

  const legacyStep = playbook.steps.find((s) => s.bookingRef === "ELV-204");
  assert.ok(legacyStep);
  assert.equal(legacyStep.bookingRef, "ELV-204");
  assert.match(legacyStep.mailtoHref, /^mailto:\?subject=/);
});

test("Cycle 50 — ContinuityScriptedReplayLlm drives website_export_transition_playbook CRUSE tables, website_release_prepared_holds, and 9/9 audit summaries", async () => {
  const replay = new ContinuityScriptedReplayLlm(null);
  const tools = [
    { function: { name: "website_export_transition_playbook" } },
    { function: { name: "website_release_prepared_holds" } },
    { function: { name: "website_audit_open_agentic_site" } },
    { function: { name: "render_cruse" } },
  ];

  // 1. Playbook tool call -> CRUSE table -> final summary
  const t1 = await replay.chat({
    messages: [{ role: "user", content: "Export my Hold-First playbook checklist." }],
    tools,
  });
  assert.equal(t1.toolCalls[0].function.name, "website_export_transition_playbook");

  const t2 = await replay.chat({
    messages: [
      { role: "user", content: "Export my Hold-First playbook checklist." },
      {
        role: "tool",
        name: "website_export_transition_playbook",
        content: JSON.stringify({
          ok: true,
          agenticStepsCount: 2,
          legacyStepsCount: 1,
          preservedCount: 1,
          avoidedPenaltiesTotalEur: 45,
          steps: [
            {
              stepNumber: 1,
              commitmentTitle: "Moving Van",
              bookingRef: "MC-8841",
              channelBadge: "Open Agentic Web · Autonomous Hold & Signed Receipt",
              fromDate: "2026-11-17",
              toDate: "2026-11-20",
              expectedTotalEur: 415,
            },
          ],
        }),
      },
    ],
    tools,
  });
  assert.equal(t2.toolCalls[0].function.name, "render_cruse");

  // 2. Audit summary reports 9/9 checks (after render_cruse tool turn) & release holds reports €0.00
  const aFinal = await replay.chat({
    messages: [
      { role: "user", content: "Audit all 5 sites for MVP 0.2 conformance." },
      {
        role: "tool",
        name: "website_audit_open_agentic_site",
        content: JSON.stringify({ ok: true, sitesAudited: 5, results: [] }),
      },
      { role: "tool", name: "render_cruse", content: "{}" },
    ],
    tools,
  });
  assert.match(aFinal.content, /9\/9 checks each/);

  const relTurn = await replay.chat({
    messages: [{ role: "user", content: "Please release my prepared holds." }],
    tools,
  });
  assert.equal(relTurn.toolCalls[0].function.name, "website_release_prepared_holds");
});
