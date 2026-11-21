import assert from "node:assert/strict";
import test from "node:test";
import { McpClient } from "../../skills/agentify-website/runtime/mcp.js";
import { ReceiptVerifier } from "../../packages/proof-verifier/index.js";
import { startAllEcosystemServers } from "../../scripts/serve_ecosystem.mjs";

let eco;
let basePorts = {
  continuity: 19080,
  moveco: 19081,
  permitflow: 19082,
  homeconnect: 19083,
  powerflow: 19084,
};

test.before(async () => {
  eco = await startAllEcosystemServers(basePorts);
});

test.after(async () => {
  if (eco) await eco.stopAll();
});

test("C1 Every peer exposes MCP JSON-RPC 2.0 (2025-06-18) compatible with runtime McpClient", async () => {
  for (const [pid, peer] of Object.entries(eco.peers)) {
    const client = new McpClient({ url: `${peer.origin()}/mcp` });
    const tools = await client.listTools();
    assert.ok(tools.length >= 3, `${pid} should publish >= 3 MCP tools`);
  }
});

test("C2 Provider MCP/API rejects missing fields, extra fields, and invalid date types", async () => {
  const origin = eco.peers.moveco.origin();

  // Missing required field
  const r1 = await fetch(`${origin}/api/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "get_moving_quote", arguments: { booking_ref: "MC-8841" } }),
  });
  assert.equal(r1.status, 400);

  // Unexpected extra field (additionalProperties: false)
  const r2 = await fetch(`${origin}/api/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: "get_moving_quote",
      arguments: { booking_ref: "MC-8841", target_date: "2027-11-19", sneak_admin: true },
    }),
  });
  assert.equal(r2.status, 400);

  // Invalid calendar date
  const r3 = await fetch(`${origin}/api/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: "get_moving_quote",
      arguments: { booking_ref: "MC-8841", target_date: "2026-02-30" },
    }),
  });
  assert.equal(r3.status, 400);
});

test("C3 Provider commit is idempotent and returns verifiable Ed25519 receipt", async () => {
  const origin = eco.peers.moveco.origin();
  await fetch(`${origin}/api/reset`, { method: "POST", body: "{}" });

  const pkResp = await fetch(`${origin}/api/public-key`);
  const pk = await pkResp.json();
  const verifier = new ReceiptVerifier();
  verifier.registerTrustedProviderKey("moveco", pk.keyId, pk.publicJwk);

  const client = new McpClient({ url: `${origin}/mcp` });
  const raw1 = await client.callTool("reschedule_van_booking", {
    booking_ref: "MC-8841",
    new_date: "2027-11-19",
    window: "08:00–13:00",
    offer_id: "off_moveco_fri_am",
    idempotency_key: "idem_contract_test_001",
  });
  const parsed1 = JSON.parse(raw1);
  assert.equal(parsed1.execution_state, "COMMITTED");

  // Duplicate call with same idempotency_key returns the exact same receipt without re-charging!
  const raw2 = await client.callTool("reschedule_van_booking", {
    booking_ref: "MC-8841",
    new_date: "2027-11-19",
    window: "08:00–13:00",
    offer_id: "off_moveco_fri_am",
    idempotency_key: "idem_contract_test_001",
  });
  const parsed2 = JSON.parse(raw2);
  assert.equal(
    parsed1.receipt_envelope.receipt_body.receipt_id,
    parsed2.receipt_envelope.receipt_body.receipt_id,
  );

  const proof = await verifier.verifyReceipt("moveco", parsed1.receipt_envelope);
  assert.equal(proof.valid, true);
  assert.equal(proof.level, "VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE");
});

test("C4 PermitFlow explicitly discloses demonstration dossier scope and never claims govt mutation", async () => {
  const origin = eco.peers.permitflow.origin();
  const client = new McpClient({ url: `${origin}/mcp` });
  const raw = await client.callTool("check_bay_eligibility", {
    booking_ref: "PF-2049",
    target_date: "2027-11-19",
  });
  const data = JSON.parse(raw);
  assert.equal(data.ok, true);
  assert.match(data.municipal_disclaimer, /Does not access municipal databases/i);
  assert.equal(data.offers[0].creates_final_booking, false);
});
