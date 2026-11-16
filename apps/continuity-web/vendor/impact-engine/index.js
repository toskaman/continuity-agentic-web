/**
 * @module @continuity/impact-engine
 * Bounded Incremental Impact Analysis over an Open Mission Graph.
 *
 * When a mission constraint or anchor commitment changes:
 * 1. Identifies directly affected nodes.
 * 2. Traverses outgoing dependency edges within bounded depth.
 * 3. Evaluates semantic edge predicates against the proposed change.
 * 4. Excludes unaffected commitments so their providers are NEVER unnecessarily contacted or modified.
 * 5. Emits verifiable efficiency metrics (nodes examined, providers contacted, operations avoided, duration).
 */

import { diffDaysIso } from "../mission-core/index.js";
import { EDGE_TYPES } from "../mission-graph/index.js";
import { deepFreezeJson, isValidIsoDate } from "../shared-schemas/index.js";

/**
 * Evaluate whether a dependent node (`targetNode`) is violated or requires re-alignment
 * when `sourceNode` moves to `proposedSourceDate`.
 *
 * @param {Record<string, any>} edge
 * @param {string} proposedSourceDate
 * @param {Record<string, any>} targetNode
 * @returns {{ affected: boolean, hardViolation: boolean, reason: string }}
 */
export function evaluateEdgeImpact(edge, proposedSourceDate, targetNode) {
  if (!isValidIsoDate(proposedSourceDate)) {
    throw new Error(`Invalid proposedSourceDate "${proposedSourceDate}" in evaluateEdgeImpact.`);
  }
  const targetDate = targetNode.scheduled_date;

  if (edge.type === EDGE_TYPES.SAME_DAY_REQUIRED) {
    if (targetDate !== proposedSourceDate) {
      if (edge.rule?.softAlignmentOnly) {
        if (diffDaysIso(targetDate, proposedSourceDate) >= 0) {
          return {
            affected: true,
            hardViolation: false,
            reason: `${targetNode.title} (${targetDate}) activates before ${proposedSourceDate}; optional zero-fee alignment to ${proposedSourceDate} available.`,
          };
        }
      }
      return {
        affected: true,
        hardViolation: true,
        reason: `${targetNode.title} is scheduled for ${targetDate}, but ${edge.rationale}`,
      };
    }
    return {
      affected: false,
      hardViolation: false,
      reason: `${targetNode.title} already matches ${proposedSourceDate}.`,
    };
  }

  if (edge.type === EDGE_TYPES.ON_OR_AFTER) {
    const offset = diffDaysIso(proposedSourceDate, targetDate); // target - source
    const minOffset = edge.rule?.minOffsetDays ?? 0;
    const maxOffset = edge.rule?.maxOffsetDays ?? 365;
    if (offset < minOffset) {
      return {
        affected: true,
        hardViolation: true,
        reason: `${targetNode.title} (${targetDate}) would occur BEFORE ${proposedSourceDate}; ${edge.rationale}`,
      };
    }
    if (offset > maxOffset) {
      return {
        affected: true,
        hardViolation: false,
        reason: `${targetNode.title} (${targetDate}) exceeds preferred ${maxOffset}-day window after ${proposedSourceDate}.`,
      };
    }
    return {
      affected: false,
      hardViolation: false,
      reason: `${targetNode.title} (${targetDate}) already occurs ${offset} day(s) after ${proposedSourceDate} — preserved untouched.`,
    };
  }

  if (edge.type === EDGE_TYPES.ON_OR_BEFORE) {
    const offset = diffDaysIso(proposedSourceDate, targetDate); // target - source (>=0 means source is ON_OR_BEFORE target!)
    const minOffset = edge.rule?.minOffsetDays ?? 0;
    const maxOffset = edge.rule?.maxOffsetDays ?? 365;
    if (offset < minOffset) {
      return {
        affected: true,
        hardViolation: true,
        reason: `Prerequisite ${edge.from} (${proposedSourceDate}) violates ${minOffset}-day lead before ${targetNode.title} (${targetDate}).`,
      };
    }
    if (offset > maxOffset) {
      return {
        affected: true,
        hardViolation: false,
        reason: `Prerequisite (${proposedSourceDate}) exceeds preferred ${maxOffset}-day window before ${targetNode.title} (${targetDate}).`,
      };
    }
    return {
      affected: false,
      hardViolation: false,
      reason: `Prerequisite (${proposedSourceDate}) activates on or before ${targetNode.title} (${targetDate}).`,
    };
  }

  if (edge.type === EDGE_TYPES.WITHIN_COVERAGE_SPAN) {
    const start = edge.rule?.coverageStart || targetNode.scheduled_date;
    const end = edge.rule?.coverageEnd || targetNode.valid_until || targetNode.scheduled_date;
    const afterStart = diffDaysIso(start, proposedSourceDate) >= 0;
    const beforeEnd = diffDaysIso(proposedSourceDate, end) >= 0;
    if (!afterStart || !beforeEnd) {
      return {
        affected: true,
        hardViolation: true,
        reason: `New date ${proposedSourceDate} falls outside ${targetNode.title} coverage [${start}..${end}].`,
      };
    }
    return {
      affected: false,
      hardViolation: false,
      reason: `${targetNode.title} covers [${start}..${end}], which safely includes ${proposedSourceDate} — preserved untouched.`,
    };
  }

  return {
    affected: false,
    hardViolation: false,
    reason: "No temporal conflict detected.",
  };
}

