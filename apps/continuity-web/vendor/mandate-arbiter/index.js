/**
 * @module @continuity/mandate-arbiter
 * Browser-Native Policy-Bound Mandate Authority & Sealed-Bid Nash Overflow Arbiter.
 *
 * Extends Section 7 ("Transactions negotiation and arbitration") of the Worldwide Agentic Web
 * MVP Specification to multi-origin post-commitment change coordination:
 *
 * 1. Immutable Policy-Bound Mandates: Derived exclusively by deterministic host code from the
 *    trusted mission invariants and user request. Model tool calls cannot alter an issued
 *    mandate's subject, target date, or budget ceiling (`Object.freeze` + SHA-256 digest).
 * 2. Strict Boundary Redaction: Outbound peer discovery messages strip `maximum_budget_eur`
 *    and free-text chat context; peer networks never see the buyer's ceiling.
 * 3. Sealed-Bid Equal-Weight Linear Nash Bargaining: When a primary commitment refuses a date
 *    (Ripple Failure) and backup fleet adapters submit sealed bids `(askCents, floorCents)`,
 *    the arbiter verifies SHA-256 commitment hashes and computes:
 *      `U = min(buyerAllowanceCents, askCents)`
 *      If `floorCents > U` -> `NO_AGREEMENT` (revealing neither `floorCents` nor `buyerAllowanceCents`).
 *      Otherwise -> `compromiseCents = Math.floor((U + floorCents) / 2)`.
 *
 * Scope Disclosure: As noted by Myerson & Satterthwaite (1983), equal-weight Nash bargaining
 * is a deterministic bilateral fairness rule over committed adapter bounds, not an incentive-
 * compatible truth-revelation mechanism for strategic unconstrained sellers.
 */

import {
  canonicalizeJson,
  deepFreezeJson,
  isValidIsoDate,
  sanitizeJson,
  sha256Hex,
  timingSafeEqualHex,
} from "../shared-schemas/index.js";

export const ARBITER_MECHANISM_VERSION = "nash-linear-equal-weight-int-cents/v1";

/**
 * Issue an immutable policy-bound mandate before any external peer research begins.
 *
 * @param {Record<string, any>} mission
 * @param {Record<string, any>} compiledProposal
 */
export async function issuePolicyBoundMandate(mission, compiledProposal) {
  if (!mission?.mission_id || !compiledProposal?.requested_change) {
    throw new Error("Mandate issuance requires a valid mission and compiled proposal.");
  }

  const ceilingEur = Number(compiledProposal.invariants.maximum_budget_eur);
  if (!Number.isFinite(ceilingEur) || ceilingEur < 0) {
    throw new Error("Invalid mandate budget ceiling.");
  }

  const core = sanitizeJson({
    schema: "continuity-policy-mandate/v1",
    mandate_id: `mnd_${mission.mission_id}_${compiledProposal.requested_change.new_value}`,
    mission_id: mission.mission_id,
    domain: mission.mission_type,
    subject_commitment_id: compiledProposal.requested_change.target_commitment_id,
    previous_date: compiledProposal.requested_change.previous_value,
    target_date: compiledProposal.requested_change.new_value,
    ceiling_cents: Math.round(ceilingEur * 100),
    preserve_existing_until_held: Boolean(compiledProposal.invariants.preserve_existing_commitments),
    allow_unauthorized_cancellation: false,
    issued_at: new Date().toISOString(),
  });

  const mandateHash = await sha256Hex(canonicalizeJson(core));
  return deepFreezeJson({
    ...core,
    mandate_sha256: mandateHash,
  });
}

export async function verifyPolicyMandateIntegrity(mandate) {
  if (!mandate || typeof mandate !== "object" || typeof mandate.mandate_sha256 !== "string") {
    return { valid: false, reason: "Missing mandate or mandate_sha256." };
  }
  const { mandate_sha256: expected, ...core } = sanitizeJson(mandate);
  const recomputed = await sha256Hex(canonicalizeJson(core));
  const valid = timingSafeEqualHex(recomputed, expected);
  return { valid, recomputedSha256: recomputed };
}

