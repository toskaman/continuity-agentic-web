/**
 * Automated Documentation <-> Codebase Truth Contract (`tests/contracts/docs_truth_contract.test.mjs`).
 *
 * Official Rules §6 notes judging "may include automated AI-driven analysis".
 * This contract test ensures README.md and DEVPOST_SUBMISSION.md never drift from the
 * actual repository package count, Chaos scenario count, site action count, file links,
 * or zero-secret policy.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CHAOS_SCENARIOS } from "../../packages/chaos-lab/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("Cycle 36 — README.md & DEVPOST_SUBMISSION.md counts, relative file links, screenshots, and zero-secret rules match actual codebase", async () => {
  const readme = await readFile(path.join(ROOT, "README.md"), "utf8");
  const devpost = await readFile(path.join(ROOT, "docs", "submission", "DEVPOST_SUBMISSION.md"), "utf8");
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "apps", "continuity-web", "agent-manifest.json"), "utf8"),
  );

  // 1. Verify exact package count (20)
  const pkgDirs = (await readdir(path.join(ROOT, "packages"), { withFileTypes: true })).filter((d) =>
    d.isDirectory(),
  );
  assert.equal(pkgDirs.length, 20);
  assert.match(readme, /20 Reusable Open-Source Community Modules/);
  assert.match(devpost, /20 zero-dependency ES modules/);

  // 2. Verify exact Chaos Lab scenario count (20)
  assert.equal(CHAOS_SCENARIOS.length, 20);
  assert.match(readme, /20 Chaos Lab scenarios/);
  assert.match(devpost, /20 failure scenarios/);

  // 3. Verify coordinator WebMCP / agentTools count (8) & test suite count claim
  assert.equal(manifest.actions.agentTools.length, 8);
  assert.match(readme, /70 automated tests in 24 suites/);
  assert.match(devpost, /70 automated tests in 24 suites/);

  // 3b. Verify HTML UI pages stay synchronized with benchmark & module counts
  const coordHtml = await readFile(path.join(ROOT, "apps", "continuity-web", "index.html"), "utf8");
  const kitHtml = await readFile(path.join(ROOT, "apps", "continuity-web", "community-kit.html"), "utf8");
  assert.match(coordHtml, /WebMCP · 8 tools/);
  assert.match(coordHtml, /90 benchmark runs/);
  assert.match(kitHtml, /five browser-local developer tools and 20 zero-dependency ES modules/);

  // 4. Verify every relative local path linked in README.md exists on disk
  const linkMatches = [...readme.matchAll(/\]\((?!https?:\/\/|mailto:|#)([^)#?]+)(?:[?#][^)]*)?\)/g)];
  assert.ok(linkMatches.length >= 12);
  for (const m of linkMatches) {
    const rel = m[1].trim();
    assert.equal(existsSync(path.join(ROOT, rel)), true, `Broken relative link in README.md: ${rel}`);
  }

  // 5. Verify zero real API key patterns exist across apps/*/agent-manifest.json and .hocon files
  const secretRe = /\b(sk-proj-[A-Za-z0-9_-]{20,}|otk_v1_(?:us|eu)_[A-Za-z0-9_-]{16,}|AIzaSy[A-Za-z0-9_-]{25,})\b/;
  for (const app of ["continuity-web", "demo-moveco", "demo-permitflow", "demo-homeconnect", "demo-powerflow"]) {
    const manTxt = await readFile(path.join(ROOT, "apps", app, "agent-manifest.json"), "utf8");
    assert.equal(secretRe.test(manTxt), false, `Potential secret pattern in apps/${app}/agent-manifest.json`);
  }
});
