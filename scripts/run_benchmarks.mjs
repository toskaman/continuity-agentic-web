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

try {
  const normalRuns = [];
  const rippleRuns = [];
  for (let i = 0; i < WARMUP; i++) {
    await runSingleLiveTrial(false);
    await runSingleLiveTrial(true);
  }
  for (let i = 0; i < SAMPLES; i++) {
    normalRuns.push(await runSingleLiveTrial(false));
    rippleRuns.push(await runSingleLiveTrial(true));
  }

  const benchmarkData = {
    measuredAtIso: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      cpuModel: os.cpus()[0]?.model || "unknown",
      cpuCores: os.cpus().length,
      networkTopology: "5 independent local HTTP origins (127.0.0.1 & localhost ports 28080..28084)",
    },
    manualStructuralBaseline: {
      classification: "ESTIMATE — documented task model (3 actions per provider site), not a measured human study",
      totalCommitmentsInMission: 6,
      manualUserInteractionsWithoutContinuity: 18,
      breakdown: "6 site logins/lookups + 6 availability checks + 6 manual reschedule/hold/verify actions (high risk of premature cancellation or touching unaffected bookings)",
    },
    continuityMeasuredNormalScenario: summarize(normalRuns),
    continuityMeasuredRippleRecoveryScenario: summarize(rippleRuns),
  };

  const jsonPath = path.join(ROOT, "docs", "benchmarks", "benchmark_results.json");
  await writeFile(jsonPath, `${JSON.stringify(benchmarkData, null, 2)}\n`, "utf8");

  const n = benchmarkData.continuityMeasuredNormalScenario;
  const r = benchmarkData.continuityMeasuredRippleRecoveryScenario;

  const md = `# Reproducible Benchmarks — Before vs. After CONTINUITY

**Date measured:** ${benchmarkData.measuredAtIso}
**Hardware / runtime:** Node.js \`${benchmarkData.environment.nodeVersion}\` on \`${benchmarkData.environment.platform}\` (${benchmarkData.environment.cpuModel.trim()}, ${benchmarkData.environment.cpuCores} logical cores)
**Sample size:** \`N = ${SAMPLES}\` live cross-origin runs per scenario (Normal shift and Ripple failure recovery), after \`${WARMUP}\` excluded warm-up runs each — \`${SAMPLES * 2}\` measured end-to-end sagas.
**Raw data:** [\`docs/benchmarks/benchmark_results.json\`](./benchmark_results.json) · **Reproduce:** \`node scripts/run_benchmarks.mjs\`

Every number in sections 1 and 2 is computed by the script in this run, except the row explicitly marked **Estimate**.

---

## 1. Workflow comparison (same 6-commitment mission)

| Metric | BEFORE — manual coordination | AFTER — CONTINUITY, normal shift | AFTER — CONTINUITY, ripple recovery | Evidence |
| --- | --- | --- | --- | --- |
| User actions | **~18** (3 per provider site × 6 sites: look up, check availability, rebook) | **2 decisions** (1 request + 1 approval; 3 clicks in the UI incl. the confirmation dialog) | **2 decisions** | Before: **Estimate** (task model, no human study). After: structural count |
| Providers contacted | up to 6 | **${n.providersContacted}** (${n.unnecessaryProvidersAvoided} out-of-scope bookings never contacted) | **${r.providersContacted}** (${r.unnecessaryProvidersAvoided} never contacted) | Measured |
| Commitments changed / kept | not optimized | **${n.changedCommitments} changed · ${n.preservedCommitments} kept** | **${r.changedCommitments} changed · ${r.preservedCommitments} kept** | Measured |
| Mission total (cap €700.00) | no global budget check | **€${n.totalCostEur.toFixed(2)}** (${fmtDelta(n.totalCostEur - n.baselineTotalEur)} vs €${n.baselineTotalEur.toFixed(2)} baseline) | **€${r.totalCostEur.toFixed(2)}** (${fmtDelta(r.totalCostEur - r.baselineTotalEur)} vs baseline) | Measured |
| Cancel calls sent to any provider | risk of cancelling before a replacement exists | **${n.cancelToolCallsTotal}** in ${SAMPLES} runs | **${r.cancelToolCallsTotal}** in ${SAMPLES} runs | Measured (tool-call log) |
| Commits with a verified Ed25519 receipt | none | **${n.verifiedReceiptsPerRun} / ${n.committedPerRun}** per run (worst run) | **${r.verifiedReceiptsPerRun} / ${r.committedPerRun}** per run (worst run) | Measured |
| Same result on every run | — | **${n.resultsIdenticalAcrossRuns ? "Yes" : "No"}** | **${r.resultsIdenticalAcrossRuns ? "Yes" : "No"}** | Measured |
| Verified saga completion | — | **${n.allSucceededRatePct}%** | **${r.allSucceededRatePct}%** | Measured |

---

## 2. Engine timings (ms, loopback, \`N = ${SAMPLES}\` per scenario)

| Phase | Normal median | Normal p95 | Normal max | Ripple median | Ripple p95 | Ripple max |
| --- | --- | --- | --- | --- | --- | --- |
${[
    ["Mission compiler & hard-invariant check", "compileMs"],
    ["Bounded impact analysis (6 nodes)", "impactMs"],
    ["Quote collection from 4 provider origins", "quoteLatencyMs"],
    ["Minimal-change solver (Pareto)", "solveMs"],
    ["**Full run: compile → quotes → hold → approve → commit → verify receipts**", "totalEndToEndMs"],
  ]
    .map(([label, k]) => `| ${label} | ${n[k].median} | ${n[k].p95} | ${n[k].max} | ${r[k].median} | ${r[k].p95} | ${r[k].max} |`)
    .join("\n")}

Means are kept in the JSON for completeness; medians and p95 are reported here because single garbage-collection pauses dominate means at sub-millisecond scale.

---

## 3. Limitations

1. **Demonstration providers.** MoveCo, PermitFlow, HomeConnect and PowerFlow are independent demonstration services on separate origins with real HTTP, CORS, MCP and Ed25519 boundaries — not commercial companies.
2. **Loopback latency.** Measured on local sockets. Over the public internet each provider hop adds WAN round-trip time (typically tens of milliseconds), plus model inference time when the optional chat assistant is used.
3. **Manual baseline is an estimate.** The "~18 actions" figure is a task model, not a timed user study. Human completion time is deliberately not claimed.
`;

  await writeFile(path.join(ROOT, "docs", "benchmarks", "BEFORE_AFTER.md"), md, "utf8");
  console.log("Benchmarks completed and written to docs/benchmarks/BEFORE_AFTER.md and benchmark_results.json.");
} finally {
  await eco.stopAll();
}
