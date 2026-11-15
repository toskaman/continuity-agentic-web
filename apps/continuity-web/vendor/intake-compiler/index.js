/**
 * @module @continuity/intake-compiler
 * Unstructured Confirmation Email / RFC 5545 `.ics` Calendar Intake Compiler,
 * Multi-Domain Scenario Library, and Verifiable `.ics` / Cryptographic Audit Exporter.
 *
 * Turns CONTINUITY from a single relocation fixture into a universal, domain-agnostic
 * Multi-Provider Change Coordinator that works on:
 *  1. Curated Multi-Domain Scenarios (`home_relocation`, `outpatient_surgery`, `product_launch_expo`)
 *  2. Any pasted confirmation emails / SMS booking threads
 *  3. Standard RFC 5545 `.ics` calendar files exported from Google, Apple, or Outlook Calendar.
 */

import { normalizePeerOffer } from "../capability-adapter/index.js";
import { addDaysIso, createSignatureMoveMission, diffDaysIso } from "../mission-core/index.js";
import { EDGE_TYPES } from "../mission-graph/index.js";
import { generateDemoProviderKeyPair, ReceiptVerifier, signProviderReceipt } from "../proof-verifier/index.js";
import { OperationLedger } from "../outcome-reconciliation/index.js";
import { canonicalizeJson, isPlainObject, isValidIsoDate, sanitizeJson, sha256Hex } from "../shared-schemas/index.js";
import { verifyBlindedBudgetAttestation } from "../zk-budget-attestation/index.js";

export const SAMPLE_RAW_CONFIRMATION_EMAILS = [
  "Subject: [ANCHOR] High-Speed Rail Charter Confirmed — Ref: HSR-4410",
  "Provider: RailWays Express · Date: 2026-11-17 · Window: 08:30–11:30",
  "Price: €210 · Reschedule fee: €15 · Cancel fee: €55 · Hold supported",
  "---",
  "Subject: Station Porter & Mobility Assistance — Ref: SPA-108",
  "Provider: GareAssist Mobility · Date: 2026-11-17 · Window: 08:00–12:00",
  "Price: €35 · Reschedule fee: €5 · Cancel fee: €15 · Same-day platform assistance",
  "---",
  "Subject: Pre-Travel PCR & Travel Clearance Certificate — Ref: LAB-992",
  "Provider: MediClear Lab · Date: 2026-11-16 · Window: 09:00–10:00",
  "Price: €45 · Reschedule fee: €0 · Cancel fee: €20 · Prerequisite before departure",
  "---",
  "Subject: Boutique Hotel Check-In & Key Handover — Ref: HTL-7731",
  "Provider: Hôtel Lumière · Date: 2026-11-17 · Window: 15:00–20:00",
  "Price: €185 · Reschedule fee: €20 · Cancel fee: €90 · Hold supported · After arrival",
  "---",
  "Subject: 10-Day European Roaming eSIM Pass — Ref: SIM-5002",
  "Provider: EuroData Mobile · Date: 2026-11-15 to 2026-11-26 · Window: All-day",
  "Price: €29 · Reschedule fee: €10 · Cancel fee: €15 · Multi-day coverage span",
].join("\n");

export const SAMPLE_HYBRID_ICS_CALENDAR = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//CONTINUITY//Hybrid Open Agentic Web + Legacy Schedule//EN",
  "BEGIN:VEVENT",
  "UID:MC-8841@moveco.demo",
  "DTSTART:20261117T080000Z",
  "DTEND:20261117T130000Z",
  "SUMMARY:[ANCHOR] Residential Moving Van & 3-Mover Crew",
  "LOCATION:MoveCo Express (Open Agentic Web Peer)",
  "URL:https://gpaschercher-sudo.github.io/moveco-agentic-peer/",
  "X-AGENTIC-NETWORK:https://gpaschercher-sudo.github.io/moveco-agentic-peer/moveco_dispatch",
  "DESCRIPTION:Ref: MC-8841 | Price: €390 | Reschedule fee: €25 | Cancel fee: €120",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:ELV-204@bellecour-syndic.example",
  "DTSTART:20261117T083000Z",
  "DTEND:20261117T123000Z",
  "SUMMARY:Building Service Freight Elevator & Courtyard Key",
  "LOCATION:Syndic Résidence Bellecour (Legacy Email Vendor)",
  "DESCRIPTION:Ref: ELV-204 | Same-day courtyard access | Price: €40 | Reschedule fee: €10 | Cancel fee: €25",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:HC-5510@homeconnect.demo",
  "DTSTART:20261117T140000Z",
  "DTEND:20261117T170000Z",
  "SUMMARY:FTTH Fiber Optic Technician Installation",
  "LOCATION:HomeConnect Fiber (Open Agentic Web Peer)",
  "URL:https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/",
  "X-AGENTIC-NETWORK:https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/homeconnect_scheduler",
  "DESCRIPTION:Ref: HC-5510 | After arrival install | Price: €49 | Reschedule fee: €0 | Cancel fee: €30",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:BOX-910@cityvault.example",
  "DTSTART:20261110",
  "DTEND:20261130",
  "SUMMARY:20-Day Climate-Controlled Transit Storage Unit",
  "LOCATION:CityVault Storage",
  "DESCRIPTION:Ref: BOX-910 | Price: €95 | Reschedule fee: €20 | Cancel fee: €45",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function normalizeSafeAgenticUrl(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.username || u.password) return null;
    const isLoopback = ["127.0.0.1", "localhost"].includes(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && isLoopback)) {
      return u.href;
    }
  } catch {}
  return null;
}

function inferLivePeerProviderId(it) {
  const hay = `${it.peerNetworkUrl || ""} ${it.providerOrigin || ""} ${it.providerName || ""}`.toLowerCase();
  if (/moveco[-_]agentic[-_]peer|moveco_dispatch|:8081\b|:18081\b|:28081\b/.test(hay)) return "moveco";
  if (/permitflow[-_]agentic[-_]peer|permitflow_advisor|:8082\b|:18082\b|:28082\b/.test(hay)) return "permitflow";
  if (/homeconnect[-_]agentic[-_]peer|homeconnect_scheduler|:8083\b|:18083\b|:28083\b/.test(hay)) return "homeconnect";
  if (/powerflow[-_]agentic[-_]peer|powerflow_grid|:8084\b|:18084\b|:28084\b/.test(hay)) return "powerflow";
  return null;
}

