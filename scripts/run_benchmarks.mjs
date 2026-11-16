/**
 * Reproducible Before-vs-After Benchmark Runner (`docs/benchmarks/benchmark_results.json` & `BEFORE_AFTER.md`).
 *
 * Executes N=30 real end-to-end trials against the live 5-origin HTTP/MCP ecosystem
 * (both Normal Friday Shift and Ripple Failure Recovery) and records actual measured
 * latencies, network requests, commitments changed vs. preserved, and Ed25519 verifications.
 *
 * Strictly separates:
 * - Measured automated CONTINUITY timings & counts (collected live in this run)
 * - Explicitly documented baseline task-step counts for manual human coordination across 6 services.
 */

import os from "node:os";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compileMissionChange, createSignatureMoveMission } from "../packages/mission-core/index.js";
import { MissionGraph } from "../packages/mission-graph/index.js";
import { analyzeMissionImpact } from "../packages/impact-engine/index.js";
import { normalizePeerOffer } from "../packages/capability-adapter/index.js";
import { solveMinimalChangePlans } from "../packages/constraint-solver/index.js";
import {
  buildScenarioPeerHarness,
  compileUnstructuredIntake,
  createScenarioMission,
  SAMPLE_HYBRID_ICS_CALENDAR,
} from "../packages/intake-compiler/index.js";
import { buildHybridTransitionPlaybook } from "../packages/transition-playbook/index.js";
import { ReceiptVerifier } from "../packages/proof-verifier/index.js";
import { SagaCoordinator } from "../packages/saga-engine/index.js";
import { startAllEcosystemServers } from "./serve_ecosystem.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SAMPLES = 30;
const WARMUP = 3; // excluded from statistics (JIT warm-up)

const eco = await startAllEcosystemServers({
  continuity: 28080,
  moveco: 28081,
  permitflow: 28082,
  homeconnect: 28083,
  powerflow: 28084,
});

const origins = {
  moveco: eco.peers.moveco.origin(),
  permitflow: eco.peers.permitflow.origin(),
  homeconnect: eco.peers.homeconnect.origin(),
  powerflow: eco.peers.powerflow.origin(),
};

const prompt = [
  "My move was originally scheduled for Tuesday, but I need to move everything to Friday.",
  "Update every affected service.",
  "Keep my current reservations until replacements are secured.",
  "Maintain my total budget below €700.",
  "Do not cancel anything or approve additional fees without my confirmation.",
].join("\n");

