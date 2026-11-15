/**
 * Boots all 5 independent origins on ephemeral or default ports, runs Cognizant's official
 * `check_partner.mjs` across every peer and the coordinator itself, then cleanly shuts down.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { PartnerCheck } from "../skills/agentify-website/scripts/check_partner.mjs";
import { startAllEcosystemServers } from "./serve_ecosystem.mjs";

const eco = await startAllEcosystemServers({
  continuity: 18080,
  moveco: 18081,
  permitflow: 18082,
  homeconnect: 18083,
  powerflow: 18084,
});

const callerOrigin = eco.coordinator.origin();
const checks = [
  { label: "MoveCo as partner of CONTINUITY", args: [`${eco.peers.moveco.origin()}/moveco_dispatch`, "--origin", callerOrigin] },
  { label: "PermitFlow as partner of CONTINUITY", args: [`${eco.peers.permitflow.origin()}/permitflow_advisor`, "--origin", callerOrigin] },
  { label: "HomeConnect as partner of CONTINUITY", args: [`${eco.peers.homeconnect.origin()}/homeconnect_scheduler`, "--origin", callerOrigin] },
  { label: "PowerFlow as partner of CONTINUITY", args: [`${eco.peers.powerflow.origin()}/powerflow_grid`, "--origin", callerOrigin] },
  { label: "CONTINUITY as bidirectional partner of MoveCo", args: [`${callerOrigin}/continuity_coordinator`, "--origin", eco.peers.moveco.origin()] },
  { label: "CONTINUITY as bidirectional partner of PermitFlow", args: [`${callerOrigin}/continuity_coordinator`, "--origin", eco.peers.permitflow.origin()] },
  { label: "CONTINUITY as bidirectional partner of HomeConnect", args: [`${callerOrigin}/continuity_coordinator`, "--origin", eco.peers.homeconnect.origin()] },
  { label: "CONTINUITY as bidirectional partner of PowerFlow", args: [`${callerOrigin}/continuity_coordinator`, "--origin", eco.peers.powerflow.origin()] },
  { label: "CONTINUITY callable by any external agentic site", args: [`${callerOrigin}/continuity_coordinator`] },
];

let exitCode = 0;
try {
  for (const item of checks) {
    console.log(`\n--- Checking: ${item.label} ---`);
    const lines = [];
    const code = await PartnerCheck.main(item.args, globalThis.fetch, (line) => lines.push(line));
    console.log(lines.join("\n"));
    if (code !== 0) {
      console.error(`FAILED partner check for ${item.label} (exit=${code})`);
      exitCode = 1;
    }
  }
} finally {
  await eco.stopAll();
}

process.exit(exitCode);
