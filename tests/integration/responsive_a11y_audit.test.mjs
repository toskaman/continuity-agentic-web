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

class CdpClient {
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
  async evalJson(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval threw: ${res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

test("Cycle 19 — Real Headless Chromium audits mobile (390x844), dark theme, keyboard SVG navigation, ?demo=1 auto-start, and accessible button/input names across coordinator & Builder Kit", async (t) => {
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
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "continuity-a11y-chrome-"));
  const cdpPort = await getFreeTcpPort();
  let chromeProc = null;
  let cdp = null;

  try {
    chromeProc = spawn(
      browserBin,
      [
        "--headless=new",
        ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
        `--remote-debugging-port=${cdpPort}`,
        "--window-size=390,844",
        "--no-first-run",
        "--no-default-browser-check",
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
    const pageTarget = targets.find((x) => x.type === "page");
    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    // 1. Mobile 390px + Dark Theme + ?demo=1 auto-run + Accessible Name & Keyboard SVG Node Navigation check
    await cdp.send("Page.navigate", { url: `${eco.coordinator.origin()}/?demo=1` });
    const mobileAudit = await cdp.evalJson(`(async () => {
      for (let i = 0; i < 65; i++) {
        if (document.querySelector("dialog[open]")) {
          break;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      // Close approval dialog if open so we can inspect page layout & toggle dark mode
      const openDialog = document.querySelector("dialog[open]");
      const demoOpenedApprovalDialog = Boolean(openDialog);
      if (openDialog) {
        openDialog.querySelector(".assistant-decline")?.click();
      }
      document.querySelector("#theme-toggle-btn")?.click();
      const darkThemeActive = document.documentElement.getAttribute("data-theme") === "dark";

      // Check zero horizontal document overflow at 390px mobile width
      const overflowPx = document.documentElement.scrollWidth - document.documentElement.clientWidth;

      // Check every visible <button> has an accessible name (textContent or aria-label)
      const unnamedButtons = Array.from(document.querySelectorAll("button"))
        .filter((b) => !b.hidden && b.offsetParent !== null)
        .filter((b) => !(b.textContent || "").trim() && !(b.getAttribute("aria-label") || "").trim())
        .map((b) => b.id || b.className || "button");

      // Check keyboard ArrowRight navigation on SVG dependency graph nodes
      const firstSvgNode = document.querySelector("#mission-graph-svg .graph-node-group");
      const beforeId = firstSvgNode?.getAttribute("data-node-id");
      firstSvgNode?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const { App } = await import("./script.js");
      const afterId = App.page.selectedNodeId;

      return {
        demoOpenedApprovalDialog,
        darkThemeActive,
        overflowPx,
        unnamedButtons,
        svgKeyboardChangedSelection: Boolean(beforeId && afterId && beforeId !== afterId),
      };
    })()`);

    assert.equal(mobileAudit.demoOpenedApprovalDialog, true, "?demo=1 must automatically prepare plans and open the bound approval dialog");
    assert.equal(mobileAudit.darkThemeActive, true, "Theme toggle must switch to dark mode");
    assert.ok(mobileAudit.overflowPx <= 2, `Expected 0 horizontal overflow on 390px mobile viewport, got +${mobileAudit.overflowPx}px`);
    assert.deepEqual(mobileAudit.unnamedButtons, [], `All visible buttons must have accessible names: ${mobileAudit.unnamedButtons.join(", ")}`);
    assert.equal(mobileAudit.svgKeyboardChangedSelection, true, "ArrowRight on SVG graph node must cycle selected commitment");

    // 2. Check Builder Kit mobile layout & accessible names at 390px
    await cdp.send("Page.navigate", { url: `${eco.coordinator.origin()}/community-kit.html` });
    const kitMobile = await cdp.evalJson(`(async () => {
      for (let i = 0; i < 30; i++) {
        if (document.querySelectorAll("#kit-modules-tbody tr").length === 19) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const overflowPx = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const unnamedButtons = Array.from(document.querySelectorAll("button"))
        .filter((b) => !b.hidden && b.offsetParent !== null)
        .filter((b) => !(b.textContent || "").trim() && !(b.getAttribute("aria-label") || "").trim())
        .map((b) => b.id || b.className || "button");
      return { overflowPx, unnamedButtons };
    })()`);

    assert.ok(kitMobile.overflowPx <= 2, `Expected 0 horizontal overflow on Builder Kit 390px mobile viewport, got +${kitMobile.overflowPx}px`);
    assert.deepEqual(kitMobile.unnamedButtons, []);
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
