/**
 * Builds or checks (`--check`) all 5 Open Agentic Website bundles using Cognizant's
 * official `skills/agentify-website/scripts/build_network.mjs` validator, and syncs
 * reusable `@continuity/*` vendor modules into the static site bundles.
 */

import { execFile } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUILDER = path.join(ROOT, "skills", "agentify-website", "scripts", "build_network.mjs");

const SITES = [
  { dir: "apps/continuity-web", hocon: "continuity_coordinator.hocon", isPrimary: true },
  { dir: "apps/demo-moveco", hocon: "moveco_dispatch.hocon", isPrimary: false },
  { dir: "apps/demo-permitflow", hocon: "permitflow_advisor.hocon", isPrimary: false },
  { dir: "apps/demo-homeconnect", hocon: "homeconnect_scheduler.hocon", isPrimary: false },
  { dir: "apps/demo-powerflow", hocon: "powerflow_grid.hocon", isPrimary: false },
];

const PEER_VENDOR_PACKAGES = [
  "shared-schemas",
  "proof-verifier",
  "cross-origin-bridge",
  "webmcp-adapter",
  "peer-firewall",
  "safety-hooks",
  "local-browser-router",
];

const isCheck = process.argv.includes("--check");

if (!isCheck) {
  const skillRuntime = path.join(ROOT, "skills", "agentify-website", "runtime");
  for (const site of SITES) {
    await cp(skillRuntime, path.join(ROOT, site.dir, "runtime"), {
      recursive: true,
      force: true,
    });
  }

  await cp(path.join(ROOT, "packages"), path.join(ROOT, "apps", "continuity-web", "vendor"), {
    recursive: true,
    force: true,
  });

  for (const site of SITES.filter((s) => !s.isPrimary)) {
    const vendorBase = path.join(ROOT, site.dir, "vendor");
    await mkdir(vendorBase, { recursive: true });
    for (const pkgName of PEER_VENDOR_PACKAGES) {
      await cp(path.join(ROOT, "packages", pkgName), path.join(vendorBase, pkgName), {
        recursive: true,
        force: true,
      });
    }
  }
}

let hasFailure = false;

for (const site of SITES) {
  const hoconPath = path.join(ROOT, site.dir, site.hocon);
  const manifestPath = path.join(ROOT, site.dir, "agent-manifest.json");
  const args = [BUILDER, hoconPath, "--manifest", manifestPath];
  if (isCheck) args.push("--check");

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args);
    process.stdout.write(`\n=== ${site.dir} ===\n${stdout}`);
    if (stderr) process.stderr.write(stderr);
    if (/WARNING:/i.test(stdout) || /WARNING:/i.test(stderr)) {
      console.error(`ERROR: Warnings found in ${site.dir}! Zero-warning gate enforced.`);
      hasFailure = true;
    }
  } catch (err) {
    console.error(`\nFAILED building ${site.dir}:`);
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    hasFailure = true;
  }
}

process.exit(hasFailure ? 1 : 0);
