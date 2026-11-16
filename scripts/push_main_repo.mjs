import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GH = "C:\\Users\\TheBox\\AppData\\Local\\Microsoft\\WinGet\\Packages\\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\\bin\\gh.exe";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
}

run(GH, ["auth", "switch", "-u", "toskaman"], { stdio: "inherit" });
run("git", ["config", "user.name", "MSDOS10"]);
run("git", ["config", "user.email", "toskaman5962@gmail.com"]);
run("git", ["add", "-A"], { stdio: "inherit" });
run(
  "git",
  [
    "commit",
    "-m",
    "feat: complete 300-upgrade TITAN OMEGA cycle (Waves 1-5: FIPS SHA-256 fix, SSRF/Tag/Beacon guards, Ed25519 key rings, VALARM .ics, lazy code-split, 36 Chaos, N=150 benchmarks & 106 tests)",
  ],
  { stdio: "inherit" },
);

const view = run(GH, ["repo", "view", "toskaman/continuity-agentic-web", "--json", "name"]);
if (view.status !== 0) {
  run(
    GH,
    [
      "repo",
      "create",
      "toskaman/continuity-agentic-web",
      "--public",
      "--description",
      "CONTINUITY — Safe Multi-Provider Change Coordinator for the Open Agentic Web (Cognizant Open Agentic Web Challenge)",
    ],
    { stdio: "inherit" },
  );
}

run("git", ["remote", "remove", "origin"]);
run("git", ["remote", "add", "origin", "https://github.com/toskaman/continuity-agentic-web.git"]);

// Enable GitHub Pages with workflow build BEFORE pushing so the push triggers deploy-pages cleanly
run(GH, ["api", "-X", "POST", "repos/toskaman/continuity-agentic-web/pages", "-f", "build_type=workflow"]);
run(GH, ["api", "-X", "PUT", "repos/toskaman/continuity-agentic-web/pages", "-f", "build_type=workflow"]);

const pushRes = run("git", ["push", "-u", "origin", "main"], { stdio: "inherit" });
if (pushRes.status !== 0) {
  console.error("git push failed with exit code", pushRes.status);
  process.exit(pushRes.status || 1);
}

// Also trigger workflow_dispatch explicitly just in case Pages was enabled milliseconds after push
run(GH, ["workflow", "run", "deploy-pages.yml", "--repo", "toskaman/continuity-agentic-web"]);
console.log("Pushed to https://github.com/toskaman/continuity-agentic-web and triggered GitHub Pages workflow.");
