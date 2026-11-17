import assert from "node:assert/strict";
import test from "node:test";
import {
  generateDemoProviderKeyPair,
  ReceiptVerifier,
  signProviderReceipt,
  verifyReceiptBatch,
} from "../../packages/proof-verifier/index.js";
import { ApprovalEngine, computeApprovalDiff } from "../../packages/approval-engine/index.js";
import {
  OP_STATES,
  OperationLedger,
  reconcileOperationOutcome,
} from "../../packages/outcome-reconciliation/index.js";
import { SagaCoordinator } from "../../packages/saga-engine/index.js";
import { MissionGraph } from "../../packages/mission-graph/index.js";
import { compileMissionChange, createSignatureMoveMission } from "../../packages/mission-core/index.js";
import {
  buildSanitizedPeerBoundaryRequest,
  issuePolicyBoundMandate,
  SealedBidArbiter,
  verifyPolicyMandateIntegrity,
} from "../../packages/mandate-arbiter/index.js";
import {
  createAndProveMissionBudget,
  verifyBlindedBudgetAttestation,
} from "../../packages/zk-budget-attestation/index.js";

test("Wave 2 (#061-#072) — @continuity/proof-verifier supports multi-key rotation rings, key revocation, 64-byte Ed25519 check, alg confusion block & batch verification", async () => {
  const k1 = await generateDemoProviderKeyPair("moveco");
  const k2 = { ...(await generateDemoProviderKeyPair("moveco")), keyId: "demo-key-moveco-v2" };
  const verifier = new ReceiptVerifier();
  verifier.registerTrustedProviderKey("moveco", k1.keyId, k1.publicJwk);
  verifier.registerTrustedProviderKey("moveco", k2.keyId, k2.publicJwk);

  const r1 = await signProviderReceipt({ receipt_id: "r1", provider_id: "moveco", total_charged_eur: 415 }, k1);
  const r2 = await signProviderReceipt({ receipt_id: "r2", provider_id: "moveco", total_charged_eur: 415 }, k2);

  // Both historical k1 and rotated k2 verify cleanly via keyRingsByProvider + CryptoKey cache
  const batch = await verifyReceiptBatch(verifier, [
    { providerId: "moveco", envelope: r1 },
    { providerId: "moveco", envelope: r2 },
  ]);
  assert.equal(batch.allValid, true);

  // Revoking k1 immediately invalidates r1 while k2 remains valid
  verifier.revokeProviderKey("moveco", k1.keyId);
  assert.equal((await verifier.verifyReceipt("moveco", r1)).valid, false);
  assert.equal((await verifier.verifyReceipt("moveco", r2)).valid, true);

  // Algorithm confusion & negative monetary value blocked
  const algConfused = { ...r2, proof: { ...r2.proof, algorithm: "HS256" } };
  assert.equal((await verifier.verifyReceipt("moveco", algConfused)).valid, false);

  const negPrice = await signProviderReceipt({ receipt_id: "r3", provider_id: "moveco", total_charged_eur: -10 }, k2);
  assert.equal((await verifier.verifyReceipt("moveco", negPrice)).valid, false);
});

test("Wave 2 (#073-#082) — @continuity/approval-engine binds hold_id & mandate_sha256, deep-freezes records, supports revokeApproval, and pinpoints diffs", async () => {
  const engine = new ApprovalEngine();
  const baseSpec = {
    mission_id: "m1",
    operation_id: "op_1",
    commitment_id: "c1",
    provider_origin: "https://moveco.example",
    provider_id: "moveco",
    capability: "reschedule",
    arguments: { hold_id: "hold_1" },
    mandate_sha256: "a".repeat(64),
    proposed_date: "2026-11-20",
    base_price_eur: 390,
    change_fee_eur: 25,
    cancellation_penalty_eur: 0,
    maximum_budget_eur: 700,
    expires_at: "2027-01-01T00:00:00Z",
  };
  const appr = await engine.createBoundApproval(baseSpec, { nowIso: "2026-11-16T10:00:00Z" });
  assert.equal(Object.isFrozen(appr), true);
  assert.equal(Object.isFrozen(appr.canonical_payload), true);

  // Mandate swap invalidates approval
  const swappedMandate = await engine.verifyApprovalBinding(
    appr.approval_id,
    { ...baseSpec, mandate_sha256: "b".repeat(64) },
    { nowIso: "2026-11-16T10:01:00Z" },
  );
  assert.equal(swappedMandate.valid, false);
  assert.match(swappedMandate.reason, /mandate_sha256/);

  const diff = computeApprovalDiff(appr.canonical_payload, {
    ...appr.canonical_payload,
    change_fee_eur: 30,
  });
  assert.deepEqual(diff.driftedFields, ["change_fee_eur"]);

  assert.equal(engine.revokeApproval(appr.approval_id), true);
  const afterRevoke = await engine.verifyApprovalBinding(appr.approval_id, baseSpec, {
    nowIso: "2026-11-16T10:01:00Z",
  });
  assert.equal(afterRevoke.valid, false);
});