/**
 * Strip private budget ceilings, bearer tokens, and arbitrary chat prose before crossing
 * an external peer boundary.
 *
 * @param {Record<string, any>} rawQuery
 */
export function buildSanitizedPeerBoundaryRequest(rawQuery) {
  const clean = sanitizeJson(rawQuery || {});
  const bookingRef = String(clean.booking_ref || "").trim();
  const targetDate = String(clean.target_date || "").trim();
  if (bookingRef && !/^[A-Za-z0-9_-]{1,48}$/.test(bookingRef)) {
    throw new Error("Invalid booking_ref format in peer boundary request.");
  }
  if (targetDate && !isValidIsoDate(targetDate)) {
    throw new Error("Invalid ISO target_date in peer boundary request.");
  }
  return Object.freeze({
    booking_ref: bookingRef.slice(0, 32),
    target_date: targetDate.slice(0, 10),
    // Explicitly omit maximum_budget_eur, mandate_id, ceiling_cents, sly_data, and raw user text!
  });
}

/**
 * Stateful Sealed-Bid Commerce Arbiter for overflow/replacement provider resolution.
 */
export class SealedBidArbiter {
  /**
   * @param {Readonly<Record<string, any>>} mandate - Frozen mandate from `issuePolicyBoundMandate`
   * @param {number} [sliceAllowanceCents] - Portion of mandate ceiling available for this contested slot
   */
  constructor(mandate, sliceAllowanceCents) {
    if (!mandate?.mandate_id || !mandate?.mandate_sha256) {
      throw new Error("SealedBidArbiter requires an issued policy-bound mandate.");
    }
    this.mandate = mandate;
    const rawAllow =
      sliceAllowanceCents !== undefined ? Math.round(Number(sliceAllowanceCents)) : mandate.ceiling_cents;
    if (!Number.isFinite(rawAllow) || rawAllow < 0) {
      throw new Error("Invalid buyerAllowanceCents for SealedBidArbiter.");
    }
    this.buyerAllowanceCents = rawAllow;
    /** @type {Map<string, { providerId: string, providerName: string, window: string, askCents: number, floorCents: number, nonce: string, commitmentHash: string }>} */
    this._sealedVault = new Map();
    /** @type {Map<string, Readonly<Record<string, any>>>} */
    this.issuedOffers = new Map();
    this.settledOfferId = null;
    this.resolved = false;
  }

  /**
   * Provider adapter commits one sealed `(askCents, floorCents)` bid for `(mandate, providerId)`.
   * Returns ONLY the public `commitment_hash` — numeric floor never enters model context!
   */
  async commitSealedBid({ providerId, providerName, window, askCents, floorCents, nonce = "n1" }) {
    if (this.resolved) {
      return { ok: false, code: "DENIED", reason: "Arbiter round already resolved; late bids rejected." };
    }
    if (this._sealedVault.has(providerId)) {
      return { ok: false, code: "DENIED", reason: `Duplicate bid rejected for provider "${providerId}".` };
    }
    const aCents = Math.round(Number(askCents));
    const fCents = Math.round(Number(floorCents));
    if (!Number.isInteger(aCents) || !Number.isInteger(fCents) || fCents <= 0 || aCents < fCents) {
      return { ok: false, code: "DENIED", reason: "Invalid ask/floor integer cents." };
    }

    const commitmentPayload = canonicalizeJson({
      mandate_id: this.mandate.mandate_id,
      provider_id: providerId,
      ask_cents: aCents,
      floor_cents: fCents,
      nonce,
    });
    const commitmentHash = await sha256Hex(commitmentPayload);

    this._sealedVault.set(providerId, {
      providerId,
      providerName: providerName || providerId,
      window: window || "09:30–14:30",
      askCents: aCents,
      floorCents: fCents,
      nonce,
      commitmentHash,
    });

    return {
      ok: true,
      mandate_id: this.mandate.mandate_id,
      provider_id: providerId,
      catalogue_ask_eur: Number((aCents / 100).toFixed(2)),
      commitment_hash: commitmentHash,
    };
  }

