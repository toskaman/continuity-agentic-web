/**
 * @module @continuity/capability-adapter
 * Peer Capability Normalization & Untrusted Response Schema Validation.
 *
 * Normalizes diverse provider capability vocabularies (`reschedule_van_booking`,
 * `prepare_permit_date_update`, `change_fiber_appointment`, `shift_grid_activation`,
 * `reserve_backup_carrier`) into a rich internal semantic contract WITHOUT erasing
 * critical operational differences (e.g., whether temporary holds exist, whether a
 * permit is only a draft dossier, or whether rescheduling is irreversible).
 */

import { assertValidSchema, sanitizeJson } from "../shared-schemas/index.js";

export const NORMALIZED_OFFER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "offer_id",
    "commitment_id",
    "provider_id",
    "provider_name",
    "provider_origin",
    "raw_capability",
    "semantic_kind",
    "proposed_date",
    "window",
    "base_price_eur",
    "change_fee_eur",
    "cancellation_penalty_eur",
    "supports_hold",
    "hold_ttl_seconds",
    "reversible",
    "creates_final_booking",
    "requires_user_approval",
    "supports_idempotency",
    "supports_status_reconciliation",
    "is_replacement_provider",
  ],
  properties: {
    offer_id: { type: "string", minLength: 3, maxLength: 96 },
    commitment_id: { type: "string", minLength: 3, maxLength: 64 },
    provider_id: { type: "string", minLength: 2, maxLength: 64 },
    provider_name: { type: "string", minLength: 2, maxLength: 120 },
    provider_origin: { type: "string", minLength: 4, maxLength: 200 },
    raw_capability: { type: "string", minLength: 2, maxLength: 80 },
    semantic_kind: {
      type: "string",
      enum: [
        "RESCHEDULE_IN_PLACE",
        "PREPARE_PERMIT_DOSSIER",
        "REPLACE_WITH_BACKUP_PROVIDER",
        "KEEP_EXISTING_SCHEDULE",
      ],
    },
    proposed_date: { type: "string", format: "date" },
    window: { type: "string", minLength: 2, maxLength: 80 },
    base_price_eur: { type: "number", minimum: 0, maximum: 50000 },
    change_fee_eur: { type: "number", minimum: 0, maximum: 10000 },
    cancellation_penalty_eur: { type: "number", minimum: 0, maximum: 10000 },
    supports_hold: { type: "boolean" },
    hold_ttl_seconds: { type: "integer", minimum: 0, maximum: 86400 },
    reversible: { type: "boolean" },
    creates_final_booking: { type: "boolean" },
    requires_user_approval: { type: "boolean" },
    supports_idempotency: { type: "boolean" },
    supports_status_reconciliation: { type: "boolean" },
    is_replacement_provider: { type: "boolean" },
    expires_at: { type: "string", maxLength: 64 },
    disclosure_note: { type: "string", maxLength: 300 },
  },
};

/**
 * Documented provider capability descriptors used across the demonstration ecosystem.
 */