export const SCENARIO_CATALOG = Object.freeze([
  {
    id: "home_relocation",
    shortLabel: "Home Relocation (6 Bookings · 4 Live Peers)",
    defaultPrompt: [
      "My move was originally scheduled for Tuesday, but I need to move everything to Friday.",
      "Update every affected service.",
      "Keep my current reservations until replacements are secured.",
      "Maintain my total budget below €700.",
      "Do not cancel anything or approve additional fees without my confirmation.",
    ].join("\n"),
  },
  {
    id: "outpatient_surgery",
    shortLabel: "Outpatient Surgery & Care (5 Bookings)",
    defaultPrompt: [
      "My knee arthroscopy moved from Tuesday to Friday.",
      "Realign pre-op bloodwork, wheelchair discharge transport, and post-op home physiotherapy.",
      "Hold replacement slots before changing existing appointments and stay below €560.",
    ].join("\n"),
  },
  {
    id: "product_launch_expo",
    shortLabel: "Product Launch & Freight Delay (6 Bookings)",
    defaultPrompt: [
      "Our customs demo hardware air-freight slipped from Tuesday to Friday.",
      "Update dock crane marshalling and stage AV rigging without touching unaffected passes or Saturday dinner.",
      "Keep total mission cost below €1980 and require my confirmation.",
    ].join("\n"),
  },
]);

/**
 * Create a complete declarative mission for one of the built-in multi-domain scenarios.
 * @param {string} scenarioId
 * @param {object} [options]
 * @param {Record<string, string>} [options.origins]
 */
