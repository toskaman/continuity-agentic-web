/**
 * UI ↔ logic contract. The redesign keeps every element the business scripts
 * and the Open Agentic Web runtime look up; these tests fail if markup drifts.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const APPS = ["continuity-web", "demo-moveco", "demo-permitflow", "demo-homeconnect", "demo-powerflow"];
// Created at runtime (by the Cognizant runtime, dialogs or render functions), not in index.html.
const DYNAMIC = /^(ns-|inspector-pin-btn$|outcome-panel$|assistant-review-title$|arrow$|continuity$)/;

const read = (app, f) => readFile(path.join(ROOT, "apps", app, f), "utf8").catch(() => "");

test("every #id looked up by site scripts exists in that site's index.html", async () => {
  for (const app of APPS) {
    const html = await read(app, "index.html");
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const file of [
      "script.js",
      "site.js",
      "ui.js",
      "peer-sync.js",
      "modules/fallback-offers.js",
      "modules/change-package-view.js",
      "modules/graph-svg-view.js",
      "modules/pareto-svg-view.js",
      "modules/trust-tables-view.js",
    ]) {
      const src = await read(app, file);
      const wanted = [...src.matchAll(/(?:querySelector|querySelectorAll)\(\s*["'`]#([A-Za-z][\w-]*)["'`]\s*\)/g)].map((m) => m[1]);
      for (const id of wanted) {
        if (DYNAMIC.test(id)) continue;
        assert.ok(ids.has(id), `${app}/${file} looks up #${id}, missing from ${app}/index.html`);
      }
    }
  }

  // Also enforce UI <-> JS contract on the standalone Community Builder Kit page
  const kitHtml = await read("continuity-web", "community-kit.html");
  const kitIds = new Set([...kitHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const kitJs = await read("continuity-web", "community-kit.js");
  const kitWanted = [...kitJs.matchAll(/(?:querySelector|querySelectorAll)\(\s*["'`]#([A-Za-z][\w-]*)["'`]\s*\)/g)].map(
    (m) => m[1],
  );
  for (const id of kitWanted) {
    assert.ok(kitIds.has(id), `continuity-web/community-kit.js looks up #${id}, missing from community-kit.html`);
  }
});

test("all 5 sites keep the runtime mount, status line and deploy-script anchors", async () => {
  for (const app of APPS) {
    const html = await read(app, "index.html");
    assert.match(html, /<p id="assistant-status" role="status"/, `${app}: #assistant-status`);
    assert.match(html, /<div id="agent-app">/, `${app}: #agent-app`);
    for (const slot of ["header", "chat", "agents", "settings"]) {
      assert.ok(html.includes(`data-ns-slot="${slot}"`), `${app}: runtime slot ${slot}`);
    }
    if (app === "continuity-web") {
      for (const peer of ["moveco", "permitflow", "homeconnect", "powerflow"]) {
        assert.match(html, new RegExp(`id="peer-link-${peer}" href="[^"]+"`), `peer-link-${peer} id+href adjacency`);
      }
    } else {
      assert.match(html, /id="coordinator-link" href="[^"]+"/, `${app}: coordinator-link id+href adjacency`);
      assert.ok(html.includes('src="peer-sync.js"'), `${app}: peer-sync.js loaded`);
    }
  }
});

test("each provider ships a compact embed.html that runs its real scripts", async () => {
  const panels = { "demo-moveco": "booking-panel", "demo-permitflow": "dossier-panel", "demo-homeconnect": "appt-panel", "demo-powerflow": "grid-panel" };
  for (const [app, panel] of Object.entries(panels)) {
    const html = await read(app, "embed.html");
    assert.ok(html.includes(`id="${panel}"`), `${app}/embed.html: #${panel}`);
    for (const src of ["script.js", "peer-sync.js", "ui.js"]) assert.ok(html.includes(`src="${src}"`), `${app}/embed.html loads ${src}`);
    assert.ok(!html.includes("site.js"), `${app}/embed.html must not boot the agent runtime`);
  }
});

test("generated stylesheets are in sync with the design system", () => {
  const res = spawnSync(process.execPath, [path.join(ROOT, "scripts", "write_peer_styles.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
