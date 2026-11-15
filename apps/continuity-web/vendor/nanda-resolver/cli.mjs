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

import { readFile } from "node:fs/promises";
import { verifyExportedAuditBundle } from "../intake-compiler/index.js";
import { auditOpenAgenticSite } from "./index.js";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const sarifMode = args.includes("--sarif");
const verifyIdx = args.indexOf("--verify-bundle");

if (verifyIdx !== -1) {
  const bundlePath = args[verifyIdx + 1];
  if (!bundlePath) {
    console.error("Usage: continuity-audit --verify-bundle <audit-bundle.json> [--json]");
    process.exit(1);
  }
  const rawJson = JSON.parse(await readFile(bundlePath, "utf8"));
  const report = await verifyExportedAuditBundle(rawJson);
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log("\n========================================================================");
    console.log(" CONTINUITY — Offline Cryptographic Audit Bundle Verifier");
    console.log("========================================================================");
    console.log(`Bundle JCS SHA-256 : ${report.bundleSha256Valid ? "PASS" : "FAIL"} (${report.computedBundleSha256})`);
    console.log(`Saga Hash Chain    : ${report.sagaChainValid ? "PASS" : "FAIL"} (${report.sagaEventsChecked} event(s))`);
    console.log(
      `Ed25519 Receipts   : ${report.receiptsVerifiedCount}/${report.receiptsTotalCommitted} verified (trust=${report.keyTrustMode})`,
    );
    if (report.errors.length > 0) {
      for (const e of report.errors) console.log(`  [FAIL] ${e}`);
    }
    console.log(`RESULT             : ${report.valid ? "VERIFIED INTACT" : "TAMPERED / INVALID"}\n`);
  }
  process.exit(report.valid ? 0 : 1);
}

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

if (sarifMode) {
  const rulesMap = new Map();
  const sarifResults = [];
  for (const r of reports) {
    for (const c of r.checks) {
      if (!rulesMap.has(c.id)) {
        rulesMap.set(c.id, {
          id: c.id,
          name: c.check,
          shortDescription: { text: c.check },
        });
      }
      if (c.status === "PASS") continue;
      sarifResults.push({
        ruleId: c.id,
        level: c.status === "FAIL" ? "error" : "warning",
        message: { text: `${c.check}: ${c.detail}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: r.siteBaseUrl },
            },
          },
        ],
      });
    }
  }
  const sarifLog = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "continuity-audit",
            version: "2.0.0",
            informationUri: "https://github.com/toskaman/continuity-agentic-web",
            rules: Array.from(rulesMap.values()),
          },
        },
        results: sarifResults,
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(sarifLog, null, 2)}\n`);
  process.exit(allPassed ? 0 : 1);
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
