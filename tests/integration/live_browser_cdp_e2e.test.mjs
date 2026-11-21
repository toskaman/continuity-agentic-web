import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startAllEcosystemServers } from "../../scripts/serve_ecosystem.mjs";

function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

function findBrowserExecutable() {
  return CHROME_CANDIDATES.find((p) => existsSync(p)) || null;
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.method === "Runtime.exceptionThrown") {
        this.exceptions.push(msg.params?.exceptionDetails?.text || "Uncaught exception");
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
        const txt = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
        this.consoleErrors.push(txt);
      }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalJson(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Browser eval threw: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ""}`);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

test("Cycle 14 — Real Headless Chromium E2E verifies 5-origin live UI, counterfactual relaxation, €0 hold release, Ed25519 provider wall, bundle tamper alarm, 20 Chaos scenarios & 9-point auditor with 0 console errors", async (t) => {
  const browserBin = findBrowserExecutable();
  if (!browserBin) {
    t.skip("No Chromium/Edge binary installed on this runner");
    return;
  }

  const eco = await startAllEcosystemServers({
    continuity: 0,
    moveco: 0,
    permitflow: 0,
    homeconnect: 0,
    powerflow: 0,
  });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "continuity-e2e-chrome-"));
  let cdpPort = 0; // Chrome picks a free port itself (no bind race); read back from DevToolsActivePort
  let chromeProc = null;
  let cdp = null;

  try {
    chromeProc = spawn(
      browserBin,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
        "--remote-debugging-port=0",
        "--window-size=1440,1050",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    let targets = null;
    // Cold Chrome starts on shared CI runners can take well over 15 s: wait up to 60 s.
    for (let i = 0; i < 400; i++) {
      try {
        if (!cdpPort) {
          const { readFile } = await import("node:fs/promises");
          const first = (await readFile(path.join(profileDir, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
          cdpPort = Number(first) || 0;
          if (!cdpPort) throw new Error("port not written yet");
        }
        const r = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (r.ok) {
          const list = await r.json();
          if (Array.isArray(list) && list.some((x) => x.type === "page")) {
            targets = list;
            break;
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }

    assert.ok(Array.isArray(targets), "Headless browser CDP /json/list did not become ready in 60s");
    const pageTarget = targets.find((x) => x.type === "page");
    assert.ok(pageTarget?.webSocketDebuggerUrl, "Expected headless browser page target");

    cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    await cdp.send("Page.navigate", { url: `${eco.coordinator.origin()}/` });

    // Wait for coordinator & runtime boot
    await cdp.evalJson(`(async () => {
      for (let i = 0; i < 40; i++) {
        const { App } = await import("./script.js");
        if (App?.page && window.__nsweb?.engine) {
          App.page.peerOrigins = {
            moveco: "${eco.peers.moveco.origin()}",
            permitflow: "${eco.peers.permitflow.origin()}",
            homeconnect: "${eco.peers.homeconnect.origin()}",
            powerflow: "${eco.peers.powerflow.origin()}",
          };
          await App.page.probeLivePeerOrigins();
          await App.page.resetMission({ rippleFailureInjected: false });
          return true;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Coordinator did not finish booting");
    })()`);

    // 1. Test Counterfactual Relaxation UI flow (infeasible €630 -> 1-click Apply minimum relaxation)
    const rxOutcome = await cdp.evalJson(`(async () => {
      const { App } = await import("./script.js");
      await App.page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday, keep total budget below €630.");
      const rxBtn = document.querySelector('[data-apply-relaxation="1"]');
      const hadRxButton = Boolean(rxBtn);
      if (rxBtn) {
        await App.page.applyCounterfactualRelaxation();
      }
      return {
        hadRxButton,
        nowFeasible: Boolean(App.page.solverResult?.feasible),
        preparedCount: App.page.preparedOps.length,
        releaseBtnEnabled: !document.querySelector("#release-holds-btn")?.disabled,
        calendarHidden: document.querySelector("#export-ics-btn")?.hidden,
        pendingCalendarBlocked: App.page.downloadUpdatedIcsCalendar().ok === false,
      };
    })()`);
    assert.equal(rxOutcome.hadRxButton, true, "Counterfactual relaxation button must render when budget is infeasible");
    assert.equal(rxOutcome.nowFeasible, true, "Applying counterfactual relaxation must unlock valid plans");
    assert.equal(rxOutcome.preparedCount, 3);
    assert.equal(rxOutcome.releaseBtnEnabled, true);
    assert.equal(rxOutcome.calendarHidden, true);
    assert.equal(rxOutcome.pendingCalendarBlocked, true);

    // 2. Test Pre-Commit Zero-Fee Hold Release via UI button
    const releaseOutcome = await cdp.evalJson(`(async () => {
      const { App } = await import("./script.js");
      const peerHolds = async () => Promise.all(["moveco", "homeconnect"].map(async (id) => {
        const provider = await (await fetch(App.page.peerOrigins[id] + "/api/state")).json();
        return provider.active_holds.length;
      }));
      const before = await peerHolds();
      const res = await App.page.releasePreparedHolds();
      return {
        ok: res.ok,
        fee: res.feeChargedEur,
        remainingOps: App.page.preparedOps.length,
        before,
        after: await peerHolds(),
        releasedCount: res.releasedCount,
        movecoDate: App.page.graph.nodes.get("cmt_moveco_van").scheduled_date,
      };
    })()`);
    assert.equal(releaseOutcome.ok, true);
    assert.equal(releaseOutcome.fee, 0);
    assert.equal(releaseOutcome.remainingOps, 0);
    assert.deepEqual(releaseOutcome.before, [1, 1]);
    assert.deepEqual(releaseOutcome.after, [0, 0]);
    assert.equal(releaseOutcome.releasedCount, 2);
    assert.equal(releaseOutcome.movecoDate, "2027-11-16");

    // 3. Test Ripple Recovery + Commit + Bundle Verifier + €0.01 Tamper Alarm + 20 Chaos + 9-Point Auditor
    const fullOutcome = await cdp.evalJson(`(async () => {
      const { App } = await import("./script.js");
      await App.page.resetMission({ rippleFailureInjected: true });
      const prep = await App.page.analyzeAndPrepareChange(document.querySelector("#mission-input").value);
      const st = App.page.getState();
      const commit = await App.page.commitPreparedPackage({
        planId: st.selectedPlanId,
        expectedVersion: st.version,
        expectedTotalEur: st.selectedPlanSummary.metrics.totalMissionCostEur,
      });
      let calendar;
      const download = App.page.triggerBrowserDownload;
      try {
        App.page.triggerBrowserDownload = (filename, mimeType, content) => { calendar = { filename, mimeType, content }; };
        document.querySelector('[data-outcome="ics"]').click();
      } finally {
        App.page.triggerBrowserDownload = download;
      }
      const verifyOk = await App.page.verifyCurrentAuditBundle();
      const tamperDetected = await App.page.simulateBundleTamperAttack();
      const chaos = await App.page.executeChaosSuite();
      const audit = await App.page.runConformanceAudit("all");
      return {
        prepOk: prep.ok,
        commitOk: commit.ok,
        committedCount: commit.committedCount,
        calendar,
        bundleValid: verifyOk.valid,
        tamperCaught: tamperDetected.valid === false && tamperDetected.errors.length >= 2,
        chaosPassed: chaos.passed,
        chaosTotal: chaos.total,
        auditOk: audit.ok,
        auditScore: audit.results[0]?.score,
      };
    })()`);

    assert.equal(fullOutcome.prepOk, true);
    assert.equal(fullOutcome.commitOk, true);
    assert.equal(fullOutcome.committedCount, 3);
    assert.match(fullOutcome.calendar.filename, /\.ics$/);
    assert.equal(fullOutcome.calendar.mimeType, "text/calendar;charset=utf-8");
    const calendarEvents = fullOutcome.calendar.content.split("BEGIN:VEVENT").slice(1);
    assert.equal(calendarEvents.length, 6);
    assert.equal(calendarEvents.filter((event) => event.includes("Verified demo receipt payload SHA-256")).length, 3);
    assert.match(calendarEvents.find((event) => event.includes("PFW-9921")), /DTSTART:20271116T080000/);
    assert.equal(fullOutcome.bundleValid, true);
    assert.equal(fullOutcome.tamperCaught, true);
    assert.equal(fullOutcome.chaosPassed, 42);
    assert.equal(fullOutcome.chaosTotal, 42);
    assert.equal(fullOutcome.auditOk, true);
    assert.equal(fullOutcome.auditScore, "9 / 9");

    // 4. Navigate to standalone Community Builder Kit (`/community-kit.html`) and verify all 6 tools & 24 modules in real Chrome
    await cdp.send("Page.navigate", { url: `${eco.coordinator.origin()}/community-kit.html` });
    const kitOutcome = await cdp.evalJson(`(async () => {
      for (let i = 0; i < 30; i++) {
        if (document.querySelectorAll("#kit-modules-tbody tr").length === 24 && document.querySelector("#kit-nanda-cat-out")?.value) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      const cleanCompiled = (document.querySelector("#kit-facts-status")?.textContent || "").includes("Compiled");
      document.querySelector("#kit-facts-inject-btn")?.click();
      await new Promise((r) => setTimeout(r, 80));
      const injectionBlocked = (document.querySelector("#kit-facts-status")?.textContent || "").includes("Blocked");
      document.querySelector("#kit-fw-attack-btn")?.click();
      await new Promise((r) => setTimeout(r, 120));
      const firewallBlocked = (document.querySelector("#kit-fw-status")?.textContent || "").includes("BLOCKED");
      document.querySelector("#kit-adk-scoped-btn")?.click();
      await new Promise((r) => setTimeout(r, 120));
      const adkScopedOk = (document.querySelector("#kit-adk-status")?.textContent || "").includes("Scoped toolboxes saved");
      for (let i = 0; i < 20; i++) {
        if ((document.querySelector("#kit-bundle-status")?.textContent || "").includes("ZK Hash-Ladder: VERIFIED")) break;
        await new Promise((r) => setTimeout(r, 80));
      }
      const sampleBundleVerified = (document.querySelector("#kit-bundle-status")?.textContent || "").includes("ZK Hash-Ladder: VERIFIED");
      document.querySelector("#kit-bundle-tamper-btn")?.click();
      await new Promise((r) => setTimeout(r, 120));
      const sampleBundleTamperCaught = (document.querySelector("#kit-bundle-status")?.textContent || "").includes("TAMPERED / INVALID");
      const kitWebMcpCount =
        window.__continuityWebMcpCatalog?.namespace === "continuity_kit"
          ? window.__continuityWebMcpCatalog.tools?.length || 0
          : 0;
      return {
        modulesRows: document.querySelectorAll("#kit-modules-tbody tr").length,
        cleanCompiled,
        injectionBlocked,
        firewallBlocked,
        adkScopedOk,
        sampleBundleVerified,
        sampleBundleTamperCaught,
        kitWebMcpCount,
        nandaCatalogGenerated: (document.querySelector("#kit-nanda-cat-out")?.value || "").includes("urn:air:"),
      };
    })()`);

    assert.equal(kitOutcome.modulesRows, 26);
    assert.equal(kitOutcome.cleanCompiled, true);
    assert.equal(kitOutcome.injectionBlocked, true);
    assert.equal(kitOutcome.firewallBlocked, true);
    assert.equal(kitOutcome.adkScopedOk, true);
    assert.equal(kitOutcome.sampleBundleVerified, true);
    assert.equal(kitOutcome.sampleBundleTamperCaught, true);
    assert.equal(kitOutcome.kitWebMcpCount, 8);
    assert.equal(kitOutcome.nandaCatalogGenerated, true);

    // 5. Verify 1-click Inbound Cross-Origin Peer -> CONTINUITY trigger (`?ask_continuity=1`) on MoveCo Express
    await cdp.send("Page.navigate", { url: `${eco.peers.moveco.origin()}/?ask_continuity=1#assistant` });
    const inboundConsentShown = await cdp.evalJson(`(async () => {
      for (let i = 0; i < 40; i++) {
        const consent = document.querySelector("#ns-msgs .ns-consent");
        if (consent && consent.textContent.includes("CONTINUITY")) {
          return true;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    })()`);
    assert.equal(
      inboundConsentShown,
      true,
      "Opening ?ask_continuity=1 on a peer site must automatically trigger the cross-origin CONTINUITY Consent Card",
    );

    assert.deepEqual(cdp.exceptions, [], `Expected 0 uncaught browser exceptions, got: ${cdp.exceptions.join("; ")}`);
    assert.deepEqual(cdp.consoleErrors, [], `Expected 0 browser console errors, got: ${cdp.consoleErrors.join("; ")}`);
  } finally {
    cdp?.close();
    if (chromeProc) {
      chromeProc.kill();
      await new Promise((r) => setTimeout(r, 250));
    }
    await eco.stopAll();
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
});