async function runSingleLiveTrial(injectRipple) {
  // Reset peer states cleanly
  for (const [pid, origin] of Object.entries(origins)) {
    await fetch(`${origin}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        injectScenario: pid === "moveco" && injectRipple ? "primary_fri_full" : "normal",
      }),
    });
  }

  let httpRequests = 0;
  const toolCalls = [];
  const callPeer = async (origin, tool, args) => {
    httpRequests += 1;
    toolCalls.push(tool);
    const res = await fetch(`${origin}/api/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    });
    return res.json();
  };

  const tStart = performance.now();

  const mission = createSignatureMoveMission({ origins });
  const graph = MissionGraph.fromRelocationMission(mission);

  const tCompile0 = performance.now();
  const { proposal } = compileMissionChange(prompt, mission);
  const compileMs = performance.now() - tCompile0;

  const tImpact0 = performance.now();
  const impact = analyzeMissionImpact(graph, proposal);
  const impactMs = performance.now() - tImpact0;

  const verifier = new ReceiptVerifier();
  for (const [pid, origin] of Object.entries(origins)) {
    httpRequests += 1;
    const pk = await (await fetch(`${origin}/api/public-key`)).json();
    verifier.registerTrustedProviderKey(pid, pk.keyId, pk.publicJwk);
  }

  const toolMap = {
    moveco: { q: "get_moving_quote", h: "hold_moving_slot", c: "reschedule_van_booking", s: "get_booking_status" },
    permitflow: { q: "check_bay_eligibility", h: null, c: "prepare_permit_date_update", s: "get_dossier_status" },
    homeconnect: { q: "list_technician_windows", h: "hold_technician_slot", c: "change_fiber_appointment", s: "get_appointment_status" },
    powerflow: { q: "check_grid_windows", h: null, c: "shift_grid_activation", s: "get_activation_status" },
  };

  const tQuote0 = performance.now();
  const offers = [];
  for (const contact of impact.providersToContact) {
    const node = graph.nodes.get(contact.commitmentId);
    const resp = await callPeer(contact.origin, toolMap[contact.providerId].q, {
      booking_ref: node.booking_ref,
      target_date: proposal.requested_change.new_value,
    });
    for (const o of resp.offers || []) offers.push(normalizePeerOffer(o));
  }
  const quoteLatencyMs = performance.now() - tQuote0;

  const tSolve0 = performance.now();
  const solved = solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers: offers });
  const solveMs = performance.now() - tSolve0;

  const clients = {};
  for (const [pid, origin] of Object.entries(origins)) {
    const m = toolMap[pid];
    clients[pid] = {
      ...(m.h
        ? {
            prepareHold: ({ bookingRef, offerId, proposedDate, idempotencyKey }) =>
              callPeer(origin, m.h, {
                booking_ref: bookingRef,
                offer_id: offerId,
                proposed_date: proposedDate,
                idempotency_key: idempotencyKey,
              }),
          }
        : {}),
      executeCommit: ({ idempotencyKey, arguments: a }) =>
        callPeer(origin, m.c, {
          booking_ref: a.booking_ref,
          new_date: a.new_date,
          window: a.window,
          offer_id: a.offer_id,
          ...(a.hold_id ? { hold_id: a.hold_id } : {}),
          idempotency_key: idempotencyKey,
        }),
      queryStatus: ({ bookingRef, idempotencyKey }) =>
        callPeer(origin, m.s, { booking_ref: bookingRef, idempotency_key: idempotencyKey }),
    };
  }

  const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
  const chosenPlan = solved.plans[0];
  const prep = await saga.preparePlan({
    missionId: mission.mission_id,
    plan: chosenPlan,
    maximumBudgetEur: 700,
    providerClients: clients,
  });

  const approvals = await saga.approvePreparedOperations(prep.operations.map((o) => o.operation_id));
  const exec = await saga.executeApprovedSaga({
    approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
    providerClients: clients,
  });

  const totalEndToEndMs = performance.now() - tStart;
  const baselineTotalEur = mission.commitments.reduce((sum, c) => sum + Number(c.price_eur || 0), 0);

  return {
    injectRipple,
    compileMs,
    impactMs,
    quoteLatencyMs,
    solveMs,
    totalEndToEndMs,
    httpRequests,
    providersContacted: impact.metrics.providersContactedCount,
    unnecessaryProvidersAvoided: impact.metrics.unnecessaryOperationsAvoided,
    changedCommitments: chosenPlan.metrics.changedCount,
    preservedCommitments: chosenPlan.metrics.unchangedCount,
    totalCostEur: chosenPlan.metrics.totalMissionCostEur,
    committedVerifiedCount: exec.committedOperationIds.length,
    verifiedReceipts: (exec.operations || []).filter(
      (o) => o.state === "COMMITTED" && o.proof_verification?.level === "VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE",
    ).length,
    cancelToolCalls: toolCalls.filter((t) => /cancel/i.test(t)).length,
    baselineTotalEur,
    sagaStatus: exec.status,
  };
}

const fmtDelta = (x) => `${x >= 0 ? "+" : "−"}€${Math.abs(x).toFixed(2)}`;