export function createScenarioMission(scenarioId, options = {}) {
  if (!scenarioId || scenarioId === "home_relocation") {
    return createSignatureMoveMission(options);
  }

  if (scenarioId === "outpatient_surgery") {
    return {
      mission_id: "care_knee_arthroscopy_002",
      title: "Outpatient Knee Arthroscopy & Post-Op Recovery",
      mission_type: "care_coordination",
      simulation_disclosure: "Demonstration healthcare scheduling scenario — synthetic non-PHI appointments only.",
      created_at: "2026-11-13T09:00:00Z",
      anchor_date: "2026-11-17",
      anchor_commitment_id: "cmt_ortho_surgery",
      primary_change_field: "appointment_date",
      destination_summary: "Clinique Orthopédique St-Jean · Wing B",
      authoritative_invariants: {
        maximum_budget_eur: 560,
        preserve_existing_commitments: true,
        destination_must_remain_unchanged: true,
        unauthorized_cancellation: false,
        no_additional_purchases_without_approval: true,
        privacy_data_minimization: true,
      },
      commitments: [
        {
          id: "cmt_ortho_surgery",
          title: "Day-Hospital Knee Arthroscopy",
          category: "clinical_procedure",
          provider_id: "orthoclinic_sim",
          provider_name: "OrthoClinic St-Jean (Demo)",
          provider_origin: "https://demo.orthoclinic.invalid",
          peer_network_url: null,
          booking_ref: "OR-4102",
          status: "CONFIRMED",
          scheduled_date: "2026-11-17",
          window: "07:30–12:30",
          price_eur: 240,
          cancellation_fee_eur: 80,
          reschedule_fee_eur: 20,
          supports_hold: true,
          reversible_reschedule: false,
          notes: "Primary surgical slot anchor.",
        },
        {
          id: "cmt_preop_lab",
          title: "Coagulation & Pre-Op Blood Panel",
          category: "diagnostics",
          provider_id: "biocheck_sim",
          provider_name: "BioCheck Diagnostics (Demo)",
          provider_origin: "https://demo.biocheck.invalid",
          peer_network_url: null,
          booking_ref: "LAB-889",
          status: "CONFIRMED",
          scheduled_date: "2026-11-16",
          window: "08:00–09:30",
          price_eur: 55,
          cancellation_fee_eur: 15,
          reschedule_fee_eur: 0,
          supports_hold: true,
          reversible_reschedule: true,
          notes: "Valid up to 4 days prior to surgery; kept if still within validity window, or shifted -1 day.",
        },
        {
          id: "cmt_med_transport",
          title: "Wheelchair Discharge Medical Shuttle",
          category: "medical_transport",
          provider_id: "careride_sim",
          provider_name: "CareRide Shuttle (Demo)",
          provider_origin: "https://demo.careride.invalid",
          peer_network_url: null,
          booking_ref: "CR-3021",
          status: "CONFIRMED",
          scheduled_date: "2026-11-17",
          window: "12:30–14:00",
          price_eur: 65,
          cancellation_fee_eur: 25,
          reschedule_fee_eur: 10,
          supports_hold: true,
          reversible_reschedule: false,
          notes: "Must match exact outpatient surgical discharge day.",
        },
        {
          id: "cmt_home_physio",
          title: "Post-Op Day+1 Home Physiotherapy",
          category: "rehabilitation",
          provider_id: "kinedom_sim",
          provider_name: "KinéDom Rehab (Demo)",
          provider_origin: "https://demo.kinedom.invalid",
          peer_network_url: null,
          booking_ref: "KD-1180",
          status: "CONFIRMED",
          scheduled_date: "2026-11-18",
          window: "10:00–11:30",
          price_eur: 75,
          cancellation_fee_eur: 30,
          reschedule_fee_eur: 15,
          supports_hold: true,
          reversible_reschedule: false,
          notes: "Must take place 1 to 3 days after arthroscopy.",
        },
        {
          id: "cmt_brace_rental",
          title: "Cryo-Compression Knee Brace (21-Day)",
          category: "medical_equipment",
          provider_id: "medequip_sim",
          provider_name: "MedEquip Direct (Demo)",
          provider_origin: "local://fixture",
          peer_network_url: null,
          booking_ref: "ME-7740",
          status: "CONFIRMED",
          scheduled_date: "2026-11-14",
          valid_until: "2026-12-05",
          window: "21-day home rental Nov 14 – Dec 5",
          price_eur: 45,
          cancellation_fee_eur: 20,
          reschedule_fee_eur: 25,
          supports_hold: false,
          reversible_reschedule: false,
          notes: "Covers Nov 14–Dec 5; unaffected by a same-week surgical shift.",
        },
      ],
      dependencies: [
        {
          from: "cmt_ortho_surgery",
          to: "cmt_med_transport",
          type: EDGE_TYPES.SAME_DAY_REQUIRED,
          rationale: "Discharge wheelchair shuttle must operate on the exact day of surgery.",
          rule: { minOffsetDays: 0, maxOffsetDays: 0 },
        },
        {
          from: "cmt_ortho_surgery",
          to: "cmt_home_physio",
          type: EDGE_TYPES.ON_OR_AFTER,
          rationale: "Initial post-op physiotherapy must occur 1–3 days after arthroscopy.",
          rule: { minOffsetDays: 1, maxOffsetDays: 3 },
        },
        {
          from: "cmt_ortho_surgery",
          to: "cmt_preop_lab",
          type: EDGE_TYPES.SAME_DAY_REQUIRED,
          rationale: "Pre-op coagulation panel can remain earlier in the week or optionally align closer to surgery.",
          rule: { softAlignmentOnly: true },
        },
        {
          from: "cmt_ortho_surgery",
          to: "cmt_brace_rental",
          type: EDGE_TYPES.WITHIN_COVERAGE_SPAN,
          rationale: "21-day cryo brace rental already spans Nov 14 through Dec 5.",
          rule: { coverageStart: "2026-11-14", coverageEnd: "2026-12-05" },
        },
      ],
    };
  }

  if (scenarioId === "product_launch_expo") {
    return {
      mission_id: "expo_launch_freight_003",
      title: "European Hardware Keynote & Customs Freight",
      mission_type: "event_coordination",
      simulation_disclosure: "Demonstration B2B event & freight logistics scenario.",
      created_at: "2026-11-13T09:00:00Z",
      anchor_date: "2026-11-17",
      anchor_commitment_id: "cmt_booth_freight",
      primary_change_field: "move_date",
      destination_summary: "Palais des Congrès · Hall A4",
      authoritative_invariants: {
        maximum_budget_eur: 1980,
        preserve_existing_commitments: true,
        destination_must_remain_unchanged: true,
        unauthorized_cancellation: false,
        no_additional_purchases_without_approval: true,
        privacy_data_minimization: true,
      },
      commitments: [
        {
          id: "cmt_booth_freight",
          title: "Bonded Demo Hardware Air-Freight",
          category: "freight",
          provider_id: "eurocargo_sim",
          provider_name: "EuroCargo Express (Demo)",
          provider_origin: "https://demo.eurocargo.invalid",
          peer_network_url: null,
          booking_ref: "EC-9012",
          status: "CONFIRMED",
          scheduled_date: "2026-11-17",
          window: "08:00–11:00",
          price_eur: 680,
          cancellation_fee_eur: 190,
          reschedule_fee_eur: 45,
          supports_hold: true,
          reversible_reschedule: false,
          notes: "Primary bonded booth hardware delivery.",
        },
        {
          id: "cmt_dock_slot",
          title: "Palais Loading Dock & Forklift Slot",
          category: "venue_dock",
          provider_id: "expovenue_sim",
          provider_name: "ExpoVenue Logistics (Demo)",
          provider_origin: "https://demo.expovenue.invalid",
          peer_network_url: null,
          booking_ref: "EV-2210",
          status: "CONFIRMED",
          scheduled_date: "2026-11-17",
          window: "08:30–11:30",
          price_eur: 190,
          cancellation_fee_eur: 60,
          reschedule_fee_eur: 25,
          supports_hold: true,
          reversible_reschedule: true,
          notes: "Dock crane must match exact freight truck arrival day.",
        },
        {
          id: "cmt_av_rigging",
          title: "LED Wall & Stage Calibration Crew",
          category: "av_production",
          provider_id: "stagecraft_sim",
          provider_name: "StageCraft AV (Demo)",
          provider_origin: "https://demo.stagecraft.invalid",
          peer_network_url: null,
          booking_ref: "SC-4401",
          status: "CONFIRMED",
          scheduled_date: "2026-11-17",
          window: "13:00–18:00",
          price_eur: 420,
          cancellation_fee_eur: 140,
          reschedule_fee_eur: 30,
          supports_hold: true,
          reversible_reschedule: false,
          notes: "Cannot rig demo stage before hardware crates arrive.",
        },
        {
          id: "cmt_live_captions",
          title: "Multilingual Live Captioning Stream",
          category: "accessibility",
          provider_id: "openstage_sim",
          provider_name: "OpenStage Captions (Demo)",
          provider_origin: "local://fixture",
          peer_network_url: null,
          booking_ref: "OS-6120",
          status: "CONFIRMED",
          scheduled_date: "2026-11-20",
          window: "18:00–20:30",
          price_eur: 210,
          cancellation_fee_eur: 50,
          reschedule_fee_eur: 0,
          supports_hold: false,
          reversible_reschedule: true,
          notes: "Already booked for Friday evening keynote — compatible if setup finishes Friday afternoon!",
        },
        {
          id: "cmt_badge_pass",
          title: "Exhibitor Security Passes (Nov 16–22)",
          category: "accreditation",
          provider_id: "expopass_sim",
          provider_name: "ExpoPass Registry (Demo)",
          provider_origin: "local://fixture",
          peer_network_url: null,
          booking_ref: "EP-1009",
          status: "CONFIRMED",
          scheduled_date: "2026-11-16",
          valid_until: "2026-11-22",
          window: "All-week access Nov 16 – Nov 22",
          price_eur: 140,
          cancellation_fee_eur: 40,
          reschedule_fee_eur: 35,
          supports_hold: false,
          reversible_reschedule: false,
          notes: "Valid all week — unaffected.",
        },
        {
          id: "cmt_press_dinner",
          title: "Saturday Post-Keynote Press Dinner",
          category: "hospitality",
          provider_id: "bistrolumiere_sim",
          provider_name: "Bistro Lumière (Demo)",
          provider_origin: "local://fixture",
          peer_network_url: null,
          booking_ref: "BL-3390",
          status: "CONFIRMED",
          scheduled_date: "2026-11-21",
          window: "19:30–22:30",
          price_eur: 180,
          cancellation_fee_eur: 75,
          reschedule_fee_eur: 50,
          supports_hold: false,
          reversible_reschedule: false,
          notes: "Saturday evening — unaffected if freight & keynote complete by Friday.",
        },
      ],
      dependencies: [
        {
          from: "cmt_booth_freight",
          to: "cmt_dock_slot",
          type: EDGE_TYPES.SAME_DAY_REQUIRED,
          rationale: "Venue forklift marshalling slot must match exact freight arrival date.",
          rule: { minOffsetDays: 0, maxOffsetDays: 0 },
        },
        {
          from: "cmt_booth_freight",
          to: "cmt_av_rigging",
          type: EDGE_TYPES.ON_OR_AFTER,
          rationale: "Stage AV crew requires physical demo hardware crates on site.",
          rule: { minOffsetDays: 0, maxOffsetDays: 1 },
        },
        {
          from: "cmt_booth_freight",
          to: "cmt_live_captions",
          type: EDGE_TYPES.ON_OR_AFTER,
          rationale: "Keynote captioning runs on or after booth setup day.",
          rule: { minOffsetDays: 0, maxOffsetDays: 4 },
        },
        {
          from: "cmt_booth_freight",
          to: "cmt_badge_pass",
          type: EDGE_TYPES.WITHIN_COVERAGE_SPAN,
          rationale: "Exhibitor passes cover Nov 16–Nov 22.",
          rule: { coverageStart: "2026-11-16", coverageEnd: "2026-11-22" },
        },
        {
          from: "cmt_booth_freight",
          to: "cmt_press_dinner",
          type: EDGE_TYPES.ON_OR_AFTER,
          rationale: "Post-keynote dinner occurs after freight & keynote.",
          rule: { minOffsetDays: 0, maxOffsetDays: 10 },
        },
      ],
    };
  }

  throw new Error(`Unknown scenarioId "${scenarioId}".`);
}

