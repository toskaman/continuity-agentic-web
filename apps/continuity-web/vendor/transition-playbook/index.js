/**
 * @module @continuity/transition-playbook
 * Hybrid Open Agentic Web + Legacy Vendor Transition Playbook Engine.
 *
 * Solves the real-world "Cold-Start / Mixed Ecosystem" problem of the Worldwide Agentic Web:
 * When a person imports a real `.ics` calendar or confirmation emails today, some providers may
 * publish Open Agentic Web manifests (`agent-manifest.json` + autonomous holds & Ed25519 receipts),
 * while legacy providers still require human email, portal, or phone rescheduling.
 *
 * Instead of faking autonomous execution on unagentified real-world vendors, this module:
 *  1. Classifies every planned operation honestly into `AGENTIC_AUTONOMOUS` vs `LEGACY_HUMAN_ASSISTED`.
 *  2. Orders operations in safe topological **Hold-First** sequence (confirming anchor & hard
 *     same-day replacements BEFORE releasing or shifting downstream reservations).
 *  3. Generates copy-ready & `mailto:` **Hold-First Reschedule Drafts** with exact booking references,
 *     old/new dates, time windows, and explicit instruction not to cancel the existing slot until the
 *     new slot is confirmed.
 *  4. Quantifies unaffected commitments and exact cancellation penalties avoided by not touching them.
 */

import { formatDateWithWeekday } from "../mission-core/index.js";
import { sanitizeJson } from "../shared-schemas/index.js";

function isLiveAgenticCommitment(commitment) {
  if (!commitment) return false;
  if (typeof commitment.peer_network_url === "string" && commitment.peer_network_url.startsWith("http")) {
    return true;
  }
  const origin = String(commitment.provider_origin || "");
  if (
    /^https?:\/\/(127\.0\.0\.1|localhost|toskaman\.github\.io|gpaschercher-sudo\.github\.io)\b/i.test(origin)
  ) {
    return true;
  }
  return false;
}

function buildMailtoHref(subject, body) {
  const cleanSubj = String(subject || "").replace(/[\r\n]+/g, " ").trim();
  const cleanBody = String(body || "").replace(/\r\n/g, "\n");
  return `mailto:?subject=${encodeURIComponent(cleanSubj)}&body=${encodeURIComponent(cleanBody)}`;
}

/**
 * Generate a complete, honest Hybrid Execution Playbook for a selected `MissionChangePlan`.
 *
 * @param {object} params
 * @param {Record<string, any>} params.mission
 * @param {Record<string, any>} params.plan - Selected plan from `solveMinimalChangePlans`
 * @param {Array<Record<string, any>>} [params.preparedOps=[]] - Prepared or committed Saga operations
 */
