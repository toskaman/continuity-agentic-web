const sites = [
  { folder: "apps/continuity-web", network: "continuity_coordinator" },
  { folder: "apps/demo-moveco", network: "moveco_dispatch" },
  { folder: "apps/demo-permitflow", network: "permitflow_advisor" },
  { folder: "apps/demo-homeconnect", network: "homeconnect_scheduler" },
  { folder: "apps/demo-powerflow", network: "powerflow_grid" },
];

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

for (const s of sites) {
  const headersContent = `/agent-manifest.json
  Access-Control-Allow-Origin: *
/${s.network}.network.json
  Access-Control-Allow-Origin: *
/links.json
  Access-Control-Allow-Origin: *
/agent-mcp.json
  Access-Control-Allow-Origin: *
/.well-known/nsdeploy.json
  Access-Control-Allow-Origin: *
/.well-known/nsdeploy-agent.json
  Access-Control-Allow-Origin: *
/runtime/sandbox-worker.js
  Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'
`;
  await writeFile(path.join(ROOT, s.folder, "_headers"), headersContent, "utf8");
}
console.log("Wrote _headers for all 5 Open Agentic Websites.");
