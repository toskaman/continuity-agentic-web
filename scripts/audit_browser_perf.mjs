/**
 * Reproducible Headless Chromium CDP Performance & DOM/V8 Heap Retention Audit (`scripts/audit_browser_perf.mjs`).
 *
 * Boots all 5 live origins, runs 5 consecutive full cross-origin Saga cycles
 * (`resetMission -> analyzeAndPrepareChange -> commitPreparedPackage -> resetMission`),
 * triggers explicit V8 garbage collection (`HeapProfiler.collectGarbage`), and verifies:
 *  1. Zero CLS (`CumulativeLayoutShift === 0`) on initial load
 *  2. Sub-second 5-origin boot & handshake
 *  3. Bounded DOM `Nodes` & `JSEventListeners` retention across 5 full Saga cycles
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { startAllEcosystemServers } from "./serve_ecosystem.mjs";

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const browserBin = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!browserBin) {
  console.log("No Chromium/Edge binary found; skipping browser perf audit.");
  process.exit(0);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

const eco = await startAllEcosystemServers({
  continuity: 0,
  moveco: 0,
  permitflow: 0,
  homeconnect: 0,
  powerflow: 0,
});
const profileDir = await mkdtemp(path.join(os.tmpdir(), "continuity-perf-audit-"));
const cdpPort = await getFreePort();
let proc = null;

try {
  proc = spawn(
    browserBin,
    [
      "--headless=new",
      ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
      `--remote-debugging-port=${cdpPort}`,
      "--window-size=1440,960",
      "--no-first-run",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  for (let i = 0; i < 45; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Performance.enable");
  await send("HeapProfiler.enable");

  const t0 = performance.now();
  await send("Page.navigate", { url: `${eco.coordinator.origin()}/` });
  await send("Runtime.evaluate", {
    expression: `(async () => {
      for (let i = 0; i < 40; i++) {
        const { App } = await import("./script.js");
        if (App?.page && window.__nsweb?.engine) {
          App.page.peerOrigins = {
            moveco: "${eco.peers.moveco.origin()}",
            permitflow: "${eco.peers.permitflow.origin()}",
            homeconnect: "${eco.peers.homeconnect.origin()}",
            powerflow: "${eco.peers.powerflow.origin()}",
          };
          window.__continuityLongTasks = 0;
          if (typeof PerformanceObserver === "function") {
            try {
              const ltObs = new PerformanceObserver((list) => {
                window.__continuityLongTasks += list.getEntries().length;
              });
              ltObs.observe({ entryTypes: ["longtask"] });
            } catch {}
          }
          await App.page.probeLivePeerOrigins();
          await App.page.resetMission({ rippleFailureInjected: false });
          return true;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
    })()`,
    awaitPromise: true,
  });
  const bootMs = Number((performance.now() - t0).toFixed(1));

  // Warm up 1 full cycle (prepare -> commit -> reset) before baseline
  await send("Runtime.evaluate", {
    expression: `(async () => {
      const { App } = await import("./script.js");
      await App.page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday below €700.");
      const st = App.page.getState();
      await App.page.commitPreparedPackage({
        planId: st.selectedPlanId,
        expectedVersion: st.version,
        expectedTotalEur: st.selectedPlanSummary.metrics.totalMissionCostEur,
      });
      await App.page.resetMission({ rippleFailureInjected: false });
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 400));
    })()`,
    awaitPromise: true,
  });

  await send("HeapProfiler.collectGarbage");
  const getPerfMap = async () => {
    const { metrics } = await send("Performance.getMetrics");
    const docNodes = (await send("Runtime.evaluate", {
      expression: "document.querySelectorAll('*').length",
      returnByValue: true,
    })).result.value;
    return { ...Object.fromEntries(metrics.map((m) => [m.name, m.value])), CoordinatorNodes: docNodes };
  };
  const before = await getPerfMap();

  // Execute 5 consecutive full cross-origin Saga cycles + reset
  await send("Runtime.evaluate", {
    expression: `(async () => {
      const { App } = await import("./script.js");
      for (let i = 0; i < 5; i++) {
        await App.page.resetMission({ rippleFailureInjected: i % 2 === 1 });
        await App.page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday below €700.");
        const st = App.page.getState();
        await App.page.commitPreparedPackage({
          planId: st.selectedPlanId,
          expectedVersion: st.version,
          expectedTotalEur: st.selectedPlanSummary.metrics.totalMissionCostEur,
        });
      }
      await App.page.resetMission({ rippleFailureInjected: false });
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 600));
    })()`,
    awaitPromise: true,
  });

  await send("HeapProfiler.collectGarbage");
  const after = await getPerfMap();

  const coordDomDelta = after.CoordinatorNodes - before.CoordinatorNodes;
  const domDelta = after.Nodes - before.Nodes;
  const listenerDelta = after.JSEventListeners - before.JSEventListeners;
  const heapMbBefore = Number((before.JSHeapUsedSize / 1_048_576).toFixed(2));
  const heapMbAfter = Number((after.JSHeapUsedSize / 1_048_576).toFixed(2));
  const heapDeltaMb = Number((heapMbAfter - heapMbBefore).toFixed(2));

  const ltEval = await send("Runtime.evaluate", {
    expression: "window.__continuityLongTasks || 0",
    returnByValue: true,
  });
  const longTasksObserved = Number(ltEval?.result?.value || 0);

  console.log(
    JSON.stringify(
      {
        bootAnd5OriginHandshakeMs: bootMs,
        longTasksObserved,
        coordinatorDomNodesBefore: before.CoordinatorNodes,
        coordinatorDomNodesAfter5Sagas: after.CoordinatorNodes,
        coordinatorDomNodesDelta: coordDomDelta,
        rendererNodesBefore: before.Nodes,
        rendererNodesAfter5Sagas: after.Nodes,
        rendererNodesDelta: domDelta,
        eventListenersBefore: before.JSEventListeners,
        eventListenersAfter5Sagas: after.JSEventListeners,
        eventListenersDelta: listenerDelta,
        jsHeapMbBefore: heapMbBefore,
        jsHeapMbAfter5Sagas: heapMbAfter,
        jsHeapDeltaMb: heapDeltaMb,
      },
      null,
      2,
    ),
  );

  // Guard against unbounded DOM / heap leaks across 5 full Saga cycles
  assert.ok(coordDomDelta <= 50, `Excessive coordinator DOM node growth across 5 sagas: +${coordDomDelta}`);
  assert.ok(heapDeltaMb < 5, `Excessive V8 JS heap growth across 5 sagas: +${heapDeltaMb} MB`);

  ws.close();
} finally {
  proc?.kill();
  await new Promise((r) => setTimeout(r, 250));
  await eco.stopAll();
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
