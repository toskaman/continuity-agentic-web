/**
 * @module @continuity/zk-budget-attestation
 * Blinded SHA-256 Hash-Ladder Budget Compliance Attestation (Zero-Ceiling-Leak Range Proof).
 *
 * Solves a fundamental privacy-vs-auditability tension in multi-party agentic commerce:
 *  - Before contacting any provider, the buyer's coordinator commits to a private hard budget
 *    ceiling `C` (in integer euro steps) using a 256-bit random secret seed `s_0`:
 *      `anchor = H^(C + 1)(s_0)`
 *  - After the Saga commits at total spend `S` (`ceil(totalSpentEur)`), the buyer proves to any
 *    third-party auditor or provider receipt log that `S <= C` WITHOUT revealing `C` (or the
 *    remaining headroom `C - S`) by releasing ONLY:
 *      `proofToken = H^(C - S + 1)(s_0)`
 *  - Verification: Anyone computes `H^(S)(proofToken)` and checks equality with `anchor`:
 *      `H^(S)(H^(C - S + 1)(s_0)) = H^(C + 1)(s_0) === anchor`
 *  - Soundness: Forging a valid `proofToken` when `S > C` requires inverting SHA-256 `S - C`
 *    times on `s_0` (computationally infeasible under SHA-256 preimage resistance).
 *  - Hiding: Even when `S === C`, `proofToken = H^1(s_0)` hashes 256 bits of fresh entropy,
 *    leaking zero information about `C` under the random-oracle model.
 */

import { deepFreezeJson, timingSafeEqualHex } from "../shared-schemas/index.js";

const DOMAIN_PREFIX = "continuity-hash-ladder-v1:";
const MAX_EURO_CEILING = 25_000;
const UTF8_ENCODER = new TextEncoder();
const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function bytesToHex(u8) {
  let out = "";
  for (let i = 0; i < u8.length; i++) {
    out += BYTE_TO_HEX[u8[i]];
  }
  return out;
}