/**
 * Run bounded incremental impact analysis on `graph` for `compiledProposal`.
 *
 * @param {import("../mission-graph/index.js").MissionGraph} graph
 * @param {Record<string, any>} compiledProposal
 * @returns {{
 *   anchorId: string,
 *   previousDate: string,
 *   targetDate: string,
 *   directlyAffectedIds: string[],
 *   transitivelyAffectedIds: string[],
 *   hardAffectedIds: string[],
 *   softCandidateIds: string[],
 *   unaffectedIds: string[],
 *   providersToContact: Array<{ providerId: string, providerName: string, origin: string, peerNetworkUrl: string | null, commitmentId: string, reason: string }>,
 *   providersSkipped: Array<{ providerId: string, providerName: string, commitmentId: string, reason: string }>,
 *   nodeDecisions: Record<string, { status: "AFFECTED_HARD" | "AFFECTED_SOFT" | "UNCHANGED", reasons: string[] }>,
 *   metrics: {
 *     totalNodes: number,
 *     nodesExamined: number,
 *     edgesEvaluated: number,
 *     providersContactedCount: number,
 *     unnecessaryOperationsAvoided: number,
 *     computationDurationMs: number
 *   }
 * }}
 */
export function analyzeMissionImpact(graph, compiledProposal) {
  const t0 = performance.now();
  const change = compiledProposal.requested_change;
  const anchorId = change.target_commitment_id;
  const targetDate = change.new_value;
  const previousDate = change.previous_value;

  const anchorNode = graph.nodes.get(anchorId);
  if (!anchorNode) {
    throw new Error(`Impact analysis target commitment "${anchorId}" not found in MissionGraph.`);
  }

  /** @type {Map<string, { status: "AFFECTED_HARD" | "AFFECTED_SOFT" | "UNCHANGED", reasons: string[], projectedDate: string }>} */
  const decisions = new Map();
  let nodesExamined = 0;
  let edgesEvaluated = 0;

  // Initialize anchor decision
  nodesExamined += 1;
  const anchorChanged = anchorNode.scheduled_date !== targetDate;
  decisions.set(anchorId, {
    status: anchorChanged ? "AFFECTED_HARD" : "UNCHANGED",
    reasons: anchorChanged
      ? [`User requested primary ${change.field} shift from ${anchorNode.scheduled_date} to ${targetDate}.`]
      : [`Target date ${targetDate} matches existing schedule.`],
    projectedDate: targetDate,
  });

  // Bounded BFS over dependent subgraph ONLY when a node is affected
  const queue = anchorChanged ? [{ nodeId: anchorId, projectedDate: targetDate, depth: 0 }] : [];
  const visitedInQueue = new Set([anchorId]);

  while (queue.length > 0) {
    const { nodeId, projectedDate, depth } = queue.shift();
    if (depth > 12) {
      throw new Error("Impact traversal exceeded maximum subgraph depth (12).");
    }

    for (const edge of graph.outgoingEdges(nodeId)) {
      edgesEvaluated += 1;
      const depNode = graph.nodes.get(edge.to);
      if (!depNode) continue;
      nodesExamined += 1;

      const evalResult = evaluateEdgeImpact(edge, projectedDate, depNode);
      const prevDecision = decisions.get(depNode.id);

      if (evalResult.affected) {
        const wasHard = prevDecision?.status === "AFFECTED_HARD";
        const nextStatus = evalResult.hardViolation || wasHard ? "AFFECTED_HARD" : "AFFECTED_SOFT";
        const combinedReasons = Array.from(new Set([...(prevDecision?.reasons || []), evalResult.reason]));
        decisions.set(depNode.id, {
          status: nextStatus,
          reasons: combinedReasons,
          projectedDate,
        });

        // Propagate hard date shifts downstream (including diamond-DAG upgrades from SOFT -> HARD!)
        if (evalResult.hardViolation && (!visitedInQueue.has(depNode.id) || !wasHard)) {
          visitedInQueue.add(depNode.id);
          queue.push({ nodeId: depNode.id, projectedDate, depth: depth + 1 });
        }
      } else if (!prevDecision) {
        decisions.set(depNode.id, {
          status: "UNCHANGED",
          reasons: [evalResult.reason],
          projectedDate: depNode.scheduled_date,
        });
      }
    }
  }

  // Any completely disconnected nodes remain untouched without even edge traversal
  for (const [id, node] of graph.nodes.entries()) {
    if (!decisions.has(id)) {
      decisions.set(id, {
        status: "UNCHANGED",
        reasons: ["Independent commitment with no dependency path from modified node — preserved untouched."],
        projectedDate: node.scheduled_date,
      });
    }
  }

  const directlyAffectedIds = anchorChanged ? [anchorId] : [];
  const transitivelyAffectedIds = [];
  const hardAffectedIds = [];
  const softCandidateIds = [];
  const unaffectedIds = [];
  const providersToContact = [];
  const providersSkipped = [];
  const nodeDecisions = {};

  for (const [id, node] of graph.nodes.entries()) {
    const dec = decisions.get(id);
    nodeDecisions[id] = { status: dec.status, reasons: dec.reasons };

    if (dec.status === "AFFECTED_HARD" || dec.status === "AFFECTED_SOFT") {
      if (id !== anchorId) transitivelyAffectedIds.push(id);
      if (dec.status === "AFFECTED_HARD") hardAffectedIds.push(id);
      else softCandidateIds.push(id);

      graph.updateNode(id, { visual_state: "AFFECTED" });
      providersToContact.push({
        providerId: node.provider_id,
        providerName: node.provider_name,
        origin: node.provider_origin,
        peerNetworkUrl: node.peer_network_url || null,
        commitmentId: id,
        reason: dec.reasons[0],
      });
    } else {
      unaffectedIds.push(id);
      graph.updateNode(id, { visual_state: "UNCHANGED" });
      providersSkipped.push({
        providerId: node.provider_id,
        providerName: node.provider_name,
        commitmentId: id,
        reason: dec.reasons[0],
      });
    }
  }

  const computationDurationMs = Number((performance.now() - t0).toFixed(3));

  return {
    anchorId,
    previousDate,
    targetDate,
    directlyAffectedIds,
    transitivelyAffectedIds,
    hardAffectedIds,
    softCandidateIds,
    unaffectedIds,
    providersToContact,
    providersSkipped,
    nodeDecisions,
    metrics: deepFreezeJson({
      totalNodes: graph.nodes.size,
      nodesExamined,
      edgesEvaluated,
      providersContactedCount: providersToContact.length,
      unnecessaryOperationsAvoided: unaffectedIds.length,
      blastRadiusRatio:
        graph.nodes.size > 0 ? Number((hardAffectedIds.length / graph.nodes.size).toFixed(3)) : 0,
      computationDurationMs,
    }),
  };
}
