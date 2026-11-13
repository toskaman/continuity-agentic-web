/**
 * @module @continuity/constraint-solver
 * Deterministic Minimal-Change Optimizer for Multi-Provider Commitment Coordination.
 *
 * Guarantees:
 * 1. Deterministic reproducibility: identical mission + offers + invariants -> identical ranked plans.
 * 2. Hard-constraint enforcement: NEVER recommends a plan that violates budget ceiling,
 *    dependency ordering, or unauthorized-cancellation policy.
 * 3. Multi-objective evaluation: generates Plan A (Minimum Changes), Plan B (Lowest Cost),
 *    and Plan C (Fastest Resolution) from the feasible combination space, and explains
 *    infeasibility precisely if no valid plan exists.
 */

import { diffDaysIso } from "../mission-core/index.js";
import { evaluateEdgeImpact } from "../impact-engine/index.js";

export const OBJECTIVE_WEIGHTS = Object.freeze({
  minimal_change: {
    changedCommitments: 1000,
    providerReplacements: 600,
    netDeltaCostEur: 8,
    approvalsRequired: 120,
    completionSpanDays: 25,
    irreversibleOps: 40,
  },
  lowest_cost: {
    changedCommitments: 80,
    providerReplacements: 100,
    netDeltaCostEur: 1000,
    approvalsRequired: 30,
    completionSpanDays: 15,
    irreversibleOps: 20,
  },
  fastest_resolution: {
    changedCommitments: 120,
    providerReplacements: 150,
    netDeltaCostEur: 10,
    approvalsRequired: 40,
    completionSpanDays: 1000,
    irreversibleOps: 20,
  },
});

/**
 * Build the implicit "KEEP_EXISTING_SCHEDULE" zero-action option for commitments
 * where preserving the existing date might remain valid (soft candidates & unaffected nodes).
 *
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
function makeKeepOption(node) {
  return {
    offer_id: `keep_${node.id}_${node.scheduled_date}`,
    commitment_id: node.id,
    provider_id: node.provider_id,
    provider_name: node.provider_name,
    provider_origin: node.provider_origin,
    raw_capability: "noop_keep_existing",
    semantic_kind: "KEEP_EXISTING_SCHEDULE",
    proposed_date: node.scheduled_date,
    window: node.window,
    base_price_eur: node.price_eur,
    change_fee_eur: 0,
    cancellation_penalty_eur: 0,
    supports_hold: true,
    hold_ttl_seconds: 0,
    reversible: true,
    creates_final_booking: false,
    requires_user_approval: false,
    supports_idempotency: true,
    supports_status_reconciliation: true,
    is_replacement_provider: false,
    disclosure_note: "Existing confirmed arrangement kept untouched.",
  };
}

/**
 * Score a feasible candidate assignment under a deterministic weight profile.
 * @param {Record<string, any>} metrics
 * @param {Record<string, number>} weights
 */
function computeObjectiveScore(metrics, weights) {
  return (
    metrics.changedCount * weights.changedCommitments
    + metrics.replacementCount * weights.providerReplacements
    + metrics.totalMissionCostEur * weights.netDeltaCostEur
    + metrics.approvalsRequiredCount * weights.approvalsRequired
    + metrics.completionOffsetDays * weights.completionSpanDays
    + metrics.irreversibleCount * weights.irreversibleOps
  );
}

/**
 * Deterministically solve for feasible minimal-change plans across affected commitments.
 *
 * @param {object} params
 * @param {import("../mission-graph/index.js").MissionGraph} params.graph
 * @param {Record<string, any>} params.proposal - Validated MissionChangeProposal
 * @param {Record<string, any>} params.impact - Output of `analyzeMissionImpact`
 * @param {Array<Record<string, any>>} params.normalizedOffers - Validated offers from `normalizePeerOffer`
 * @returns {{
 *   feasible: boolean,
 *   recommendedPlanId: string | null,
 *   plans: Array<Record<string, any>>,
 *   rejectedCombinationsCount: number,
 *   rejectionReasonsSummary: string[],
 *   solverDurationMs: number
 * }}
 */