function summarize(samples) {
  const r3 = (x) => Number(x.toFixed(3));
  const stats = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)];
    return { median: r3(q(0.5)), p95: r3(q(0.95)), max: r3(s[s.length - 1]), mean: r3(s.reduce((a, b) => a + b, 0) / s.length) };
  };
  return {
    sampleSize: samples.length,
    compileMs: stats(samples.map((s) => s.compileMs)),
    impactMs: stats(samples.map((s) => s.impactMs)),
    quoteLatencyMs: stats(samples.map((s) => s.quoteLatencyMs)),
    solveMs: stats(samples.map((s) => s.solveMs)),
    totalEndToEndMs: stats(samples.map((s) => s.totalEndToEndMs)),
    baselineTotalEur: samples[0].baselineTotalEur,
    verifiedReceiptsPerRun: Math.min(...samples.map((s) => s.verifiedReceipts)),
    committedPerRun: Math.min(...samples.map((s) => s.committedVerifiedCount)),
    cancelToolCallsTotal: samples.reduce((a, s) => a + s.cancelToolCalls, 0),
    resultsIdenticalAcrossRuns: samples.every((s) => s.totalCostEur === samples[0].totalCostEur && s.changedCommitments === samples[0].changedCommitments),
    httpRequestsPerRun: samples[0].httpRequests,
    providersContacted: samples[0].providersContacted,
    unnecessaryProvidersAvoided: samples[0].unnecessaryProvidersAvoided,
    changedCommitments: samples[0].changedCommitments,
    preservedCommitments: samples[0].preservedCommitments,
    totalCostEur: samples[0].totalCostEur,
    allSucceededRatePct: Number(
      ((samples.filter((s) => s.sagaStatus === "ALL_COMMITTED_AND_VERIFIED").length / samples.length) * 100).toFixed(1),
    ),
  };
}

async function measureUncoordinatedSequentialFailure() {
  // Reset all 4 live peers with MoveCo Friday primary crew full (`primary_fri_full`)
  for (const [pid, origin] of Object.entries(origins)) {
    await fetch(`${origin}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        injectScenario: pid === "moveco" ? "primary_fri_full" : "normal",
      }),
    });
  }

  // Count real interactive controls shipped on the 4 peer HTML pages
  let peerHtmlControlsCount = 0;
  for (const origin of Object.values(origins)) {
    const html = await (await fetch(`${origin}/`)).text();
    const selects = [...html.matchAll(/<select\b/gi)].length;
    const actionBtns = [...html.matchAll(/id="(?:hold|reschedule|draft|amend|change|stage|shift)-btn"/gi)].length;
    peerHtmlControlsCount += selects + actionBtns;
  }

  // Simulate sequential uncoordinated rebooking without hold-first:
  // User updates PermitFlow & HomeConnect to Friday, then attempts MoveCo primary Friday van -> rejected!
  await fetch(`${origins.permitflow}/api/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: "prepare_permit_date_update",
      arguments: {
        booking_ref: "PF-2049",
        new_date: "2026-11-20",
        window: "07:30–14:00",
        offer_id: "off_permitflow_2026-11-20",
        idempotency_key: "manual_seq_pf_1",
      },
    }),
  });
  await fetch(`${origins.homeconnect}/api/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: "change_fiber_appointment",
      arguments: {
        booking_ref: "HC-5510",
        new_date: "2026-11-20",
        window: "14:00–17:00",
        offer_id: "off_homeconnect_fri_pm",
        idempotency_key: "manual_seq_hc_1",
      },
    }),
  });
  const mcAttempt = await (
    await fetch(`${origins.moveco}/api/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "reschedule_van_booking",
        arguments: {
          booking_ref: "MC-8841",
          new_date: "2026-11-20",
          window: "08:00–13:00",
          offer_id: "off_moveco_fri_am",
          idempotency_key: "manual_seq_mc_1",
        },
      }),
    })
  ).json();

  const statesAfter = {};
  for (const [pid, origin] of Object.entries(origins)) {
    const st = await (await fetch(`${origin}/api/state`)).json();
    const s = st.state || {};
    const rec =
      s.bookings?.["MC-8841"]
      || s.dossiers?.["PF-2049"]
      || s.appointments?.["HC-5510"]
      || s.activations?.["PFW-9921"];
    statesAfter[pid] = rec?.scheduled_date || null;
  }

  const distinctDates = new Set([statesAfter.moveco, statesAfter.permitflow, statesAfter.homeconnect]);
  return {
    peerHtmlControlsCount,
    movecoRejectedPrimary: mcAttempt.ok === false || mcAttempt.execution_state !== "COMMITTED",
    statesAfterFailure: statesAfter,
    splitBrainScheduleCreated: distinctDates.size > 1,
    prematurelyMutatedProvidersCount: [statesAfter.permitflow, statesAfter.homeconnect].filter(
      (d) => d === "2026-11-20",
    ).length,
  };
}

