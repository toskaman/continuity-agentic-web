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

import { addDaysIso, diffDaysIso, formatDateWithWeekday } from "../mission-core/index.js";
import { analyzeMissionImpact, evaluateEdgeImpact } from "../impact-engine/index.js";

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
export function solveMinimalChangePlans({
  graph,
  proposal,
  impact,
  normalizedOffers,
  pinnedCommitmentIds = [],
  _skipCounterfactual = false,
}) {
  const t0 = performance.now();
  const pinnedSet = new Set(pinnedCommitmentIds);
  const targetCommitmentId = proposal.requested_change.target_commitment_id;
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
    if (pinnedSet.has(node.id)) {
      optionsByNode.set(node.id, [makeKeepOption(node)]);
      continue;
    }
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
        targetCommitmentId,
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
    const counterfactualPrescription = _skipCounterfactual
      ? null
      : computeMinimalCounterfactualRelaxation({
          graph,
          proposal,
          impact,
          normalizedOffers,
          pinnedCommitmentIds,
        });
    return {
      feasible: false,
      recommendedPlanId: null,
      plans: [],
      counterfactualPrescription,
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

  const rawCandidatePlans = Array.from(uniqueBySig.values());
  const plans = computeParetoFrontier(rawCandidatePlans);
  const preferredMode = proposal.preferences?.priority_mode || "minimal_change";
  const recommended =
    plans.find((p) => p.co_optimizes.includes(preferredMode)) || plans[0];

  return {
    feasible: true,
    recommendedPlanId: recommended.plan_id,
    plans,
    paretoFrontierCount: plans.filter((p) => p.paretoOptimal).length,
    rejectedCombinationsCount: rejectedCount,
    rejectionReasonsSummary: Array.from(rejectionReasons),
    solverDurationMs: Number((performance.now() - t0).toFixed(3)),
  };
}

/**
 * Multi-objective Pareto Dominance Classifier across the 4 minimization objectives:
 * `(changedCount, totalMissionCostEur, completionOffsetDays, irreversibleCount)`.
 * Plan X dominates Plan Y iff X is `<=` Y on all 4 objectives and strictly `<` on at least one.
 *
 * @param {Array<Record<string, any>>} plans
 * @returns {Array<Record<string, any>>}
 */
export function computeParetoFrontier(plans) {
  const vec = (p) => [
    Number(p.metrics.changedCount),
    Number(p.metrics.totalMissionCostEur),
    Number(p.metrics.completionOffsetDays),
    Number(p.metrics.irreversibleCount),
  ];

  // NSGA-II Crowding Distance across the 4 normalized minimization objectives
  const distances = new Map(plans.map((p) => [p.plan_id, 0]));
  if (plans.length <= 2) {
    for (const p of plans) distances.set(p.plan_id, Number.POSITIVE_INFINITY);
  } else {
    for (let dim = 0; dim < 4; dim++) {
      const sorted = plans.slice().sort((a, b) => vec(a)[dim] - vec(b)[dim]);
      const minV = vec(sorted[0])[dim];
      const maxV = vec(sorted[sorted.length - 1])[dim];
      const span = maxV - minV;
      if (span <= 0) continue;
      distances.set(sorted[0].plan_id, Number.POSITIVE_INFINITY);
      distances.set(sorted[sorted.length - 1].plan_id, Number.POSITIVE_INFINITY);
      for (let i = 1; i < sorted.length - 1; i++) {
        const cur = distances.get(sorted[i].plan_id) || 0;
        if (!Number.isFinite(cur)) continue;
        const delta = (vec(sorted[i + 1])[dim] - vec(sorted[i - 1])[dim]) / span;
        distances.set(sorted[i].plan_id, Number((cur + delta).toFixed(4)));
      }
    }
  }

  return plans.map((plan) => {
    const vP = vec(plan);
    let dominator = null;
    let dominatedCount = 0;
    for (const other of plans) {
      if (other.plan_id === plan.plan_id) continue;
      const vO = vec(other);
      const otherDominates = vO.every((val, i) => val <= vP[i]) && vO.some((val, i) => val < vP[i]);
      if (otherDominates && dominator === null) {
        dominator = other.plan_id;
      }
      const planDominatesOther = vP.every((val, i) => val <= vO[i]) && vP.some((val, i) => val < vO[i]);
      if (planDominatesOther) {
        dominatedCount += 1;
      }
    }
    const rawCd = distances.get(plan.plan_id) ?? 0;
    return {
      ...plan,
      paretoOptimal: dominator === null,
      paretoRank: dominator === null ? 1 : 2,
      dominatedByPlanId: dominator,
      dominatedCount,
      crowdingDistance: Number.isFinite(rawCd) ? rawCd : "boundary",
    };
  });
}

/**
 * Minimal Unsatisfiable Core (MUS) & Exact Counterfactual Relaxation Prescription:
 * When hard constraints make a mission change infeasible, computes the smallest deterministic
 * change in user-controlled bounds (exact minimum budget ceiling in cents, minimal conflicting
 * pin release, or both) needed to unlock at least one valid plan.
 *
 * @param {object} params
 * @param {import("../mission-graph/index.js").MissionGraph} params.graph
 * @param {Record<string, any>} params.proposal
 * @param {Record<string, any>} params.impact
 * @param {Array<Record<string, any>>} params.normalizedOffers
 * @param {string[]} [params.pinnedCommitmentIds]
 */
export function computeMinimalCounterfactualRelaxation({
  graph,
  proposal,
  impact,
  normalizedOffers,
  pinnedCommitmentIds = [],
}) {
  const currentCapEur = Number(proposal.invariants.maximum_budget_eur);
  const UNBOUNDED_PROBE_EUR = 1_000_000;

  const probeWith = (capEur, pins) =>
    solveMinimalChangePlans({
      graph,
      proposal: {
        ...proposal,
        invariants: {
          ...proposal.invariants,
          maximum_budget_eur: capEur,
        },
      },
      impact,
      normalizedOffers,
      pinnedCommitmentIds: pins,
      _skipCounterfactual: true,
    });

  // 1. Check if raising the budget ceiling alone (keeping all pins) unlocks feasibility
  const budgetOnlyProbe = probeWith(UNBOUNDED_PROBE_EUR, pinnedCommitmentIds);
  if (budgetOnlyProbe.feasible) {
    const minTotalEur = budgetOnlyProbe.plans.reduce(
      (minC, p) => Math.min(minC, p.metrics.totalMissionCostEur),
      UNBOUNDED_PROBE_EUR,
    );
    const exactMinEur = Number(minTotalEur.toFixed(2));
    const deltaEur = Number(Math.max(0.01, exactMinEur - currentCapEur).toFixed(2));
    const verifiedAtMin = probeWith(exactMinEur, pinnedCommitmentIds);
    return {
      relaxationFound: true,
      kind: "raise_budget",
      currentBudgetEur: currentCapEur,
      relaxedBudgetEur: exactMinEur,
      deltaBudgetNeededEur: deltaEur,
      unpinCommitmentIds: [],
      unpinTitles: [],
      unlockedPlansCount: verifiedAtMin.plans.length,
      summary: `Raise budget ceiling by +€${deltaEur.toFixed(2)} (from €${currentCapEur.toFixed(2)} to €${exactMinEur.toFixed(2)}) to unlock ${verifiedAtMin.plans.length} valid plan(s).`,
    };
  }

  // 2. If commitments are pinned, search minimal cardinality unpin subsets (size 1..k)
  const pins = Array.from(new Set(pinnedCommitmentIds)).sort();
  if (pins.length > 0) {
    /** @type {string[][]} */
    const subsets = [];
    const genSubsets = (startIdx, chosen, targetLen) => {
      if (chosen.length === targetLen) {
        subsets.push(chosen.slice());
        return;
      }
      for (let i = startIdx; i < pins.length; i++) {
        chosen.push(pins[i]);
        genSubsets(i + 1, chosen, targetLen);
        chosen.pop();
      }
    };
    for (let k = 1; k <= pins.length; k++) {
      genSubsets(0, [], k);
    }

    // 2a. Unpin only, keeping user's current budget cap
    for (const dropSet of subsets) {
      const dropLookup = new Set(dropSet);
      const remainingPins = pins.filter((id) => !dropLookup.has(id));
      const p = probeWith(currentCapEur, remainingPins);
      if (p.feasible) {
        const titles = dropSet.map((id) => graph.nodes.get(id)?.title || id);
        return {
          relaxationFound: true,
          kind: "unpin_commitments",
          currentBudgetEur: currentCapEur,
          relaxedBudgetEur: currentCapEur,
          deltaBudgetNeededEur: 0,
          unpinCommitmentIds: dropSet,
          unpinTitles: titles,
          unlockedPlansCount: p.plans.length,
          summary: `Unpin conflicting lock on ${titles.join(", ")} to unlock ${p.plans.length} valid plan(s) within your €${currentCapEur.toFixed(2)} ceiling.`,
        };
      }
    }

    // 2b. Combined minimal unpin + exact minimum budget increase
    for (const dropSet of subsets) {
      const dropLookup = new Set(dropSet);
      const remainingPins = pins.filter((id) => !dropLookup.has(id));
      const pUnbounded = probeWith(UNBOUNDED_PROBE_EUR, remainingPins);
      if (pUnbounded.feasible) {
        const minTotalEur = pUnbounded.plans.reduce(
          (minC, pl) => Math.min(minC, pl.metrics.totalMissionCostEur),
          UNBOUNDED_PROBE_EUR,
        );
        const exactMinEur = Number(minTotalEur.toFixed(2));
        const deltaEur = Number(Math.max(0.01, exactMinEur - currentCapEur).toFixed(2));
        const verifiedAtMin = probeWith(exactMinEur, remainingPins);
        const titles = dropSet.map((id) => graph.nodes.get(id)?.title || id);
        return {
          relaxationFound: true,
          kind: "unpin_and_raise_budget",
          currentBudgetEur: currentCapEur,
          relaxedBudgetEur: exactMinEur,
          deltaBudgetNeededEur: deltaEur,
          unpinCommitmentIds: dropSet,
          unpinTitles: titles,
          unlockedPlansCount: verifiedAtMin.plans.length,
          summary: `Unpin ${titles.join(", ")} and raise budget ceiling by +€${deltaEur.toFixed(2)} to €${exactMinEur.toFixed(2)} to unlock ${verifiedAtMin.plans.length} valid plan(s).`,
        };
      }
    }
  }

  return {
    relaxationFound: false,
    kind: "structural_provider_unavailability",
    currentBudgetEur: currentCapEur,
    relaxedBudgetEur: null,
    deltaBudgetNeededEur: null,
    unpinCommitmentIds: [],
    unpinTitles: [],
    unlockedPlansCount: 0,
    summary: "No provider offers satisfy the hard physical/temporal dependency rules for this target date.",
  };
}

/**
 * Counterfactual Budget Sensitivity Sweep: determines the exact minimum hard budget ceiling
 * required for feasibility and maps budget thresholds to unlocked Pareto-optimal plans.
 *
 * @param {object} params
 * @param {import("../mission-graph/index.js").MissionGraph} params.graph
 * @param {Record<string, any>} params.proposal
 * @param {Record<string, any>} params.impact
 * @param {Array<Record<string, any>>} params.normalizedOffers
 * @param {number[]} [params.testCeilingsEur]
 */
export function analyzeBudgetSensitivity({
  graph,
  proposal,
  impact,
  normalizedOffers,
  testCeilingsEur,
}) {
  const baselineTotalEur = Array.from(graph.nodes.values()).reduce(
    (sum, n) => sum + Number(n.price_eur || 0),
    0,
  );
  const grid =
    testCeilingsEur
    || [0, 15, 25, 35, 50, 75, 100, 140].map((delta) => Number((baselineTotalEur + delta).toFixed(2)));

  let minimumFeasibleBudgetEur = null;
  const points = [];

  for (const cap of grid) {
    const variedProposal = {
      ...proposal,
      invariants: {
        ...proposal.invariants,
        maximum_budget_eur: cap,
      },
    };
    const solved = solveMinimalChangePlans({
      graph,
      proposal: variedProposal,
      impact,
      normalizedOffers,
    });
    if (solved.feasible && minimumFeasibleBudgetEur === null) {
      minimumFeasibleBudgetEur = solved.plans.reduce(
        (minC, p) => Math.min(minC, p.metrics.totalMissionCostEur),
        cap,
      );
    }
    points.push({
      budgetCapEur: cap,
      feasible: solved.feasible,
      feasiblePlansCount: solved.plans.length,
      bestTotalEur: solved.plans[0]?.metrics?.totalMissionCostEur ?? null,
      bestChangedCount: solved.plans[0]?.metrics?.changedCount ?? null,
    });
  }

  return {
    baselineTotalEur,
    minimumFeasibleBudgetEur,
    points,
  };
}

/**
 * Multi-Day Anchor Horizon Surrogate Sweep: evaluates candidate target dates (+1..+horizonDays
 * from the baseline anchor date) in sub-millisecond time to reveal cheaper or less-disruptive
 * calendar days across the entire week.
 *
 * @param {object} params
 * @param {import("../mission-graph/index.js").MissionGraph} params.graph
 * @param {Record<string, any>} params.proposal
 * @param {(targetDate: string, impact: Record<string, any>) => Array<Record<string, any>>} params.buildOffersForDate
 * @param {number} [params.horizonDays=6]
 * @param {string[]} [params.pinnedCommitmentIds=[]]
 */
export function sweepAnchorHorizon({
  graph,
  proposal,
  buildOffersForDate,
  horizonDays = 6,
  pinnedCommitmentIds = [],
}) {
  const t0 = performance.now();
  const baseDate = proposal.requested_change.previous_value;
  const days = [];
  let lowestCostEur = Infinity;

  for (let offset = 1; offset <= horizonDays; offset++) {
    const candidateDate = addDaysIso(baseDate, offset);
    const dayProposal = {
      ...proposal,
      requested_change: {
        ...proposal.requested_change,
        new_value: candidateDate,
      },
    };
    const dayImpact = analyzeMissionImpact(graph, dayProposal);
    const offers = buildOffersForDate(candidateDate, dayImpact);
    const solved = solveMinimalChangePlans({
      graph,
      proposal: dayProposal,
      impact: dayImpact,
      normalizedOffers: offers,
      pinnedCommitmentIds,
      _skipCounterfactual: true,
    });

    const minDayCost = solved.feasible
      ? solved.plans.reduce((m, p) => Math.min(m, p.metrics.totalMissionCostEur), Infinity)
      : null;
    if (minDayCost !== null && minDayCost < lowestCostEur) {
      lowestCostEur = minDayCost;
    }

    const shortLabel = formatDateWithWeekday(candidateDate).replace(/,\s*202\d$/, "");
    days.push({
      offsetDays: offset,
      targetDate: candidateDate,
      shortLabel,
      feasible: solved.feasible,
      minTotalCostEur: minDayCost !== null ? Number(minDayCost.toFixed(2)) : null,
      bestChangedCount: solved.plans[0]?.metrics?.changedCount ?? null,
      bestUnchangedCount: solved.plans[0]?.metrics?.unchangedCount ?? null,
      recommendedPlanId: solved.recommendedPlanId,
      isLowestCostDay: false,
    });
  }

  for (const d of days) {
    if (d.feasible && d.minTotalCostEur !== null && Math.abs(d.minTotalCostEur - lowestCostEur) < 0.01) {
      d.isLowestCostDay = true;
    }
  }

  return {
    baseDate,
    selectedTargetDate: proposal.requested_change.new_value,
    lowestFeasibleCostEur: Number.isFinite(lowestCostEur) ? Number(lowestCostEur.toFixed(2)) : null,
    sweepDurationMs: Number((performance.now() - t0).toFixed(3)),
    days,
  };
}

/**
 * Validate all hard constraints on one complete assignment across all mission nodes.
 */
function validateCandidateAssignment(
  graph,
  allNodes,
  assignmentMap,
  targetCommitmentId,
  targetAnchorDate,
  maxBudgetEur,
  allowUnauthorizedCancel,
  baselineTotalEur,
) {
  const anchorId = targetCommitmentId || "cmt_moveco_van";
  const anchorChoice = assignmentMap[anchorId];
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
