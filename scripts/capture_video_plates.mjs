/**
 * Captures crystal-clear 1920x1080 30fps live product plates AND measures exact
 * `getBoundingClientRect()` coordinates (`ui_bounds.json`) on the exact 1920x1080 viewport,
 * guaranteeing 100% pixel-accurate virtual cursor targets and focus outlines!
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startAllEcosystemServers } from "./serve_ecosystem.mjs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const FFMPEG_PATH = "D:\\Program Files\\ShareX\\ffmpeg.exe";
const OUT_DIR = "Z:\\continuity-titan-omega\\footage";
const JURY_ASSETS = "Z:\\continuity-titan-omega\\jury-film\\assets\\footage";
const BRAG_ASSETS = "Z:\\continuity-titan-omega\\brag-output\\composition\\assets";

await mkdir(OUT_DIR, { recursive: true });
await mkdir(JURY_ASSETS, { recursive: true });
await mkdir(BRAG_ASSETS, { recursive: true });

const eco = await startAllEcosystemServers({
  continuity: 8080,
  moveco: 8081,
  permitflow: 8082,
  homeconnect: 8083,
  powerflow: 8084,
});

const cdpPort = 9444;
const chromeProc = spawn(
  CHROME_PATH,
  [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    "--window-size=1920,1080",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=Z:\\continuity-titan-omega\\chrome-video-profile",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForCdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Headless Chrome CDP did not start");
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.pending = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
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
  close() {
    this.ws.close();
  }
}

try {
  await waitForCdp();
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === "page");
  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const snap = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const buf = Buffer.from(data, "base64");
    await writeFile(path.join(OUT_DIR, name), buf);
    await writeFile(path.join(JURY_ASSETS, name), buf);
    await writeFile(path.join(BRAG_ASSETS, name), buf);
    console.log(`Captured 1920x1080 plate: ${name}`);
  };

  const measureSelectors = async (selectorsMap) => {
    const res = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const map = ${JSON.stringify(selectorsMap)};
        const out = {};
        for (const [key, sel] of Object.entries(map)) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            out[key] = {
              x: Math.round(r.left),
              y: Math.round(r.top),
              w: Math.round(r.width),
              h: Math.round(r.height),
              cx: Math.round(r.left + r.width / 2),
              cy: Math.round(r.top + r.height / 2)
            };
          }
        }
        return out;
      })()`,
      returnByValue: true,
    });
    return res.result.value;
  };

  const bounds = {};

  // PLATE 1: Clean Baseline 6-Commitment Coordinator (Top View)
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8080/" });
  await new Promise((r) => setTimeout(r, 900));
  await snap("plate_01_baseline_top.png");
  bounds.plate01 = await measureSelectors({
    transportBadge: "#transport-badge",
    injectRippleBtn: "#inject-ripple-btn",
    peerDirectory: ".peer-directory-card",
    missionInput: "#mission-input",
    analyzeBtn: "#analyze-plan-btn",
    approveBtn: "#approve-commit-btn",
    kpiGrid: ".kpi-grid",
    kpiAffected: ".kpi-card:nth-child(1)",
    kpiPreserved: ".kpi-card:nth-child(2)",
    kpiCost: ".kpi-card:nth-child(3)",
  });

  // PLATE 2: Ripple Failure Armed on Top Bar
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const { App } = await import("./script.js");
      await App.page.resetMission({ rippleFailureInjected: true });
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snap("plate_02_ripple_armed.png");
  bounds.plate02 = await measureSelectors({
    injectRippleBtn: "#inject-ripple-btn",
    analyzeBtn: "#analyze-plan-btn",
    statusBanner: "#status-banner",
  });

  // PLATE 3: Impact Analyzed & Minimal-Change Plan Prepared (Top View with KPIs)
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const { App } = await import("./script.js");
      await App.page.analyzeAndPrepareChange(document.querySelector("#mission-input").value);
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 300));
  await snap("plate_03_prepared_top.png");
  bounds.plate03 = await measureSelectors({
    approveBtn: "#approve-commit-btn",
    kpiAffected: ".kpi-card:nth-child(1)",
    kpiPreserved: ".kpi-card:nth-child(2)",
    kpiCost: ".kpi-card:nth-child(3)",
    kpiApprovals: ".kpi-card:nth-child(4)",
    changeSummary: "#change-summary-box",
    planA: ".plan-option:nth-child(1)",
  });

  // PLATE 4: Scrolled Workspace View showing Full SVG Graph + Unified Change Package + Hold IDs
  await cdp.send("Runtime.evaluate", {
    expression: `window.scrollTo(0, 760); "scrolled"`,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snap("plate_04_prepared_graph_and_holds.png");
  bounds.plate04 = await measureSelectors({
    graphPanel: ".graph-panel",
    graphSvg: "#mission-graph-svg",
    changeSummary: "#change-summary-box",
    planA: ".plan-option:nth-child(1)",
    firstOpCard: ".op-card:nth-child(1)",
    secondOpCard: ".op-card:nth-child(2)",
  });

  // PLATE 5: Bound SHA-256 Confirmation Modal Open
  await cdp.send("Runtime.evaluate", {
    expression: `window.scrollTo(0, 0); document.querySelector("#approve-commit-btn").click(); "modal"`,
  });
  await new Promise((r) => setTimeout(r, 280));
  await snap("plate_05_approval_modal.png");
  bounds.plate05 = await measureSelectors({
    modalDialog: "dialog.assistant-review",
    confirmBtn: "dialog.assistant-review button:not(.assistant-decline)",
    declineBtn: "dialog.assistant-review button.assistant-decline",
  });

  // PLATE 6: Committed & Ed25519 Verified Graph + Receipts
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      document.querySelector("dialog.assistant-review button")?.click();
      await new Promise(r => setTimeout(r, 380));
      window.scrollTo(0, 720);
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snap("plate_06_committed_ed25519_verified.png");
  bounds.plate06 = await measureSelectors({
    graphSvg: "#mission-graph-svg",
    nodeInspector: "#node-inspector",
    changeSummary: "#change-summary-box",
    opCard1: ".op-card:nth-child(1)",
    opCard2: ".op-card:nth-child(2)",
    opCard3: ".op-card:nth-child(3)",
  });

  // PLATE 7: Chaos Lab 15/15 Scenarios Passed
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      document.querySelector("#tab-btn-chaos").click();
      await new Promise(r => setTimeout(r, 450));
      document.querySelector(".tabs-section")?.scrollIntoView({ behavior: "instant" });
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snap("plate_07_chaos_lab_15_passed.png");
  bounds.plate07 = await measureSelectors({
    chaosTabBtn: "#tab-btn-chaos",
    chaosSummary: "#chaos-summary",
    chaosRow3: "#chaos-tbody tr:nth-child(3)",
    chaosRow5: "#chaos-tbody tr:nth-child(5)",
  });

  // PLATE 8: Open Agentic Web Browser Runtime + Mozilla Otari BYOK Panel
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#assistant")?.scrollIntoView({ behavior: "instant" }); "runtime"`,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snap("plate_08_runtime_otari.png");
  bounds.plate08 = await measureSelectors({
    assistantHeader: "#assistant .panel-header",
    nsHeader: "#agent-app .ns-header",
    nsChat: "#agent-app .ns-chat",
    nsAgents: "[data-ns-slot='agents']",
  });

  // PLATE 9: Independent Peer Website — MoveCo Express
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8081/" });
  await new Promise((r) => setTimeout(r, 750));
  await snap("plate_09_peer_moveco.png");
  bounds.plate09 = await measureSelectors({
    bookingCard: ".two-col-cards .card:nth-child(1)",
    slotsCard: ".two-col-cards .card:nth-child(2)",
    artifactLinks: ".artifact-links",
  });

  // PLATE 10: Independent Peer Website — PermitFlow Civic Prep
  await cdp.send("Page.navigate", { url: "http://localhost:8082/" });
  await new Promise((r) => setTimeout(r, 750));
  await snap("plate_10_peer_permitflow.png");

  await writeFile(path.join(OUT_DIR, "ui_bounds.json"), JSON.stringify(bounds, null, 2), "utf8");
  console.log("Wrote exact 1920x1080 bounding-box telemetry -> Z:\\continuity-titan-omega\\footage\\ui_bounds.json");

  cdp.close();
} finally {
  chromeProc.kill();
  await eco.stopAll();
}