function parseIcsDateToIso(rawVal) {
  const m = String(rawVal || "").trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidIsoDate(iso)) return null;
  const hhmm = m[4] && m[5] ? `${m[4]}:${m[5]}` : null;
  return { iso, hhmm };
}

function extractMoneyField(text, pattern, fallback) {
  const m = text.match(pattern);
  if (!m) return fallback;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Compile either an RFC 5545 `.ics` calendar file OR raw pasted confirmation emails / booking notes
 * into an executable, schema-clean `Mission` with automatically inferred semantic dependency edges.
 *
 * @param {string} rawInput
 * @param {object} [options]
 * @param {number} [options.budgetMultiplier=1.18]
 */
export function compileUnstructuredIntake(rawInput, options = {}) {
  const text = String(rawInput || "").trim();
  if (!text) {
    throw new Error("Paste at least two booking confirmations or upload a valid .ics calendar file.");
  }
  if (text.length > 65_536) {
    throw new Error("Intake text exceeds 64 KB safety bound.");
  }

  const isIcs = /BEGIN:VCALENDAR/i.test(text) && /BEGIN:VEVENT/i.test(text);
  const isJsonArray = !isIcs && text.startsWith("[");
  const items = isIcs
    ? parseIcsEvents(text)
    : isJsonArray
      ? parseJsonBookingArray(text)
      : parseConfirmationEmailBlocks(text);

  if (items.length < 2) {
    throw new Error(
      `Found ${items.length} commitment(s); provide at least 2 commitments (separated by "---" or VEVENT blocks) to build a multi-provider dependency graph.`,
    );
  }

  // Pick anchor commitment: explicit [ANCHOR] tag, or primary logistics/procedure keyword, or first item
  let anchorIdx = items.findIndex((it) => it.explicitAnchor);
  if (anchorIdx < 0) {
    anchorIdx = items.findIndex((it) =>
      /\b(move|moving|van|flight|rail|train|charter|surgery|arthroscopy|freight|keynote)\b/i.test(it.title),
    );
  }
  if (anchorIdx < 0) anchorIdx = 0;

  const anchor = items[anchorIdx];
  const commitments = items.map((it, idx) => {
    const livePeerId = inferLivePeerProviderId(it);
    return {
      id: `cmt_imp_${idx + 1}`,
      title: it.title.slice(0, 64),
      category: it.category,
      provider_id: livePeerId || `imp_prov_${idx + 1}`,
      provider_name: it.providerName.slice(0, 56),
      provider_origin: it.providerOrigin || `https://imported-peer-${idx + 1}.example`,
      peer_network_url: it.peerNetworkUrl || null,
      booking_ref: it.bookingRef,
      status: "CONFIRMED",
      scheduled_date: it.scheduledDate,
      ...(it.validUntil ? { valid_until: it.validUntil } : {}),
      window: it.window,
      price_eur: it.priceEur,
      cancellation_fee_eur: it.cancelFeeEur,
      reschedule_fee_eur: it.rescheduleFeeEur,
      supports_hold: it.supportsHold,
      reversible_reschedule: it.rescheduleFeeEur === 0,
      notes: it.notes,
    };
  });

  const anchorCommitment = commitments[anchorIdx];
  const dependencies = [];

  commitments.forEach((c, idx) => {
    if (idx === anchorIdx) return;
    const rawBlock = items[idx].rawText;

    if (c.valid_until && diffDaysIso(c.scheduled_date, c.valid_until) >= 2) {
      dependencies.push({
        from: anchorCommitment.id,
        to: c.id,
        type: EDGE_TYPES.WITHIN_COVERAGE_SPAN,
        rationale: `${c.title} is a multi-day coverage span [${c.scheduled_date}..${c.valid_until}].`,
        rule: { coverageStart: c.scheduled_date, coverageEnd: c.valid_until },
      });
      return;
    }

    const dayDelta = diffDaysIso(anchorCommitment.scheduled_date, c.scheduled_date);

    if (dayDelta < 0 || /\b(pre[- ]?op|pre[- ]?travel|prerequisite|before\s+departure|power|grid)\b/i.test(rawBlock)) {
      dependencies.push({
        from: anchorCommitment.id,
        to: c.id,
        type: EDGE_TYPES.SAME_DAY_REQUIRED,
        rationale: `${c.title} is an earlier prerequisite (${c.scheduled_date}); kept intact if valid or optionally realigned.`,
        rule: { softAlignmentOnly: true },
      });
      return;
    }

    if (
      (dayDelta === 0 && /\b(same[- ]?day|permit|porter|shuttle|dock|crane|platform|parking)\b/i.test(rawBlock))
      || (dayDelta === 0 && !/\b(after|check[- ]?in|hotel|install|delivery)\b/i.test(rawBlock))
    ) {
      dependencies.push({
        from: anchorCommitment.id,
        to: c.id,
        type: EDGE_TYPES.SAME_DAY_REQUIRED,
        rationale: `${c.title} must match the exact anchor date of ${anchorCommitment.title}.`,
        rule: { minOffsetDays: 0, maxOffsetDays: 0 },
      });
      return;
    }

    dependencies.push({
      from: anchorCommitment.id,
      to: c.id,
      type: EDGE_TYPES.ON_OR_AFTER,
      rationale: `${c.title} must occur on or after ${anchorCommitment.title}.`,
      rule: { minOffsetDays: 0, maxOffsetDays: Math.max(7, dayDelta + 4) },
    });
  });

  const baselineTotal = commitments.reduce((s, c) => s + c.price_eur, 0);
  const mult = options.budgetMultiplier ?? 1.18;
  const maxBudgetEur = Math.max(baselineTotal + 40, Math.ceil((baselineTotal * mult) / 10) * 10);

  const mission = sanitizeJson({
    mission_id: `imported_mission_${commitments.length}c`,
    title: `Imported Schedule — ${anchorCommitment.title}`,
    mission_type: "custom_imported",
    simulation_disclosure: `Compiled deterministically from ${isIcs ? "RFC 5545 .ics calendar" : "pasted confirmation messages"}.`,
    created_at: new Date().toISOString(),
    anchor_date: anchorCommitment.scheduled_date,
    anchor_commitment_id: anchorCommitment.id,
    primary_change_field: "move_date",
    destination_summary: "Imported Multi-Provider Schedule",
    authoritative_invariants: {
      maximum_budget_eur: maxBudgetEur,
      preserve_existing_commitments: true,
      destination_must_remain_unchanged: true,
      unauthorized_cancellation: false,
      no_additional_purchases_without_approval: true,
      privacy_data_minimization: true,
    },
    commitments,
    dependencies,
  });

  const suggestedTarget = addDaysIso(anchorCommitment.scheduled_date, 3);

  return {
    ok: true,
    format: isIcs ? "ics" : isJsonArray ? "json" : "emails",
    mission,
    baselineTotalEur: baselineTotal,
    inferredEdgesCount: dependencies.length,
    suggestedPrompt: `Move ${anchorCommitment.title} from ${anchorCommitment.scheduled_date} to ${suggestedTarget}. Realign affected bookings, hold replacements before touching existing confirmations, and stay below €${maxBudgetEur}.`,
  };
}

function parseIcsEvents(icsText) {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)].map((m) => m[1]);
  const out = [];

  blocks.forEach((blk, i) => {
    const field = (name) => {
      const m = blk.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "im"));
      return m ? m[1].trim().replace(/\\n/g, " ").replace(/\\,/g, ",") : "";
    };
    const summary = field("SUMMARY") || `Calendar Commitment ${i + 1}`;
    const desc = field("DESCRIPTION");
    const loc = field("LOCATION");
    const uid = field("UID");
    const eventUrl = normalizeSafeAgenticUrl(field("URL") || field("X-AGENTIC-ORIGIN"));
    const agenticNetUrl = normalizeSafeAgenticUrl(field("X-AGENTIC-NETWORK"));
    const startParsed = parseIcsDateToIso(field("DTSTART"));
    const endParsed = parseIcsDateToIso(field("DTEND"));
    if (!startParsed) return;

    let validUntil = null;
    if (endParsed && diffDaysIso(startParsed.iso, endParsed.iso) >= 2) {
      validUntil = endParsed.iso;
    }

    const combined = `${summary} ${desc} ${loc}`;
    const priceEur = extractMoneyField(combined, /(?:price|cost|total|€)\s*[:=]?\s*€?\s*(\d+(?:\.\d{1,2})?)/i, 80);
    const rescheduleFeeEur = extractMoneyField(combined, /reschedule(?:\s+fee)?\s*[:=]?\s*€?\s*(\d+(?:\.\d{1,2})?)/i, 15);
    const cancelFeeEur = extractMoneyField(combined, /cancel(?:lation)?(?:\s+fee)?\s*[:=]?\s*€?\s*(\d+(?:\.\d{1,2})?)/i, 35);
    const refMatch = combined.match(/\b(?:ref|booking|id)\s*[:#]?\s*([A-Z0-9-]{4,18})\b/i);

    out.push({
      explicitAnchor: /\[ANCHOR\]/i.test(combined),
      title: summary.replace(/\[ANCHOR\]\s*/i, "").trim(),
      providerName: loc || `Calendar Provider ${i + 1}`,
      providerOrigin: eventUrl ? eventUrl.replace(/\/+$/, "") : null,
      peerNetworkUrl: agenticNetUrl,
      bookingRef: refMatch ? refMatch[1].toUpperCase() : (uid ? uid.slice(0, 10).toUpperCase() : `ICS-${100 + i}`),
      scheduledDate: startParsed.iso,
      validUntil,
      window:
        startParsed.hhmm && endParsed?.hhmm
          ? `${startParsed.hhmm}–${endParsed.hhmm}`
          : validUntil
            ? `${startParsed.iso} – ${validUntil}`
            : "09:00–13:00",
      priceEur,
      rescheduleFeeEur,
      cancelFeeEur,
      supportsHold: !/no[- ]?hold/i.test(combined),
      category: "imported_calendar",
      notes: desc || "Imported from RFC 5545 .ics calendar event.",
      rawText: combined,
    });
  });

  return out.slice(0, 16);
}

