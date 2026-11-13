/**
 * @module @continuity/mission-graph
 * Typed, persistent Open Mission Graph for multi-provider commitments and dependencies.
 *
 * Explicitly separates:
 * - Observed provider facts (`observedState`, `lastVerifiedAt`, `evidence`)
 * - coordinator dependency semantics (`DEPENDENCY`, `TEMPORAL_WINDOW`, `PREREQUISITE`, `RESOURCE_CONFLICT`)
 *
 * Enforces bounded graph depth and cycle detection.
 */

import { sanitizeJson } from "../shared-schemas/index.js";

export const GRAPH_VISUAL_STATES = Object.freeze({
  UNCHANGED: { code: "UNCHANGED", label: "Unchanged (Preserved)", badge: "PRESERVED", icon: "●" },
  AFFECTED: { code: "AFFECTED", label: "Affected by Change", badge: "AFFECTED", icon: "◆" },
  EVALUATING: { code: "EVALUATING", label: "Under Evaluation", badge: "EVALUATING", icon: "◌" },
  PROPOSED: { code: "PROPOSED", label: "Proposed Modification", badge: "PROPOSED", icon: "◇" },
  PREPARED: { code: "PREPARED", label: "Prepared / Slot Held", badge: "PREPARED", icon: "▣" },
  AWAITING_APPROVAL: { code: "AWAITING_APPROVAL", label: "Awaiting User Approval", badge: "APPROVAL REQ", icon: "▲" },
  COMMITTED: { code: "COMMITTED", label: "Verified & Committed", badge: "COMMITTED", icon: "✓" },
  FAILED: { code: "FAILED", label: "Provider Refused / Failed", badge: "FAILED", icon: "✕" },
  UNKNOWN: { code: "UNKNOWN", label: "Outcome Unknown — Reconciling", badge: "UNKNOWN", icon: "?" },
  NEEDS_USER: { code: "NEEDS_USER", label: "Requires Human Intervention", badge: "HUMAN REQ", icon: "!" },
});

export const EDGE_TYPES = Object.freeze({
  SAME_DAY_REQUIRED: "SAME_DAY_REQUIRED",       // e.g. Parking bay permit must match exact moving van date
  ON_OR_AFTER: "ON_OR_AFTER",                   // e.g. Fiber install & furniture delivery must occur on or after move arrival
  ON_OR_BEFORE: "ON_OR_BEFORE",                 // e.g. Power grid must be active on or before move arrival
  WITHIN_COVERAGE_SPAN: "WITHIN_COVERAGE_SPAN", // e.g. Storage pod covers [start..valid_until]
  ALTERNATIVE_PROVIDER: "ALTERNATIVE_PROVIDER", // Backup peer relationship
  COMPENSATION_LINK: "COMPENSATION_LINK",       // Compensation action reference
});

const MAX_GRAPH_NODES = 64;
const MAX_GRAPH_DEPTH = 16;

export class MissionGraph {
  /**
   * @param {object} [initial]
   * @param {string} initial.missionId
   */
  constructor({ missionId } = {}) {
    this.missionId = missionId || "mission_default";
    /** @type {Map<string, Record<string, any>>} */
    this.nodes = new Map();
    /** @type {Array<Record<string, any>>} */
    this.edges = [];
  }

  /**
   * Add a commitment or capability node.
   * @param {Record<string, any>} node
   */
  addNode(node) {
    if (this.nodes.size >= MAX_GRAPH_NODES) {
      throw new Error(`MissionGraph limit exceeded: maximum ${MAX_GRAPH_NODES} nodes.`);
    }
    const clean = sanitizeJson(node);
    if (!clean.id || typeof clean.id !== "string") {
      throw new Error("MissionGraph node requires a string id.");
    }
    if (this.nodes.has(clean.id)) {
      throw new Error(`Duplicate MissionGraph node id "${clean.id}".`);
    }
    this.nodes.set(clean.id, {
      visual_state: "UNCHANGED",
      observed: {
        verified: true,
        last_verified_at: "2026-11-13T09:00:00Z",
        evidence_trust: "DEMO_FIXTURE_INITIAL",
        receipt_id: clean.booking_ref || null,
      },
      assumptions: [],
      ...clean,
    });
    return this;
  }

  /**
   * Add a semantic directed edge `from -> to` (`to` depends on `from`).
   * Rejects structural dependency cycles on hard dependency edges.
   * @param {object} edge
   * @param {string} edge.from
   * @param {string} edge.to
   * @param {string} edge.type
   * @param {string} edge.rationale
   * @param {Record<string, any>} [edge.rule]
   */
  addEdge(edge) {
    const clean = sanitizeJson(edge);
    if (!this.nodes.has(clean.from)) {
      throw new Error(`Edge source node "${clean.from}" does not exist.`);
    }
    if (!this.nodes.has(clean.to)) {
      throw new Error(`Edge target node "${clean.to}" does not exist.`);
    }
    if (clean.from === clean.to) {
      throw new Error(`Self-dependency cycle on node "${clean.from}" is forbidden.`);
    }
    if (!Object.values(EDGE_TYPES).includes(clean.type)) {
      throw new Error(`Unsupported edge type "${clean.type}".`);
    }

    // Check cycle before inserting
    this.edges.push(clean);
    const cycle = this.detectCycle();
    if (cycle) {
      this.edges.pop();
      const err = new Error(`Dependency cycle rejected: ${cycle.join(" -> ")}`);
      err.code = "DEPENDENCY_CYCLE";
      throw err;
    }
    return this;
  }