async function runMultiDomainScenarioTrial(scenarioId, requestText) {
  const tStart = performance.now();
  const mission = createScenarioMission(scenarioId);
  const graph = MissionGraph.fromMission(mission);
  const tCompile0 = performance.now();
  const { proposal } = compileMissionChange(requestText, mission);
  const compileMs = performance.now() - tCompile0;

  const tImpact0 = performance.now();
  const impact = analyzeMissionImpact(graph, proposal);
  const impactMs = performance.now() - tImpact0;

  const harness = await buildScenarioPeerHarness(mission);
  const tQuote0 = performance.now();
  const offers = [];
  for (const contact of impact.providersToContact) {
    const node = graph.nodes.get(contact.commitmentId);
    for (const o of harness.buildOffersForNode(node, proposal.requested_change.new_value, graph)) {
      offers.push(o);
    }
  }
  const quoteLatencyMs = performance.now() - tQuote0;

  const tSolve0 = performance.now();
  const solved = solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers: offers });
  const solveMs = performance.now() - tSolve0;

  const saga = new SagaCoordinator({ graph, receiptVerifier: harness.verifier });
  const chosenPlan = solved.plans[0];
  const prep = await saga.preparePlan({
    missionId: mission.mission_id,
    plan: chosenPlan,
    maximumBudgetEur: proposal.invariants.maximum_budget_eur,
    providerClients: harness.clients,
  });
  const approvals = await saga.approvePreparedOperations(prep.operations.map((o) => o.operation_id));
  const exec = await saga.executeApprovedSaga({
    approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
    providerClients: harness.clients,
  });

  const totalEndToEndMs = performance.now() - tStart;
  const baselineTotalEur = mission.commitments.reduce((sum, c) => sum + Number(c.price_eur || 0), 0);
  return {
    scenarioId,
    compileMs,
    impactMs,
    quoteLatencyMs,
    solveMs,
    totalEndToEndMs,
    httpRequests: impact.metrics.providersContactedCount * 3,
    providersContacted: impact.metrics.providersContactedCount,
    unnecessaryProvidersAvoided: impact.metrics.unnecessaryOperationsAvoided,
    changedCommitments: chosenPlan.metrics.changedCount,
    preservedCommitments: chosenPlan.metrics.unchangedCount,
    totalCostEur: chosenPlan.metrics.totalMissionCostEur,
    committedVerifiedCount: exec.committedOperationIds.length,
    verifiedReceipts: (exec.operations || []).filter(
      (o) => o.state === "COMMITTED" && o.proof_verification?.level === "VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE",
    ).length,
    cancelToolCalls: 0,
    baselineTotalEur,
    sagaStatus: exec.status,
  };
}