function parseJsonBookingArray(jsonText) {
  let arr;
  try {
    arr = sanitizeJson(JSON.parse(jsonText));
  } catch (err) {
    throw new Error(`Invalid JSON booking array: ${err.message}`);
  }
  if (!Array.isArray(arr)) {
    throw new Error("JSON schedule intake must be an array of booking objects.");
  }
  const out = [];
  arr.forEach((entry, i) => {
    if (!isPlainObject(entry)) return;
    const rawDate = String(entry.scheduled_date || entry.date || "").trim();
    if (!isValidIsoDate(rawDate)) return;
    const rawValidUntil = entry.valid_until || entry.validUntil;
    const validUntil = rawValidUntil && isValidIsoDate(String(rawValidUntil)) ? String(rawValidUntil) : null;
    const title = String(entry.title || entry.summary || `Booking ${i + 1}`).trim();
    const providerName = String(entry.provider_name || entry.provider || `Provider ${i + 1}`).trim();
    const bookingRef = String(entry.booking_ref || entry.ref || `JSON-${100 + i}`).trim();
    const priceEur = Math.max(0, Number(entry.price_eur ?? entry.price ?? 80) || 0);
    const rescheduleFeeEur = Math.max(0, Number(entry.reschedule_fee_eur ?? entry.rescheduleFee ?? 10) || 0);
    const cancelFeeEur = Math.max(0, Number(entry.cancellation_fee_eur ?? entry.cancelFee ?? 30) || 0);

    const providerOrigin = normalizeSafeAgenticUrl(entry.provider_origin || entry.url);
    const peerNetworkUrl = normalizeSafeAgenticUrl(entry.peer_network_url || entry.agentic_network);

    out.push({
      explicitAnchor: Boolean(entry.anchor || /\[ANCHOR\]/i.test(title)),
      title: title.replace(/\[ANCHOR\]\s*/i, "").trim(),
      providerName,
      providerOrigin: providerOrigin ? providerOrigin.replace(/\/+$/, "") : null,
      peerNetworkUrl,
      bookingRef,
      scheduledDate: rawDate,
      validUntil,
      window: String(entry.window || "09:00–13:00"),
      priceEur,
      rescheduleFeeEur,
      cancelFeeEur,
      supportsHold: entry.supports_hold !== false && entry.supportsHold !== false,
      category: String(entry.category || "imported_json"),
      notes: String(entry.notes || "Imported from structured JSON booking array."),
      rawText: `${title} ${providerName} ${entry.notes || ""}`,
    });
  });
  return out.slice(0, 16);
}

