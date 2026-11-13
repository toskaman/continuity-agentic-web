import { createPowerFlowDefinition } from "../shared/peer_definitions.mjs";
import { IndependentProviderHost } from "../shared/provider_server.mjs";

const port = Number(process.env.PORT || 8084);
const host = new IndependentProviderHost(createPowerFlowDefinition({ port }));
await host.start();
console.log(`PowerFlow Peer listening at ${host.origin()}`);