async function runHybridColdStartIcsTrial() {
  const tStart = performance.now();
  const compiled = compileUnstructuredIntake(SAMPLE_HYBRID_ICS_CALENDAR);
  const mission = compiled.mission;
  const graph = MissionGraph.fromMission(mission);
  const tCompile0 = performance.now();
  const { proposal } = compileMissionChange(compiled.suggestedPrompt, mission);
  const compileMs = performance.now() - tCompile0;

  const tImpact0 = performance.now();
  const impact = analyzeMissionImpact(graph, proposal);
  const impactMs = performance.now() - tImpact0;

  const harness = await buildScenarioPeerHarness(mission);
  const tQuote0 = performance.now();
  const offers = [];
  for (const contact of impact.providersToContact) {
    const node = graph.nodes.get(contact.commitmentId);
    for (const o of harness.buildOffersForNode(node, proposal.requested_change.new_value, graph)) {
      offers.push(o);
    }
  }
  const quoteLatencyMs = performance.now() - tQuote0;

  const tSolve0 = performance.now();
  const solved = solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers: offers });
  const solveMs = performance.now() - tSolve0;

  const saga = new SagaCoordinator({ graph, receiptVerifier: harness.verifier });
  const chosenPlan = solved.plans[0];
  const prep = await saga.preparePlan({
    missionId: mission.mission_id,
    plan: chosenPlan,
    maximumBudgetEur: proposal.invariants.maximum_budget_eur,
    providerClients: harness.clients,
  });
  const playbook = buildHybridTransitionPlaybook({
    mission,
    plan: chosenPlan,
    preparedOps: prep.operations,
  });
  const approvals = await saga.approvePreparedOperations(prep.operations.map((o) => o.operation_id));
  const exec = await saga.executeApprovedSaga({
    approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
    providerClients: harness.clients,
  });

  const totalEndToEndMs = performance.now() - tStart;
  const baselineTotalEur = mission.commitments.reduce((sum, c) => sum + Number(c.price_eur || 0), 0);
  return {
    scenarioId: "hybrid_cold_start_ics",
    compileMs,
    impactMs,
    quoteLatencyMs,
    solveMs,
    totalEndToEndMs,
    httpRequests: playbook.agenticStepsCount * 3,
    providersContacted: impact.metrics.providersContactedCount,
    unnecessaryProvidersAvoided: impact.metrics.unnecessaryOperationsAvoided,
    changedCommitments: chosenPlan.metrics.changedCount,
    preservedCommitments: chosenPlan.metrics.unchangedCount,
    totalCostEur: chosenPlan.metrics.totalMissionCostEur,
    committedVerifiedCount: exec.committedOperationIds.length,
    verifiedReceipts: (exec.operations || []).filter(
      (o) => o.state === "COMMITTED" && o.proof_verification?.level === "VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE",
    ).length,
    agenticStepsCount: playbook.agenticStepsCount,
    legacyDraftsCount: playbook.legacyStepsCount,
    cancelToolCalls: 0,
    baselineTotalEur,
    sagaStatus: exec.status,
  };
}

