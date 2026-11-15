/**
 * @module @continuity/mission-core
 * Deterministic Mission Representation, Constraint Compiler, and Hard-Invariant Guard.
 *
 * Architectural Rule:
 * - Natural language or LLM proposals produce untrusted candidate JSON.
 * - `compileMissionChange()` validates the candidate against strict schemas and enforces
 *   that hard user invariants can NEVER be silently downgraded into soft preferences.
 */

import {
  assertValidSchema,
  isValidIsoDate,
  MISSION_CHANGE_PROPOSAL_SCHEMA,
  sanitizeJson,
} from "../shared-schemas/index.js";

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * Format YYYY-MM-DD with explicit weekday (e.g. "Fri, Nov 20, 2026").
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDateWithWeekday(isoDate) {
  if (!isValidIsoDate(isoDate)) return String(isoDate);
  const dt = new Date(`${isoDate}T12:00:00Z`);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Add days to an ISO YYYY-MM-DD date in UTC.
 * @param {string} isoDate
 * @param {number} deltaDays
 * @returns {string}
 */
export function addDaysIso(isoDate, deltaDays) {
  if (!isValidIsoDate(isoDate)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * Difference in days `b - a` between two ISO dates.
 * @param {string} dateA
 * @param {string} dateB
 * @returns {number}
 */
export function diffDaysIso(dateA, dateB) {
  const msA = Date.parse(`${dateA}T00:00:00Z`);
  const msB = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Resolve a weekday name relative to a reference ISO date within the same or upcoming week.
 * @param {string} referenceIsoDate
 * @param {string} weekdayName
 * @returns {string | null}
 */
export function resolveWeekdayFromAnchor(referenceIsoDate, weekdayName) {
  if (!isValidIsoDate(referenceIsoDate)) return null;
  const targetIdx = WEEKDAY_NAMES.indexOf(String(weekdayName || "").toLowerCase());
  if (targetIdx < 0) return null;
  const refDate = new Date(`${referenceIsoDate}T00:00:00Z`);
  const refIdx = refDate.getUTCDay();
  let delta = targetIdx - refIdx;
  if (delta <= 0) delta += 7;
  return addDaysIso(referenceIsoDate, delta);
}

/**
 * Create the canonical initial 6-commitment relocation mission ("The Ripple Effect Demo").
 * Explicitly labels all providers as independent demonstration services.
 * @param {object} [options]
 * @param {string} [options.baseTuesday="2026-11-17"]
 * @param {Record<string, string>} [options.origins]
 */
export function createSignatureMoveMission(options = {}) {
  const baseTuesday = options.baseTuesday || "2026-11-17";
  const wednesday = addDaysIso(baseTuesday, 1); // 2026-11-18
  const saturday = addDaysIso(baseTuesday, 4);  // 2026-11-21
  const origins = {
    moveco: "http://127.0.0.1:8081",
    permitflow: "http://localhost:8082",
    homeconnect: "http://127.0.0.1:8083",
    powerflow: "http://localhost:8084",
    ...(options.origins || {}),
  };

  return {
    mission_id: "move_paris_lyon_001",
    title: "Home Relocation — Rue de Rivoli to Bellecour",
    mission_type: "home_relocation",
    simulation_disclosure: "Independent demonstration provider services for the Open Agentic Web Challenge.",
    created_at: "2026-11-13T09:00:00Z",
    anchor_date: baseTuesday,
    anchor_commitment_id: "cmt_moveco_van",
    primary_change_field: "move_date",
    destination_summary: "District 2, Place Bellecour (Zone B)",
    authoritative_invariants: {
      maximum_budget_eur: 700,
      preserve_existing_commitments: true,
      destination_must_remain_unchanged: true,
      unauthorized_cancellation: false,
      no_additional_purchases_without_approval: true,
      privacy_data_minimization: true,
    },
    commitments: [
      {
        id: "cmt_moveco_van",
        title: "Moving Crew & 20m³ Luton Van",
        category: "moving",
        provider_id: "moveco",
        provider_name: "MoveCo Express (Demo)",
        provider_origin: origins.moveco,
        peer_network_url: `${origins.moveco}/moveco_dispatch`,
        booking_ref: "MC-8841",
        status: "CONFIRMED",
        scheduled_date: baseTuesday,
        window: "08:00–13:00",
        price_eur: 390,
        cancellation_fee_eur: 65,
        reschedule_fee_eur: 25,
        supports_hold: true,
        reversible_reschedule: false,
        notes: "Primary move anchor commitment.",
      },
      {
        id: "cmt_permitflow_bay",
        title: "Curbside Loading Bay Permit Draft",
        category: "permit_preparation",
        provider_id: "permitflow",
        provider_name: "PermitFlow Civic Prep (Demo)",
        provider_origin: origins.permitflow,
        peer_network_url: `${origins.permitflow}/permitflow_advisor`,
        booking_ref: "PF-2049",
        status: "PREPARED_DOSSIER",
        scheduled_date: baseTuesday,
        window: "07:30–14:00",
        price_eur: 35,
        cancellation_fee_eur: 0,
        reschedule_fee_eur: 10,
        supports_hold: true,
        reversible_reschedule: true,
        notes: "Demonstration permit dossier preparation — never mutates real municipal systems.",
      },
      {
        id: "cmt_homeconnect_fiber",
        title: "Gigabit Fiber ONT Installation",
        category: "broadband",
        provider_id: "homeconnect",
        provider_name: "HomeConnect Fiber (Demo)",
        provider_origin: origins.homeconnect,
        peer_network_url: `${origins.homeconnect}/homeconnect_scheduler`,
        booking_ref: "HC-5510",
        status: "CONFIRMED",
        scheduled_date: baseTuesday,
        window: "14:00–17:00",
        price_eur: 49,
        cancellation_fee_eur: 30,
        reschedule_fee_eur: 0,
        supports_hold: true,
        reversible_reschedule: false,
        notes: "Requires tenant access at new address on or after move arrival.",
      },
      {
        id: "cmt_powerflow_grid",
        title: "Smart Meter & Grid Activation",
        category: "electricity",
        provider_id: "powerflow",
        provider_name: "PowerFlow Energy (Demo)",
        provider_origin: origins.powerflow,
        peer_network_url: `${origins.powerflow}/powerflow_grid`,
        booking_ref: "PFW-9921",
        status: "CONFIRMED",
        scheduled_date: baseTuesday,
        window: "08:00–12:00",
        price_eur: 30,
        cancellation_fee_eur: 15,
        reschedule_fee_eur: 0,
        supports_hold: true,
        reversible_reschedule: false,
        notes: "Must be active on or before move-in day so elevator/lighting and ONT test work.",
      },
      {
        id: "cmt_storage_pod",
        title: "Climate-Controlled Buffer Storage (14-Day)",
        category: "storage",
        provider_id: "cityvault_local",
        provider_name: "CityVault Pod (Demo Fixture)",
        provider_origin: "local://fixture",
        peer_network_url: null,
        booking_ref: "CV-3104",
        status: "CONFIRMED",
        scheduled_date: "2026-11-15",
        window: "All-day access Nov 15 – Nov 29",
        valid_until: "2026-11-29",
        price_eur: 75,
        cancellation_fee_eur: 40,
        reschedule_fee_eur: 20,
        supports_hold: false,
        reversible_reschedule: false,
        notes: "Covers Nov 15 through Nov 29; unaffected by any move date within that window.",
      },
      {
        id: "cmt_furniture_drop",
        title: "Modular Sofa & Desk Delivery",
        category: "delivery",
        provider_id: "nordicloom_local",
        provider_name: "NordicLoom Delivery (Demo Fixture)",
        provider_origin: "local://fixture",
        peer_network_url: null,
        booking_ref: "NL-7712",
        status: "CONFIRMED",
        scheduled_date: saturday,
        window: "10:00–14:00",
        price_eur: 45,
        cancellation_fee_eur: 35,
        reschedule_fee_eur: 25,
        supports_hold: false,
        reversible_reschedule: false,
        notes: "Scheduled for Saturday Nov 21 — remains valid if move completes on or before Friday Nov 20.",
      },
    ],
  };
}

/**
 * Deterministic natural-language parser + schema validator for change requests.
 * Extracts target date, budget ceiling, hold-before-cancel invariant, and priority mode.
 * Even if an untrusted LLM or peer prompt attempts to relax hard constraints,
 * `authoritativeInvariants` enforces user safety boundaries.
 *
 * @param {string | Record<string, any>} input - User natural-language prompt or structured LLM candidate
 * @param {ReturnType<typeof createSignatureMoveMission>} mission
 * @returns {{
 *   proposal: Record<string, any>,
 *   extractedNotes: string[],
 *   securityWarnings: string[]
 * }}
 */
export function compileMissionChange(input, mission) {
  if (!mission || !mission.mission_id) {
    throw new Error("A valid authoritative mission state is required.");
  }

  const securityWarnings = [];
  const extractedNotes = [];
  const authInv = mission.authoritative_invariants;

  // Case 1: Structured candidate proposal (e.g. from LLM tool call)
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const candidate = sanitizeJson(input);
    // Enforce hard-constraint floor: model cannot flip unauthorized_cancellation to true
    // or disable preserve_existing_commitments when authoritative mission requires it.
    if (candidate.invariants?.unauthorized_cancellation === true) {
      securityWarnings.push("Blocked attempt to enable unauthorized_cancellation; enforced false.");
      candidate.invariants.unauthorized_cancellation = false;
    }
    if (candidate.invariants?.no_additional_purchases_without_approval === false) {
      securityWarnings.push("Blocked attempt to waive purchase approval; enforced true.");
      candidate.invariants.no_additional_purchases_without_approval = true;
    }
    if (authInv.preserve_existing_commitments && candidate.invariants?.preserve_existing_commitments === false) {
      securityWarnings.push("Blocked attempt to downgrade preserve_existing_commitments hard constraint.");
      candidate.invariants.preserve_existing_commitments = true;
    }
    if (candidate.permissions?.commit_changes === true) {
      securityWarnings.push("Compiler stripped pre-approval commit_changes=true; commit requires bound human approval.");
      candidate.permissions.commit_changes = false;
    }
    if (candidate.permissions?.cancel_original_commitments === true) {
      securityWarnings.push("Compiler stripped pre-approval cancel_original_commitments=true.");
      candidate.permissions.cancel_original_commitments = false;
    }

    const validated = assertValidSchema(
      MISSION_CHANGE_PROPOSAL_SCHEMA,
      candidate,
      "MissionChangeProposal",
    );
    if (!isValidIsoDate(validated.requested_change.new_value)) {
      throw new Error(`Invalid target date "${validated.requested_change.new_value}".`);
    }
    return { proposal: validated, extractedNotes, securityWarnings };
  }

  // Case 2: Natural-language request compilation
  const rawText = String(input || "").trim();
  if (!rawText) {
    throw new Error("Change request cannot be empty.");
  }
  if (rawText.length > 4000) {
    throw new Error("Change request exceeds maximum length of 4,000 characters.");
  }

  // Detect prompt injection patterns trying to override budget or auto-cancel
  if (/ignore\s+(all\s+)?previous\s+(instructions|constraints)|bypass\s+approval|auto[- ]?cancel\s+without\s+asking/i.test(rawText)) {
    securityWarnings.push(
      "Adversarial override phrase detected in request text; deterministic hard invariants remain enforced.",
    );
  }

  const prevDate = mission.anchor_date;
  let newDate = null;

  // 1. Explicit ISO date YYYY-MM-DD in prompt (pick the last mentioned target date != prevDate)
  const isoMatches = [...rawText.matchAll(/\b(202[6-9]-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  for (const iso of isoMatches) {
    if (isValidIsoDate(iso) && iso !== prevDate) {
      newDate = iso;
    }
  }

  // 2. Prefer explicit destination phrases ("to Friday", "until Friday", "move ... to Friday")
  if (!newDate) {
    const prevWeekday = WEEKDAY_NAMES[new Date(`${prevDate}T00:00:00Z`).getUTCDay()];
    const toMatches = [
      ...rawText.matchAll(/\b(?:to|until)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi),
    ];
    for (const m of toMatches) {
      const wd = m[1].toLowerCase();
      if (wd !== prevWeekday) {
        newDate = resolveWeekdayFromAnchor(prevDate, wd);
        extractedNotes.push(`Resolved target "to ${m[1]}" relative to ${prevDate} -> ${newDate}`);
      }
    }
  }
  if (!newDate) {
    const prevWeekday = WEEKDAY_NAMES[new Date(`${prevDate}T00:00:00Z`).getUTCDay()];
    const onMatches = [
      ...rawText.matchAll(/\b(?:for|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi),
    ];
    for (const m of onMatches) {
      const wd = m[1].toLowerCase();
      if (wd !== prevWeekday) {
        newDate = resolveWeekdayFromAnchor(prevDate, wd);
        extractedNotes.push(`Resolved "${m[1]}" relative to ${prevDate} -> ${newDate}`);
      }
    }
  }
  if (!newDate) {
    for (const day of WEEKDAY_NAMES) {
      const rx = new RegExp(`\\b${day}\\b`, "i");
      if (rx.test(rawText)) {
        const candidateDate = resolveWeekdayFromAnchor(prevDate, day);
        const prevWeekday = WEEKDAY_NAMES[new Date(`${prevDate}T00:00:00Z`).getUTCDay()];
        if (candidateDate && day !== prevWeekday) {
          newDate = candidateDate;
          extractedNotes.push(`Resolved weekday "${day}" -> ${newDate}`);
          break;
        }
      }
    }
  }

  if (!newDate) {
    // Month + Day expressions (e.g., "Nov 20", "November 20th", "20 Nov", "20 November")
    const MONTHS = {
      jan: "01", january: "01",
      feb: "02", february: "02",
      mar: "03", march: "03",
      apr: "04", april: "04",
      may: "05",
      jun: "06", june: "06",
      jul: "07", july: "07",
      aug: "08", august: "08",
      sep: "09", sept: "09", september: "09",
      oct: "10", october: "10",
      nov: "11", november: "11",
      dec: "12", december: "12",
    };
    const anchorYear = prevDate.slice(0, 4);
    const mdMatches = [
      ...rawText.matchAll(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(202\d))?\b/gi,
      ),
    ];
    for (const m of mdMatches) {
      const mm = MONTHS[m[1].toLowerCase()];
      const dd = String(Number(m[2])).padStart(2, "0");
      const yr = m[3] || anchorYear;
      const cand = `${yr}-${mm}-${dd}`;
      if (isValidIsoDate(cand) && cand !== prevDate) {
        newDate = cand;
        extractedNotes.push(`Resolved calendar phrase "${m[0]}" -> ${newDate}`);
      }
    }
    if (!newDate) {
      const dmMatches = [
        ...rawText.matchAll(
          /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:,?\s*(202\d))?\b/gi,
        ),
      ];
      for (const m of dmMatches) {
        const dd = String(Number(m[1])).padStart(2, "0");
        const mm = MONTHS[m[2].toLowerCase()];
        const yr = m[3] || anchorYear;
        const cand = `${yr}-${mm}-${dd}`;
        if (isValidIsoDate(cand) && cand !== prevDate) {
          newDate = cand;
          extractedNotes.push(`Resolved calendar phrase "${m[0]}" -> ${newDate}`);
        }
      }
    }
  }

  if (!newDate) {
    // Relative shift expressions: "3 days later", "+3 days", "push/postpone/delay/shift by 3 days"
    const shiftMatch =
      rawText.match(/\b(\d{1,2})\s+days?\s+later\b/i)
      || rawText.match(/(?:^|\s)\+(\d{1,2})\s*days?\b/i)
      || rawText.match(/\b(?:push|postpone|delay|shift|move)(?:\s+\w+){0,3}\s+by\s+(\d{1,2})\s+days?\b/i);
    if (shiftMatch) {
      newDate = addDaysIso(prevDate, Number(shiftMatch[1]));
      extractedNotes.push(`Applied +${shiftMatch[1]} days shift -> ${newDate}`);
    }
  }

  if (!newDate || !isValidIsoDate(newDate)) {
    throw new Error(
      "Could not determine a valid target date from the request. Specify a weekday (e.g. Friday) or ISO date (e.g. 2026-11-20).",
    );
  }

  // Budget extraction (e.g. "below €700", "under 680 EUR", "budget €700")
  let maxBudget = authInv.maximum_budget_eur;
  const budgetMatch =
    rawText.match(/(?:below|under|max(?:imum)?|budget(?:\s+of|\s+below|\s+under)?|<=?)\s*(?:€|eur\s*)?(\d{2,5}(?:\.\d{1,2})?)/i)
    || rawText.match(/€\s*(\d{2,5}(?:\.\d{1,2})?)/i)
    || rawText.match(/(\d{2,5}(?:\.\d{1,2})?)\s*(?:€|euros?|eur)\b/i);
  if (budgetMatch) {
    const parsedBudget = Number(budgetMatch[1]);
    if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
      maxBudget = parsedBudget;
      extractedNotes.push(`Extracted hard budget ceiling: €${maxBudget}`);
    }
  }

  // Priority preference detection
  let priorityMode = "minimal_change";
  if (/\b(cheapest|lowest\s+cost|save\s+money|minimum\s+cost)\b/i.test(rawText)) {
    priorityMode = "lowest_cost";
  } else if (/\b(fastest|earliest|quickest|asap)\b/i.test(rawText)) {
    priorityMode = "fastest_resolution";
  }

  const preserveCommitments =
    authInv.preserve_existing_commitments
    || /\b(keep|preserve|hold|until\s+replacements?\s+are\s+secured|do\s+not\s+cancel)\b/i.test(rawText);

  const proposal = assertValidSchema(
    MISSION_CHANGE_PROPOSAL_SCHEMA,
    {
      mission_id: mission.mission_id,
      mission_type: mission.mission_type,
      requested_change: {
        field: mission.primary_change_field || "move_date",
        previous_value: prevDate,
        new_value: newDate,
        target_commitment_id:
          mission.anchor_commitment_id || mission.commitments?.[0]?.id || "cmt_moveco_van",
        summary: rawText.slice(0, 240),
      },
      invariants: {
        maximum_budget_eur: maxBudget,
        preserve_existing_commitments: Boolean(preserveCommitments),
        destination_must_remain_unchanged: true,
        unauthorized_cancellation: false,
        no_additional_purchases_without_approval: true,
        privacy_data_minimization: true,
      },
      preferences: {
        priority_mode: priorityMode,
        prefer_existing_providers: true,
        minimize_approvals: true,
        preferred_window: "any",
      },
      permissions: {
        search: true,
        request_quotes: true,
        prepare_changes: true,
        commit_changes: false,
        cancel_original_commitments: false,
      },
    },
    "CompiledMissionProposal",
  );

  return {
    proposal,
    extractedNotes,
    securityWarnings,
  };
}
