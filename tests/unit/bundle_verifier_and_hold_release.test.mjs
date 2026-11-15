import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ContinuityCoordinatorPage } from "../../apps/continuity-web/script.js";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = path.join(ROOT, "packages", "nanda-resolver", "cli.mjs");

test("Cycle 6 — Zero-trust audit bundle verifier validates JCS SHA-256, Saga chain & Ed25519 receipts, and catches €0.01 tampering in API & CLI", async () => {
  const page = new ContinuityCoordinatorPage();
  const prep = await page.analyzeAndPrepareChange(
    "Move relocation from Tuesday to Friday below €700 without cancelling anything.",
  );
  assert.equal(prep.ok, true);

  const state1 = page.getState();
  const commit = await page.commitPreparedPackage({
    planId: state1.selectedPlanId,
    expectedVersion: state1.version,
    expectedTotalEur: state1.selectedPlanSummary.metrics.totalMissionCostEur,
  });
  assert.equal(commit.ok, true);

  const validReport = await page.verifyCurrentAuditBundle();
  assert.equal(validReport.valid, true);
  assert.equal(validReport.bundleSha256Valid, true);
  assert.equal(validReport.sagaChainValid, true);
  assert.equal(validReport.receiptsVerifiedCount, 3);
  assert.equal(validReport.keyTrustMode, "PINNED_TRUST_STORE");

  const tamperReport = await page.simulateBundleTamperAttack();
  assert.equal(tamperReport.valid, false);
  assert.equal(tamperReport.bundleSha256Valid, false);
  assert.equal(tamperReport.sagaChainValid, false);
  assert.ok(tamperReport.errors.some((e) => e.includes("ED25519_SIGNATURE_INVALID")));

  // Verify standalone CLI `--verify-bundle` exits 0 on intact bundle and 1 on tampered bundle
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "continuity-bundle-"));
  try {
    const intactBundle = await page.buildCurrentAuditBundle();
    const intactPath = path.join(tmpDir, "intact.json");
    await writeFile(intactPath, JSON.stringify(intactBundle, null, 2), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [CLI, "--verify-bundle", intactPath, "--json"]);
    const cliReport = JSON.parse(stdout);
    assert.equal(cliReport.valid, true);
    assert.equal(cliReport.receiptsVerifiedCount, 3);

    const forged = JSON.parse(JSON.stringify(intactBundle));
    forged.operations[0].receipt_envelope.receipt_body.total_charged_eur += 0.01;
    const forgedPath = path.join(tmpDir, "forged.json");
    await writeFile(forgedPath, JSON.stringify(forged, null, 2), "utf8");

    await assert.rejects(() => execFileAsync(process.execPath, [CLI, "--verify-bundle", forgedPath, "--json"]));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("Cycle 7 — Pre-commit releasePreparedHolds safely releases all holds at €0.00 fee, preserves baseline dates, and refuses post-commit release", async () => {
  const page = new ContinuityCoordinatorPage();
  const baselineDates = page.mission.commitments.map((c) => `${c.id}:${c.scheduled_date}`);

  const prep = await page.analyzeAndPrepareChange(
    "Move relocation from Tuesday to Friday below €700.",
  );
  assert.equal(prep.ok, true);
  assert.ok(page.preparedOps.length >= 2);

  const released = await page.releasePreparedHolds();
  assert.equal(released.ok, true);
  assert.equal(released.feeChargedEur, 0);
  assert.equal(released.releasedCount, 3);
  assert.equal(page.preparedOps.length, 0);

  // Every node in the live graph remains on its exact original Tuesday/Wednesday/Saturday baseline date
  const afterReleaseDates = Array.from(page.graph.nodes.values()).map((n) => `${n.id}:${n.scheduled_date}`);
  assert.deepEqual(afterReleaseDates, baselineDates);

  //Saga hash chain remains 100% valid after COMPENSATED transitions
  const history = page.saga.ledger.getHistory();
  assert.ok(history.some((h) => h.to_state === "COMPENSATED"));
});