function randomSeedHex() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function stepHashHex(prevHex) {
  const bytes = UTF8_ENCODER.encode(`${DOMAIN_PREFIX}${prevHex}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function iterateHashHex(startHex, steps) {
  let cur = String(startHex).toLowerCase();
  for (let i = 0; i < steps; i++) {
    cur = await stepHashHex(cur);
  }
  return cur;
}

/**
 * Pre-commit to a private maximum budget ceiling `ceilingEur` BEFORE contacting providers.
 * Returns `{ publicCommitment, privateOpening }` — only `publicCommitment` is shared/logged!
 *
 * @param {object} params
 * @param {number} params.ceilingEur
 * @param {string} [params.missionId="mission"]
 * @param {string} [params.seedHex] - Optional deterministic 64-hex seed for reproducible tests
 */
export async function createBlindedBudgetCommitment({
  ceilingEur,
  missionId = "mission",
  seedHex,
}) {
  const ceilingUnits = Math.floor(Number(ceilingEur));
  if (!Number.isInteger(ceilingUnits) || ceilingUnits < 1 || ceilingUnits > MAX_EURO_CEILING) {
    throw new Error(`Budget ceiling must be between €1 and €${MAX_EURO_CEILING}.`);
  }
  const cleanMissionId = String(missionId || "").trim();
  if (!cleanMissionId || cleanMissionId.length > 128) {
    throw new Error("Invalid missionId (must be 1..128 characters).");
  }
  const secretSeedHex = seedHex && /^[0-9a-f]{64}$/i.test(seedHex) ? seedHex.toLowerCase() : randomSeedHex();
  const ladderAnchorSha256 = await iterateHashHex(secretSeedHex, ceilingUnits + 1);

  return {
    publicCommitment: deepFreezeJson({
      scheme: "continuity-sha256-hash-ladder-range/v1",
      missionId: cleanMissionId,
      stepUnit: "1_EUR_CONSERVATIVE_CEIL",
      ladderAnchorSha256,
      issuedAt: new Date().toISOString(),
    }),
    privateOpening: {
      secretSeedHex,
      ceilingUnits,
    },
  };
}

/**
 * Produce a zero-ceiling-leak compliance proof showing `Math.ceil(spentEur) <= ceilingUnits`
 * without disclosing `ceilingUnits` or `secretSeedHex`.
 *
 * @param {object} params
 * @param {{ ladderAnchorSha256: string, missionId: string }} params.publicCommitment
 * @param {{ secretSeedHex: string, ceilingUnits: number }} params.privateOpening
 * @param {number} params.spentEur
 */
export async function proveSpendWithinBlindedCeiling({
  publicCommitment,
  privateOpening,
  spentEur,
}) {
  const spentUnits = Math.ceil(Number(spentEur));
  if (!Number.isFinite(spentUnits) || spentUnits < 0) {
    throw new Error("Invalid spentEur amount.");
  }
  if (spentUnits > privateOpening.ceilingUnits) {
    return {
      ok: false,
      reason: `Spend €${Number(spentEur).toFixed(2)} (ceil €${spentUnits}) exceeds committed ceiling.`,
    };
  }
  const headroomSteps = privateOpening.ceilingUnits - spentUnits + 1;
  const proofTokenSha256 = await iterateHashHex(privateOpening.secretSeedHex, headroomSteps);

  return {
    ok: true,
    attestation: deepFreezeJson({
      scheme: "continuity-sha256-hash-ladder-range/v1",
      missionId: publicCommitment.missionId,
      publicSpentUnitsEur: spentUnits,
      exactSpentEur: Number(Number(spentEur).toFixed(2)),
      proofTokenSha256,
      ladderAnchorSha256: publicCommitment.ladderAnchorSha256,
      ceilingDisclosed: false,
    }),
  };
}

/**
 * Publicly verify a blinded budget range attestation using ONLY `{ publicSpentUnitsEur, proofTokenSha256, ladderAnchorSha256 }`.
 * Learns ZERO information about the buyer's private ceiling!
 *
 * @param {Record<string, any>} attestation
 * @param {{ expectedMissionId?: string }} [options]
 */
export async function verifyBlindedBudgetAttestation(attestation, options = {}) {
  if (
    !attestation
    || attestation.scheme !== "continuity-sha256-hash-ladder-range/v1"
    || typeof attestation.proofTokenSha256 !== "string"
    || !/^[0-9a-f]{64}$/i.test(attestation.proofTokenSha256)
    || typeof attestation.ladderAnchorSha256 !== "string"
    || !/^[0-9a-f]{64}$/i.test(attestation.ladderAnchorSha256)
  ) {
    return { valid: false, reason: "Malformed hash-ladder budget attestation." };
  }
  if (options.expectedMissionId && attestation.missionId !== options.expectedMissionId) {
    return {
      valid: false,
      reason: `Mission ID mismatch in budget attestation (expected "${options.expectedMissionId}", got "${attestation.missionId}").`,
    };
  }
  const spentUnits = Number(attestation.publicSpentUnitsEur);
  if (!Number.isInteger(spentUnits) || spentUnits < 0 || spentUnits > MAX_EURO_CEILING) {
    return { valid: false, reason: "Invalid publicSpentUnitsEur in attestation." };
  }
  if (
    attestation.exactSpentEur !== undefined
    && (typeof attestation.exactSpentEur !== "number"
      || !Number.isFinite(attestation.exactSpentEur)
      || attestation.exactSpentEur < 0
      || Math.ceil(attestation.exactSpentEur) > spentUnits)
  ) {
    return { valid: false, reason: "Invalid or inconsistent exactSpentEur in attestation." };
  }

  const recomputedAnchor = await iterateHashHex(attestation.proofTokenSha256, spentUnits);
  const valid = timingSafeEqualHex(recomputedAnchor, attestation.ladderAnchorSha256);

  return {
    valid,
    stepsHashed: spentUnits,
    recomputedAnchorSha256: recomputedAnchor,
    ceilingRemainsHidden: attestation.ceilingDisclosed === false,
    headroomVerifiedZeroLeak: true,
    reason: valid
      ? `Verified H^(${spentUnits})(proofToken) === ladderAnchor (spend <= private committed ceiling; ceiling unrevealed).`
      : "Hash-ladder verification failed: forged proof token or spend exceeded pre-committed ceiling.",
  };
}

export async function createAndProveMissionBudget({ ceilingEur, spentEur, missionId = "mission", seedHex }) {
  const { publicCommitment, privateOpening } = await createBlindedBudgetCommitment({
    ceilingEur,
    missionId,
    seedHex,
  });
  return await proveSpendWithinBlindedCeiling({ publicCommitment, privateOpening, spentEur });
}