export function solveMinimalChangePlans({ graph, proposal, impact, normalizedOffers }) {
  const t0 = performance.now();
  const targetAnchorDate = proposal.requested_change.new_value;
  const maxBudgetEur = proposal.invariants.maximum_budget_eur;
  const allowUnauthorizedCancel = proposal.invariants.unauthorized_cancellation === true;

  // Sort nodes deterministically by id
  const allNodes = Array.from(graph.nodes.values()).sort((a, b) => a.id.localeCompare(b.id));
  const baselineTotalEur = allNodes.reduce((sum, n) => sum + Number(n.price_eur || 0), 0);

  // Group candidate options per node
  /** @type {Map<string, Array<Record<string, any>>>} */
  const optionsByNode = new Map();
  for (const node of allNodes) {
    const decision = impact.nodeDecisions[node.id];
    if (!decision || decision.status === "UNCHANGED") {
      optionsByNode.set(node.id, [makeKeepOption(node)]);
      continue;
    }

    const nodeOffers = normalizedOffers
      .filter((o) => o.commitment_id === node.id)
      .slice()
      .sort((a, b) => a.offer_id.localeCompare(b.offer_id));

    if (decision.status === "AFFECTED_SOFT") {
      // Soft candidate can either keep its existing schedule OR take a peer alignment offer
      optionsByNode.set(node.id, [makeKeepOption(node), ...nodeOffers]);
    } else {
      // Hard-affected node MUST change to a valid offer (unless existing date already equals target)
      if (node.scheduled_date === targetAnchorDate) {
        optionsByNode.set(node.id, [makeKeepOption(node), ...nodeOffers]);
      } else {
        optionsByNode.set(node.id, nodeOffers);
      }
    }
  }

  // Check if any hard-affected commitment has zero offers at all
  const missingOfferReasons = [];
  for (const [nodeId, opts] of optionsByNode.entries()) {
    if (opts.length === 0) {
      const node = graph.nodes.get(nodeId);
      missingOfferReasons.push(
        `No feasible alternative offer received for "${node?.title || nodeId}" (${node?.provider_name || nodeId}).`,
      );
    }
  }

  if (missingOfferReasons.length > 0) {
    return {
      feasible: false,
      recommendedPlanId: null,
      plans: [],
      rejectedCombinationsCount: 0,
      rejectionReasonsSummary: missingOfferReasons,
      solverDurationMs: Number((performance.now() - t0).toFixed(3)),
    };
  }

  // Bounded Cartesian search over affected commitments
  const nodeIds = allNodes.map((n) => n.id);
  const feasibleAssignments = [];
  const rejectionReasons = new Set();
  let rejectedCount = 0;
  const MAX_COMBINATIONS = 4096;
  let explored = 0;

  /** @param {number} idx @param {Record<string, Record<string, any>>} current */
  const search = (idx, current) => {
    if (explored >= MAX_COMBINATIONS) return;
    if (idx === nodeIds.length) {
      explored += 1;
      const check = validateCandidateAssignment(
        graph,
        allNodes,
        current,
        targetAnchorDate,
        maxBudgetEur,
        allowUnauthorizedCancel,
        baselineTotalEur,
      );
      if (check.valid) {
        feasibleAssignments.push(check.evaluated);
      } else {
        rejectedCount += 1;
        rejectionReasons.add(check.reason);
      }
      return;
    }

    const nid = nodeIds[idx];
    const opts = optionsByNode.get(nid) || [];
    for (const opt of opts) {
      current[nid] = opt;
      search(idx + 1, current);
    }
  };

  search(0, {});

  if (feasibleAssignments.length === 0) {
    return {
      feasible: false,
      recommendedPlanId: null,
      plans: [],
      rejectedCombinationsCount: rejectedCount,
      rejectionReasonsSummary: Array.from(rejectionReasons),
      solverDurationMs: Number((performance.now() - t0).toFixed(3)),
    };
  }

  // Pick distinct optimal plans for Plan A (Minimal Changes), Plan B (Lowest Cost), Plan C (Fastest Resolution)
  const pickBest = (mode) => {
    const weights = OBJECTIVE_WEIGHTS[mode];
    return feasibleAssignments
      .slice()
      .sort((a, b) => {
        const scoreDiff = computeObjectiveScore(a.metrics, weights) - computeObjectiveScore(b.metrics, weights);
        if (scoreDiff !== 0) return scoreDiff;
        return a.signature.localeCompare(b.signature);
      })[0];
  };

  const bestMinChange = pickBest("minimal_change");
  const bestLowCost = pickBest("lowest_cost");
  const bestFastest = pickBest("fastest_resolution");

  const rawPlans = [
    {
      planId: "PLAN_A_MINIMAL_CHANGE",
      label: "Plan A — Minimum Changes (Recommended Default)",
      strategyMode: "minimal_change",
      candidate: bestMinChange,
    },
    {
      planId: "PLAN_B_LOWEST_COST",
      label: "Plan B — Lowest Overall Financial Cost",
      strategyMode: "lowest_cost",
      candidate: bestLowCost,
    },
    {
      planId: "PLAN_C_FASTEST_RESOLUTION",
      label: "Plan C — Fastest Complete Service Alignment",
      strategyMode: "fastest_resolution",
      candidate: bestFastest,
    },
  ];

  // Deduplicate identical underlying assignments while noting which objectives they co-optimize
  const uniqueBySig = new Map();
  for (const item of rawPlans) {
    const sig = item.candidate.signature;
    if (!uniqueBySig.has(sig)) {
      uniqueBySig.set(sig, {
        plan_id: item.planId,
        label: item.label,
        co_optimizes: [item.strategyMode],
        ...item.candidate,
      });
    } else {
      uniqueBySig.get(sig).co_optimizes.push(item.strategyMode);
    }
  }

  // If fewer than 2 distinct plans exist and additional feasible assignments exist, surface runner-ups
  // so users can genuinely compare trade-offs (e.g. aligning PowerFlow to Friday vs keeping Tuesday).
  const remaining = feasibleAssignments
    .filter((fa) => !uniqueBySig.has(fa.signature))
    .sort(
      (a, b) =>
        computeObjectiveScore(a.metrics, OBJECTIVE_WEIGHTS.minimal_change)
        - computeObjectiveScore(b.metrics, OBJECTIVE_WEIGHTS.minimal_change)
        || a.signature.localeCompare(b.signature),
    );

  let altIdx = 1;
  while (uniqueBySig.size < Math.min(3, feasibleAssignments.length) && remaining.length > 0) {
    const next = remaining.shift();
    uniqueBySig.set(next.signature, {
      plan_id: `PLAN_ALT_${altIdx++}`,
      label:
        next.metrics.completionOffsetDays === 0
          ? "Alternative Plan — Same-Day Full Alignment"
          : "Alternative Plan — Balanced Schedule Window",
      co_optimizes: ["feasible_alternative"],
      ...next,
    });
  }

  const plans = Array.from(uniqueBySig.values());
  const preferredMode = proposal.preferences?.priority_mode || "minimal_change";
  const recommended =
    plans.find((p) => p.co_optimizes.includes(preferredMode)) || plans[0];

  return {
    feasible: true,
    recommendedPlanId: recommended.plan_id,
    plans,
    rejectedCombinationsCount: rejectedCount,
    rejectionReasonsSummary: Array.from(rejectionReasons),
    solverDurationMs: Number((performance.now() - t0).toFixed(3)),
  };
}