  /**
   * Detect any directed cycle in the graph using 3-color DFS.
   * @returns {string[] | null}
   */
  detectCycle() {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    for (const id of this.nodes.keys()) color.set(id, WHITE);

    const adj = new Map();
    for (const id of this.nodes.keys()) adj.set(id, []);
    for (const edge of this.edges) {
      if (edge.type !== EDGE_TYPES.ALTERNATIVE_PROVIDER && edge.type !== EDGE_TYPES.COMPENSATION_LINK) {
        adj.get(edge.from)?.push(edge.to);
      }
    }

    const dfs = (u, depth) => {
      if (depth > MAX_GRAPH_DEPTH) {
        throw new Error(`Graph depth exceeds maximum safety bound (${MAX_GRAPH_DEPTH}).`);
      }
      color.set(u, GRAY);
      for (const v of adj.get(u) || []) {
        if (color.get(v) === GRAY) {
          const path = [v, u];
          let cur = u;
          while (parent.has(cur) && cur !== v) {
            cur = parent.get(cur);
            path.push(cur);
          }
          return path.reverse();
        }
        if (color.get(v) === WHITE) {
          parent.set(v, u);
          const found = dfs(v, depth + 1);
          if (found) return found;
        }
      }
      color.set(u, BLACK);
      return null;
    };

    for (const id of this.nodes.keys()) {
      if (color.get(id) === WHITE) {
        const cycle = dfs(id, 0);
        if (cycle) return cycle;
      }
    }
    return null;
  }

  /**
   * Outgoing edges from a node.
   * @param {string} nodeId
   */
  outgoingEdges(nodeId) {
    return this.edges.filter((e) => e.from === nodeId);
  }

  /**
   * Update a node's state immutably in the map.
   * @param {string} nodeId
   * @param {Record<string, any>} patch
   */
  updateNode(nodeId, patch) {
    const existing = this.nodes.get(nodeId);
    if (!existing) {
      throw new Error(`Node "${nodeId}" not found.`);
    }
    const updated = sanitizeJson({ ...existing, ...patch });
    this.nodes.set(nodeId, updated);
    return updated;
  }

  /**
   * Export serializable graph snapshot for UI rendering and persistence.
   */
  toJSON() {
    return {
      missionId: this.missionId,
      nodes: Array.from(this.nodes.values()).map((n) => ({
        ...n,
        stateMeta: GRAPH_VISUAL_STATES[n.visual_state] || GRAPH_VISUAL_STATES.UNCHANGED,
      })),
      edges: this.edges.map((e) => ({ ...e })),
    };
  }

  /**
   * Build the standard relocation MissionGraph from a mission object.
   * @param {Record<string, any>} mission
   * @returns {MissionGraph}
   */
  static fromRelocationMission(mission) {
    const graph = new MissionGraph({ missionId: mission.mission_id });
    for (const cmt of mission.commitments) {
      graph.addNode(cmt);
    }

    // Semantic edges from primary move van (`cmt_moveco_van`) to dependent commitments
    graph.addEdge({
      from: "cmt_moveco_van",
      to: "cmt_permitflow_bay",
      type: EDGE_TYPES.SAME_DAY_REQUIRED,
      rationale: "Curbside loading bay permit draft must cover the exact date the moving van occupies the street.",
      rule: { maxOffsetDays: 0, minOffsetDays: 0 },
    });

    graph.addEdge({
      from: "cmt_moveco_van",
      to: "cmt_homeconnect_fiber",
      type: EDGE_TYPES.ON_OR_AFTER,
      rationale: "Fiber technician requires tenant presence at destination on or after moving arrival.",
      rule: { minOffsetDays: 0, maxOffsetDays: 3 },
    });

    graph.addEdge({
      from: "cmt_moveco_van",
      to: "cmt_powerflow_grid",
      type: EDGE_TYPES.SAME_DAY_REQUIRED,
      rationale: "Grid activation is soft-linked for optional alignment if move shifts, or can remain active earlier.",
      rule: { softAlignmentOnly: true },
    });

    graph.addEdge({
      from: "cmt_moveco_van",
      to: "cmt_storage_pod",
      type: EDGE_TYPES.WITHIN_COVERAGE_SPAN,
      rationale: "Buffer storage pod is already reserved from Nov 15 through Nov 29.",
      rule: { coverageStart: "2026-11-15", coverageEnd: "2026-11-29" },
    });

    graph.addEdge({
      from: "cmt_moveco_van",
      to: "cmt_furniture_drop",
      type: EDGE_TYPES.ON_OR_AFTER,
      rationale: "Modular furniture delivery must arrive on or after move-in day.",
      rule: { minOffsetDays: 0, maxOffsetDays: 14 },
    });

    // Secondary edge: Fiber ONT testing requires electricity active on or before fiber install date
    graph.addEdge({
      from: "cmt_powerflow_grid",
      to: "cmt_homeconnect_fiber",
      type: EDGE_TYPES.ON_OR_BEFORE,
      rationale: "Optical Network Terminal (ONT) line verification requires active apartment power.",
      rule: { maxPowerDateRelativeToFiber: 0 },
    });

    return graph;
  }
}
