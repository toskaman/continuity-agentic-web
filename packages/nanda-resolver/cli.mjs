#!/usr/bin/env node
/**
 * Standalone Open Agentic Web Challenge Submission & NANDA Conformance CLI Validator (`continuity-audit`).
 *
 * Addresses the upstream validation need (`cognizant-ai-labs/agentic-web` README §Testing):
 * Verifies any live HTTP/HTTPS Open Agentic Website URL(s) against:
 *  1. Transport Security (HTTPS or Loopback)
 *  2. Public `agent-manifest.json` + CORS header (`Access-Control-Allow-Origin`) + non-mock BYOK router
 *  3. Resolved Portable Neuro SAN `.network.json` (`front_man` present, 0 unresolved includes, 0 leaked keys)
 *  4. Pluggable Inference / BYOK Router metadata
 *  5. Explicit `peer_policy` & `allowed_peers`
 *  6. Isolated Cross-Site `action-bridge.html` reachability
 *  7. Project NANDA / A2A v1.0 Agent Card (`agent-card.json` / `.well-known/agent-card.json`)
 *
 * Usage:
 *   node packages/nanda-resolver/cli.mjs https://toskaman.github.io/continuity-agentic-web/
 *   node packages/nanda-resolver/cli.mjs --json https://toskaman.github.io/continuity-agentic-web/
 */

import { auditOpenAgenticSite } from "./index.js";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const urls = args.filter((a) => !a.startsWith("--"));

const DEFAULT_ECOSYSTEM_URLS = [
  "https://toskaman.github.io/continuity-agentic-web/",
  "https://gpaschercher-sudo.github.io/moveco-agentic-peer/",
  "https://gpaschercher-sudo.github.io/permitflow-agentic-peer/",
  "https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/",
  "https://gpaschercher-sudo.github.io/powerflow-agentic-peer/",
];

const targets = urls.length > 0 ? urls : DEFAULT_ECOSYSTEM_URLS;

const reports = [];
let allPassed = true;

for (const u of targets) {
  const rep = await auditOpenAgenticSite(u);
  // Also check CORS header on agent-manifest.json
  let corsOrigin = null;
  try {
    const base = String(u).replace(/\/+$/, "") + "/";
    const mRes = await fetch(new URL("agent-manifest.json", base).href, { method: "HEAD" });
    corsOrigin = mRes.headers.get("access-control-allow-origin");
  } catch {
    corsOrigin = null;
  }
  const enriched = {
    ...rep,
    corsAllowOrigin: corsOrigin,
  };
  reports.push(enriched);
  if (!rep.ok) allPassed = false;
}

if (jsonMode) {
  process.stdout.write(`${JSON.stringify({ ok: allPassed, sitesAudited: reports.length, reports }, null, 2)}\n`);
  process.exit(allPassed ? 0 : 1);
}

console.log("\n========================================================================");
console.log(" CONTINUITY — Open Agentic Web MVP 0.2 & Project NANDA CLI Validator");
console.log("========================================================================");

for (const r of reports) {
  console.log(`\nSite:    ${r.siteBaseUrl}`);
  console.log(`Network: ${r.networkName || "n/a"} | Score: ${r.score} | CORS: ${r.corsAllowOrigin || "same-origin/default"}`);
  console.log(`Digests: manifest=${r.manifestDigest || "n/a"} | network=${r.networkDigest || "n/a"}`);
  for (const c of r.checks) {
    const icon = c.status === "PASS" ? "[PASS]" : c.status === "WARN" ? "[WARN]" : "[FAIL]";
    console.log(`  ${icon} ${c.check} — ${c.detail}`);
  }
}

console.log("\n------------------------------------------------------------------------");
console.log(
  allPassed
    ? `RESULT: ALL ${reports.length} OPEN AGENTIC WEBSITE(S) CONFORM TO STAGE ONE & NANDA CHECKS.`
    : "RESULT: CONFORMANCE FAILURES DETECTED.",
);
console.log("------------------------------------------------------------------------\n");

process.exit(allPassed ? 0 : 1);
