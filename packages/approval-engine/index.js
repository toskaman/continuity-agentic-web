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

import { canonicalizeJson, sanitizeJson, sha256Hex } from "../shared-schemas/index.js";

/**
 * Extract the exact canonical fields bound to a human approval decision.
 * @param {Record<string, any>} opSpec
 */
export function buildCanonicalApprovalPayload(opSpec) {
  return sanitizeJson({
    version: "continuity-approval/v1",
    mission_id: String(opSpec.mission_id),
    operation_id: String(opSpec.operation_id),
    commitment_id: String(opSpec.commitment_id),
    provider_origin: String(opSpec.provider_origin),
    provider_id: String(opSpec.provider_id),
    capability: String(opSpec.capability),
    arguments: opSpec.arguments || {},
    proposed_date: String(opSpec.proposed_date),
    base_price_eur: Number(opSpec.base_price_eur),
    change_fee_eur: Number(opSpec.change_fee_eur ?? 0),
    cancellation_penalty_eur: Number(opSpec.cancellation_penalty_eur ?? 0),
    maximum_budget_eur: Number(opSpec.maximum_budget_eur),
    expires_at: String(opSpec.expires_at),
  });
}

/**
 * Create a cryptographically bound approval token after explicit user consent.
 * Also tracks consumed approvals to prevent replay on unrelated or duplicate executions.
 */
export class ApprovalEngine {
  constructor() {
    /** @type {Map<string, Record<string, any>>} */
    this.approvals = new Map();
    /** @type {Set<string>} */
    this.consumedOperationIds = new Set();
  }

  /**
   * Bind user approval to an exact operation specification.
   * @param {Record<string, any>} opSpec
   * @param {{ nowIso?: string, approvedBy?: string }} [meta]
   */
  async createBoundApproval(opSpec, meta = {}) {
    const nowIso = meta.nowIso || new Date().toISOString();
    const payload = buildCanonicalApprovalPayload(opSpec);
    const canonicalString = canonicalizeJson(payload);
    const approvalHash = await sha256Hex(canonicalString);

    const record = {
      approval_id: `appr_${payload.operation_id}_${approvalHash.slice(0, 12)}`,
      operation_id: payload.operation_id,
      approval_hash: approvalHash,
      canonical_payload: payload,
      approved_at: nowIso,
      approved_by: meta.approvedBy || "human_visitor",
      expires_at: payload.expires_at,
    };

    this.approvals.set(record.approval_id, record);
    return record;
  }

  /**
   * Verify that an execution candidate matches a valid, unconsumed, non-expired approval.
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

    const currentPayload = buildCanonicalApprovalPayload(currentOpSpec);
    const currentHash = await sha256Hex(canonicalizeJson(currentPayload));

    if (currentHash !== record.approval_hash) {
      if (consume) this.consumedOperationIds.delete(record.operation_id);
      // Pinpoint exact field that drifted for transparent user reporting
      const driftedFields = [];
      for (const key of Object.keys(record.canonical_payload)) {
        if (canonicalizeJson(record.canonical_payload[key]) !== canonicalizeJson(currentPayload[key])) {
          driftedFields.push(key);
        }
      }
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