function parseConfirmationEmailBlocks(rawText) {
  const chunks = rawText
    .split(/\n\s*---+\s*\n|\n{2,}(?=Subject:|Booking:|\[ANCHOR\])/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const out = [];
  chunks.forEach((chunk, i) => {
    const dateMatches = [...chunk.matchAll(/\b(202[5-9]-\d{2}-\d{2})\b/g)]
      .map((m) => m[1])
      .filter(isValidIsoDate);
    const scheduledDate = dateMatches[0] || "2026-11-17";
    const validUntil =
      dateMatches.length >= 2 && diffDaysIso(scheduledDate, dateMatches[1]) >= 2 ? dateMatches[1] : null;

    const firstLine = chunk
      .split(/\r?\n/)[0]
      .replace(/^(?:Subject|Booking|Confirmation)\s*:\s*/i, "")
      .replace(/—\s*Ref:.*$/i, "")
      .trim();

    const provMatch = chunk.match(/Provider\s*:\s*([^·\n]+)/i);
    const refMatch = chunk.match(/(?:Ref|Booking\s*#|Code)\s*[:#]?\s*([A-Z0-9]{2,6}-\d{2,6})/i);
    const winMatch = chunk.match(/(\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2})/);

    const priceEur = extractMoneyField(chunk, /(?:Price|Total|Base)\s*:\s*€?\s*(\d+(?:\.\d{1,2})?)/i, 75);
    const rescheduleFeeEur = extractMoneyField(chunk, /Reschedule(?:\s+fee)?\s*:\s*€?\s*(\d+(?:\.\d{1,2})?)/i, 10);
    const cancelFeeEur = extractMoneyField(chunk, /Cancel(?:lation)?(?:\s+fee)?\s*:\s*€?\s*(\d+(?:\.\d{1,2})?)/i, 30);

    out.push({
      explicitAnchor: /\[ANCHOR\]/i.test(chunk),
      title: firstLine.replace(/\[ANCHOR\]\s*/i, "").trim() || `Imported Booking ${i + 1}`,
      providerName: provMatch ? provMatch[1].trim() : `Independent Service ${i + 1}`,
      bookingRef: refMatch ? refMatch[1].toUpperCase() : `IMP-${200 + i}`,
      scheduledDate,
      validUntil,
      window: winMatch ? winMatch[1].replace(/\s+/g, "") : validUntil ? `Span until ${validUntil}` : "09:00–13:00",
      priceEur,
      rescheduleFeeEur,
      cancelFeeEur,
      supportsHold: !/no\s+hold/i.test(chunk),
      category: "imported_booking",
      notes: "Compiled from pasted confirmation email.",
      rawText: chunk,
    });
  });

  return out.slice(0, 16);
}

/**
 * Build deterministic offers & WebCrypto Ed25519 provider clients for non-relocation scenarios
 * and custom imported missions so every mission supports full Hold-Before-Commit + Ed25519 verification!
 *
 * @param {Record<string, any>} mission
 * @param {object} [options]
 * @param {boolean} [options.rippleFailureInjected=false]
 */
export async function buildScenarioPeerHarness(mission, options = {}) {
  const verifier = new ReceiptVerifier();
  const clients = {};
  const keysByProvider = new Map();

  for (const c of mission.commitments) {
    if (!keysByProvider.has(c.provider_id)) {
      const kp = await generateDemoProviderKeyPair(c.provider_id);
      keysByProvider.set(c.provider_id, kp);
      verifier.registerTrustedProviderKey(c.provider_id, kp.keyId, kp.publicJwk);
    }
  }

  for (const [providerId, kp] of keysByProvider.entries()) {
    const holds = new Map();
    const idemStore = new Map();

    clients[providerId] = {
      prepareHold: async ({ bookingRef, offerId, proposedDate, idempotencyKey }) => {
        if (holds.has(idempotencyKey)) return holds.get(idempotencyKey);
        const h = {
          ok: true,
          hold_id: `hold_${providerId.slice(0, 6)}_${holds.size + 1}`,
          booking_ref: bookingRef,
          offer_id: offerId,
          proposed_date: proposedDate,
          original_booking_preserved: true,
          expires_at: "2027-01-20T23:59:59Z",
        };
        holds.set(idempotencyKey, h);
        return h;
      },
      executeCommit: async ({ idempotencyKey, arguments: a }) => {
        if (idemStore.has(idempotencyKey)) return idemStore.get(idempotencyKey);
        const cmt = mission.commitments.find((x) => x.provider_id === providerId);
        const isOffPeak = String(a.offer_id || "").startsWith("off_offpeak_");
        const isOverflow = String(a.offer_id || "").startsWith("off_overflow_");
        const basePrice = isOffPeak
          ? Math.max(10, Number(cmt?.price_eur || 0) - 10)
          : isOverflow
            ? Number(cmt?.price_eur || 0) + 15
            : Number(cmt?.price_eur || 0);
        const changeFee = isOffPeak || isOverflow ? 0 : Number(cmt?.reschedule_fee_eur || 0);
        const cancelPenalty = isOverflow ? 15 : 0;

        const receiptBody = {
          receipt_id: `rcpt_${providerId.slice(0, 6)}_${idemStore.size + 1}`,
          provider_id: providerId,
          booking_ref: a.booking_ref,
          operation: "reschedule_commitment",
          idempotency_key: idempotencyKey,
          committed_status: "COMMITTED",
          scheduled_date: a.new_date,
          window: a.window || cmt?.window || "09:00–13:00",
          base_price_eur: basePrice,
          change_fee_eur: changeFee,
          total_price_eur: basePrice + changeFee + cancelPenalty,
          issued_at: new Date().toISOString(),
        };
        const env = await signProviderReceipt(receiptBody, kp);
        const out = { ok: true, execution_state: "COMMITTED", status: "CONFIRMED", receipt_envelope: env };
        idemStore.set(idempotencyKey, out);
        return out;
      },
      queryStatus: async ({ idempotencyKey }) => {
        if (idempotencyKey && idemStore.has(idempotencyKey)) {
          return {
            ok: true,
            execution_state: "COMMITTED",
            operation_status: "COMMITTED",
            receipt_envelope: idemStore.get(idempotencyKey).receipt_envelope,
          };
        }
        return { ok: true, execution_state: "NOT_FOUND_NEVER_EXECUTED", operation_status: "NOT_COMMITTED" };
      },
    };
  }

  const buildOffersForNode = (node, targetDate, graph) => {
    const isAnchor = node.id === mission.anchor_commitment_id;
    // Check if an incoming ON_OR_AFTER edge requires minOffsetDays >= 1 (e.g. post-op physio Day+1!)
    const incoming = graph.edges.find((e) => e.to === node.id && e.from === mission.anchor_commitment_id);
    const minOffset = incoming?.type === EDGE_TYPES.ON_OR_AFTER ? (incoming.rule?.minOffsetDays ?? 0) : 0;
    const primaryProposedDate = addDaysIso(targetDate, minOffset);

    if (isAnchor && options.rippleFailureInjected) {
      return [
        normalizePeerOffer({
          offer_id: `off_overflow_${node.id}_${primaryProposedDate}`,
          commitment_id: node.id,
          provider_id: node.provider_id,
          provider_name: `${node.provider_name.replace(/\s*\(Demo\)$/, "")} Partner Overflow (Demo)`,
          provider_origin: node.provider_origin.startsWith("http")
            ? node.provider_origin
            : "https://overflow-partner.example",
          raw_capability: "reschedule_commitment",
          semantic_kind: "REPLACE_WITH_BACKUP_PROVIDER",
          proposed_date: primaryProposedDate,
          window: node.window,
          base_price_eur: Number(node.price_eur) + 15,
          change_fee_eur: 0,
          cancellation_penalty_eur: 15,
          supports_hold: Boolean(node.supports_hold),
          hold_ttl_seconds: node.supports_hold ? 900 : 0,
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

    const offers = [
      normalizePeerOffer({
        offer_id: `off_std_${node.id}_${primaryProposedDate}`,
        commitment_id: node.id,
        provider_id: node.provider_id,
        provider_name: node.provider_name,
        provider_origin: node.provider_origin.startsWith("http")
          ? node.provider_origin
          : "https://provider-peer.example",
        raw_capability: "reschedule_commitment",
        semantic_kind: "RESCHEDULE_IN_PLACE",
        proposed_date: primaryProposedDate,
        window: node.window,
        base_price_eur: Number(node.price_eur),
        change_fee_eur: Number(node.reschedule_fee_eur || 0),
        cancellation_penalty_eur: 0,
        supports_hold: Boolean(node.supports_hold),
        hold_ttl_seconds: node.supports_hold ? 900 : 0,
        reversible: Boolean(node.reversible_reschedule),
        creates_final_booking: !node.reversible_reschedule,
        requires_user_approval: true,
        supports_idempotency: true,
        supports_status_reconciliation: true,
        is_replacement_provider: false,
        expires_at: "2027-01-20T23:59:59Z",
      }),
    ];

    // If flexible ON_OR_AFTER (like delivery/install/physio), also offer an off-peak +1 day discount option!
    if (!isAnchor && incoming?.type === EDGE_TYPES.ON_OR_AFTER && Number(node.price_eur) >= 20) {
      const offPeakDate = addDaysIso(primaryProposedDate, 1);
      offers.push(
        normalizePeerOffer({
          offer_id: `off_offpeak_${node.id}_${offPeakDate}`,
          commitment_id: node.id,
          provider_id: node.provider_id,
          provider_name: node.provider_name,
          provider_origin: node.provider_origin.startsWith("http")
            ? node.provider_origin
            : "https://provider-peer.example",
          raw_capability: "reschedule_commitment",
          semantic_kind: "RESCHEDULE_IN_PLACE",
          proposed_date: offPeakDate,
          window: "09:00–12:00",
          base_price_eur: Math.max(10, Number(node.price_eur) - 10),
          change_fee_eur: 0,
          cancellation_penalty_eur: 0,
          supports_hold: Boolean(node.supports_hold),
          hold_ttl_seconds: node.supports_hold ? 600 : 0,
          reversible: Boolean(node.reversible_reschedule),
          creates_final_booking: !node.reversible_reschedule,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: false,
          expires_at: "2027-01-20T23:59:59Z",
        }),
      );
    }

    return offers;
  };

  return { clients, verifier, buildOffersForNode };
}

/**
 * Generate a standard RFC 5545 `.ics` calendar string containing all reconciled & preserved
 * commitments, booking references, and verified Ed25519 receipt signatures.
 *
 * @param {Record<string, any>} mission
 * @param {import("../mission-graph/index.js").MissionGraph} graph
 * @param {Array<Record<string, any>>} [operations=[]]
 * @returns {string}
 */
export function exportMissionToIcs(mission, graph, operations = []) {
  const opByNode = new Map(operations.map((o) => [o.commitment_id, o]));
  const dtStamp = "20261114T120000Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CONTINUITY//Open Agentic Change Coordinator//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const node of graph.nodes.values()) {
    const op = opByNode.get(node.id);
    const activeDate =
      op && (op.state === "COMMITTED" || op.state === "AWAITING_APPROVAL")
        ? op.proposed_date
        : node.scheduled_date;
    const activeWindow = op?.window || node.window || "09:00–12:00";
    const ymd = String(activeDate).replace(/-/g, "");
    const timeMatch = String(activeWindow).match(/(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})/);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${node.booking_ref}-${mission.mission_id}@continuity.agentic.web`);
    lines.push(`DTSTAMP:${dtStamp}`);
    if (timeMatch) {
      lines.push(`DTSTART:${ymd}T${timeMatch[1]}${timeMatch[2]}00`);
      lines.push(`DTEND:${ymd}T${timeMatch[3]}${timeMatch[4]}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`);
      const endIso = node.valid_until || addDaysIso(activeDate, 1);
      lines.push(`DTEND;VALUE=DATE:${String(endIso).replace(/-/g, "")}`);
    }
    const statusTag = op?.state === "COMMITTED" ? "RE-ALIGNED & VERIFIED" : "PRESERVED UNTOUCHED";
    lines.push(`SUMMARY:[${statusTag}] ${node.title} (${node.booking_ref})`);
    lines.push(`LOCATION:${node.provider_name}`);
    const proofDigest = op?.receipt_envelope?.proof?.payload_sha256
      ? `Ed25519 Payload SHA-256: ${op.receipt_envelope.proof.payload_sha256}`
      : "Original Confirmed Commitment Preserved";
    lines.push(
      `DESCRIPTION:Provider: ${node.provider_name}\\nRef: ${node.booking_ref}\\nState: ${node.visual_state}\\n${proofDigest}`,
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/**
 * Create an offline-verifiable cryptographic audit bundle JSON with canonical SHA-256 digest.
 */
export async function exportVerifiableAuditBundle({
  mission,
  selectedPlan,
  operations,
  auditLog,
  trustedProviderKeys = null,
  zkBudgetAttestation = null,
}) {
  const keySnapshot = {};
  if (trustedProviderKeys instanceof Map) {
    for (const [pid, meta] of trustedProviderKeys.entries()) {
      keySnapshot[pid] = { keyId: meta.keyId, publicJwk: meta.publicJwk };
    }
  } else if (isPlainObject(trustedProviderKeys)) {
    for (const [pid, meta] of Object.entries(trustedProviderKeys)) {
      if (meta?.keyId && meta?.publicJwk) {
        keySnapshot[pid] = { keyId: meta.keyId, publicJwk: meta.publicJwk };
      }
    }
  }

  let exportedMetrics = selectedPlan?.metrics || null;
  if (selectedPlan?.metrics && zkBudgetAttestation) {
    const { maxBudgetEur: _redactedCeiling, ...publicMetrics } = selectedPlan.metrics;
    exportedMetrics = {
      ...publicMetrics,
      ceilingDisclosed: false,
    };
  }

  const payload = sanitizeJson({
    schema: "continuity-verifiable-audit-bundle/v1",
    exported_at: new Date().toISOString(),
    mission_id: mission.mission_id,
    mission_title: mission.title,
    authoritative_invariants: mission.authoritative_invariants,
    selected_plan: selectedPlan
      ? {
          plan_id: selectedPlan.plan_id,
          label: selectedPlan.label,
          pareto_optimal: Boolean(selectedPlan.paretoOptimal),
          metrics: exportedMetrics,
        }
      : null,
    ...(zkBudgetAttestation ? { zk_budget_attestation: zkBudgetAttestation } : {}),
    operations: (operations || []).map((op) => ({
      operation_id: op.operation_id,
      commitment_id: op.commitment_id,
      provider_id: op.provider_id || op.receipt_envelope?.receipt_body?.provider_id || null,
      provider_name: op.provider_name,
      state: op.state,
      proposed_date: op.proposed_date,
      window: op.window,
      approval_hash: op.approval_hash || null,
      proof_verification: op.proof_verification || null,
      receipt_envelope: op.receipt_envelope || null,
    })),
    pinned_provider_keys_snapshot: keySnapshot,
    immutable_saga_log: auditLog || [],
  });

  const bundleSha256 = await sha256Hex(canonicalizeJson(payload));
  return {
    ...payload,
    bundle_integrity: {
      canonicalization: "RFC8785-JCS-Subset",
      bundle_sha256: bundleSha256,
    },
  };
}

/**
 * Offline Zero-Trust Cryptographic Audit Bundle Verifier.
 * Independently checks:
 *  1. Canonical RFC 8785 JCS `bundle_sha256` payload digest (catches any 1-byte mutation).
 *  2. SHA-256 hash-chained `immutable_saga_log` (`OperationLedger.verifyChainIntegrity` from genesis `0000...`).
 *  3. WebCrypto Ed25519 signature + payload SHA-256 on every `COMMITTED` operation's `receipt_envelope`.
 *     Explicitly distinguishes external pinned trust anchors (`PINNED_TRUST_STORE`) from embedded snapshot
 *     consistency (`SNAPSHOT_SELF_CONSISTENT`).
 *
 * @param {unknown} rawBundle
 * @param {object} [options]
 * @param {Record<string, { keyId: string, publicJwk: JsonWebKey }> | Map<string, any>} [options.externalPinnedKeys]
 */
export async function verifyExportedAuditBundle(rawBundle, options = {}) {
  if (!isPlainObject(rawBundle) || rawBundle.schema !== "continuity-verifiable-audit-bundle/v1") {
    return {
      valid: false,
      bundleSha256Valid: false,
      sagaChainValid: false,
      receiptsVerifiedCount: 0,
      receiptsTotalCommitted: 0,
      keyTrustMode: "NONE",
      errors: ['Bundle must be a JSON object with schema "continuity-verifiable-audit-bundle/v1".'],
    };
  }

  const errors = [];
  const clean = sanitizeJson(rawBundle);
  const { bundle_integrity: integrity, ...corePayload } = clean;
  const expectedSha = integrity?.bundle_sha256 || "";
  const computedSha = await sha256Hex(canonicalizeJson(corePayload));
  const bundleSha256Valid = Boolean(expectedSha) && computedSha === expectedSha;
  if (!bundleSha256Valid) {
    errors.push(
      `BUNDLE_SHA256_MISMATCH: expected ${expectedSha.slice(0, 16) || "missing"}…, computed ${computedSha.slice(0, 16)}…`,
    );
  }

  const chainCheck = OperationLedger.verifyChainIntegrity(
    Array.isArray(clean.immutable_saga_log) ? clean.immutable_saga_log : [],
  );
  const sagaChainValid = chainCheck.valid;
  if (!sagaChainValid) {
    errors.push(`LEDGER_CHAIN_BROKEN: ${chainCheck.reason || `tampered at seq #${chainCheck.brokenAtSeq}`}`);
  }

  let keyMapObj = null;
  let keyTrustMode = "NONE";
  if (options.externalPinnedKeys instanceof Map && options.externalPinnedKeys.size > 0) {
    keyMapObj = Object.fromEntries(options.externalPinnedKeys.entries());
    keyTrustMode = "PINNED_TRUST_STORE";
  } else if (isPlainObject(options.externalPinnedKeys) && Object.keys(options.externalPinnedKeys).length > 0) {
    keyMapObj = options.externalPinnedKeys;
    keyTrustMode = "PINNED_TRUST_STORE";
  } else if (
    isPlainObject(clean.pinned_provider_keys_snapshot)
    && Object.keys(clean.pinned_provider_keys_snapshot).length > 0
  ) {
    keyMapObj = clean.pinned_provider_keys_snapshot;
    keyTrustMode = "SNAPSHOT_SELF_CONSISTENT";
  }

  const verifier = new ReceiptVerifier(keyMapObj || {});
  const committedOps = (Array.isArray(clean.operations) ? clean.operations : []).filter(
    (op) => op?.state === "COMMITTED",
  );
  let receiptsVerifiedCount = 0;

  for (const op of committedOps) {
    const pid = op.provider_id || op.receipt_envelope?.receipt_body?.provider_id;
    if (!pid || !op.receipt_envelope) {
      errors.push(`MISSING_RECEIPT: committed operation "${op.operation_id}" has no signed receipt_envelope.`);
      continue;
    }
    const res = await verifier.verifyReceipt(pid, op.receipt_envelope);
    if (!res.valid) {
      errors.push(`ED25519_SIGNATURE_INVALID (${pid} / ${op.operation_id}): ${res.detail || res.level}`);
    } else {
      receiptsVerifiedCount += 1;
    }
  }

  let zkBudgetValid = null;
  const zkAtt = clean.zk_budget_attestation;
  if (zkAtt !== undefined && zkAtt !== null) {
    const zkRes = await verifyBlindedBudgetAttestation(zkAtt);
    let zkConsistent = zkRes.valid && zkRes.ceilingRemainsHidden;
    if (!zkRes.valid) {
      errors.push(`ZK_BUDGET_LADDER_INVALID: ${zkRes.reason}`);
    }
    const planCost = clean.selected_plan?.metrics?.totalMissionCostEur;
    if (typeof planCost === "number" && Math.ceil(planCost) > Number(zkAtt.publicSpentUnitsEur)) {
      zkConsistent = false;
      errors.push(
        `ZK_BUDGET_LADDER_MISMATCH: selected_plan totalMissionCostEur (€${planCost.toFixed(2)}) exceeds attested publicSpentUnitsEur (€${zkAtt.publicSpentUnitsEur}).`,
      );
    }
    if (clean.selected_plan?.metrics?.maxBudgetEur !== undefined) {
      zkConsistent = false;
      errors.push("ZK_BUDGET_CEILING_LEAKED: selected_plan.metrics.maxBudgetEur must be redacted when zk_budget_attestation is present.");
    }
    zkBudgetValid = zkConsistent;
  }

  return {
    valid: errors.length === 0,
    bundleSha256Valid,
    computedBundleSha256: computedSha,
    sagaChainValid,
    sagaEventsChecked: chainCheck.verifiedEntries ?? (clean.immutable_saga_log?.length || 0),
    receiptsVerifiedCount,
    receiptsTotalCommitted: committedOps.length,
    zkBudgetAttestationPresent: Boolean(zkAtt),
    zkBudgetValid,
    keyTrustMode,
    errors,
  };
}