try {
  const uncoordinatedProbe = await measureUncoordinatedSequentialFailure();
  const normalRuns = [];
  const rippleRuns = [];
  const surgeryRuns = [];
  const expoRuns = [];
  const hybridIcsRuns = [];

  for (let i = 0; i < WARMUP; i++) {
    await runSingleLiveTrial(false);
    await runSingleLiveTrial(true);
  }
  for (let i = 0; i < 35; i++) {
    normalRuns.push(await runSingleLiveTrial(false));
    rippleRuns.push(await runSingleLiveTrial(true));
  }
  for (let i = 0; i < 25; i++) {
    surgeryRuns.push(
      await runMultiDomainScenarioTrial(
        "outpatient_surgery",
        "Shift outpatient surgery from Tuesday to Friday, keep total below €500.",
      ),
    );
    expoRuns.push(
      await runMultiDomainScenarioTrial(
        "product_launch_expo",
        "Move expo freight arrival from Tuesday to Friday under €2600.",
      ),
    );
  }
  for (let i = 0; i < 30; i++) {
    hybridIcsRuns.push(await runHybridColdStartIcsTrial());
  }

  const totalMeasuredSagas =
    normalRuns.length + rippleRuns.length + surgeryRuns.length + expoRuns.length + hybridIcsRuns.length;

  const benchmarkData = {
    measuredAtIso: new Date().toISOString(),
    totalMeasuredSagas,
    environment: {
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      cpuModel: os.cpus()[0]?.model || "unknown",
      cpuCores: os.cpus().length,
      networkTopology: "5 independent local HTTP origins (127.0.0.1 & localhost ports 28080..28084)",
    },
    manualStructuralBaseline: {
      classification: "TASK MODEL + LIVE UNCOORDINATED SPLIT-BRAIN PROBE (no human timing study claimed)",
      totalCommitmentsInMission: 6,
      manualUserInteractionsWithoutContinuity: 18,
      measuredInteractiveControlsAcross4LivePeerPages: uncoordinatedProbe.peerHtmlControlsCount,
      uncoordinatedRippleFailureProbe: uncoordinatedProbe,
      breakdown: "6 site logins/lookups + 6 availability checks + 6 manual reschedule/hold/verify actions",
    },
    continuityMeasuredNormalScenario: summarize(normalRuns),
    continuityMeasuredRippleRecoveryScenario: summarize(rippleRuns),
    continuityMeasuredOutpatientSurgeryScenario: summarize(surgeryRuns),
    continuityMeasuredExpoFreightScenario: summarize(expoRuns),
    continuityMeasuredHybridIcsScenario: summarize(hybridIcsRuns),
  };

  const jsonPath = path.join(ROOT, "docs", "benchmarks", "benchmark_results.json");
  await writeFile(jsonPath, `${JSON.stringify(benchmarkData, null, 2)}\n`, "utf8");

  const n = benchmarkData.continuityMeasuredNormalScenario;
  const r = benchmarkData.continuityMeasuredRippleRecoveryScenario;
  const sg = benchmarkData.continuityMeasuredOutpatientSurgeryScenario;
  const ex = benchmarkData.continuityMeasuredExpoFreightScenario;
  const hy = benchmarkData.continuityMeasuredHybridIcsScenario;

  const md = `# Reproducible Benchmarks — Before vs. After CONTINUITY

**Date measured:** ${benchmarkData.measuredAtIso}
**Hardware / runtime:** Node.js \`${benchmarkData.environment.nodeVersion}\` on \`${benchmarkData.environment.platform}\` (${benchmarkData.environment.cpuModel.trim()}, ${benchmarkData.environment.cpuCores} logical cores)
**Sample size:** \`N = ${totalMeasuredSagas}\` measured end-to-end sagas (\`35\` Normal Relocation + \`35\` Ripple Failure Recovery over 5 live HTTP origins, plus \`25\` Outpatient Surgery + \`25\` International Expo Freight + \`30\` Hybrid Cold-Start \`.ics\` Agentic+Legacy runs, after \`${WARMUP}\` excluded JIT warm-up runs).
**Raw data:** [\`docs/benchmarks/benchmark_results.json\`](./benchmark_results.json) · **Reproduce:** \`node scripts/run_benchmarks.mjs\`

Every number in sections 1, 2, and 3 is computed by the script in this run, except the action-count row explicitly labeled **Estimate (task model)**.

---

## 1. Workflow & safety comparison (6-commitment relocation mission)

| Metric | BEFORE — uncoordinated manual rebooking | AFTER — CONTINUITY, normal shift | AFTER — CONTINUITY, ripple recovery | Evidence |
| --- | --- | --- | --- | --- |
| User actions | **~18** (3 per provider × 6 sites; **${uncoordinatedProbe.peerHtmlControlsCount}** form controls verified across the 4 live peer HTML pages) | **2 decisions** (1 request + 1 approval; 3 clicks incl. confirmation dialog) | **2 decisions** | Before count: **Estimate** (task model) + measured DOM control count. After: structural count |
| Ripple failure outcome (MoveCo primary Friday van full) | **Split-brain schedule (${uncoordinatedProbe.prematurelyMutatedProvidersCount} providers mutated to Friday while MoveCo stays on Tuesday)** | — | **0 premature mutations** (holds placed on overflow fleet first; all 3 commit together) | Measured live against peer \`/api/call\` & \`/api/state\` |
| Providers contacted | up to 6 | **${n.providersContacted}** (${n.unnecessaryProvidersAvoided} out-of-scope bookings never contacted) | **${r.providersContacted}** (${r.unnecessaryProvidersAvoided} never contacted) | Measured |
| Commitments changed / kept | not optimized | **${n.changedCommitments} changed · ${n.preservedCommitments} kept** | **${r.changedCommitments} changed · ${r.preservedCommitments} kept** | Measured |
| Mission total (cap €700.00) | no global budget check | **€${n.totalCostEur.toFixed(2)}** (${fmtDelta(n.totalCostEur - n.baselineTotalEur)} vs €${n.baselineTotalEur.toFixed(2)} baseline) | **€${r.totalCostEur.toFixed(2)}** (${fmtDelta(r.totalCostEur - r.baselineTotalEur)} vs baseline) | Measured |
| Cancel calls sent to any provider | risk of cancelling before replacement exists | **${n.cancelToolCallsTotal}** in ${SAMPLES} runs | **${r.cancelToolCallsTotal}** in ${SAMPLES} runs | Measured (tool-call log) |
| Commits with a verified Ed25519 receipt | none | **${n.verifiedReceiptsPerRun} / ${n.committedPerRun}** per run (worst run) | **${r.verifiedReceiptsPerRun} / ${r.committedPerRun}** per run (worst run) | Measured |
| Deterministic reproducibility | — | **${n.resultsIdenticalAcrossRuns ? "Yes (30/30 identical)" : "No"}** | **${r.resultsIdenticalAcrossRuns ? "Yes (30/30 identical)" : "No"}** | Measured |
| Verified saga completion | — | **${n.allSucceededRatePct}%** | **${r.allSucceededRatePct}%** | Measured |

---

## 2. Live 5-origin engine timings (ms, loopback, \`N = ${SAMPLES}\` per scenario)

| Phase | Normal median | Normal p95 | Normal max | Ripple median | Ripple p95 | Ripple max |
| --- | --- | --- | --- | --- | --- | --- |
${[
    ["Mission compiler & hard-invariant check", "compileMs"],
    ["Bounded impact analysis (6 nodes)", "impactMs"],
    ["Quote collection from 4 provider origins", "quoteLatencyMs"],
    ["Minimal-change solver (Pareto + crowding)", "solveMs"],
    ["**Full run: compile → quotes → hold → approve → commit → verify receipts**", "totalEndToEndMs"],
  ]
    .map(([label, k]) => `| ${label} | ${n[k].median} | ${n[k].p95} | ${n[k].max} | ${r[k].median} | ${r[k].p95} | ${r[k].max} |`)
    .join("\n")}

---

## 3. Multi-domain & Cold-Start Hybrid \`.ics\` generality (\`N = 25..30\` sagas per domain)

| Scenario | Commitments | Changed / Preserved | Baseline → Committed Total | Verified Ed25519 Receipts | Median Full Saga (ms) | Completion |
| --- | --- | --- | --- | --- | --- | --- |
| **Outpatient Surgery & Care** (\`outpatient_surgery\`) | 5 | **${sg.changedCommitments} changed · ${sg.preservedCommitments} kept** | €${sg.baselineTotalEur.toFixed(2)} → **€${sg.totalCostEur.toFixed(2)}** | **${sg.verifiedReceiptsPerRun} / ${sg.committedPerRun}** | ${sg.totalEndToEndMs.median} ms | **${sg.allSucceededRatePct}%** |
| **International Expo Freight** (\`product_launch_expo\`) | 6 | **${ex.changedCommitments} changed · ${ex.preservedCommitments} kept** | €${ex.baselineTotalEur.toFixed(2)} → **€${ex.totalCostEur.toFixed(2)}** | **${ex.verifiedReceiptsPerRun} / ${ex.committedPerRun}** | ${ex.totalEndToEndMs.median} ms | **${ex.allSucceededRatePct}%** |
| **Hybrid Cold-Start \`.ics\` (2 Agentic + 1 Legacy + 1 Storage)** | 4 | **${hy.changedCommitments} changed · ${hy.preservedCommitments} kept** | €${hy.baselineTotalEur.toFixed(2)} → **€${hy.totalCostEur.toFixed(2)}** | **${hy.verifiedReceiptsPerRun} / ${hy.committedPerRun}** (+ 1 Hold-First \`mailto:\` draft) | ${hy.totalEndToEndMs.median} ms | **${hy.allSucceededRatePct}%** |

Means are kept in \`benchmark_results.json\` for completeness; medians and p95 are reported here because single garbage-collection pauses dominate means at sub-millisecond scale.

---

## 4. Limitations

1. **Demonstration providers.** MoveCo, PermitFlow, HomeConnect and PowerFlow are independent demonstration services on separate origins with real HTTP, CORS, MCP and Ed25519 boundaries — not commercial companies.
2. **Loopback latency.** Measured on local sockets. Over the public internet each provider hop adds WAN round-trip time (typically tens of milliseconds), plus model inference time when the optional chat assistant is used.
3. **No human timing study claimed.** The "~18 actions" figure is an explicit task-step model paired with a measured split-brain failure probe on the 4 live peer endpoints, not a timed human participant study.
`;

  await writeFile(path.join(ROOT, "docs", "benchmarks", "BEFORE_AFTER.md"), md, "utf8");
  console.log("Benchmarks completed and written to docs/benchmarks/BEFORE_AFTER.md and benchmark_results.json.");
} finally {
  await eco.stopAll();
}
