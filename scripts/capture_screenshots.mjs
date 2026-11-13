/**
 * Headless Chrome DevTools Protocol (CDP) Screenshot Generator (`1920x1080`).
 * Captures authentic, real-browser Devpost submission screenshots + clean SVG Architecture Diagram
 * into `docs/submission/screenshots/`.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startAllEcosystemServers } from "./serve_ecosystem.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT_DIR = path.join(ROOT, "docs", "submission", "screenshots");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await mkdir(OUT_DIR, { recursive: true });

// 1. Write crisp, publication-grade Architecture SVG Diagram for Devpost gallery
const archSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 820" width="1400" height="820">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8"/>
    </marker>
    <marker id="arrGreen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981"/>
    </marker>
  </defs>
  <rect width="1400" height="820" fill="url(#bgGrad)"/>

  <!-- Header -->
  <text x="50" y="54" fill="#f8fafc" font-size="28" font-weight="800" font-family="Inter, Segoe UI, sans-serif">CONTINUITY — Open Agentic Web Architecture (MVP Profile 0.2)</text>
  <text x="50" y="84" fill="#94a3b8" font-size="16" font-family="Inter, Segoe UI, sans-serif">Browser-Executed Portable Neuro SAN Networks · Deterministic Minimal-Change Solver · Multi-Origin Consent &amp; Ed25519 Verification</text>

  <!-- Browser Container -->
  <rect x="45" y="115" width="820" height="655" rx="16" fill="#131c2e" stroke="#38bdf8" stroke-width="2"/>
  <text x="70" y="150" fill="#7dd3fc" font-size="17" font-weight="700" font-family="Inter, Segoe UI, sans-serif">VISITOR'S STANDARD WEB BROWSER (AUTHORITATIVE TRUST BOUNDARY)</text>

  <!-- UI + Runtime Box -->
  <rect x="70" y="175" width="770" height="190" rx="12" fill="#1b263b" stroke="#334155" stroke-width="1.5"/>
  <text x="95" y="208" fill="#f8fafc" font-size="16" font-weight="700" font-family="Inter, Segoe UI, sans-serif">1. Cognizant Browser Runtime (nsDeploy / agentify-website) + CRUSE UI</text>
  <text x="95" y="236" fill="#cbd5e1" font-size="13.5" font-family="Inter, Segoe UI, sans-serif">• Parses &amp; validates continuity_coordinator.network.json (Front: continuity_orchestrator + peer_network_specialist)</text>
  <text x="95" y="262" fill="#cbd5e1" font-size="13.5" font-family="Inter, Segoe UI, sans-serif">• Enforces closed peer_policy, per-hop Interactive Consent Cards BEFORE contact, &amp; bounded budgets (4 peers / 12 steps)</text>
  <text x="95" y="288" fill="#cbd5e1" font-size="13.5" font-family="Inter, Segoe UI, sans-serif">• Runs fetched peer networks LOCALLY in caller browser on visitor's active router — peer NEVER sees BYOK API key</text>
  <text x="95" y="314" fill="#34d399" font-size="13.5" font-weight="600" font-family="Inter, Segoe UI, sans-serif">• Exposes grounded local site capabilities via website_* tools &amp; confirmation modal (AssistantMount.review)</text>

  <!-- Deterministic Safety Kernel Box -->
  <rect x="70" y="390" width="770" height="350" rx="12" fill="#0f172a" stroke="#10b981" stroke-width="1.8"/>
  <text x="95" y="424" fill="#34d399" font-size="16" font-weight="700" font-family="Inter, Segoe UI, sans-serif">2. Deterministic Safety &amp; Reconciliation Kernel (12 Open-Source @continuity/* Modules)</text>

  <rect x="95" y="445" width="350" height="82" rx="8" fill="#131c2e" stroke="#334155"/>
  <text x="112" y="472" fill="#f8fafc" font-size="14" font-weight="700" font-family="Inter, Segoe UI, sans-serif">@continuity/mission-core &amp; mission-graph</text>
  <text x="112" y="495" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">Locks hard budget (&lt;= €700) &amp; no-auto-cancel;</text>
  <text x="112" y="513" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">3-color DFS cycle guard; observed vs assumed facts.</text>

  <rect x="465" y="445" width="350" height="82" rx="8" fill="#131c2e" stroke="#334155"/>
  <text x="482" y="472" fill="#f8fafc" font-size="14" font-weight="700" font-family="Inter, Segoe UI, sans-serif">@continuity/impact-engine &amp; constraint-solver</text>
  <text x="482" y="495" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">Bounded BFS excludes unaffected bookings (0 calls);</text>
  <text x="482" y="513" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">solves Plan A (Min Change), Plan B (Cost), Plan C.</text>

  <rect x="95" y="545" width="350" height="82" rx="8" fill="#131c2e" stroke="#334155"/>
  <text x="112" y="572" fill="#f8fafc" font-size="14" font-weight="700" font-family="Inter, Segoe UI, sans-serif">@continuity/approval-engine &amp; saga-engine</text>
  <text x="112" y="595" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">Prepare-First / Hold-Before-Commit; RFC-8785 JCS +</text>
  <text x="112" y="613" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">SHA-256 bound approvals (€0.01 drift invalidates).</text>

  <rect x="465" y="545" width="350" height="82" rx="8" fill="#131c2e" stroke="#334155"/>
  <text x="482" y="572" fill="#f8fafc" font-size="14" font-weight="700" font-family="Inter, Segoe UI, sans-serif">@continuity/outcome-reconciliation &amp; proof</text>
  <text x="482" y="595" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">14-state ledger; UNKNOWN timeout idempotency check;</text>
  <text x="482" y="613" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">Ed25519 provider receipt signature verification.</text>

  <rect x="95" y="645" width="720" height="72" rx="8" fill="#1b263b" stroke="#f59e0b"/>
  <text x="115" y="673" fill="#fbbf24" font-size="14" font-weight="700" font-family="Inter, Segoe UI, sans-serif">@continuity/nanda-resolver + @continuity/chaos-lab (15 Fault Scenarios)</text>
  <text x="115" y="697" fill="#cbd5e1" font-size="12.5" font-family="Inter, Segoe UI, sans-serif">Validates A2A v1.0 Agent Cards &amp; NANDA authority/sequence bindings · Chaos Lab proves 15/15 failure recoveries live.</text>

  <!-- Right Column: Otari Router -->
  <rect x="935" y="115" width="420" height="145" rx="14" fill="#1e1b4b" stroke="#818cf8" stroke-width="2"/>
  <text x="960" y="150" fill="#c7d2fe" font-size="16" font-weight="700" font-family="Inter, Segoe UI, sans-serif">PLUGGABLE BYOK INFERENCE ROUTER</text>
  <text x="960" y="178" fill="#f8fafc" font-size="14.5" font-weight="600" font-family="Inter, Segoe UI, sans-serif">Mozilla Otari Gateway (api.otari.ai/api/v1)</text>
  <text x="960" y="203" fill="#cbd5e1" font-size="12.5" font-family="Inter, Segoe UI, sans-serif">Default model: alibaba/qwen-3.5-35b-a3b (or OpenAI/Ollama)</text>
  <text x="960" y="226" fill="#34d399" font-size="12.5" font-weight="600" font-family="Inter, Segoe UI, sans-serif">Receives Bearer key ONLY — Site host pays $0 LLM cost</text>

  <!-- Right Column: Independent Peer Origins -->
  <rect x="920" y="295" width="445" height="475" rx="14" fill="#131c2e" stroke="#38bdf8" stroke-width="2"/>
  <text x="942" y="330" fill="#7dd3fc" font-size="16" font-weight="700" font-family="Inter, Segoe UI, sans-serif">INDEPENDENT PEER AGENTIC WEBSITES</text>
  <text x="942" y="352" fill="#cbd5e1" font-size="12" font-family="Inter, Segoe UI, sans-serif">Separate Origins · CORS · Manifest · .network.json · A2A · MCP</text>

  <rect x="942" y="372" width="400" height="82" rx="10" fill="#1b263b" stroke="#3b82f6"/>
  <text x="958" y="398" fill="#f8fafc" font-size="13.5" font-weight="700" font-family="Inter, Segoe UI, sans-serif">Peer A — MoveCo Express (moveco_dispatch)</text>
  <text x="958" y="420" fill="#cbd5e1" font-size="11.8" font-family="Inter, Segoe UI, sans-serif">Quotes · 15-min Crew Holds · Overflow Recovery · Ed25519</text>
  <text x="958" y="440" fill="#93c5fd" font-size="11" font-family="monospace">agent-manifest.json | agent-card.json | /mcp</text>

  <rect x="942" y="468" width="400" height="82" rx="10" fill="#1b263b" stroke="#14b8a6"/>
  <text x="958" y="494" fill="#f8fafc" font-size="13.5" font-weight="700" font-family="Inter, Segoe UI, sans-serif">Peer B — PermitFlow Civic Prep (permitflow_advisor)</text>
  <text x="958" y="516" fill="#cbd5e1" font-size="11.8" font-family="Inter, Segoe UI, sans-serif">Public Bay Notice Check &amp; Demo Application Drafts Only</text>
  <text x="958" y="536" fill="#5eead4" font-size="11" font-family="monospace">agent-manifest.json | agent-card.json | /mcp</text>

  <rect x="942" y="564" width="400" height="82" rx="10" fill="#1b263b" stroke="#8b5cf6"/>
  <text x="958" y="590" fill="#f8fafc" font-size="13.5" font-weight="700" font-family="Inter, Segoe UI, sans-serif">Peer C — HomeConnect Fiber (homeconnect_scheduler)</text>
  <text x="958" y="612" fill="#cbd5e1" font-size="11.8" font-family="Inter, Segoe UI, sans-serif">2 Gbps ONT Technician Windows &amp; 10-min Slot Holds</text>
  <text x="958" y="632" fill="#ddd6fe" font-size="11" font-family="monospace">agent-manifest.json | agent-card.json | /mcp</text>

  <rect x="942" y="660" width="400" height="82" rx="10" fill="#1b263b" stroke="#f59e0b"/>
  <text x="958" y="686" fill="#f8fafc" font-size="13.5" font-weight="700" font-family="Inter, Segoe UI, sans-serif">Peer D — PowerFlow Energy (powerflow_grid)</text>
  <text x="958" y="708" fill="#cbd5e1" font-size="11.8" font-family="Inter, Segoe UI, sans-serif">Remote Smart-Meter Energization (Preserved by Solver!)</text>
  <text x="958" y="728" fill="#fde68a" font-size="11" font-family="monospace">agent-manifest.json | agent-card.json | /mcp</text>

  <!-- Arrows -->
  <line x1="840" y1="215" x2="930" y2="185" stroke="#38bdf8" stroke-width="2.5" marker-end="url(#arr)"/>
  <line x1="840" y1="300" x2="915" y2="410" stroke="#38bdf8" stroke-width="2.5" marker-end="url(#arr)"/>
  <line x1="840" y1="560" x2="915" y2="560" stroke="#10b981" stroke-width="2.5" marker-end="url(#arrGreen)"/>
</svg>`;

await writeFile(path.join(OUT_DIR, "00_architecture_diagram.svg"), archSvg, "utf8");

// 2. Boot live 5-origin ecosystem + headless Chrome CDP to capture real PNG screenshots
const eco = await startAllEcosystemServers({
  continuity: 8080,
  moveco: 8081,
  permitflow: 8082,
  homeconnect: 8083,
  powerflow: 8084,
});

const cdpPort = 9333;
const chromeProc = spawn(
  CHROME_PATH,
  [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    "--window-size=1600,1150",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=C:\\Users\\TheBox\\AppData\\Local\\Temp\\opencode\\chrome-ss-profile`,
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
    width: 1560,
    height: 1120,
    deviceScaleFactor: 1.5,
    mobile: false,
  });

  const snapPng = async (filename) => {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const outPath = path.join(OUT_DIR, filename);
    await writeFile(outPath, Buffer.from(data, "base64"));
    console.log(`Captured: ${filename}`);
  };

  // Screenshot 1: Baseline 6-Commitment Mission & SVG Dependency Graph
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8080/" });
  await new Promise((r) => setTimeout(r, 900));
  await snapPng("01_continuity_mission_baseline.png");

  // Screenshot 2: Ripple Failure Armed + Minimal-Change Plan Prepared (3 affected, 3 preserved)
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const { App } = await import("./script.js");
      await App.page.resetMission({ rippleFailureInjected: true });
      await App.page.analyzeAndPrepareChange(document.querySelector("#mission-input").value);
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 350));
  await snapPng("02_ripple_recovery_prepared_plan.png");

  // Screenshot 3: Bound Cryptographic Approval Confirmation Modal
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#approve-commit-btn").click(); "opened"`,
  });
  await new Promise((r) => setTimeout(r, 300));
  await snapPng("03_bound_approval_modal.png");

  // Screenshot 4: Verified Commit & Ed25519 Provider Receipts
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      document.querySelector("dialog.assistant-review button")?.click();
      await new Promise(r => setTimeout(r, 400));
      document.querySelector(".workspace-two-col")?.scrollIntoView({ behavior: "instant" });
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snapPng("04_committed_verified_ed25519.png");

  // Screenshot 5: Chaos Lab (15/15 Scenarios Passed)
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      document.querySelector("#tab-btn-chaos").click();
      await new Promise(r => setTimeout(r, 500));
      document.querySelector(".tabs-section")?.scrollIntoView({ behavior: "instant" });
    })()`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snapPng("05_chaos_lab_15_passed.png");

  // Screenshot 6: Open Agentic Web Browser Runtime & Mozilla Otari BYOK Configuration Panel
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#assistant")?.scrollIntoView({ behavior: "instant" })`,
  });
  await new Promise((r) => setTimeout(r, 250));
  await snapPng("06_open_agentic_web_runtime_otari_byok.png");

  // Screenshot 7: Independent Peer Website (MoveCo Express)
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8081/" });
  await new Promise((r) => setTimeout(r, 700));
  await snapPng("07_independent_peer_moveco.png");

  // Screenshot 7: Architecture SVG rendered cleanly to PNG
  const archFileUrl = "file:///" + path.join(OUT_DIR, "00_architecture_diagram.svg").replace(/\\/g, "/");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 820,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: archFileUrl });
  await new Promise((r) => setTimeout(r, 400));
  await snapPng("00_architecture_diagram.png");

  cdp.close();
} finally {
  chromeProc.kill();
  await eco.stopAll();
}
