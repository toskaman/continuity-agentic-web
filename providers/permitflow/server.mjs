import { createPermitFlowDefinition } from "../shared/peer_definitions.mjs";
import { IndependentProviderHost } from "../shared/provider_server.mjs";

const port = Number(process.env.PORT || 8082);
const host = new IndependentProviderHost(createPermitFlowDefinition({ port }));
await host.start();
console.log(`PermitFlow Peer listening at ${host.origin()}`);