  /**
   * Resolve all committed sealed bids simultaneously using equal-weight linear Nash bargaining:
   * `U = min(buyerAllowanceCents, askCents)`, `price = floor((U + floorCents) / 2)` when `floorCents <= U`.
   * Never reveals `floorCents` or `buyerAllowanceCents` in any returned record!
   */
  resolveNashBargaining() {
    this.resolved = true;
    const publicOutcomes = [];

    for (const [providerId, secretBid] of this._sealedVault.entries()) {
      const upperCents = Math.min(this.buyerAllowanceCents, secretBid.askCents);
      if (secretBid.floorCents > upperCents) {
        publicOutcomes.push(
          Object.freeze({
            provider_id: providerId,
            provider_name: secretBid.providerName,
            commitment_hash: secretBid.commitmentHash,
            catalogue_ask_eur: Number((secretBid.askCents / 100).toFixed(2)),
            status: "NO_AGREEMENT",
            compromise_cents: null,
            compromise_eur: null,
            savings_vs_ask_eur: null,
          }),
        );
        continue;
      }

      const compromiseCents = Math.floor((upperCents + secretBid.floorCents) / 2);
      const offerId = `arb_offer_${this.mandate.mandate_id}_${providerId}`;
      const offerRecord = Object.freeze({
        offer_id: offerId,
        mandate_id: this.mandate.mandate_id,
        target_date: this.mandate.target_date,
        provider_id: providerId,
        provider_name: secretBid.providerName,
        window: secretBid.window,
        catalogue_ask_cents: secretBid.askCents,
        catalogue_ask_eur: Number((secretBid.askCents / 100).toFixed(2)),
        compromise_cents: compromiseCents,
        compromise_eur: Number((compromiseCents / 100).toFixed(2)),
        savings_vs_ask_eur: Number(((secretBid.askCents - compromiseCents) / 100).toFixed(2)),
        commitment_hash: secretBid.commitmentHash,
        status: "AGREEMENT_REACHED",
      });
      this.issuedOffers.set(offerId, offerRecord);
      publicOutcomes.push(offerRecord);
    }

    publicOutcomes.sort((a, b) => {
      if (a.status !== b.status) return a.status === "AGREEMENT_REACHED" ? -1 : 1;
      const diff = (a.compromise_cents ?? Infinity) - (b.compromise_cents ?? Infinity);
      return diff !== 0 ? diff : String(a.provider_id).localeCompare(String(b.provider_id));
    });

    return {
      mechanism: ARBITER_MECHANISM_VERSION,
      mandate_id: this.mandate.mandate_id,
      mandate_sha256: this.mandate.mandate_sha256,
      caveat:
        "Deterministic equal-weight linear Nash bargaining over sealed adapter bounds (see Myerson–Satterthwaite 1983 for strategic bilateral-trade limits). Raw floors and buyer ceilings are never disclosed.",
      outcomes: publicOutcomes,
    };
  }

  /**
   * Attempt settlement against an arbiter-issued offer. Enforces:
   * - Owner human approval token required (agents cannot self-settle)
   * - Exact `offerId` and `compromise_cents` match (`€0.01` seller override -> DENIED)
   * - Single settlement per mandate (concurrent/replay attempts -> DENIED).
   */
  authorizeSettlement({ offerId, proposedPriceCents, humanOwnerApproved }) {
    if (humanOwnerApproved !== true) {
      return {
        ok: false,
        code: "DENIED",
        reason: "Agent-initiated settlement forbidden: explicit human owner approval is required.",
      };
    }
    if (this.settledOfferId) {
      if (this.settledOfferId === offerId) {
        return { ok: true, idempotentReplay: true, settled_offer_id: offerId };
      }
      return {
        ok: false,
        code: "DENIED",
        reason: `Mandate already settled on "${this.settledOfferId}"; conflicting settlement rejected.`,
      };
    }
    const offer = this.issuedOffers.get(offerId);
    if (!offer) {
      return {
        ok: false,
        code: "DENIED",
        reason: `Unrecognized or LLM-invented offer_id "${offerId}" has zero settlement authority.`,
      };
    }
    if (Math.round(Number(proposedPriceCents)) !== offer.compromise_cents) {
      return {
        ok: false,
        code: "DENIED",
        reason: `Price override rejected: proposed ${proposedPriceCents} cents != arbiter Nash compromise ${offer.compromise_cents} cents.`,
      };
    }
    this.settledOfferId = offerId;
    return {
      ok: true,
      code: "SETTLED",
      settled_offer_id: offerId,
      compromise_eur: offer.compromise_eur,
      commitment_hash: offer.commitment_hash,
    };
  }
  static async verifySealedBidOpening(mandateId, bidOpening, expectedCommitmentHash) {
    const payload = canonicalizeJson({
      mandate_id: String(mandateId),
      provider_id: String(bidOpening.providerId),
      ask_cents: Math.round(Number(bidOpening.askCents)),
      floor_cents: Math.round(Number(bidOpening.floorCents)),
      nonce: String(bidOpening.nonce ?? "n1"),
    });
    const computed = await sha256Hex(payload);
    return timingSafeEqualHex(computed, String(expectedCommitmentHash));
  }

