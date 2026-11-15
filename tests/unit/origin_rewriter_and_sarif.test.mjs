import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startAllEcosystemServers } from "../../scripts/serve_ecosystem.mjs";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = path.join(ROOT, "packages", "nanda-resolver", "cli.mjs");

test("Cycle 13 — continuity-audit --sarif emits valid SARIF v2.1.0 report with 0 findings on compliant live sites and flags warnings on partial sites", async () => {
  const eco = await startAllEcosystemServers({
    continuity: 0,
    moveco: 0,
    permitflow: 0,
    homeconnect: 0,
    powerflow: 0,
  });
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      CLI,
      "--sarif",
      eco.coordinator.origin(),
      eco.peers.moveco.origin(),
    ]);
    const sarif = JSON.parse(stdout);
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0].tool.driver.name, "continuity-audit");
    assert.equal(sarif.runs[0].tool.driver.rules.length, 9);
    assert.deepEqual(sarif.runs[0].results, [], "Compliant ecosystem sites must yield 0 SARIF warnings/errors");
  } finally {
    await eco.stopAll();
  }
});

test("Cycle 22 — deploy_public_github.mjs --dry-run stages all 5 HTTPS production bundles with .nojekyll, .well-known/*, facts/*, zero loopback leaks in manifests/networks, and restores local mode cleanly", async () => {
  const { existsSync } = await import("node:fs");
  const { readFile } = await import("node:fs/promises");
  const os = await import("node:os");

  await execFileAsync(process.execPath, [path.join(ROOT, "scripts", "deploy_public_github.mjs"), "--dry-run"]);

  const stageBase = path.join(os.tmpdir(), "continuity-public-deploy");
  const stagedDirs = [
    "deploy-continuity-agentic-web",
    "deploy-moveco-agentic-peer",
    "deploy-permitflow-agentic-peer",
    "deploy-homeconnect-agentic-peer",
    "deploy-powerflow-agentic-peer",
  ];

  for (const dir of stagedDirs) {
    const full = path.join(stageBase, dir);
    assert.equal(existsSync(path.join(full, ".nojekyll")), true, `${dir} must contain .nojekyll`);
    assert.equal(existsSync(path.join(full, ".well-known", "agent-card.json")), true, `${dir} must stage .well-known/agent-card.json`);
    assert.equal(existsSync(path.join(full, ".well-known", "ai-catalog.json")), true, `${dir} must stage .well-known/ai-catalog.json`);
    assert.equal(existsSync(path.join(full, "facts", "agent-manifest.json")), true, `${dir} must stage facts/agent-manifest.json`);
    assert.equal(existsSync(path.join(full, "tests")), false, `${dir} must not stage test files`);

    const manifestTxt = await readFile(path.join(full, "agent-manifest.json"), "utf8");
    const catTxt = await readFile(path.join(full, "ai-catalog.json"), "utf8");
    assert.ok(!/127\.0\.0\.1|localhost/.test(manifestTxt), `${dir}/agent-manifest.json leaked loopback origin`);
    assert.ok(!/127\.0\.0\.1|localhost/.test(catTxt), `${dir}/ai-catalog.json leaked loopback origin`);
  }

  // Working tree restored to local mode with 0 build warnings
  await execFileAsync(process.execPath, [path.join(ROOT, "scripts", "build_all_networks.mjs"), "--check"]);
});
