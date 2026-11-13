import { createMoveCoDefinition } from "../shared/peer_definitions.mjs";
import { IndependentProviderHost } from "../shared/provider_server.mjs";

const port = Number(process.env.PORT || 8081);
const host = new IndependentProviderHost(createMoveCoDefinition({ port }));
await host.start();
console.log(`MoveCo Peer listening at ${host.origin()}`);
