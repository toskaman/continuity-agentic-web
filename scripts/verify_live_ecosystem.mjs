/**
 * Boots all 5 independent origins on ephemeral ports (`0`), runs Cognizant's official
 * `check_partner.mjs` across every primary network, bidirectional coordinator link, and
 * public `facts/*` single-turn network, plus `@continuity/peer-firewall` safety verification,
 * then cleanly shuts down.
 */

import { inspectPeerNetworkSafety } from "../packages/peer-firewall/index.js";
import { PartnerCheck } from "../skills/agentify-website/scripts/check_partner.mjs";
import { startAllEcosystemServers } from "./serve_ecosystem.mjs";

const eco = await startAllEcosystemServers({
  continuity: 0,
  moveco: 0,
  permitflow: 0,
  homeconnect: 0,
  powerflow: 0,
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
  { label: "CONTINUITY public facts network", args: [`${callerOrigin}/facts/continuity_coordinator_facts`] },
  { label: "MoveCo public facts network", args: [`${eco.peers.moveco.origin()}/facts/moveco_dispatch_facts`] },
  { label: "PermitFlow public facts network", args: [`${eco.peers.permitflow.origin()}/facts/permitflow_advisor_facts`] },
  { label: "HomeConnect public facts network", args: [`${eco.peers.homeconnect.origin()}/facts/homeconnect_scheduler_facts`] },
  { label: "PowerFlow public facts network", args: [`${eco.peers.powerflow.origin()}/facts/powerflow_grid_facts`] },
];

const firewallTargets = [
  callerOrigin,
  eco.peers.moveco.origin(),
  eco.peers.permitflow.origin(),
  eco.peers.homeconnect.origin(),
  eco.peers.powerflow.origin(),
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

  for (const origin of firewallTargets) {
    const manifestJson = await (await fetch(`${origin}/agent-manifest.json`)).json();
    const hoconRel = manifestJson.networks[0].hocon.replace(/^\.\//, "");
    const networkJson = await (await fetch(`${origin}/${hoconRel}`)).json();
    const fw = await inspectPeerNetworkSafety({ siteBaseUrl: `${origin}/`, manifestJson, networkJson });
    if (!fw.safe || fw.riskScore !== 0) {
      console.error(`FAILED firewall check on ${origin}: verdict=${fw.verdict} riskScore=${fw.riskScore}`);
      exitCode = 1;
    }
  }
} finally {
  await eco.stopAll();
}

process.exit(exitCode);
