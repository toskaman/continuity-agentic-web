/**
 * Film-plate capture for the v2 jury film (redesigned UI, public deployment).
 *
 * Drives a real headless Chrome over CDP against the PUBLIC site (real cross-origin
 * peers), performs real mouse clicks (Input.dispatchMouseEvent) and records:
 *   - screencast clips  -> <out>/clips/<seg>.mp4   (1920x1080, CFR 30 fps, from real frame timestamps)
 *   - hi-res stills     -> <out>/stills/<name>.jpg (2880x1620, DPR 2 of a 1440x810 viewport)
 *   - element bounds    -> <out>/bounds.json        (output pixels of the 1920x1080 frame)
 *   - page text proofs  -> <out>/proofs.json        (exact strings on screen, for the evidence ledger)
 *
 * Usage: node scripts/capture_video_v2.mjs [outDir]
 * No secrets are used: the demo needs no API key.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const OUT = process.argv[2] || "Z:\\continuity-titan-omega\\v2\\footage";
const LOCAL = process.argv[3] === "local";
let SITE = "https://toskaman.github.io/continuity-agentic-web/";
let eco = null;
if (LOCAL) {
  const { startAllEcosystemServers } = await import("./serve_ecosystem.mjs");
  eco = await startAllEcosystemServers({ continuity: 8080, moveco: 8081, permitflow: 8082, homeconnect: 8083, powerflow: 8084 });
  SITE = "http://127.0.0.1:8080/";
}
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const FFMPEG = ["C:\\Users\\TheBox\\AppData\\Local\\agy\\bin\\ffmpeg.exe", "D:\\Program Files\\ShareX\\ffmpeg.exe"].find((p) => existsSync(p));
const VW = 1440, VH = 810, DPR = 2; // 1440x810 css -> 2880x1620 media (zoom-safe), shown at 1920x1080
const K = 4 / 3; // css px -> 1920x1080 film px

await mkdir(path.join(OUT, "clips"), { recursive: true });
await mkdir(path.join(OUT, "stills"), { recursive: true });
await mkdir(path.join(OUT, "frames"), { recursive: true });

const port = 9455;
const profile = path.join(OUT, "..", "chrome-profile-" + Date.now());
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--window-size=${VW},${VH}`, "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.seq = 0; this.p = new Map(); this.h = new Map(); }
  async open() {
    await new Promise((res, rej) => { this.ws.addEventListener("open", res, { once: true }); this.ws.addEventListener("error", rej, { once: true }); });
    this.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && this.p.has(m.id)) { const q = this.p.get(m.id); this.p.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); }
      else if (m.method && this.h.has(m.method)) for (const f of this.h.get(m.method)) f(m.params);
    });
  }
  on(method, f) { if (!this.h.has(method)) this.h.set(method, []); this.h.get(method).push(f); }
  send(method, params = {}) { const id = ++this.seq; return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
}

let cdp;
const evalJs = async (expr) => (await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
const setDpr = (d) => cdp.send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: d, mobile: false });
const bounds = {}, proofs = {};

async function measure(key, map) {
  bounds[key] = await evalJs(`(() => { const m = ${JSON.stringify(map)}, o = {};
    for (const [k, s] of Object.entries(m)) { const els = [...document.querySelectorAll(s)]; if (!els.length) continue;
      const toB = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left*${K}), y: Math.round(r.top*${K}), w: Math.round(r.width*${K}), h: Math.round(r.height*${K}), text: (el.innerText||"").trim().slice(0,160) }; };
      o[k] = els.length === 1 ? toB(els[0]) : els.map(toB); }
    o.__scrollY = Math.round(scrollY); return o; })()`);
}
async function still(name) {
  await sleep(300);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
  await writeFile(path.join(OUT, "stills", name + ".jpg"), Buffer.from(data, "base64"));
  console.log("still", name);
}
async function stillHi(name, d = 3) {
  await setDpr(d); await sleep(900);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 93 });
  await writeFile(path.join(OUT, "stills", name + ".jpg"), Buffer.from(data, "base64"));
  await setDpr(DPR); await sleep(600);
  console.log("stillHi", name);
}
// Screencast recorder: real frames with real timestamps -> CFR 30 fps mp4
async function record(seg, action, tailMs = 600) {
  const dir = path.join(OUT, "frames", seg); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const frames = []; let n = 0;
  const onFrame = async (p) => {
    const f = path.join(dir, String(n++).padStart(5, "0") + ".jpg");
    frames.push({ f, t: p.metadata.timestamp });
    writeFile(f, Buffer.from(p.data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
  };
  cdp.h.set("Page.screencastFrame", [onFrame]);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2880, maxHeight: 1620, everyNthFrame: 1 });
  await sleep(250);
  const t0 = Date.now() / 1000;
  await action();
  await sleep(tailMs);
  const tEnd = Date.now() / 1000;
  await cdp.send("Page.stopScreencast"); cdp.h.delete("Page.screencastFrame"); await sleep(300);
  if (!frames.length) throw new Error("no frames for " + seg);
  let list = "ffconcat version 1.0\n";
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : Math.max(0.1, tEnd - frames[i].t);
    list += `file '${frames[i].f.replace(/\\/g, "/")}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`;
  }
  list += `file '${frames.at(-1).f.replace(/\\/g, "/")}'\n`;
  const lf = path.join(dir, "list.ffconcat"); await writeFile(lf, list);
  const tmp = path.join(OUT, "clips", seg + ".tmp.mp4"), fin = path.join(OUT, "clips", seg + ".mp4");
  const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lf, "-vf", "fps=30,scale=2880:1620:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-movflags", "+faststart", tmp]);
  if (r.status !== 0) throw new Error("ffmpeg " + seg + ": " + r.stderr);
  await rm(fin, { force: true }); spawnSync("cmd", ["/c", "move", "/y", tmp, fin]);
  console.log(`clip ${seg}: ${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(2)}s (t0 offset ${(frames[0].t - t0).toFixed(2)})`);
  proofs["clip_" + seg] = { frames: frames.length, seconds: Number((tEnd - frames[0].t).toFixed(2)) };
}
async function center(sel) {
  return evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
}
async function click(sel, key) {
  const c = await center(sel); if (!c) throw new Error("no element " + sel);
  bounds["click_" + key] = { x: Math.round(c.x * K), y: Math.round(c.y * K), scrollY: await evalJs("Math.round(scrollY)") };
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await sleep(120);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
  await sleep(70);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
}
const smoothTo = (sel, block = "start") => evalJs(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({behavior:"smooth", block:${JSON.stringify(block)}}); true`);
const jumpTo = (sel, block = "start") => evalJs(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({behavior:"instant", block:${JSON.stringify(block)}}); true`);
const text = (sel) => evalJs(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.innerText.trim())`);
async function waitFor(expr, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await evalJs(expr)) return true; await sleep(200); } throw new Error("timeout: " + expr); }

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(200); }
  const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page");
  cdp = new Cdp(t.webSocketDebuggerUrl); await cdp.open();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await setDpr(DPR);

  // ---- 01 hero
  await cdp.send("Page.navigate", { url: SITE + "?film=" + Date.now() });
  await waitFor(`document.readyState === "complete" && !/Detecting/i.test(document.querySelector("#transport-badge")?.textContent || "Detecting")`);
  await sleep(2500);
  proofs.transportBadge = await text("#transport-badge");
  proofs.hero = await text("#hero-heading");
  proofs.proofRow = await text(".proof");
  await measure("hero", { demoBtn: "#guided-demo-btn", heading: "#hero-heading", eco: "#eco", peers: "#eco [data-peer]", badge: "#transport-badge", steps: "#mission-steps", launch: "#launch-workspace-link", core: "#eco-core-state" });
  await still("01_hero");
  await record("01_hero_idle", () => sleep(6000), 0);

  // ---- 02 before/after proof row
  await record("02_scroll_proof", async () => { await smoothTo(".proof", "center"); await sleep(1600); }, 400);
  await measure("proof", { section: ".proof", cards: ".proof .card, .proof article, .proof > div > div" });
  await still("02_proof");

  // ---- 03 workspace request, arm failure, analyze (real clicks)
  await record("03_scroll_workspace", async () => { await smoothTo("#workspace"); await sleep(1500); }, 300);
  proofs.missionInput = await evalJs(`document.querySelector("#mission-input")?.value || document.querySelector("#mission-input")?.innerText`);
  proofs.capTag = await text("#inv-cap-tag");
  await measure("workspace", { input: "#mission-input", ripple: "#inject-ripple-btn", analyze: "#analyze-plan-btn", cap: "#inv-cap-tag", tags: ".inv-tag", status: "#status-banner", kpis: ".kpi-grid", heading: "#workspace-heading" });
  await still("03_workspace");
  await record("04_arm_failure", async () => { await click("#inject-ripple-btn", "ripple"); await sleep(1400); }, 300);
  await measure("armed", { ripple: "#inject-ripple-btn", status: "#status-banner", input: "#mission-input", analyze: "#analyze-plan-btn" });
  proofs.statusArmed = await text("#status-banner");
  await still("04_armed");
  await record("05_analyze", async () => { await click("#analyze-plan-btn", "analyze"); await sleep(3500); }, 400);
  proofs.statusAnalyzed = await text("#status-banner");
  proofs.kpis = await text(".kpi-grid .kpi-card, .kpi-grid > *");
  await measure("analyzed", { status: "#status-banner", kpis: ".kpi-grid > *", kpiGrid: ".kpi-grid", analyze: "#analyze-plan-btn" });
  await still("05_analyzed");
  await record("05b_scroll_kpis", async () => { await smoothTo(".kpi-grid", "center"); await sleep(1300); }, 300);
  await measure("kpis", { kpis: ".kpi-grid > *", kpiGrid: ".kpi-grid", status: "#status-banner", analyze: "#analyze-plan-btn", input: "#mission-input" });
  await still("05b_kpis");

  // ---- 06 mission map + approval center
  await record("06_scroll_mission", async () => { await smoothTo("#mission"); await sleep(1600); }, 300);
  await measure("mission", { heading: "#mission-heading", graph: "#graph-viewport", svg: "#mission-graph-svg", inspector: "#node-inspector", summary: "#change-summary-box", holds: "#hold-countdown-strip", ops: "#operations-list > *", opsList: "#operations-list", approve: "#approve-commit-btn", pkg: ".package-panel" });
  proofs.changeSummary = await text("#change-summary-box");
  proofs.holds = await text("#hold-countdown-strip");
  proofs.ops = await text("#operations-list > *");
  await still("06_mission");
  await jumpTo(".package-panel", "center"); await sleep(500);
  await measure("pkg", { summary: "#change-summary-box", holds: "#hold-countdown-strip", ops: "#operations-list > *", approve: "#approve-commit-btn", pkg: ".package-panel" });
  await still("06b_package");

  // ---- 07 plans
  await record("07_scroll_plans", async () => { await smoothTo("#plans"); await sleep(1600); }, 300);
  await measure("plans", { heading: "#plans-heading", merge: "#plans-merge-note", plans: "#plans-selector > *", selector: "#plans-selector", budget: "#whatif-budget-box", pareto: "#pareto-plot-svg" });
  proofs.plans = await text("#plans-selector > *");
  proofs.mergeNote = await text("#plans-merge-note");
  await still("07_plans");

  // ---- 08 provider wall before approval (frames load from their own origins)
  await record("08_scroll_wall", async () => { await smoothTo("#live-wall", "center"); await sleep(1800); }, 300);
  await evalJs(`document.querySelector("#live-wall-load")?.click(); true`);
  await waitFor(`document.querySelectorAll("#live-wall iframe").length >= 4`, 20000);
  await sleep(6000);
  await jumpTo("#live-wall", "center"); await sleep(600);
  proofs.wallBefore = await text("#live-wall [data-live-state]");
  proofs.wallUrls = await evalJs(`[...document.querySelectorAll("#live-wall iframe")].map(f => f.src.split("#")[0])`);
  await measure("wallBefore", { wall: "#live-wall", sites: "#live-wall .live-site", urls: "#live-wall .live-url", states: "#live-wall .live-state", frames: "#live-wall .live-frame" });
  await still("08_wall_before");
  await stillHi("08_wall_before_hi");

  // ---- 09 approval dialog (real click on the approve button)
  await jumpTo("#approve-commit-btn", "center"); await sleep(700);
  await record("09_open_approval", async () => { await click("#approve-commit-btn", "approve"); await sleep(1600); }, 300);
  await waitFor(`!!document.querySelector("dialog[open]")`, 8000);
  proofs.dialog = await text("dialog[open]");
  await measure("dialog", { dialog: "dialog[open]", title: "dialog[open] h2, dialog[open] h3", blocks: "dialog[open] section, dialog[open] dl > div, dialog[open] li, dialog[open] p", strong: "dialog[open] strong, dialog[open] dt", confirm: "dialog[open] button:not(.assistant-decline)", decline: "dialog[open] button.assistant-decline", code: "dialog[open] code" });
  await still("09_dialog");
  await stillHi("09_dialog_hi");

  // ---- 10 approve -> commit -> providers verify receipts (real click)
  await record("10_commit_wall", async () => {
    await click("dialog[open] button:not(.assistant-decline)", "confirm");
    await sleep(9000);
  }, 600);
  proofs.wallAfter = await text("#live-wall [data-live-state]");
  proofs.outcome = await text("#outcome-panel");
  await measure("wallAfter", { wall: "#live-wall", sites: "#live-wall .live-site", urls: "#live-wall .live-url", states: "#live-wall .live-state", frames: "#live-wall .live-frame", outcome: "#outcome-panel" });
  await still("10_wall_after");
  await evalJs(`document.querySelector("#outcome-panel .outcome-close")?.click(); true`); await sleep(500);
  await jumpTo("#live-wall", "center"); await sleep(500);
  await measure("wallClean", { wall: "#live-wall", sites: "#live-wall .live-site", urls: "#live-wall .live-url", states: "#live-wall .live-state", frames: "#live-wall .live-frame" });
  await still("10b_wall_after_clean");
  await stillHi("10b_wall_after_hi");
  // frame-internal proof: read each provider frame's visible text via CDP targets
  proofs.frameTexts = {};
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for (const tg of targets.filter((x) => x.type === "iframe")) proofs.frameTexts[tg.url.split("#")[0]] = tg.title;

  // ---- 11 agent grid (network cards)
  await jumpTo("#agent-grid", "center"); await sleep(700);
  await measure("agents", { grid: "#agent-grid", cards: "#agent-grid > *" });
  proofs.agents = await text("#agent-grid > *");
  await still("11_agents");

  // ---- 12 trust center: chaos lab + hash-chained timeline
  await record("12_trust_chaos", async () => {
    await smoothTo("#trust"); await sleep(1400);
    await click("#tab-btn-chaos", "chaosTab"); await sleep(700);
    await click("#run-chaos-suite-btn", "chaosRun"); await sleep(3500);
  }, 400);
  await waitFor(`/scenarios passed/.test(document.querySelector("#chaos-summary")?.textContent || "")`, 30000);
  proofs.chaos = await text("#chaos-summary");
  await measure("chaos", { tabs: "#trust [role=tab], #trust .tab-btn", summary: "#chaos-summary", rows: "#chaos-tbody tr", run: "#run-chaos-suite-btn", panel: "#tab-panel-chaos" });
  await still("12_chaos");
  await click("#tab-btn-privacy", "privacyTab"); await sleep(900);
  proofs.privacy = await text("#tab-panel-privacy");
  await measure("privacy", { panel: "#tab-panel-privacy", rows: "#privacy-tbody tr", tiles: "#trust .trust-tile, #trust [data-open-tab]" });
  await still("12b_privacy");
  await click("#tab-btn-timeline", "timelineTab"); await sleep(900);
  proofs.chain = await text("#chain-integrity-banner");
  await measure("timeline", { banner: "#chain-integrity-banner", list: "#audit-timeline-list > *" });
  await still("13_timeline");

  // ---- 14 assistant (BYOK runtime, Otari preset) — no key is typed
  await jumpTo("#assistant"); await sleep(900);
  await measure("assistant", { shell: "#assistant", otari: "#otari-preset-btn", zero: "#zero-key-replay-btn", app: "#agent-app", status: "#assistant-status", policy: "#policy-note" });
  proofs.assistant = await text("#assistant-status, #policy-note");
  await still("14_assistant");

  // ---- 15 back to top: completed state of the hero (core says verified)
  await jumpTo("#top"); await sleep(1200);
  proofs.coreAfter = await text("#eco-core-state");
  await measure("heroAfter", { eco: "#eco", peers: "#eco [data-peer]", core: "#eco-core-state", steps: "#mission-steps", demoBtn: "#guided-demo-btn" });
  await still("15_hero_after");
  await record("15_hero_after_idle", () => sleep(4000), 0);

  // ---- 16 the four providers' own sites + coordinator, opened directly (for the 3D origin scene)
  for (const u of proofs.wallUrls || []) {
    const root = u.replace(/embed\.html$/, ""); const id = root.split("/").filter(Boolean).pop();
    await cdp.send("Page.navigate", { url: root }); await sleep(4000);
    await still("peer_" + id);
  }
  const mc = null;
  if (mc) {
    await cdp.send("Page.navigate", { url: mc }); await sleep(4500);
    proofs.movecoSite = await evalJs(`document.body.innerText.slice(0, 600)`);
    await still("16_moveco_site");
  }
} catch (e) {
  console.error("CAPTURE ERROR:", e.stack || e.message);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(OUT, "bounds.json"), JSON.stringify(bounds, null, 2));
  await writeFile(path.join(OUT, "proofs.json"), JSON.stringify(proofs, null, 2));
  try { cdp?.ws.close(); } catch {}
  chrome.kill();
  if (eco) await eco.stopAll();
  console.log("done ->", OUT);
}
