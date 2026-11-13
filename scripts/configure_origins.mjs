/**
 * Rewrites partner network URLs, `link_labels`, `allowed_peers`, and UI links across the
 * 5 Open Agentic Websites for multi-origin public HTTPS deployment (or restores local dev ports).
 *
 * Usage:
 *   node scripts/configure_origins.mjs --mode github-pages \
 *     --continuity https://toskaman.github.io/continuity-agentic-web \
 *     --moveco https://moveco-agentic-peer.pages.dev \
 *     --permitflow https://permitflow-agentic-peer.pages.dev \
 *     --homeconnect https://homeconnect-agentic-peer.pages.dev \
 *     --powerflow https://powerflow-agentic-peer.pages.dev
 *
 *   node scripts/configure_origins.mjs --mode local
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function parseCli(argv) {
  const out = { mode: "local" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && argv[i + 1]) {
      out[a.slice(2)] = argv[++i].replace(/\/$/, "");
    }
  }
  return out;
}

const opts = parseCli(process.argv.slice(2));

const targets =
  opts.mode === "local"
    ? {
        continuity: "http://127.0.0.1:8080",
        moveco: "http://127.0.0.1:8081",
        permitflow: "http://localhost:8082",
        homeconnect: "http://127.0.0.1:8083",
        powerflow: "http://localhost:8084",
      }
    : {
        continuity: opts.continuity,
        moveco: opts.moveco,
        permitflow: opts.permitflow,
        homeconnect: opts.homeconnect,
        powerflow: opts.powerflow,
      };

for (const [k, v] of Object.entries(targets)) {
  if (!v) {
    console.error(`Missing URL for --${k}`);
    process.exit(1);
  }
}

const originOf = (u) => new URL(u).origin;
const safeToolName = (fullUrl) => {
  const u = new URL(fullUrl);
  return u.pathname
    .replace(/^\//, "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 60);
};

// 1. Update apps/continuity-web/agent-manifest.json allowed_peers
const manifestPath = path.join(ROOT, "apps", "continuity-web", "agent-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.allowed_peers = Array.from(
  new Set([
    originOf(targets.moveco),
    originOf(targets.permitflow),
    originOf(targets.homeconnect),
    originOf(targets.powerflow),
  ]),
);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// 2. Update apps/continuity-web/continuity_coordinator.hocon
const mcUrl = `${targets.moveco}/moveco_dispatch`;
const pfUrl = `${targets.permitflow}/permitflow_advisor`;
const hcUrl = `${targets.homeconnect}/homeconnect_scheduler`;
const pwUrl = `${targets.powerflow}/powerflow_grid`;

const hoconPath = path.join(ROOT, "apps", "continuity-web", "continuity_coordinator.hocon");
let hocon = await readFile(hoconPath, "utf8");

hocon = hocon.replace(
  /"link_labels":\s*\{[\s\S]*?\},/,
  `"link_labels": {\n        "${mcUrl}": "MoveCo Express",\n        "${pfUrl}": "PermitFlow Civic Prep",\n        "${hcUrl}": "HomeConnect Fiber",\n        "${pwUrl}": "PowerFlow Energy"\n    },`,
);

hocon = hocon.replace(
  /"tools":\s*\[\s*"http[^"]+",\s*"http[^"]+",\s*"http[^"]+",\s*"http[^"]+"\s*\]/,
  `"tools": [\n                "${mcUrl}",\n                "${pfUrl}",\n                "${hcUrl}",\n                "${pwUrl}"\n            ]`,
);

// Update tool names in How to work if subpath changed them
hocon = hocon
  .replace(/ask [A-Za-z0-9_]+ what moving services/, `ask ${safeToolName(mcUrl)} what moving services`)
  .replace(/ask [A-Za-z0-9_]+ what public eligibility/, `ask ${safeToolName(pfUrl)} what public eligibility`)
  .replace(/ask [A-Za-z0-9_]+ what fiber installation/, `ask ${safeToolName(hcUrl)} what fiber installation`)
  .replace(/ask [A-Za-z0-9_]+ what electricity activation/, `ask ${safeToolName(pwUrl)} what electricity activation`);

await writeFile(hoconPath, hocon, "utf8");

// 3. Update UI links in index.html & script.js
const indexHtmlPath = path.join(ROOT, "apps", "continuity-web", "index.html");
let html = await readFile(indexHtmlPath, "utf8");
html = html
  .replace(/id="peer-link-moveco" href="[^"]+"/, `id="peer-link-moveco" href="${targets.moveco}/"`)
  .replace(/id="peer-link-permitflow" href="[^"]+"/, `id="peer-link-permitflow" href="${targets.permitflow}/"`)
  .replace(/id="peer-link-homeconnect" href="[^"]+"/, `id="peer-link-homeconnect" href="${targets.homeconnect}/"`)
  .replace(/id="peer-link-powerflow" href="[^"]+"/, `id="peer-link-powerflow" href="${targets.powerflow}/"`);
await writeFile(indexHtmlPath, html, "utf8");

const scriptJsPath = path.join(ROOT, "apps", "continuity-web", "script.js");
let sjs = await readFile(scriptJsPath, "utf8");
sjs = sjs.replace(
  /this\.peerOrigins = \{[\s\S]*?\};/,
  `this.peerOrigins = {\n      moveco: "${targets.moveco}",\n      permitflow: "${targets.permitflow}",\n      homeconnect: "${targets.homeconnect}",\n      powerflow: "${targets.powerflow}",\n    };`,
);
await writeFile(scriptJsPath, sjs, "utf8");

for (const peerDir of ["demo-moveco", "demo-permitflow", "demo-homeconnect", "demo-powerflow"]) {
  const pHtmlPath = path.join(ROOT, "apps", peerDir, "index.html");
  let pHtml = await readFile(pHtmlPath, "utf8");
  pHtml = pHtml.replace(/id="coordinator-link" href="[^"]+"/, `id="coordinator-link" href="${targets.continuity}/"`);
  await writeFile(pHtmlPath, pHtml, "utf8");
}

// 4. Rebuild & validate all 5 bundles
const build = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build_all_networks.mjs")], {
  stdio: "inherit",
});
process.exit(build.status || 0);
