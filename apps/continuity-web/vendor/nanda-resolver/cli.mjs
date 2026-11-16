#!/usr/bin/env node
/**
 * Standalone Open Agentic Web Challenge Submission & NANDA Conformance CLI Validator (`continuity-audit`).
 *
 * Addresses the upstream validation need (`cognizant-ai-labs/agentic-web` README §Testing):
 * Verifies any live HTTP/HTTPS Open Agentic Website URL(s) against:
 *  1. Transport Security (HTTPS or Loopback) + SSRF Guard
 *  2. Public `agent-manifest.json` + CORS header (`Access-Control-Allow-Origin`) + non-mock BYOK router
 *  3. Resolved Portable Neuro SAN `.network.json` (`front_man` present, 0 unresolved includes, 0 leaked keys)
 *  4. Pluggable Inference / BYOK Router metadata
 *  5. Explicit `peer_policy` & `allowed_peers`
 *  6. Isolated Cross-Site `action-bridge.html` reachability
 *  7. Project NANDA / A2A v1.0 Agent Card (`agent-card.json` / `.well-known/agent-card.json`)
 *  8. Optional `--check-firewall`, `--verify-facts`, `--check-poppy`, `--sarif`, `--json`, and `--verify-bundle`
 */

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractMarkedPageFacts, verifyFactsProvenance } from "../facts-publisher/index.js";
import { verifyExportedAuditBundle } from "../intake-compiler/index.js";
import { inspectPeerNetworkSafety } from "../peer-firewall/index.js";
import { auditOpenAgenticSite, validatePoppyReachDeclaration } from "./index.js";

export const CLI_VERSION = "2.1.0";

const DEFAULT_ECOSYSTEM_URLS = [
  "https://toskaman.github.io/continuity-agentic-web/",
  "https://gpaschercher-sudo.github.io/moveco-agentic-peer/",
  "https://gpaschercher-sudo.github.io/permitflow-agentic-peer/",
  "https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/",
  "https://gpaschercher-sudo.github.io/powerflow-agentic-peer/",
];

const HELP_TEXT = `continuity-audit v${CLI_VERSION} — Open Agentic Web MVP 0.2, Firewall, Facts & NANDA Validator

Usage:
  continuity-audit [options] [url...]
  continuity-audit --verify-bundle <audit-bundle.json> [--json]

Options:
  -h, --help             Show usage and exit (0)
  -v, --version          Print CLI version and exit (0)
  --json                 Emit structured JSON report
  --sarif                Emit SARIF 2.1.0 report for GitHub Code Scanning / CI
  --check-firewall       Run @continuity/peer-firewall pre-execution scan on manifest + .network.json
  --verify-facts         Verify HTML data-agent-facts visibility & facts/ source_html_sha256 provenance
  --check-poppy          Validate /.well-known/poppy.json NANDA Reach v1 declaration
  --verify-bundle <path> Offline verify JCS SHA-256, Saga chain, Ed25519 receipts & ZK hash-ladder
`;