/**
 * Validate all hard constraints on one complete assignment across all mission nodes.
 */
function validateCandidateAssignment(
  graph,
  allNodes,
  assignmentMap,
  targetAnchorDate,
  maxBudgetEur,
  allowUnauthorizedCancel,
  baselineTotalEur,
) {
  const anchorChoice = assignmentMap["cmt_moveco_van"];
  if (anchorChoice && anchorChoice.proposed_date !== targetAnchorDate) {
    return {
      valid: false,
      reason: `Anchor commitment date (${anchorChoice.proposed_date}) does not satisfy requested target date (${targetAnchorDate}).`,
    };
  }

  // Verify every hard edge in MissionGraph under the proposed dates
  for (const edge of graph.edges) {
    const srcOpt = assignmentMap[edge.from];
    const dstNode = graph.nodes.get(edge.to);
    const dstOpt = assignmentMap[edge.to];
    if (!srcOpt || !dstNode || !dstOpt) continue;

    const syntheticDstNode = { ...dstNode, scheduled_date: dstOpt.proposed_date };
    const edgeCheck = evaluateEdgeImpact(edge, srcOpt.proposed_date, syntheticDstNode);
    if (edgeCheck.hardViolation) {
      return {
        valid: false,
        reason: `Dependency violation (${edge.from} -> ${edge.to}): ${edgeCheck.reason}`,
      };
    }
  }

  // Calculate total mission cost and change operations
  let totalMissionCostEur = 0;
  let totalFeesAndPenaltiesEur = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let replacementCount = 0;
  let approvalsRequiredCount = 0;
  let irreversibleCount = 0;
  let maxModifiedOffsetDays = 0;
  let latestServiceDate = targetAnchorDate;
  const operations = [];
  const preservedCommitments = [];

  for (const node of allNodes) {
    const opt = assignmentMap[node.id];
    const isKeep = opt.semantic_kind === "KEEP_EXISTING_SCHEDULE";

    if (isKeep) {
      unchangedCount += 1;
      totalMissionCostEur += Number(node.price_eur);
      preservedCommitments.push({
        commitment_id: node.id,
        title: node.title,
        provider_name: node.provider_name,
        booking_ref: node.booking_ref,
        scheduled_date: node.scheduled_date,
        window: node.window,
        price_eur: Number(node.price_eur),
      });
    } else {
      changedCount += 1;
      if (opt.is_replacement_provider) {
        replacementCount += 1;
        // If replacing original provider, original commitment is HELD until replacement commits,
        // then original cancellation fee applies ONLY if authorized by user in change package.
        if (!allowUnauthorizedCancel && !opt.requires_user_approval) {
          return {
            valid: false,
            reason: `Replacement offer ${opt.offer_id} lacks mandatory user approval gate for provider switch.`,
          };
        }
      }
      const opCost =
        Number(opt.base_price_eur) + Number(opt.change_fee_eur) + Number(opt.cancellation_penalty_eur);
      const itemFees = Number(opt.change_fee_eur) + Number(opt.cancellation_penalty_eur);
      totalMissionCostEur += opCost;
      totalFeesAndPenaltiesEur += itemFees;

      if (opt.requires_user_approval) approvalsRequiredCount += 1;
      if (!opt.reversible) irreversibleCount += 1;

      const opOffset = Math.max(0, diffDaysIso(targetAnchorDate, opt.proposed_date));
      if (opOffset > maxModifiedOffsetDays) {
        maxModifiedOffsetDays = opOffset;
        latestServiceDate = opt.proposed_date;
      }

      operations.push({
        operation_seq: operations.length + 1,
        commitment_id: node.id,
        commitment_title: node.title,
        original_provider_name: node.provider_name,
        original_booking_ref: node.booking_ref,
        original_date: node.scheduled_date,
        original_price_eur: Number(node.price_eur),
        offer: opt,
        net_delta_eur: Number((opCost - Number(node.price_eur)).toFixed(2)),
      });
    }
  }

  totalMissionCostEur = Number(totalMissionCostEur.toFixed(2));
  totalFeesAndPenaltiesEur = Number(totalFeesAndPenaltiesEur.toFixed(2));
  const netDeltaEur = Number((totalMissionCostEur - baselineTotalEur).toFixed(2));

  if (totalMissionCostEur > maxBudgetEur) {
    return {
      valid: false,
      reason: `Total mission cost €${totalMissionCostEur.toFixed(2)} exceeds hard maximum budget €${maxBudgetEur.toFixed(2)}.`,
    };
  }

  const completionOffsetDays = maxModifiedOffsetDays;
  const signature = allNodes.map((n) => `${n.id}:${assignmentMap[n.id].offer_id}`).join("|");

  return {
    valid: true,
    evaluated: {
      signature,
      operations,
      preservedCommitments,
      metrics: {
        baselineTotalEur,
        totalMissionCostEur,
        netDeltaEur,
        totalFeesAndPenaltiesEur,
        maxBudgetEur,
        budgetHeadroomEur: Number((maxBudgetEur - totalMissionCostEur).toFixed(2)),
        changedCount,
        unchangedCount,
        replacementCount,
        approvalsRequiredCount,
        irreversibleCount,
        latestServiceDate,
        completionOffsetDays,
      },
    },
  };
}