test("Wave 2 (#083-#106) — OutcomeReconciliation blocks missing envelope, wrong booking_ref & total_price_eur overcharge; SagaCoordinator rolls back partial holds on preparePlan failure", async () => {
  const kp = await generateDemoProviderKeyPair("moveco");
  const verifier = new ReceiptVerifier({ moveco: { keyId: kp.keyId, publicJwk: kp.publicJwk } });
  const expectedOp = {
    provider_id: "moveco",
    original_booking_ref: "MC-8841",
    proposed_date: "2026-11-20",
    base_price_eur: 390,
    change_fee_eur: 25,
    cancellation_penalty_eur: 0,
    idempotency_key: "idem_1",
  };

  // Missing receipt_envelope when verifier is active -> NEEDS_USER
  const missingEnv = await reconcileOperationOutcome({
    expectedOp,
    providerStatus: { execution_state: "COMMITTED", scheduled_date: "2026-11-20", total_charged_eur: 415 },
    receiptVerifier: verifier,
  });
  assert.equal(missingEnv.outcomeState, OP_STATES.NEEDS_USER);

  // Wrong booking_ref in signed receipt -> NEEDS_USER
  const wrongRefEnv = await signProviderReceipt(
    {
      provider_id: "moveco",
      booking_ref: "MC-OTHER-999",
      scheduled_date: "2026-11-20",
      total_charged_eur: 415,
      idempotency_key: "idem_1",
    },
    kp,
  );
  const wrongRef = await reconcileOperationOutcome({
    expectedOp,
    providerStatus: { execution_state: "COMMITTED", receipt_envelope: wrongRefEnv },
    receiptVerifier: verifier,
  });
  assert.equal(wrongRef.outcomeState, OP_STATES.NEEDS_USER);

  // Overcharge hidden in total_price_eur -> NEEDS_USER
  const overPriceEnv = await signProviderReceipt(
    {
      provider_id: "moveco",
      booking_ref: "MC-8841",
      scheduled_date: "2026-11-20",
      total_price_eur: 999,
      idempotency_key: "idem_1",
    },
    kp,
  );
  const overPrice = await reconcileOperationOutcome({
    expectedOp,
    providerStatus: { execution_state: "COMMITTED", receipt_envelope: overPriceEnv },
    receiptVerifier: verifier,
  });
  assert.equal(overPrice.outcomeState, OP_STATES.NEEDS_USER);

  // Partial hold rollback on preparePlan downstream failure
  const mission = createSignatureMoveMission();
  const graph = MissionGraph.fromMission(mission);
  const saga = new SagaCoordinator({ graph, receiptVerifier: verifier });
  const releasedHolds = [];
  const prepFail = await saga.preparePlan({
    missionId: mission.mission_id,
    maximumBudgetEur: 700,
    plan: {
      operations: [
        {
          commitment_id: "cmt_moveco_van",
          commitment_title: "Van",
          original_booking_ref: "MC-8841",
          original_date: "2026-11-17",
          offer: {
            offer_id: "off_1",
            provider_id: "moveco",
            provider_name: "MoveCo",
            provider_origin: "https://mc.example",
            raw_capability: "reschedule",
            semantic_kind: "RESCHEDULE_IN_PLACE",
            proposed_date: "2026-11-20",
            window: "08:00–12:00",
            base_price_eur: 390,
            change_fee_eur: 25,
            cancellation_penalty_eur: 0,
            supports_hold: true,
            supports_idempotency: true,
            supports_status_reconciliation: true,
            reversible: false,
            is_replacement_provider: false,
          },
        },
        {
          commitment_id: "cmt_homeconnect_fiber",
          commitment_title: "Fiber",
          original_booking_ref: "HC-5510",
          original_date: "2026-11-17",
          offer: {
            offer_id: "off_2",
            provider_id: "homeconnect",
            provider_name: "HomeConnect",
            provider_origin: "https://hc.example",
            raw_capability: "reschedule",
            semantic_kind: "RESCHEDULE_IN_PLACE",
            proposed_date: "2026-11-20",
            window: "13:00–17:00",
            base_price_eur: 49,
            change_fee_eur: 0,
            cancellation_penalty_eur: 0,
            supports_hold: true,
            supports_idempotency: true,
            supports_status_reconciliation: true,
            reversible: false,
            is_replacement_provider: false,
          },
        },
      ],
    },
    providerClients: {
      moveco: {
        prepareHold: async () => ({ ok: true, hold_id: "hold_mc_temp_1" }),
        releaseHold: async ({ holdId }) => {
          releasedHolds.push(holdId);
          return { ok: true, released: true, hold_id: holdId, fee_charged_eur: 0 };
        },
      },
      homeconnect: {
        prepareHold: async () => ({ ok: false, reason: "Slot just taken" }),
      },
    },
  });
  assert.equal(prepFail.ok, false);
  assert.deepEqual(prepFail.rolledBackHoldIds, ["hold_mc_temp_1"]);
  assert.deepEqual(releasedHolds, ["hold_mc_temp_1"]);
  assert.equal(saga.ledger.exportCompactMerkleTip().genesisAnchored, true);
});

