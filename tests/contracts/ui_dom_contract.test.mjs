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
    for (const file of ["script.js", "site.js", "ui.js", "peer-sync.js"]) {
      const src = await read(app, file);
      const wanted = [...src.matchAll(/(?:querySelector|querySelectorAll)\(\s*["'`]#([A-Za-z][\w-]*)["'`]\s*\)/g)].map((m) => m[1]);
      for (const id of wanted) {
        if (DYNAMIC.test(id)) continue;
        assert.ok(ids.has(id), `${app}/${file} looks up #${id}, missing from ${app}/index.html`);
      }
    }
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

test("generated stylesheets are in sync with the design system", () => {
  const res = spawnSync(process.execPath, [path.join(ROOT, "scripts", "write_peer_styles.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
