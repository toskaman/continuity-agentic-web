/**
 * @module @continuity/toolbox-scoper
 * Least-Privilege Per-Agent `website_*` Action Scoper & Token-Budget Optimizer.
 *
 * Implements `cognizant-ai-labs/agentic-web` Issue #28 ("Give each agent its own website
 * actions with toolbox entries") and Issue #21 ("Move tool guidance into action descriptions"):
 *  1. Supports Neuro SAN `{ "name": "website_<action>", "toolbox": "<action>" }` entries in
 *     resolved `.network.json` graphs so each sub-agent receives ONLY the site actions it needs.
 *  2. Enforces `manifest.actions.agentTools` as the authoritative site-level ceiling (refuses
 *     any sub-agent toolbox entry that attempts to claim an undeclared action).
 *  3. Enforces MVP Profile 0.2 isolation: when `isTopSite === false` (peer running inside a
 *     caller's browser), every agent receives `0` website actions.
 *  4. Computes exact per-turn schema character savings vs broadcasting all `agentTools` to every agent.
 */

import { isPlainObject, sanitizeJson } from "../shared-schemas/index.js";

/**
 * Validate and resolve per-agent `website_*` tool visibility for a multi-agent network.
 *
 * @param {object} params
 * @param {Record<string, any>} params.networkJson
 * @param {Record<string, any>} params.manifestJson
 * @param {Array<{ name: string, description?: string, effect?: string, inputSchema?: Record<string, any> }>} [params.actionDefinitions=[]]
 * @param {boolean} [params.isTopSite=true]
 */
export function compileScopedToolboxNetwork({
  networkJson,
  manifestJson,
  actionDefinitions = [],
  isTopSite = true,
}) {
  const cleanNet = sanitizeJson(networkJson || {});
  const cleanMan = sanitizeJson(manifestJson || {});
  const allowedAgentTools = new Set(
    Array.isArray(cleanMan?.actions?.agentTools) ? cleanMan.actions.agentTools : [],
  );
  const defsByName = new Map(actionDefinitions.map((d) => [d.name, d]));

  const rawEntries = Array.isArray(cleanNet.tools) ? cleanNet.tools.filter(isPlainObject) : [];
  const toolboxEntries = rawEntries.filter((e) => typeof e.toolbox === "string" && e.toolbox.trim());
  const agentEntries = rawEntries.filter((e) => typeof e.toolbox !== "string");

  // Partner networks running inside another site's browser never receive website_* tools
  if (!isTopSite) {
    const emptyMap = Object.fromEntries(agentEntries.map((a) => [String(a.name), []]));
    return {
      ok: true,
      mode: "PARTNER_ISOLATED_ZERO_ACTIONS",
      errors: [],
      exposedToolsByAgent: emptyMap,
      agentsWithWebsiteNote: [],
      metrics: {
        agentsCount: agentEntries.length,
        broadcastSchemaChars: 0,
        scopedSchemaChars: 0,
        savedCharsPerTurn: 0,
        reductionPercent: 100,
      },
    };
  }

  const errors = [];
  const toolboxMap = new Map(); // entryName -> actionName

  for (const tb of toolboxEntries) {
    const entryName = String(tb.name || "").trim();
    const targetAction = String(tb.toolbox || "").trim();
    if (!entryName) {
      errors.push("Toolbox entry is missing a valid name.");
      continue;
    }
    if (!allowedAgentTools.has(targetAction)) {
      errors.push(
        `Least-privilege violation: toolbox entry "${entryName}" references "${targetAction}", which is not permitted by manifest actions.agentTools.`,
      );
      continue;
    }
    if (defsByName.size > 0 && !defsByName.has(targetAction)) {
      errors.push(
        `Unregistered action: toolbox entry "${entryName}" references "${targetAction}", which is missing from site-actions.js.`,
      );
      continue;
    }
    toolboxMap.set(entryName, targetAction);
  }

  const serializeToolChars = (actionName) => {
    const def = defsByName.get(actionName) || { name: actionName, description: "", inputSchema: {} };
    return JSON.stringify({
      name: `website_${actionName}`,
      description: def.description || "",
      parameters: def.inputSchema || {},
    }).length;
  };

  const singleBroadcastAgentChars = Array.from(allowedAgentTools).reduce(
    (sum, a) => sum + serializeToolChars(a),
    0,
  );
  const broadcastSchemaChars = singleBroadcastAgentChars * agentEntries.length;

  const exposedToolsByAgent = {};
  const agentsWithWebsiteNote = [];
  let scopedSchemaChars = 0;

  if (toolboxEntries.length === 0) {
    // Backward-compatible rule: networks without toolbox entries expose all manifest agentTools
    const allTools = Array.from(allowedAgentTools);
    for (const ag of agentEntries) {
      const agName = String(ag.name);
      exposedToolsByAgent[agName] = allTools.map((a) => `website_${a}`);
      if (allTools.length > 0) agentsWithWebsiteNote.push(agName);
      scopedSchemaChars += singleBroadcastAgentChars;
    }
  } else {
    for (const ag of agentEntries) {
      const agName = String(ag.name);
      const refs = Array.isArray(ag.tools) ? ag.tools : [];
      const granted = [];
      for (const ref of refs) {
        if (typeof ref === "string" && toolboxMap.has(ref)) {
          const act = toolboxMap.get(ref);
          granted.push(ref);
          scopedSchemaChars += serializeToolChars(act);
        }
      }
      exposedToolsByAgent[agName] = granted;
      if (granted.length > 0) {
        agentsWithWebsiteNote.push(agName);
      }
    }
  }

  const savedCharsPerTurn = Math.max(0, broadcastSchemaChars - scopedSchemaChars);
  const reductionPercent =
    broadcastSchemaChars > 0
      ? Number(((savedCharsPerTurn / broadcastSchemaChars) * 100).toFixed(1))
      : 0;

  return {
    ok: errors.length === 0,
    mode: toolboxEntries.length > 0 ? "SCOPED_PER_AGENT_TOOLBOX" : "LEGACY_BROADCAST_ALL_AGENTS",
    errors,
    exposedToolsByAgent,
    agentsWithWebsiteNote,
    metrics: {
      agentsCount: agentEntries.length,
      broadcastSchemaChars,
      scopedSchemaChars,
      savedCharsPerTurn,
      reductionPercent,
    },
  };
}