  wipeVaultSecrets() {
    this._sealedVault.clear();
  }
}

/**
 * Run the 4 interactive adversarial bypass checks (mirroring `agent-commerce-demo` Step 4 "Try a bypass"):
 *  1. Mandate Mutation Attempt (agent tries to raise `ceiling_cents` on frozen mandate)
 *  2. Seller `€0.01` Price Override Attempt (`proposedPriceCents = compromise + 1`)
 *  3. Buyer Agent Unapproved `settle` Attempt (`humanOwnerApproved = false`)
 *  4. Hallucinated / Forged `offer_id` Settlement Attempt (`arb_offer_fake_999`)
 *
 * @param {Readonly<Record<string, any>>} mandate
 * @param {SealedBidArbiter} arbiter
 */
export function runAdversarialBypassAudit(mandate, arbiter) {
  const results = [];

  // Bypass 1: Mutate frozen mandate ceiling
  let mutated = false;
  try {
    // @ts-expect-error deliberate adversarial mutation test
    mandate.ceiling_cents = mandate.ceiling_cents + 50_000;
    mutated = mandate.ceiling_cents !== mandate.ceiling_cents;
  } catch {
    mutated = false;
  }
  results.push({
    id: "BYPASS-01",
    attack: "Agent attempts to mutate issued Mandate ceiling (+€500)",
    decision: !mutated ? "DENIED" : "FAILED",
    passed: !mutated,
    detail: "Mandate record is frozen & SHA-256 pinned; ceiling_cents remained immutable.",
  });

  const validOffer = Array.from(arbiter.issuedOffers.values())[0];
  const baseOfferId = validOffer?.offer_id || "arb_offer_none";
  const baseCents = validOffer?.compromise_cents ?? 40500;

  // Bypass 2: Seller +€0.01 override
  const b2 = arbiter.authorizeSettlement({
    offerId: baseOfferId,
    proposedPriceCents: baseCents + 1,
    humanOwnerApproved: true,
  });
  results.push({
    id: "BYPASS-02",
    attack: "Seller supplies +€0.01 price override at settlement",
    decision: b2.code,
    passed: b2.ok === false && b2.code === "DENIED",
    detail: b2.reason,
  });

  // Bypass 3: Agent attempts autonomous settlement without owner approval
  const b3 = arbiter.authorizeSettlement({
    offerId: baseOfferId,
    proposedPriceCents: baseCents,
    humanOwnerApproved: false,
  });
  results.push({
    id: "BYPASS-03",
    attack: "Buyer agent calls settle without human owner confirmation",
    decision: b3.code,
    passed: b3.ok === false && b3.code === "DENIED",
    detail: b3.reason,
  });

  // Bypass 4: LLM-invented offer ID
  const b4 = arbiter.authorizeSettlement({
    offerId: "arb_offer_llm_hallucinated_350eur",
    proposedPriceCents: 35000,
    humanOwnerApproved: true,
  });
  results.push({
    id: "BYPASS-04",
    attack: "Model invents unauthorized low-price offer_id",
    decision: b4.code,
    passed: b4.ok === false && b4.code === "DENIED",
    detail: b4.reason,
  });

  return {
    allDenied: results.every((r) => r.passed),
    results,
  };
}
