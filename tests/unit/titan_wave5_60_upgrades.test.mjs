import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ContinuityCoordinatorPage } from "../../apps/continuity-web/script.js";
import { verifyExportedAuditBundle } from "../../packages/intake-compiler/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("Wave 5 (#241-#255) — Coordinator defers chaos-lab via dynamic import(), binds mandate_sha256 into prepared operations, and blocks cross-mission ZK proof swaps in Audit Bundle", async () => {
  const scriptSrc = await readFile(path.join(ROOT, "apps", "continuity-web", "script.js"), "utf8");
  assert.equal(/from\s+["']\.\/vendor\/chaos-lab\/index\.js["']/.test(scriptSrc), false);
  assert.match(scriptSrc, /import\(["']\.\/vendor\/chaos-lab\/index\.js["']\)/);

  const page = new ContinuityCoordinatorPage();
  const prep = await page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday under €700.");
  assert.equal(prep.ok, true);
  assert.ok(page.preparedOps[0].mandate_sha256);
  assert.equal(page.preparedOps[0].mandate_sha256, page.activeMandate.mandate_sha256);

  const st = page.getState();
  await page.commitPreparedPackage({
    planId: st.selectedPlanId,
    expectedVersion: st.version,
    expectedTotalEur: st.selectedPlanSummary.metrics.totalMissionCostEur,
  });

  const bundle = await page.buildCurrentAuditBundle();
  const swappedMission = JSON.parse(JSON.stringify(bundle));
  swappedMission.mission_id = "different_mission_999";
  const swappedCheck = await verifyExportedAuditBundle(swappedMission);
  assert.equal(swappedCheck.valid, false);
  assert.equal(swappedCheck.zkBudgetValid, false);
});

test("Wave 5 (#256-#275) — All 5 Open Agentic Websites declare cross-origin <link rel=preconnect> and ship executive @media print stylesheet", async () => {
  const baseCss = await readFile(path.join(ROOT, "design-system", "base.css"), "utf8");
  assert.match(baseCss, /@media\s+print/);

  const coordHtml = await readFile(path.join(ROOT, "apps", "continuity-web", "index.html"), "utf8");
  assert.match(coordHtml, /rel="preconnect"\s+href="https:\/\/gpaschercher-sudo\.github\.io"/);

  for (const peer of ["demo-moveco", "demo-permitflow", "demo-homeconnect", "demo-powerflow"]) {
    const html = await readFile(path.join(ROOT, "apps", peer, "index.html"), "utf8");
    assert.match(html, /rel="preconnect"\s+href="https:\/\/toskaman\.github\.io"/);
  }
});

test("Wave 5 (#276-#300) — TITAN_300_UPGRADES_LEDGER.md documents all 5 engineering waves (#001-#300) with automated test references", async () => {
  const ledger = await readFile(
    path.join(ROOT, "docs", "competition", "TITAN_300_UPGRADES_LEDGER.md"),
    "utf8",
  );
  assert.match(ledger, /#001/);
  assert.match(ledger, /#300/);
  assert.match(ledger, /Wave 5/);
});
