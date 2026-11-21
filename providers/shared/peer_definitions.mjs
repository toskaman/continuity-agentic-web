/**
 * Provider Contracts & Stateful Domain Engines for the 4 Independent Peers:
 *  - Peer A: MoveCo Express (`moveco`)
 *  - Peer B: PermitFlow Civic Prep (`permitflow`) — explicitly demonstration dossier prep only
 *  - Peer C: HomeConnect Fiber (`homeconnect`)
 *  - Peer D: PowerFlow Energy (`powerflow`)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { IndependentProviderHost } from "./provider_server.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const RELEASE_HOLD_TOOL = {
  name: "release_hold",
  description: "Release a temporary slot hold without changing the original reservation.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["booking_ref", "hold_id"],
    properties: {
      booking_ref: { type: "string", minLength: 3, maxLength: 32 },
      hold_id: { type: "string", minLength: 1, maxLength: 96 },
    },
  },
};

function releaseTemporaryHold(_state, args, { holds }) {
  for (const [key, hold] of holds) {
    if (hold.hold_id !== args.hold_id) continue;
    if (hold.booking_ref !== args.booking_ref) return { ok: false, reason: "Hold belongs to a different booking." };
    holds.delete(key);
    break;
  }
  return { ok: true, released: true, hold_id: args.hold_id, fee_charged_eur: 0 };
}

function findActiveHoldKey(holds, args) {
  for (const [key, hold] of holds) {
    if (hold.hold_id === args.hold_id && hold.booking_ref === args.booking_ref && hold.offer_id === args.offer_id
      && hold.proposed_date === args.new_date && Date.parse(hold.expires_at) > Date.now()) return key;
  }
  return null;
}

export function createMoveCoDefinition({ host = "127.0.0.1", port = 8081, openAs = "127.0.0.1" } = {}) {
  return {
    providerId: "moveco",
    providerName: "MoveCo Express (Demo)",
    siteFolder: path.join(REPO_ROOT, "apps", "demo-moveco"),
    host,
    port,
    openAs,
    createInitialState: () => ({
      version: 1,
      injected_scenario: "normal",
      bookings: {
        "MC-8841": {
          booking_ref: "MC-8841",
          customer_zone: "Zone B — Bellecour",
          crew_tier: "20m3 Luton Van + 3 Movers",
          status: "CONFIRMED",
          scheduled_date: "2027-11-16",
          window: "08:00–13:00",
          base_price_eur: 390,
          reschedule_fee_eur: 25,
          cancellation_fee_eur: 65,
        },
      },
      slots: [
        {
          offer_id: "off_moveco_fri_am",
          date: "2027-11-19",
          window: "08:00–13:00",
          crew_label: "MoveCo Express Primary Crew",
          base_price_eur: 390,
          change_fee_eur: 25,
          cancellation_penalty_eur: 0,
          is_replacement_provider: false,
          available: true,
        },
        {
          offer_id: "off_moveco_partner_overflow_fri",
          date: "2027-11-19",
          window: "09:30–14:30",
          crew_label: "MoveCo Partner Overflow Fleet (Backup)",
          base_price_eur: 405,
          change_fee_eur: 0,
          cancellation_penalty_eur: 20,
          is_replacement_provider: true,
          available: true,
        },
      ],
    }),
    mcpTools: [
      {
        name: "get_moving_quote",
        description: "Check real-time demonstration moving van availability and reschedule quotes for a target date.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "target_date"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            target_date: { type: "string", format: "date" },
          },
        },
      },
      {
        name: "hold_moving_slot",
        description: "Place a 15-minute temporary slot hold without modifying or cancelling the existing reservation.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "offer_id", "proposed_date", "idempotency_key"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            offer_id: { type: "string", minLength: 3, maxLength: 96 },
            proposed_date: { type: "string", format: "date" },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
          },
        },
      },
      {
        name: "reschedule_van_booking",
        description: "Commit an authorized reschedule of an existing MoveCo reservation with Ed25519 receipt.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "new_date", "offer_id", "idempotency_key"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            new_date: { type: "string", format: "date" },
            window: { type: "string", maxLength: 64 },
            offer_id: { type: "string", minLength: 3, maxLength: 96 },
            hold_id: { type: "string", maxLength: 96 },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
          },
        },
      },
      RELEASE_HOLD_TOOL,
      {
        name: "get_booking_status",
        description: "Reconcile booking and operation status by booking_ref and optional idempotency_key.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            idempotency_key: { type: "string", maxLength: 120 },
          },
        },
      },
    ],
    handlers: {
      release_hold: releaseTemporaryHold,
      async get_moving_quote(state, args, helpers) {
        const booking = state.bookings[args.booking_ref];
        if (!booking) {
          return { ok: false, reason: `Booking ${args.booking_ref} not found.` };
        }
        const offers = state.slots
          .filter((s) => s.date === args.target_date && s.available)
          .filter((s) =>
            state.injected_scenario === "primary_fri_full" ? s.is_replacement_provider : !s.is_replacement_provider,
          )
          .map((s) => ({
            offer_id: s.offer_id,
            commitment_id: "cmt_moveco_van",
            provider_id: "moveco",
            provider_name: s.is_replacement_provider ? s.crew_label : "MoveCo Express (Demo)",
            provider_origin: helpers.origin,
            raw_capability: "reschedule_van_booking",
            semantic_kind: s.is_replacement_provider
              ? "REPLACE_WITH_BACKUP_PROVIDER"
              : "RESCHEDULE_IN_PLACE",
            proposed_date: s.date,
            window: s.window,
            base_price_eur: s.base_price_eur,
            change_fee_eur: s.change_fee_eur,
            cancellation_penalty_eur: s.cancellation_penalty_eur,
            supports_hold: true,
            hold_ttl_seconds: 900,
            reversible: false,
            creates_final_booking: true,
            requires_user_approval: true,
            supports_idempotency: true,
            supports_status_reconciliation: true,
            is_replacement_provider: s.is_replacement_provider,
            expires_at: "2027-12-30T23:59:59Z",
            disclosure_note: s.is_replacement_provider
              ? "Primary MoveCo Friday crew full (injected ripple failure); verified partner overflow crew offered while MC-8841 stays held."
              : "Direct reschedule keeps MC-8841 active until commit.",
          }));

        return {
          ok: true,
          simulation_service: true,
          current_booking: booking,
          primary_refused: state.injected_scenario === "primary_fri_full",
          refusal_reason:
            state.injected_scenario === "primary_fri_full"
              ? "the usual 08:00 crew is fully booked on 2027-11-19, so a partner crew was found instead."
              : null,
          offers,
        };
      },
      async hold_moving_slot(state, args, helpers) {
        const booking = state.bookings[args.booking_ref];
        if (!booking) return { ok: false, reason: "Unknown booking_ref." };
        const existingHold = helpers.holds.get(args.idempotency_key);
        if (existingHold) return existingHold;

        const slot = state.slots.find((s) => s.offer_id === args.offer_id && s.date === args.proposed_date);
        if (!slot) return { ok: false, reason: `Offer ${args.offer_id} unavailable for ${args.proposed_date}.` };

        const hold = {
          ok: true,
          hold_id: `hold_mc_${crypto.randomUUID()}`,
          booking_ref: args.booking_ref,
          offer_id: args.offer_id,
          proposed_date: args.proposed_date,
          original_booking_preserved: true,
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
        helpers.holds.set(args.idempotency_key, hold);
        return hold;
      },
      async reschedule_van_booking(state, args, helpers) {
        if (helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const holdKey = args.hold_id ? findActiveHoldKey(helpers.holds, args) : null;
        if (args.hold_id && holdKey === null) {
          return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "The exact moving hold is no longer active." };
        }
        const booking = state.bookings[args.booking_ref];
        if (!booking) {
          return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "Booking not found." };
        }
        const slot = state.slots.find((s) => s.offer_id === args.offer_id && s.date === args.new_date);
        if (!slot) {
          return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "Offer slot invalid or expired." };
        }

        const totalEur = Number((slot.base_price_eur + slot.change_fee_eur + slot.cancellation_penalty_eur).toFixed(2));
        booking.scheduled_date = slot.date;
        booking.window = slot.window;
        booking.base_price_eur = totalEur;
        booking.status = "CONFIRMED";
        state.version += 1;

        const receiptBody = {
          receipt_id: `rcpt_mc_${state.version}`,
          provider_id: "moveco",
          booking_ref: booking.booking_ref,
          scheduled_date: booking.scheduled_date,
          window: booking.window,
          total_charged_eur: totalEur,
          idempotency_key: args.idempotency_key,
          issued_at: new Date().toISOString(),
        };
        const envelope = await helpers.signReceipt(receiptBody);
        const out = {
          ok: true,
          execution_state: "COMMITTED",
          status: "CONFIRMED",
          booking,
          receipt_envelope: envelope,
        };
        helpers.idempotencyStore.set(args.idempotency_key, out);
        if (holdKey !== null) helpers.holds.delete(holdKey);
        return out;
      },
      async get_booking_status(state, args, helpers) {
        if (args.idempotency_key && helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const booking = state.bookings[args.booking_ref];
        if (!booking) return { execution_state: "NOT_FOUND_NEVER_EXECUTED" };
        return {
          execution_state: args.idempotency_key ? "NOT_FOUND_NEVER_EXECUTED" : "OBSERVED_CURRENT",
          booking,
        };
      },
    },
  };
}

export function createPermitFlowDefinition({ host = "127.0.0.1", port = 8082, openAs = "localhost" } = {}) {
  return {
    providerId: "permitflow",
    providerName: "PermitFlow Civic Prep (Demo)",
    siteFolder: path.join(REPO_ROOT, "apps", "demo-permitflow"),
    host,
    port,
    openAs,
    createInitialState: () => ({
      version: 1,
      injected_scenario: "normal",
      municipal_disclaimer:
        "Demonstration civic dossier preparation service only. Does not access municipal databases or issue official government permits.",
      dossiers: {
        "PF-2049": {
          booking_ref: "PF-2049",
          zone: "Zone B Curbside Bay (15m)",
          status: "PREPARED_DOSSIER",
          scheduled_date: "2027-11-16",
          window: "07:30–14:00",
          prep_fee_eur: 35,
          amendment_fee_eur: 10,
        },
      },
    }),
    mcpTools: [
      {
        name: "check_bay_eligibility",
        description: "Check public curbside loading-bay rules and dossier amendment quote in the demo environment.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "target_date"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            target_date: { type: "string", format: "date" },
          },
        },
      },
      {
        name: "prepare_permit_date_update",
        description: "Update the prepared demonstration permit request dossier for a new target date (never mutates real government records).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "new_date", "offer_id", "idempotency_key"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            new_date: { type: "string", format: "date" },
            window: { type: "string", maxLength: 64 },
            offer_id: { type: "string", minLength: 3, maxLength: 96 },
            hold_id: { type: "string", maxLength: 96 },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
          },
        },
      },
      {
        name: "get_dossier_status",
        description: "Inspect prepared permit dossier state and reconcile by idempotency_key.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            idempotency_key: { type: "string", maxLength: 120 },
          },
        },
      },
    ],
    handlers: {
      async check_bay_eligibility(state, args, helpers) {
        const d = state.dossiers[args.booking_ref];
        if (!d) return { ok: false, reason: `Dossier ${args.booking_ref} not found.` };
        return {
          ok: true,
          simulation_service: true,
          municipal_disclaimer: state.municipal_disclaimer,
          current_dossier: d,
          offers: [
            {
              offer_id: `off_permitflow_${args.target_date}`,
              commitment_id: "cmt_permitflow_bay",
              provider_id: "permitflow",
              provider_name: "PermitFlow Civic Prep (Demo)",
              provider_origin: helpers.origin,
              raw_capability: "prepare_permit_date_update",
              semantic_kind: "PREPARE_PERMIT_DOSSIER",
              proposed_date: args.target_date,
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
              expires_at: "2027-12-30T23:59:59Z",
              disclosure_note: "Updates demonstration permit application draft only; citizen files final municipal PDF.",
            },
          ],
        };
      },
      async prepare_permit_date_update(state, args, helpers) {
        if (helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const d = state.dossiers[args.booking_ref];
        if (!d) return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "Dossier not found." };
        d.scheduled_date = args.new_date;
        d.prep_fee_eur = 45;
        d.status = "PREPARED_DOSSIER";
        state.version += 1;

        const receiptBody = {
          receipt_id: `rcpt_pf_${state.version}`,
          provider_id: "permitflow",
          booking_ref: d.booking_ref,
          scheduled_date: d.scheduled_date,
          window: d.window,
          total_charged_eur: 45,
          idempotency_key: args.idempotency_key,
          issued_at: new Date().toISOString(),
        };
        const envelope = await helpers.signReceipt(receiptBody);
        const out = {
          ok: true,
          execution_state: "COMMITTED",
          status: "PREPARED_DOSSIER",
          municipal_disclaimer: state.municipal_disclaimer,
          dossier: d,
          receipt_envelope: envelope,
        };
        helpers.idempotencyStore.set(args.idempotency_key, out);
        return out;
      },
      async get_dossier_status(state, args, helpers) {
        if (args.idempotency_key && helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const d = state.dossiers[args.booking_ref];
        if (!d) return { execution_state: "NOT_FOUND_NEVER_EXECUTED" };
        return {
          execution_state: args.idempotency_key ? "NOT_FOUND_NEVER_EXECUTED" : "OBSERVED_CURRENT",
          dossier: d,
        };
      },
    },
  };
}

export function createHomeConnectDefinition({ host = "127.0.0.1", port = 8083, openAs = "127.0.0.1" } = {}) {
  return {
    providerId: "homeconnect",
    providerName: "HomeConnect Fiber (Demo)",
    siteFolder: path.join(REPO_ROOT, "apps", "demo-homeconnect"),
    host,
    port,
    openAs,
    createInitialState: () => ({
      version: 1,
      injected_scenario: "normal",
      appointments: {
        "HC-5510": {
          booking_ref: "HC-5510",
          plan: "2 Gbps Symmetric Fiber + ONT Splice",
          status: "CONFIRMED",
          scheduled_date: "2027-11-16",
          window: "14:00–17:00",
          install_fee_eur: 49,
          reschedule_fee_eur: 0,
          cancellation_fee_eur: 30,
        },
      },
      windows: [
        { offer_id: "off_homeconnect_fri_pm", date: "2027-11-19", window: "14:00–17:00", price_eur: 49 },
        { offer_id: "off_homeconnect_sat_am", date: "2027-11-20", window: "09:00–12:00", price_eur: 39 },
      ],
    }),
    mcpTools: [
      {
        name: "list_technician_windows",
        description: "List available fiber technician installation windows on or after the target move date.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "target_date"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            target_date: { type: "string", format: "date" },
          },
        },
      },
      {
        name: "hold_technician_slot",
        description: "Hold a technician slot for 10 minutes while keeping the existing appointment active.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "offer_id", "proposed_date", "idempotency_key"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            offer_id: { type: "string", minLength: 3, maxLength: 96 },
            proposed_date: { type: "string", format: "date" },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
          },
        },
      },
      {
        name: "change_fiber_appointment",
        description: "Commit a confirmed fiber technician appointment date change.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "new_date", "offer_id", "idempotency_key"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            new_date: { type: "string", format: "date" },
            window: { type: "string", maxLength: 64 },
            offer_id: { type: "string", minLength: 3, maxLength: 96 },
            hold_id: { type: "string", maxLength: 96 },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
          },
        },
      },
      RELEASE_HOLD_TOOL,
      {
        name: "get_appointment_status",
        description: "Reconcile fiber appointment state by booking_ref and optional idempotency_key.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            idempotency_key: { type: "string", maxLength: 120 },
          },
        },
      },
    ],
    handlers: {
      release_hold: releaseTemporaryHold,
      async list_technician_windows(state, args, helpers) {
        const appt = state.appointments[args.booking_ref];
        if (!appt) return { ok: false, reason: `Appointment ${args.booking_ref} not found.` };
        const offers = state.windows
          .filter((w) => w.date >= args.target_date)
          .map((w) => ({
            offer_id: w.offer_id,
            commitment_id: "cmt_homeconnect_fiber",
            provider_id: "homeconnect",
            provider_name: "HomeConnect Fiber (Demo)",
            provider_origin: helpers.origin,
            raw_capability: "change_fiber_appointment",
            semantic_kind: "RESCHEDULE_IN_PLACE",
            proposed_date: w.date,
            window: w.window,
            base_price_eur: w.price_eur,
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
            expires_at: "2027-12-30T23:59:59Z",
            disclosure_note:
              w.price_eur < 49
                ? "Off-peak Saturday window saves €10 installation fee."
                : "Same-day Friday afternoon fiber activation window.",
          }));
        return { ok: true, simulation_service: true, current_appointment: appt, offers };
      },
      async hold_technician_slot(state, args, helpers) {
        if (helpers.holds.has(args.idempotency_key)) return helpers.holds.get(args.idempotency_key);
        const hold = {
          ok: true,
          hold_id: `hold_hc_${crypto.randomUUID()}`,
          booking_ref: args.booking_ref,
          offer_id: args.offer_id,
          proposed_date: args.proposed_date,
          original_booking_preserved: true,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
        helpers.holds.set(args.idempotency_key, hold);
        return hold;
      },
      async change_fiber_appointment(state, args, helpers) {
        if (helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const holdKey = args.hold_id ? findActiveHoldKey(helpers.holds, args) : null;
        if (args.hold_id && holdKey === null) {
          return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "The exact technician hold is no longer active." };
        }
        const appt = state.appointments[args.booking_ref];
        const win = state.windows.find((w) => w.offer_id === args.offer_id && w.date === args.new_date);
        if (!appt || !win) {
          return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "Invalid appointment or window." };
        }
        appt.scheduled_date = win.date;
        appt.window = win.window;
        appt.install_fee_eur = win.price_eur;
        state.version += 1;
        const receiptBody = {
          receipt_id: `rcpt_hc_${state.version}`,
          provider_id: "homeconnect",
          booking_ref: appt.booking_ref,
          scheduled_date: appt.scheduled_date,
          window: appt.window,
          total_charged_eur: win.price_eur,
          idempotency_key: args.idempotency_key,
          issued_at: new Date().toISOString(),
        };
        const envelope = await helpers.signReceipt(receiptBody);
        const out = {
          ok: true,
          execution_state: "COMMITTED",
          status: "CONFIRMED",
          appointment: appt,
          receipt_envelope: envelope,
        };
        helpers.idempotencyStore.set(args.idempotency_key, out);
        if (holdKey !== null) helpers.holds.delete(holdKey);
        return out;
      },
      async get_appointment_status(state, args, helpers) {
        if (args.idempotency_key && helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const appt = state.appointments[args.booking_ref];
        if (!appt) return { execution_state: "NOT_FOUND_NEVER_EXECUTED" };
        return {
          execution_state: args.idempotency_key ? "NOT_FOUND_NEVER_EXECUTED" : "OBSERVED_CURRENT",
          appointment: appt,
        };
      },
    },
  };
}

export function createPowerFlowDefinition({ host = "127.0.0.1", port = 8084, openAs = "localhost" } = {}) {
  return {
    providerId: "powerflow",
    providerName: "PowerFlow Energy (Demo)",
    siteFolder: path.join(REPO_ROOT, "apps", "demo-powerflow"),
    host,
    port,
    openAs,
    createInitialState: () => ({
      version: 1,
      injected_scenario: "normal",
      activations: {
        "PFW-9921": {
          booking_ref: "PFW-9921",
          meter_point: "PRM-7510299481",
          status: "CONFIRMED",
          scheduled_date: "2027-11-16",
          window: "08:00–12:00",
          activation_fee_eur: 30,
          reschedule_fee_eur: 0,
          cancellation_fee_eur: 15,
        },
      },
    }),
    mcpTools: [
      {
        name: "check_grid_windows",
        description: "Check smart-meter remote activation windows and whether keeping an earlier date remains valid.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "target_date"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            target_date: { type: "string", format: "date" },
          },
        },
      },
      {
        name: "shift_grid_activation",
        description: "Commit a grid activation date modification.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref", "new_date", "offer_id", "idempotency_key"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            new_date: { type: "string", format: "date" },
            window: { type: "string", maxLength: 64 },
            offer_id: { type: "string", minLength: 3, maxLength: 96 },
            hold_id: { type: "string", maxLength: 96 },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
          },
        },
      },
      {
        name: "get_activation_status",
        description: "Reconcile smart-meter activation schedule by booking_ref and optional idempotency_key.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["booking_ref"],
          properties: {
            booking_ref: { type: "string", minLength: 3, maxLength: 32 },
            idempotency_key: { type: "string", maxLength: 120 },
          },
        },
      },
    ],
    handlers: {
      async check_grid_windows(state, args, helpers) {
        const act = state.activations[args.booking_ref];
        if (!act) return { ok: false, reason: `Activation ${args.booking_ref} not found.` };
        return {
          ok: true,
          simulation_service: true,
          current_activation: act,
          can_keep_existing_earlier_date: act.scheduled_date <= args.target_date,
          offers: [
            {
              offer_id: `off_powerflow_${args.target_date}`,
              commitment_id: "cmt_powerflow_grid",
              provider_id: "powerflow",
              provider_name: "PowerFlow Energy (Demo)",
              provider_origin: helpers.origin,
              raw_capability: "shift_grid_activation",
              semantic_kind: "RESCHEDULE_IN_PLACE",
              proposed_date: args.target_date,
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
              expires_at: "2027-12-30T23:59:59Z",
              disclosure_note:
                "Optional zero-fee shift to Friday, OR keep existing Tuesday activation untouched (Minimal-Change Solver prefers keeping Tuesday).",
            },
          ],
        };
      },
      async shift_grid_activation(state, args, helpers) {
        if (helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const act = state.activations[args.booking_ref];
        if (!act) return { execution_state: "REJECTED_NO_SIDE_EFFECT", reason: "Activation not found." };
        act.scheduled_date = args.new_date;
        state.version += 1;
        const receiptBody = {
          receipt_id: `rcpt_pfw_${state.version}`,
          provider_id: "powerflow",
          booking_ref: act.booking_ref,
          scheduled_date: act.scheduled_date,
          window: act.window,
          total_charged_eur: 30,
          idempotency_key: args.idempotency_key,
          issued_at: new Date().toISOString(),
        };
        const envelope = await helpers.signReceipt(receiptBody);
        const out = {
          ok: true,
          execution_state: "COMMITTED",
          status: "CONFIRMED",
          activation: act,
          receipt_envelope: envelope,
        };
        helpers.idempotencyStore.set(args.idempotency_key, out);
        return out;
      },
      async get_activation_status(state, args, helpers) {
        if (args.idempotency_key && helpers.idempotencyStore.has(args.idempotency_key)) {
          return helpers.idempotencyStore.get(args.idempotency_key);
        }
        const act = state.activations[args.booking_ref];
        if (!act) return { execution_state: "NOT_FOUND_NEVER_EXECUTED" };
        return {
          execution_state: args.idempotency_key ? "NOT_FOUND_NEVER_EXECUTED" : "OBSERVED_CURRENT",
          activation: act,
        };
      },
    },
  };
}

export function instantiateAllPeerHosts(ports = {}) {
  return {
    moveco: new IndependentProviderHost(createMoveCoDefinition({ port: ports.moveco ?? 8081 })),
    permitflow: new IndependentProviderHost(createPermitFlowDefinition({ port: ports.permitflow ?? 8082 })),
    homeconnect: new IndependentProviderHost(createHomeConnectDefinition({ port: ports.homeconnect ?? 8083 })),
    powerflow: new IndependentProviderHost(createPowerFlowDefinition({ port: ports.powerflow ?? 8084 })),
  };
}