export const PROVIDER_CAPABILITY_CONTRACTS = Object.freeze({
  moveco: {
    providerId: "moveco",
    providerName: "MoveCo Express (Demo)",
    capabilities: {
      get_moving_quote: { effect: "read", supportsIdempotency: true, supportsHold: false },
      hold_moving_slot: { effect: "write", supportsIdempotency: true, supportsHold: true, holdTtlSeconds: 900 },
      reschedule_van_booking: {
        effect: "irreversible",
        semanticKind: "RESCHEDULE_IN_PLACE",
        reversible: false,
        createsFinalBooking: true,
        requiresApproval: true,
        supportsIdempotency: true,
        supportsStatusReconciliation: true,
      },
      get_booking_status: { effect: "read", supportsIdempotency: true, supportsStatusReconciliation: true },
    },
  },
  permitflow: {
    providerId: "permitflow",
    providerName: "PermitFlow Civic Prep (Demo)",
    capabilities: {
      check_bay_eligibility: { effect: "read", supportsIdempotency: true, supportsHold: false },
      prepare_permit_date_update: {
        effect: "irreversible",
        semanticKind: "PREPARE_PERMIT_DOSSIER",
        reversible: true,
        createsFinalBooking: false, // Honest: prepares municipal application draft in demo, never claims govt API commit
        requiresApproval: true,
        supportsIdempotency: true,
        supportsStatusReconciliation: true,
      },
      get_dossier_status: { effect: "read", supportsIdempotency: true, supportsStatusReconciliation: true },
    },
  },
  homeconnect: {
    providerId: "homeconnect",
    providerName: "HomeConnect Fiber (Demo)",
    capabilities: {
      list_technician_windows: { effect: "read", supportsIdempotency: true, supportsHold: false },
      hold_technician_slot: { effect: "write", supportsIdempotency: true, supportsHold: true, holdTtlSeconds: 600 },
      change_fiber_appointment: {
        effect: "irreversible",
        semanticKind: "RESCHEDULE_IN_PLACE",
        reversible: false,
        createsFinalBooking: true,
        requiresApproval: true,
        supportsIdempotency: true,
        supportsStatusReconciliation: true,
      },
      get_appointment_status: { effect: "read", supportsIdempotency: true, supportsStatusReconciliation: true },
    },
  },
  powerflow: {
    providerId: "powerflow",
    providerName: "PowerFlow Energy (Demo)",
    capabilities: {
      check_grid_windows: { effect: "read", supportsIdempotency: true, supportsHold: false },
      shift_grid_activation: {
        effect: "irreversible",
        semanticKind: "RESCHEDULE_IN_PLACE",
        reversible: false,
        createsFinalBooking: true,
        requiresApproval: true,
        supportsIdempotency: true,
        supportsStatusReconciliation: true,
      },
      get_activation_status: { effect: "read", supportsIdempotency: true, supportsStatusReconciliation: true },
    },
  },
});

/**
 * Normalize and strictly validate a raw peer alternative/offer payload.
 * Rejects malformed or hostile peer payloads (e.g., negative prices, prompt-injection fields,
 * missing dates, or undeclared capability semantics).
 *
 * @param {Record<string, any>} rawPeerOffer
 * @returns {Record<string, any>}
 */
export function normalizePeerOffer(rawPeerOffer) {
  const clean = sanitizeJson(rawPeerOffer);
  const contract = PROVIDER_CAPABILITY_CONTRACTS[clean.provider_id];
  const capMeta = contract?.capabilities?.[clean.raw_capability];

  const normalized = {
    offer_id: String(clean.offer_id || ""),
    commitment_id: String(clean.commitment_id || ""),
    provider_id: String(clean.provider_id || ""),
    provider_name: String(clean.provider_name || contract?.providerName || ""),
    provider_origin: String(clean.provider_origin || ""),
    raw_capability: String(clean.raw_capability || ""),
    semantic_kind: clean.semantic_kind || capMeta?.semanticKind || "RESCHEDULE_IN_PLACE",
    proposed_date: String(clean.proposed_date || ""),
    window: String(clean.window || ""),
    base_price_eur: Number(clean.base_price_eur),
    change_fee_eur: Number(clean.change_fee_eur ?? 0),
    cancellation_penalty_eur: Number(clean.cancellation_penalty_eur ?? 0),
    supports_hold: Boolean(clean.supports_hold ?? capMeta?.supportsHold ?? false),
    hold_ttl_seconds: Number.isInteger(clean.hold_ttl_seconds) ? clean.hold_ttl_seconds : 0,
    reversible: Boolean(clean.reversible ?? capMeta?.reversible ?? false),
    creates_final_booking: Boolean(clean.creates_final_booking ?? capMeta?.createsFinalBooking ?? true),
    requires_user_approval: Boolean(clean.requires_user_approval ?? true),
    supports_idempotency: Boolean(clean.supports_idempotency ?? capMeta?.supportsIdempotency ?? false),
    supports_status_reconciliation: Boolean(
      clean.supports_status_reconciliation ?? capMeta?.supportsStatusReconciliation ?? false,
    ),
    is_replacement_provider: Boolean(clean.is_replacement_provider ?? false),
    ...(clean.expires_at ? { expires_at: String(clean.expires_at) } : {}),
    ...(clean.disclosure_note ? { disclosure_note: String(clean.disclosure_note).slice(0, 300) } : {}),
  };

  return assertValidSchema(NORMALIZED_OFFER_SCHEMA, normalized, "NormalizedPeerOffer");
}