export function buildHybridTransitionPlaybook({ mission, plan, preparedOps = [] }) {
  if (!mission || !plan) {
    throw new Error("buildHybridTransitionPlaybook requires a mission and selected plan.");
  }

  const commitmentsById = new Map((mission.commitments || []).map((c) => [c.id, c]));
  const opsByCommitmentId = new Map((preparedOps || []).map((op) => [op.commitment_id, op]));

  // Compute topological depth from mission.dependencies when present so A -> B -> C orders cleanly
  const topoDepth = new Map((mission.commitments || []).map((c) => [c.id, 0]));
  if (Array.isArray(mission.dependencies)) {
    for (let pass = 0; pass < (mission.commitments?.length || 1); pass++) {
      for (const dep of mission.dependencies) {
        const dFrom = topoDepth.get(dep.from) ?? 0;
        const dTo = topoDepth.get(dep.to) ?? 0;
        if (dTo <= dFrom) topoDepth.set(dep.to, dFrom + 1);
      }
    }
  }

  // Order operations: anchor commitment first, then topological prerequisite depth, then non-reversible hard bookings
  const orderedPlanOps = (plan.operations || []).slice().sort((a, b) => {
    const aAnchor = a.commitment_id === mission.anchor_commitment_id ? 0 : 1;
    const bAnchor = b.commitment_id === mission.anchor_commitment_id ? 0 : 1;
    if (aAnchor !== bAnchor) return aAnchor - bAnchor;
    const depthDiff = (topoDepth.get(a.commitment_id) ?? 0) - (topoDepth.get(b.commitment_id) ?? 0);
    if (depthDiff !== 0) return depthDiff;
    const aRev = a.offer?.reversible ? 1 : 0;
    const bRev = b.offer?.reversible ? 1 : 0;
    if (aRev !== bRev) return aRev - bRev;
    return (a.operation_seq || 0) - (b.operation_seq || 0);
  });

  const steps = orderedPlanOps.map((planOp, idx) => {
    const cmt = commitmentsById.get(planOp.commitment_id) || {};
    const liveOp = opsByCommitmentId.get(planOp.commitment_id) || null;
    const agentic = isLiveAgenticCommitment(cmt);
    const oldDateFmt = formatDateWithWeekday(planOp.original_date);
    const newDateFmt = formatDateWithWeekday(planOp.offer.proposed_date);
    const windowStr = planOp.offer.window || cmt.window || "standard window";
    const expectedCost = Number(
      (
        Number(planOp.offer.base_price_eur || 0)
        + Number(planOp.offer.change_fee_eur || 0)
        + Number(planOp.offer.cancellation_penalty_eur || 0)
      ).toFixed(2),
    );

    const subject = `Reschedule Request (Hold-First) — Ref ${planOp.original_booking_ref} (${planOp.commitment_title})`;
    const messageDraft = [
      `Hello ${planOp.offer.provider_name || planOp.original_provider_name},`,
      "",
      `I would like to reschedule booking reference ${planOp.original_booking_ref} (${planOp.commitment_title}):`,
      `• Current confirmed date: ${oldDateFmt} (${cmt.window || "existing window"})`,
      `• Requested new date: ${newDateFmt} (${windowStr})`,
      "",
      "IMPORTANT (Hold-Before-Release): Please confirm availability and hold the new slot BEFORE releasing or cancelling my current reservation. Please also confirm any applicable change fee before finalizing.",
      "",
      "Thank you.",
    ].join("\n");

    return sanitizeJson({
      stepNumber: idx + 1,
      commitmentId: planOp.commitment_id,
      commitmentTitle: planOp.commitment_title,
      providerName: planOp.offer.provider_name || planOp.original_provider_name,
      bookingRef: planOp.original_booking_ref,
      executionChannel: agentic ? "OPEN_AGENTIC_WEB_AUTONOMOUS" : "LEGACY_VENDOR_HOLD_FIRST_DRAFT",
      channelBadge: agentic
        ? "Open Agentic Web · Autonomous Hold & Signed Receipt"
        : "Legacy Vendor · Hold-First Message Draft",
      fromDate: planOp.original_date,
      toDate: planOp.offer.proposed_date,
      window: windowStr,
      expectedTotalEur: expectedCost,
      changeFeeEur: Number(planOp.offer.change_fee_eur || 0),
      currentState: liveOp?.state || "PLANNED",
      holdId: liveOp?.hold_id || null,
      receiptVerified: Boolean(liveOp?.proof_verification?.trusted),
      safetyInstruction:
        idx === 0
          ? "Primary anchor: secure or hold this slot FIRST before committing dependent services."
          : "Dependent service: confirm only after Step 1 anchor replacement is held/confirmed.",
      subject,
      messageDraft,
      shortSmsDraft: `Ref ${planOp.original_booking_ref}: Please hold ${newDateFmt} (${windowStr}) BEFORE releasing ${oldDateFmt}, and confirm fee.`,
      mailtoHref: buildMailtoHref(subject, messageDraft),
    });
  });

  const preserved = (plan.preservedCommitments || []).map((p) => {
    const cmt = commitmentsById.get(p.commitment_id) || {};
    return sanitizeJson({
      commitmentId: p.commitment_id,
      title: p.title,
      providerName: p.provider_name,
      bookingRef: p.booking_ref,
      scheduledDate: p.scheduled_date,
      window: p.window,
      priceEur: Number(p.price_eur || 0),
      avoidedCancellationPenaltyEur: Number(cmt.cancellation_fee_eur || 0),
    });
  });

  const avoidedPenaltiesTotalEur = Number(
    preserved.reduce((sum, p) => sum + p.avoidedCancellationPenaltyEur, 0).toFixed(2),
  );
  const agenticStepsCount = steps.filter((s) => s.executionChannel === "OPEN_AGENTIC_WEB_AUTONOMOUS").length;
  const legacyStepsCount = steps.length - agenticStepsCount;

  const markdownLines = [
    `# CONTINUITY — Safe Change Execution Playbook`,
    ``,
    `- **Mission:** ${mission.title} (\`${mission.mission_id}\`)`,
    `- **Strategy:** ${plan.label}`,
    `- **Projected Total:** €${Number(plan.metrics.totalMissionCostEur).toFixed(2)} (Hard ceiling: €${Number(plan.metrics.maxBudgetEur).toFixed(2)})`,
    `- **Execution Split:** ${agenticStepsCount} Open Agentic Web autonomous op(s) · ${legacyStepsCount} legacy hold-first draft(s) · ${preserved.length} booking(s) kept untouched (€${avoidedPenaltiesTotalEur.toFixed(2)} cancel fees avoided)`,
    ``,
    `## 1. Ordered Hold-First Change Steps`,
    ``,
  ];

  for (const s of steps) {
    markdownLines.push(
      `### Step ${s.stepNumber}: ${s.commitmentTitle} (\`${s.bookingRef}\`) — [${s.channelBadge}]`,
      `- **Provider:** ${s.providerName}`,
      `- **Shift:** ${s.fromDate} → **${s.toDate}** (${s.window}) · Total €${s.expectedTotalEur.toFixed(2)} (change fee €${s.changeFeeEur.toFixed(2)})`,
      `- **Safety Rule:** ${s.safetyInstruction}`,
      ...(s.holdId ? [`- **Active Hold:** \`${s.holdId}\` (${s.currentState})`] : []),
      ...(s.executionChannel === "LEGACY_VENDOR_HOLD_FIRST_DRAFT"
        ? [``, `\`\`\`text`, `Subject: ${s.subject}`, ``, s.messageDraft, `\`\`\``]
        : []),
      ``,
    );
  }

  markdownLines.push(`## 2. Preserved Untouched Commitments (Do NOT Contact or Cancel)`, ``);
  for (const p of preserved) {
    markdownLines.push(
      `- **${p.title}** (${p.providerName} · Ref \`${p.bookingRef}\`): kept on **${p.scheduledDate}** (${p.window}) — avoids €${p.avoidedCancellationPenaltyEur.toFixed(2)} cancellation penalty.`,
    );
  }

  return {
    missionId: mission.mission_id,
    planId: plan.plan_id,
    agenticStepsCount,
    legacyStepsCount,
    preservedCount: preserved.length,
    avoidedPenaltiesTotalEur,
    steps,
    preserved,
    markdown: `${markdownLines.join("\n")}\n`,
  };
}
