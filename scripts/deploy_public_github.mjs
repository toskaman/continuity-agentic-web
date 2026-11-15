/**
 * Builds and (when not `--dry-run`) deploys:
 *  - All 4 independent peer websites to `gpaschercher-sudo.github.io/<peer>` (distinct origin!)
 *  - Preserves `.well-known/*` (`agent-card.json`, `ai-catalog.json`, `nsdeploy.json`), `facts/*`,
 *    and bidirectional `continuity_coordinator` partner links via `.nojekyll` + `configure_origins.mjs`,
 *    then restores the working tree cleanly to `--mode local`.
 *
 * Usage:
 *   node scripts/deploy_public_github.mjs --dry-run
 *   node scripts/deploy_public_github.mjs
 */

import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const isDryRun = process.argv.includes("--dry-run");
const GH =
  process.env.GH_BIN
  || "C:\\Users\\TheBox\\AppData\\Local\\Microsoft\\WinGet\\Packages\\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\\bin\\gh.exe";
const TMP_BASE = path.join(os.tmpdir(), "continuity-public-deploy");

const PUBLIC_URLS = {
  continuity: "https://toskaman.github.io/continuity-agentic-web",
  moveco: "https://gpaschercher-sudo.github.io/moveco-agentic-peer",
  permitflow: "https://gpaschercher-sudo.github.io/permitflow-agentic-peer",
  homeconnect: "https://gpaschercher-sudo.github.io/homeconnect-agentic-peer",
  powerflow: "https://gpaschercher-sudo.github.io/powerflow-agentic-peer",
};

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return res;
}

const PEERS = [
  {
    key: "moveco",
    folder: "demo-moveco",
    repo: "moveco-agentic-peer",
    desc: "MoveCo Express — Independent Open Agentic Moving Website (MVP 0.2 Peer Demo)",
  },
  {
    key: "permitflow",
    folder: "demo-permitflow",
    repo: "permitflow-agentic-peer",
    desc: "PermitFlow Civic Prep — Independent Open Agentic Permit Dossier Website (MVP 0.2 Peer Demo)",
  },
  {
    key: "homeconnect",
    folder: "demo-homeconnect",
    repo: "homeconnect-agentic-peer",
    desc: "HomeConnect Fiber — Independent Open Agentic Broadband Scheduling Website (MVP 0.2 Peer Demo)",
  },
  {
    key: "powerflow",
    folder: "demo-powerflow",
    repo: "powerflow-agentic-peer",
    desc: "PowerFlow Energy — Independent Open Agentic Smart-Meter Website (MVP 0.2 Peer Demo)",
  },
];

try {
  // 1. Rewrite all 5 sites (`agent-manifest.json`, `.network.json`, `agent-card.json`, `ai-catalog.json`, `facts/*`, `index.html`) to public HTTPS URLs
  const cfg = run(
    process.execPath,
    [
      path.join(ROOT, "scripts", "configure_origins.mjs"),
      "--mode",
      "github-pages",
      "--continuity",
      PUBLIC_URLS.continuity,
      "--moveco",
      PUBLIC_URLS.moveco,
      "--permitflow",
      PUBLIC_URLS.permitflow,
      "--homeconnect",
      PUBLIC_URLS.homeconnect,
      "--powerflow",
      PUBLIC_URLS.powerflow,
    ],
    { stdio: "inherit" },
  );
  if (cfg.status !== 0) {
    throw new Error("configure_origins.mjs --mode github-pages failed");
  }

  // Verify zero errors & zero warnings in production HTTPS configuration
  const chk = run(process.execPath, [path.join(ROOT, "scripts", "build_all_networks.mjs"), "--check"], {
    stdio: "inherit",
  });
  if (chk.status !== 0) {
    throw new Error("build_all_networks.mjs --check failed in github-pages mode");
  }

  await mkdir(TMP_BASE, { recursive: true });

  // Stage primary bundle in dry-run/staging directory for inspection
  const primaryStage = path.join(TMP_BASE, "deploy-continuity-agentic-web");
  await rm(primaryStage, { recursive: true, force: true });
  await mkdir(primaryStage, { recursive: true });
  await cp(path.join(ROOT, "apps", "continuity-web"), primaryStage, { recursive: true });
  await rm(path.join(primaryStage, "tests"), { recursive: true, force: true });
  await cp(path.join(ROOT, "LICENSE"), path.join(primaryStage, "LICENSE"));
  await writeFile(path.join(primaryStage, ".nojekyll"), "", "utf8");

  if (!isDryRun) {
    console.log("1. Deploying 4 Independent Peer Websites under gpaschercher-sudo.github.io ...");
    run(GH, ["auth", "switch", "-u", "gpaschercher-sudo"], { stdio: "inherit" });
  }

  for (const p of PEERS) {
    const tmp = path.join(TMP_BASE, `deploy-${p.repo}`);
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    await cp(path.join(ROOT, "apps", p.folder), tmp, { recursive: true });
    await rm(path.join(tmp, "tests"), { recursive: true, force: true });
    await cp(path.join(ROOT, "LICENSE"), path.join(tmp, "LICENSE"));
    // Essential on GitHub Pages so `/.well-known/agent-card.json` & `/.well-known/ai-catalog.json` are published!
    await writeFile(path.join(tmp, ".nojekyll"), "", "utf8");

    if (isDryRun) {
      console.log(`[dry-run] Staged clean HTTPS peer bundle -> ${tmp}`);
      continue;
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

  if (!isDryRun) {
    console.log("\n2. Switching back to primary account toskaman ...");
    run(GH, ["auth", "switch", "-u", "toskaman"], { stdio: "inherit" });
  } else {
    console.log(`[dry-run] All 5 HTTPS production bundles staged and verified in ${TMP_BASE}`);
  }
} finally {
  // Always restore repository working tree to `--mode local` so local dev & tests remain clean
  run(process.execPath, [path.join(ROOT, "scripts", "configure_origins.mjs"), "--mode", "local"], {
    stdio: "inherit",
  });
}
