/**
 * Starts the complete 5-Origin Open Agentic Web Ecosystem:
 *  - Origin 1: CONTINUITY Coordinator -> http://127.0.0.1:8080
 *  - Origin 2: MoveCo Express Peer     -> http://127.0.0.1:8081
 *  - Origin 3: PermitFlow Civic Peer   -> http://localhost:8082
 *  - Origin 4: HomeConnect Fiber Peer  -> http://127.0.0.1:8083
 *  - Origin 5: PowerFlow Energy Peer   -> http://localhost:8084
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { IndependentProviderHost } from "../providers/shared/provider_server.mjs";
import { instantiateAllPeerHosts } from "../providers/shared/peer_definitions.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export async function startAllEcosystemServers(ports = {}) {
  const coordinator = new IndependentProviderHost({
    providerId: "continuity",
    providerName: "CONTINUITY Coordinator",
    siteFolder: path.join(ROOT, "apps", "continuity-web"),
    host: "127.0.0.1",
    port: ports.continuity ?? 8080,
    openAs: "127.0.0.1",
    createInitialState: () => ({ ready: true }),
    mcpTools: [],
    handlers: {},
  });

  const peers = instantiateAllPeerHosts(ports);

  await coordinator.start();
  await Promise.all(Object.values(peers).map((p) => p.start()));

  return {
    coordinator,
    peers,
    async stopAll() {
      await coordinator.stop();
      await Promise.all(Object.values(peers).map((p) => p.stop()));
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const eco = await startAllEcosystemServers();
  console.log("CONTINUITY Ecosystem Live Across 5 Distinct Origins:");
  console.log(`  [Coordinator] ${eco.coordinator.origin()}/`);
  for (const [id, peer] of Object.entries(eco.peers)) {
    console.log(`  [Peer: ${id}]  ${peer.origin()}/  (MCP: ${peer.origin()}/mcp)`);
  }
}
