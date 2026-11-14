/**
 * Deploys:
 *  - All 4 independent peer websites to `gpaschercher-sudo.github.io/<peer>` (independent origin!)
 *  - The primary CONTINUITY repository & GitHub Pages site to `toskaman.github.io/continuity-agentic-web`
 */

import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GH = "C:\\Users\\TheBox\\AppData\\Local\\Microsoft\\WinGet\\Packages\\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\\bin\\gh.exe";
const TMP_BASE = "C:\\Users\\TheBox\\AppData\\Local\\Temp\\opencode";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return res;
}

const PEERS = [
  {
    folder: "demo-moveco",
    repo: "moveco-agentic-peer",
    desc: "MoveCo Express — Independent Open Agentic Moving Website (MVP 0.2 Peer Demo)",
  },
  {
    folder: "demo-permitflow",
    repo: "permitflow-agentic-peer",
    desc: "PermitFlow Civic Prep — Independent Open Agentic Permit Dossier Website (MVP 0.2 Peer Demo)",
  },
  {
    folder: "demo-homeconnect",
    repo: "homeconnect-agentic-peer",
    desc: "HomeConnect Fiber — Independent Open Agentic Broadband Scheduling Website (MVP 0.2 Peer Demo)",
  },
  {
    folder: "demo-powerflow",
    repo: "powerflow-agentic-peer",
    desc: "PowerFlow Energy — Independent Open Agentic Smart-Meter Website (MVP 0.2 Peer Demo)",
  },
];

console.log("1. Deploying 4 Independent Peer Websites under gpaschercher-sudo.github.io ...");
run(GH, ["auth", "switch", "-u", "gpaschercher-sudo"], { stdio: "inherit" });

for (const p of PEERS) {
  const tmp = path.join(TMP_BASE, `deploy-${p.repo}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  await cp(path.join(ROOT, "apps", p.folder), tmp, { recursive: true });
  await cp(path.join(ROOT, "LICENSE"), path.join(tmp, "LICENSE"));

  const idxPath = path.join(tmp, "index.html");
  let html = await readFile(idxPath, "utf8");
  html = html.replace(/http:\/\/127\.0\.0\.1:8080\//g, "https://toskaman.github.io/continuity-agentic-web/");
  await writeFile(idxPath, html, "utf8");

  for (const relCard of [path.join(".well-known", "agent-card.json"), "agent-card.json"]) {
    const cardPath = path.join(tmp, relCard);
    try {
      let card = await readFile(cardPath, "utf8");
      card = card
        .replace(/http:\/\/(127\.0\.0\.1|localhost):808[1-4]/g, `https://gpaschercher-sudo.github.io/${p.repo}`)
        .replace(/urn:air:(127\.0\.0\.1|localhost):/g, "urn:air:gpaschercher-sudo.github.io:");
      await writeFile(cardPath, card, "utf8");
    } catch {
      // Skip if absent
    }
  }

  run("git", ["-C", tmp, "init"], { stdio: "inherit" });
  run("git", ["-C", tmp, "checkout", "-b", "main"], { stdio: "inherit" });
  run("git", ["-C", tmp, "config", "core.autocrlf", "false"], { stdio: "inherit" });
  run("git", ["-C", tmp, "config", "user.name", "MSDOS10"], { stdio: "inherit" });
  run("git", ["-C", tmp, "config", "user.email", "toskaman5962@gmail.com"], { stdio: "inherit" });
  run("git", ["-C", tmp, "add", "-A"], { stdio: "inherit" });
  run("git", ["-C", tmp, "commit", "-m", `feat: publish Open Agentic Web peer (${p.repo})`], {
    stdio: "inherit",
  });

  const view = run(GH, ["repo", "view", `gpaschercher-sudo/${p.repo}`, "--json", "name"]);
  if (view.status !== 0) {
    run(GH, ["repo", "create", `gpaschercher-sudo/${p.repo}`, "--public", "--description", p.desc], {
      stdio: "inherit",
    });
  }

  run("git", ["-C", tmp, "remote", "add", "origin", `https://github.com/gpaschercher-sudo/${p.repo}.git`]);
  run("git", ["-C", tmp, "push", "-u", "origin", "main", "--force"], { stdio: "inherit" });

  // Enable GitHub Pages from main root
  run(GH, [
    "api",
    "-X",
    "POST",
    `repos/gpaschercher-sudo/${p.repo}/pages`,
    "-f",
    "build_type=legacy",
    "-f",
    "source[branch]=main",
    "-f",
    "source[path]=/",
  ]);
  console.log(`-> Peer deployed: https://gpaschercher-sudo.github.io/${p.repo}/`);
}

console.log("\n2. Switching back to primary account toskaman ...");
run(GH, ["auth", "switch", "-u", "toskaman"], { stdio: "inherit" });
