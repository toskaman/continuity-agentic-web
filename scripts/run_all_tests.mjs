/**
 * Cross-platform (POSIX, Windows local drive, and Windows UNC share) Master Test Runner.
 * Runs:
 *  1. Official Open Agentic Web network & manifest validation (`build_all_networks.mjs --check`)
 *  2. Live 5-origin cross-origin partner & bridge verification (`verify_live_ecosystem.mjs`)
 *  3. All unit, contract, integration, security, chaos, and site test suites via `node --test`.
 */

import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

async function collectTestFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules" && e.name !== "vendor" && e.name !== "runtime") {
      out.push(...(await collectTestFiles(full)));
    } else if (e.isFile() && e.name.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

function runStep(label, args) {
  console.log(`\n========================================================`);
  console.log(`STEP: ${label}`);
  console.log(`========================================================`);
  const res = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`FAILED at step: ${label} (exit code ${res.status})`);
    process.exit(res.status || 1);
  }
}

runStep("1. Validate All 5 Open Agentic Web HOCON & Manifest Bundles", [
  path.join(ROOT, "scripts", "build_all_networks.mjs"),
  "--check",
]);

runStep("2. Verify Live 5-Origin CORS, Manifests & Action Bridges", [
  path.join(ROOT, "scripts", "verify_live_ecosystem.mjs"),
]);

const testFiles = [
  ...(await collectTestFiles(path.join(ROOT, "tests"))),
  ...(await collectTestFiles(path.join(ROOT, "apps"))),
]
  .map((f) => path.relative(process.cwd(), f))
  .sort();

runStep(`3. Run All ${testFiles.length} Automated Test Suites`, ["--test", ...testFiles]);

console.log("\nALL CHECKS & TESTS PASSED CLEANLY.");
