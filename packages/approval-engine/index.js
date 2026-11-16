/**
 * @module @continuity/approval-engine
 * Canonical Operation Approval Binding & Drift Invalidation.
 *
 * Every user approval is bound to an exact operation payload:
 * - provider_origin, provider_id, capability, exact arguments, price_eur, change_fee_eur,
 *   proposed_date, mission_budget_eur, expiration_iso, and operation_id.
 *
 * Uses deterministic canonical JSON serialization + SHA-256 digest (`approvalHash`).
 * If ANY parameter drifts (e.g., price changes by €1 after approval, date shifts, or
 * approval expires), `verifyApprovalBinding()` rejects execution and forces fresh user consent.
 */

import {
  canonicalizeJson,
  deepFreezeJson,
  sanitizeJson,
  sha256Hex,
  timingSafeEqualHex,
} from "../shared-schemas/index.js";

const MAX_APPROVAL_RECORDS = 1024;

function toEurFromCents(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Approval monetary fields must be finite non-negative numbers.");
  }
  return Math.round(n * 100) / 100;
}

/**
 * Extract the exact canonical fields bound to a human approval decision.
 * @param {Record<string, any>} opSpec
 */
export function buildCanonicalApprovalPayload(opSpec) {
  const holdId = opSpec.hold_id ?? opSpec.arguments?.hold_id ?? null;
  return sanitizeJson({
    version: "continuity-approval/v1",
    mission_id: String(opSpec.mission_id),
    operation_id: String(opSpec.operation_id),
    commitment_id: String(opSpec.commitment_id),
    provider_origin: String(opSpec.provider_origin),
    provider_id: String(opSpec.provider_id),
    capability: String(opSpec.capability),
    arguments: opSpec.arguments || {},
    ...(holdId ? { hold_id: String(holdId) } : {}),
    ...(opSpec.mandate_sha256 ? { mandate_sha256: String(opSpec.mandate_sha256) } : {}),
    proposed_date: String(opSpec.proposed_date),
    base_price_eur: toEurFromCents(opSpec.base_price_eur),
    change_fee_eur: toEurFromCents(opSpec.change_fee_eur ?? 0),
    cancellation_penalty_eur: toEurFromCents(opSpec.cancellation_penalty_eur ?? 0),
    maximum_budget_eur: toEurFromCents(opSpec.maximum_budget_eur),
    expires_at: String(opSpec.expires_at),
  });
}

export function computeApprovalDiff(approvedPayload, candidatePayload) {
  const driftedFields = [];
  const beforeAfter = {};
  const allKeys = new Set([...Object.keys(approvedPayload || {}), ...Object.keys(candidatePayload || {})]);
  for (const key of allKeys) {
    if (canonicalizeJson(approvedPayload[key] ?? null) !== canonicalizeJson(candidatePayload[key] ?? null)) {
      driftedFields.push(key);
      beforeAfter[key] = { approved: approvedPayload[key] ?? null, candidate: candidatePayload[key] ?? null };
    }
  }
  return { driftedFields, beforeAfter };
}

/**
 * Create a cryptographically bound approval token after explicit user consent.
 * Also tracks consumed and revoked approvals to prevent replay on unrelated or duplicate executions.
 */
export class ApprovalEngine {
  constructor() {
    /** @type {Map<string, Record<string, any>>} */
    this.approvals = new Map();
    /** @type {Set<string>} */
    this.consumedOperationIds = new Set();
    /** @type {Set<string>} */
    this.revokedApprovalIds = new Set();
  }

  revokeApproval(approvalId) {
    if (!this.approvals.has(approvalId)) return false;
    this.revokedApprovalIds.add(approvalId);
    return true;
  }

  /**
   * Bind user approval to an exact operation specification.
   * @param {Record<string, any>} opSpec
   * @param {{ nowIso?: string, approvedBy?: string }} [meta]
   */
  async createBoundApproval(opSpec, meta = {}) {
    const nowIso = meta.nowIso || new Date().toISOString();
    const payload = buildCanonicalApprovalPayload(opSpec);
    const nowMs = Date.parse(nowIso);
    const expMs = Date.parse(payload.expires_at);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expMs) || expMs <= nowMs) {
      throw new Error(`Approval expires_at "${payload.expires_at}" must be a valid future ISO timestamp.`);
    }
    const canonicalString = canonicalizeJson(payload);
    const approvalHash = await sha256Hex(canonicalString);

    const record = deepFreezeJson({
      approval_id: `appr_${payload.operation_id}_${approvalHash.slice(0, 12)}`,
      operation_id: payload.operation_id,
      approval_hash: approvalHash,
      canonical_payload: payload,
      approved_at: nowIso,
      approved_by: meta.approvedBy || "human_visitor",
      expires_at: payload.expires_at,
    });

    if (this.approvals.size >= MAX_APPROVAL_RECORDS && !this.approvals.has(record.approval_id)) {
      const oldest = this.approvals.keys().next().value;
      this.approvals.delete(oldest);
    }
    this.approvals.set(record.approval_id, record);
    return record;
  }

  /**
   * Verify that an execution candidate matches a valid, unconsumed, non-revoked, non-expired approval.
   * @param {string} approvalId
   * @param {Record<string, any>} currentOpSpec
   * @param {{ nowIso?: string, consume?: boolean }} [options]
   * @returns {Promise<{ valid: boolean, reason?: string, approvalHash?: string }>}
   */
  async verifyApprovalBinding(approvalId, currentOpSpec, options = {}) {
    const nowIso = options.nowIso || new Date().toISOString();
    const consume = options.consume ?? true;

    const record = this.approvals.get(approvalId);
    if (!record) {
      return { valid: false, reason: `Approval "${approvalId}" not found or forged.` };
    }
    if (this.revokedApprovalIds.has(approvalId)) {
      return { valid: false, reason: `Approval "${approvalId}" was explicitly revoked by the user.` };
    }

    if (this.consumedOperationIds.has(record.operation_id)) {
      return {
        valid: false,
        reason: `Operation "${record.operation_id}" approval has already been consumed (replay blocked).`,
      };
    }

    // Reserve synchronously BEFORE any await to prevent concurrent TOCTOU race!
    if (consume) {
      this.consumedOperationIds.add(record.operation_id);
    }

    if (Date.parse(nowIso) > Date.parse(record.expires_at)) {
      if (consume) this.consumedOperationIds.delete(record.operation_id);
      return {
        valid: false,
        reason: `Approval "${approvalId}" expired at ${record.expires_at} (now ${nowIso}). Re-approval required.`,
      };
    }

    let currentPayload;
    try {
      currentPayload = buildCanonicalApprovalPayload(currentOpSpec);
    } catch (err) {
      if (consume) this.consumedOperationIds.delete(record.operation_id);
      return { valid: false, reason: `Invalid candidate operation payload: ${err.message}` };
    }
    const currentHash = await sha256Hex(canonicalizeJson(currentPayload));

    if (!timingSafeEqualHex(currentHash, record.approval_hash)) {
      if (consume) this.consumedOperationIds.delete(record.operation_id);
      const { driftedFields } = computeApprovalDiff(record.canonical_payload, currentPayload);
      return {
        valid: false,
        reason: `Approval invalidated because proposal changed after user approval in field(s): [${driftedFields.join(", ")}].`,
      };
    }

    return {
      valid: true,
      approvalHash: record.approval_hash,
    };
  }
}
