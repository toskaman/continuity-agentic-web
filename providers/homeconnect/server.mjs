import { createHomeConnectDefinition } from "../shared/peer_definitions.mjs";
import { IndependentProviderHost } from "../shared/provider_server.mjs";

const port = Number(process.env.PORT || 8083);
const host = new IndependentProviderHost(createHomeConnectDefinition({ port }));
await host.start();
console.log(`HomeConnect Peer listening at ${host.origin()}`);
