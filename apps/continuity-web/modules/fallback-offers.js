/**
 * Deterministic relocation fallback offer builder when operating without live HTTP/bridge servers.
 */

import { normalizePeerOffer } from "../vendor/capability-adapter/index.js";

export function buildFallbackOffersForRelocationNode({
  node,
  targetDate,
  peerOrigins,
  rippleFailureInjected,
  providerAlerts,
}) {
  if (node.provider_id === "moveco") {
    if (rippleFailureInjected) {
      providerAlerts.push(
        `MoveCo Alert: Primary 08:00 crew full on ${targetDate}; recovered with MoveCo Partner Overflow Fleet while keeping MC-8841 held.`,
      );
      return [
        normalizePeerOffer({
          offer_id: "off_moveco_partner_overflow_fri",
          commitment_id: node.id,
          provider_id: "moveco",
          provider_name: "MoveCo Partner Overflow Fleet (Demo)",
          provider_origin: peerOrigins.moveco,
          raw_capability: "reschedule_van_booking",
          semantic_kind: "REPLACE_WITH_BACKUP_PROVIDER",
          proposed_date: targetDate,
          window: "09:30–14:30",
          base_price_eur: 405,
          change_fee_eur: 0,
          cancellation_penalty_eur: 20,
          supports_hold: true,
          hold_ttl_seconds: 900,
          reversible: false,
          creates_final_booking: true,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: true,
          expires_at: "2027-01-20T23:59:59Z",
        }),
      ];
    }
    return [
      normalizePeerOffer({
        offer_id: "off_moveco_fri_am",
        commitment_id: node.id,
        provider_id: "moveco",
        provider_name: "MoveCo Express (Demo)",
        provider_origin: peerOrigins.moveco,
        raw_capability: "reschedule_van_booking",
        semantic_kind: "RESCHEDULE_IN_PLACE",
        proposed_date: targetDate,
        window: "08:00–13:00",
        base_price_eur: 390,
        change_fee_eur: 25,
        cancellation_penalty_eur: 0,
        supports_hold: true,
        hold_ttl_seconds: 900,
        reversible: false,
        creates_final_booking: true,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
        expires_at: "2027-01-20T23:59:59Z",
      }),
    ];
  }

  if (node.provider_id === "permitflow") {
    return [
      normalizePeerOffer({
        offer_id: `off_permitflow_${targetDate}`,
        commitment_id: node.id,
        provider_id: "permitflow",
        provider_name: "PermitFlow Civic Prep (Demo)",
        provider_origin: peerOrigins.permitflow,
        raw_capability: "prepare_permit_date_update",
        semantic_kind: "PREPARE_PERMIT_DOSSIER",
        proposed_date: targetDate,
        window: "07:30–14:00",
        base_price_eur: 35,
        change_fee_eur: 10,
        cancellation_penalty_eur: 0,
        supports_hold: false,
        hold_ttl_seconds: 0,
        reversible: true,
        creates_final_booking: false,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
        expires_at: "2027-01-20T23:59:59Z",
      }),
    ];
  }

  if (node.provider_id === "homeconnect") {
    const nextDayDate = new Date(Date.parse(`${targetDate}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    return [
      normalizePeerOffer({
        offer_id: "off_homeconnect_fri_pm",
        commitment_id: node.id,
        provider_id: "homeconnect",
        provider_name: "HomeConnect Fiber (Demo)",
        provider_origin: peerOrigins.homeconnect,
        raw_capability: "change_fiber_appointment",
        semantic_kind: "RESCHEDULE_IN_PLACE",
        proposed_date: targetDate,
        window: "14:00–17:00",
        base_price_eur: 49,
        change_fee_eur: 0,
        cancellation_penalty_eur: 0,
        supports_hold: true,
        hold_ttl_seconds: 600,
        reversible: false,
        creates_final_booking: true,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
        expires_at: "2027-01-20T23:59:59Z",
      }),
      normalizePeerOffer({
        offer_id: "off_homeconnect_sat_am",
        commitment_id: node.id,
        provider_id: "homeconnect",
        provider_name: "HomeConnect Fiber (Demo)",
        provider_origin: peerOrigins.homeconnect,
        raw_capability: "change_fiber_appointment",
        semantic_kind: "RESCHEDULE_IN_PLACE",
        proposed_date: nextDayDate,
        window: "09:00–12:00",
        base_price_eur: 39,
        change_fee_eur: 0,
        cancellation_penalty_eur: 0,
        supports_hold: true,
        hold_ttl_seconds: 600,
        reversible: false,
        creates_final_booking: true,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
        expires_at: "2027-01-20T23:59:59Z",
      }),
    ];
  }

  if (node.provider_id === "powerflow") {
    return [
      normalizePeerOffer({
        offer_id: `off_powerflow_${targetDate}`,
        commitment_id: node.id,
        provider_id: "powerflow",
        provider_name: "PowerFlow Energy (Demo)",
        provider_origin: peerOrigins.powerflow,
        raw_capability: "shift_grid_activation",
        semantic_kind: "RESCHEDULE_IN_PLACE",
        proposed_date: targetDate,
        window: "08:00–12:00",
        base_price_eur: 30,
        change_fee_eur: 0,
        cancellation_penalty_eur: 0,
        supports_hold: false,
        hold_ttl_seconds: 0,
        reversible: false,
        creates_final_booking: true,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
        expires_at: "2027-01-20T23:59:59Z",
      }),
    ];
  }

  return [];
}