test("Wave 2 (#107-#120) — MandateArbiter & ZK Budget Attestation verify mandate integrity, bid openings, wipe vault secrets, and block cross-mission proof replay", async () => {
  const mission = createSignatureMoveMission();
  const { proposal } = compileMissionChange("Move relocation from Tuesday to Friday under €700.", mission);
  const mandate = await issuePolicyBoundMandate(mission, proposal);
  assert.equal((await verifyPolicyMandateIntegrity(mandate)).valid, true);

  assert.throws(() => buildSanitizedPeerBoundaryRequest({ booking_ref: "BAD REF!<script>", target_date: "2026-11-20" }));
  assert.throws(() => buildSanitizedPeerBoundaryRequest({ booking_ref: "MC-8841", target_date: "2026-02-30" }));

  const arb = new SealedBidArbiter(mandate, 44_000);
  const b1 = await arb.commitSealedBid({ providerId: "b_peer", askCents: 43_000, floorCents: 40_000, nonce: "n1" });
  const b2 = await arb.commitSealedBid({ providerId: "a_peer", askCents: 43_000, floorCents: 40_000, nonce: "n2" });
  assert.equal(
    await SealedBidArbiter.verifySealedBidOpening(
      mandate.mandate_id,
      { providerId: "b_peer", askCents: 43_000, floorCents: 40_000, nonce: "n1" },
      b1.commitment_hash,
    ),
    true,
  );
  const nash = arb.resolveNashBargaining();
  // Deterministic lexicographic tie-breaking: a_peer before b_peer
  assert.equal(nash.outcomes[0].provider_id, "a_peer");
  assert.equal(b2.ok, true);
  arb.wipeVaultSecrets();
  assert.equal(arb._sealedVault.size, 0);

  const zk = await createAndProveMissionBudget({
    ceilingEur: 700,
    spentEur: 659,
    missionId: "mission_alpha",
  });
  assert.equal(zk.ok, true);
  assert.equal((await verifyBlindedBudgetAttestation(zk.attestation, { expectedMissionId: "mission_alpha" })).valid, true);
  assert.equal((await verifyBlindedBudgetAttestation(zk.attestation, { expectedMissionId: "mission_beta" })).valid, false);
});