export async function runContinuityCli(argv = process.argv.slice(2), io = {}) {
  const fetchFn = io.fetchImpl || globalThis.fetch;
  const writeOut = io.stdout || ((s) => process.stdout.write(s));
  const writeErr = io.stderr || ((s) => process.stderr.write(s));

  if (argv.includes("--help") || argv.includes("-h")) {
    writeOut(HELP_TEXT);
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    writeOut(`continuity-audit v${CLI_VERSION}\n`);
    return 0;
  }

  const jsonMode = argv.includes("--json");
  const sarifMode = argv.includes("--sarif");
  const checkFirewall = argv.includes("--check-firewall");
  const verifyFacts = argv.includes("--verify-facts");
  const checkPoppy = argv.includes("--check-poppy");
  const verifyIdx = argv.indexOf("--verify-bundle");

  if (verifyIdx !== -1) {
    const bundlePath = argv[verifyIdx + 1];
    if (!bundlePath || bundlePath.startsWith("--")) {
      writeErr("Usage: continuity-audit --verify-bundle <audit-bundle.json> [--json]\n");
      return 1;
    }
    const rawJson = JSON.parse(await readFile(bundlePath, "utf8"));
    const report = await verifyExportedAuditBundle(rawJson);
    if (jsonMode) {
      writeOut(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      writeOut("\n========================================================================\n");
      writeOut(" CONTINUITY — Offline Cryptographic Audit Bundle Verifier\n");
      writeOut("========================================================================\n");
      writeOut(`Bundle JCS SHA-256 : ${report.bundleSha256Valid ? "PASS" : "FAIL"} (${report.computedBundleSha256})\n`);
      writeOut(`Saga Hash Chain    : ${report.sagaChainValid ? "PASS" : "FAIL"} (${report.sagaEventsChecked} event(s))\n`);
      writeOut(
        `Ed25519 Receipts   : ${report.receiptsVerifiedCount}/${report.receiptsTotalCommitted} verified (trust=${report.keyTrustMode})\n`,
      );
      if (report.zkBudgetAttestationPresent) {
        writeOut(`ZK Budget Ladder   : ${report.zkBudgetValid ? "PASS (private ceiling hidden)" : "FAIL"}\n`);
      }
      if (report.errors.length > 0) {
        for (const e of report.errors) writeOut(`  [FAIL] ${e}\n`);
      }
      writeOut(`RESULT             : ${report.valid ? "VERIFIED INTACT" : "TAMPERED / INVALID"}\n\n`);
    }
    return report.valid ? 0 : 1;
  }

  const urls = argv.filter((a) => !a.startsWith("-"));
  const targets = urls.length > 0 ? urls : DEFAULT_ECOSYSTEM_URLS;

  const reports = await Promise.all(
    targets.map(async (u) => {
      const rep = await auditOpenAgenticSite(u, fetchFn);
      const base = `${String(u).replace(/\/+$/, "")}/`;
      const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
      let corsOrigin = null;
      try {
        const mRes = await fetchFn(new URL("agent-manifest.json", base).href, {
          method: "HEAD",
          ...(signal ? { signal } : {}),
        });
        corsOrigin = mRes.headers?.get?.("access-control-allow-origin") || null;
      } catch {
        corsOrigin = null;
      }

      const extraChecks = [];
      let firewall = null;
      if (checkFirewall) {
        try {
          const mJson = await (await fetchFn(new URL("agent-manifest.json", base).href, signal ? { signal } : undefined)).json();
          const hoconRel = mJson?.networks?.[0]?.hocon;
          const nUrl = new URL(hoconRel, base);
          if (nUrl.origin !== new URL(base).origin) throw new Error("Cross-origin network path rejected.");
          const nJson = await (await fetchFn(nUrl.href, signal ? { signal } : undefined)).json();
          firewall = await inspectPeerNetworkSafety({ siteBaseUrl: base, manifestJson: mJson, networkJson: nJson });
          extraChecks.push({
            id: "EXT-FIREWALL",
            check: "Pre-Execution Peer Firewall Scan",
            status: firewall.safe ? "PASS" : "FAIL",
            detail: `verdict=${firewall.verdict} riskScore=${firewall.riskScore} findings=${firewall.findings.length}`,
          });
        } catch (err) {
          extraChecks.push({
            id: "EXT-FIREWALL",
            check: "Pre-Execution Peer Firewall Scan",
            status: "FAIL",
            detail: err.message,
          });
        }
      }

      let factsProvenance = null;
      if (verifyFacts) {
        try {
          const htmlText = await (await fetchFn(base, signal ? { signal } : undefined)).text();
          const extracted = await extractMarkedPageFacts(htmlText);
          const fManifest = await (
            await fetchFn(new URL("facts/agent-manifest.json", base).href, signal ? { signal } : undefined)
          ).json();
          const fHocon = fManifest?.networks?.[0]?.hocon;
          const fNet = await (
            await fetchFn(new URL(fHocon, new URL("facts/", base).href).href, signal ? { signal } : undefined)
          ).json();
          const prov = await verifyFactsProvenance(htmlText, fNet);
          factsProvenance = {
            valid: prov.valid,
            markedCount: extracted.entries.length,
            computedHtmlSha256: prov.computedHtmlSha256,
          };
          extraChecks.push({
            id: "EXT-FACTS-PROVENANCE",
            check: "Visible-DOM Facts Provenance (source_html_sha256)",
            status: prov.valid ? "PASS" : "FAIL",
            detail: prov.valid
              ? `Verified ${extracted.entries.length} visible fact(s) (sha256:${prov.computedHtmlSha256.slice(0, 16)}…)`
              : "HTML source digest differs from published facts network metadata.",
          });
        } catch (err) {
          extraChecks.push({
            id: "EXT-FACTS-PROVENANCE",
            check: "Visible-DOM Facts Provenance (source_html_sha256)",
            status: "FAIL",
            detail: err.message,
          });
        }
      }

      let poppyReach = null;
      if (checkPoppy) {
        try {
          let pRes = await fetchFn(new URL(".well-known/poppy.json", base).href, signal ? { signal } : undefined);
          if (!pRes.ok) pRes = await fetchFn(new URL("poppy.json", base).href, signal ? { signal } : undefined);
          if (!pRes.ok) throw new Error(`HTTP ${pRes.status}`);
          const pJson = await pRes.json();
          poppyReach = validatePoppyReachDeclaration(pJson);
          extraChecks.push({
            id: "EXT-POPPY-REACH",
            check: "NANDA Reach Poppy v1 Declaration",
            status: poppyReach.valid ? "PASS" : "FAIL",
            detail: poppyReach.valid ? "Valid nandaindex.org/reach v1 manifest" : poppyReach.errors.join("; "),
          });
        } catch (err) {
          extraChecks.push({
            id: "EXT-POPPY-REACH",
            check: "NANDA Reach Poppy v1 Declaration",
            status: "FAIL",
            detail: err.message,
          });
        }
      }

      const mergedChecks = [...rep.checks, ...extraChecks];
      const extraFailed = extraChecks.some((c) => c.status === "FAIL");
      return {
        ...rep,
        ok: rep.ok && !extraFailed,
        checks: mergedChecks,
        corsAllowOrigin: corsOrigin,
        ...(firewall ? { firewall } : {}),
        ...(factsProvenance ? { factsProvenance } : {}),
        ...(poppyReach ? { poppyReach } : {}),
      };
    }),
  );

  const allPassed = reports.every((r) => r.ok);

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
          locations: [{ physicalLocation: { artifactLocation: { uri: r.siteBaseUrl } } }],
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
              version: CLI_VERSION,
              informationUri: "https://github.com/toskaman/continuity-agentic-web",
              rules: Array.from(rulesMap.values()),
            },
          },
          results: sarifResults,
        },
      ],
    };
    writeOut(`${JSON.stringify(sarifLog, null, 2)}\n`);
    return allPassed ? 0 : 1;
  }

  if (jsonMode) {
    writeOut(`${JSON.stringify({ ok: allPassed, sitesAudited: reports.length, reports }, null, 2)}\n`);
    return allPassed ? 0 : 1;
  }

  writeOut("\n========================================================================\n");
  writeOut(` CONTINUITY — Open Agentic Web MVP 0.2 & Project NANDA CLI Validator v${CLI_VERSION}\n`);
  writeOut("========================================================================\n");

  for (const r of reports) {
    writeOut(`\nSite:    ${r.siteBaseUrl}\n`);
    writeOut(`Network: ${r.networkName || "n/a"} | Score: ${r.score} | CORS: ${r.corsAllowOrigin || "same-origin/default"}\n`);
    writeOut(`Digests: manifest=${r.manifestDigest || "n/a"} | network=${r.networkDigest || "n/a"}\n`);
    for (const c of r.checks) {
      const icon = c.status === "PASS" ? "[PASS]" : c.status === "WARN" ? "[WARN]" : "[FAIL]";
      writeOut(`  ${icon} ${c.check} — ${c.detail}\n`);
    }
  }

  writeOut("\n------------------------------------------------------------------------\n");
  writeOut(
    allPassed
      ? `RESULT: ALL ${reports.length} OPEN AGENTIC WEBSITE(S) CONFORM TO STAGE ONE & NANDA CHECKS.\n`
      : "RESULT: CONFORMANCE FAILURES DETECTED.\n",
  );
  writeOut("------------------------------------------------------------------------\n\n");
  return allPassed ? 0 : 1;
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = await runContinuityCli(process.argv.slice(2));
  process.exit(code);
}
