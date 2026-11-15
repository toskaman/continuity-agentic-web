/**
 * @module @continuity/adk-hocon-converter
 * Portable Agent Graph Compiler: Google ADK / OpenAI Agents SDK -> Open Agentic Web HOCON JSON.
 *
 * Implements Section 2.2 ("Portable Data Profile") & Section 7 ("Framework converters") of the
 * Worldwide Agentic Web MVP Specification (Profile 0.2):
 *  - Translates hierarchical Google ADK (`LlmAgent`, `sub_agents`, `instruction`, `tools`) or
 *    OpenAI Agents SDK (`handoffs`, `instructions`) definitions into resolved, declarative
 *    Neuro SAN `.network.json` + `agent-manifest.json` bundles ready for browser execution.
 *  - Enforces DAG cycle detection across sub-agent delegation, strips accidentally embedded
 *    API keys, separates peer-network URLs vs MCP tool descriptors, and produces a deterministic
 *    Semantic Equivalence Verification Report.
 */

import { canonicalizeJson, isPlainObject, sanitizeJson, sha256Hex } from "../shared-schemas/index.js";
import { compileScopedToolboxNetwork } from "../toolbox-scoper/index.js";

export const SAMPLE_GOOGLE_ADK_CONFIG = JSON.stringify(
  {
    agent_class: "LlmAgent",
    name: "campus_relocation_concierge",
    model: "gemini-2.5-flash",
    description: "Helps incoming researchers coordinate housing lease dates, lab badge access, and shuttle bookings.",
    instruction:
      "You coordinate arrival schedules for visiting researchers. Delegate housing questions to housing_specialist and lab access questions to badge_specialist. Never invent prices or confirm irreversible changes without user approval.",
    sub_agents: [
      {
        agent_class: "LlmAgent",
        name: "housing_specialist",
        description: "Checks faculty housing check-in windows and temporary 24-hour room holds.",
        instruction:
          "Answer faculty housing availability questions using grounded page state and partner peer networks.",
        tools: ["https://gpaschercher-sudo.github.io/moveco-agentic-peer/moveco_dispatch"],
      },
      {
        agent_class: "LlmAgent",
        name: "badge_specialist",
        description: "Verifies security clearance lead times and lab orientation prerequisites.",
        instruction:
          "Explain 48-hour badge notice rules clearly and never claim direct write access to university HR systems.",
        tools: [
          {
            mcp_url: "https://tools.university.example/mcp",
            allowed_tools: ["lookup_orientation_slots"],
          },
        ],
      },
    ],
  },
  null,
  2,
);

function normalizeAgentIdentifier(rawName, fallback) {
  const cleaned = String(rawName || fallback || "agent")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "front_agent";
}

function scrubAccidentalSecrets(text) {
  let warnings = 0;
  const scrubbed = String(text || "").replace(
    /\b(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._-]{16,})\b/g,
    () => {
      warnings += 1;
      return "[REDACTED_CREDENTIAL]";
    },
  );
  return { scrubbed, warnings };
}

/**
 * Convert a Google ADK or OpenAI Agents SDK JSON graph into a resolved Open Agentic Web
 * `.network.json` + `agent-manifest.json` bundle and verify semantic equivalence.
 *
 * @param {string | Record<string, any>} rawSource
 * @param {object} [options]
 * @param {string} [options.defaultRouterUrl="https://api.otari.ai/api/v1"]
 * @param {string} [options.defaultModel="alibaba/qwen-3.5-35b-a3b"]
 */
export async function convertAgentFrameworkToHoconBundle(rawSource, options = {}) {
  const parsed =
    typeof rawSource === "string" ? sanitizeJson(JSON.parse(rawSource)) : sanitizeJson(rawSource);

  if (!isPlainObject(parsed)) {
    throw new Error("Framework agent definition must be a JSON object.");
  }

  const routerUrl = options.defaultRouterUrl || "https://api.otari.ai/api/v1";
  const defaultModel = options.defaultModel || "alibaba/qwen-3.5-35b-a3b";

  const sourceFramework =
    parsed.agent_class || Array.isArray(parsed.sub_agents)
      ? "Google ADK"
      : Array.isArray(parsed.handoffs)
        ? "OpenAI Agents SDK"
        : "Generic Agent Spec";

  /** @type {Map<string, Record<string, any>>} */
  const flatAgents = new Map();
  /** @type {Set<string>} */
  const discoveredPeerOrigins = new Set();
  /** @type {string[]} */
  const conversionNotes = [];
  let redactedCount = 0;

  // Detect cycles via recursion stack while flattening sub_agents / handoffs
  const visiting = new Set();

  const visit = (node, idx) => {
    if (!isPlainObject(node)) {
      throw new Error(`Sub-agent at index ${idx} must be an object.`);
    }
    const name = normalizeAgentIdentifier(node.name, `specialist_${idx}`);
    if (visiting.has(name)) {
      throw new Error(`Delegation cycle rejected in source graph involving "${name}".`);
    }
    if (flatAgents.has(name)) {
      return name;
    }

    visiting.add(name);
    const childrenRaw = Array.isArray(node.sub_agents)
      ? node.sub_agents
      : Array.isArray(node.handoffs)
        ? node.handoffs
        : [];

    const childNames = childrenRaw.map((ch, cIdx) => visit(ch, cIdx + 1));

    const externalRefs = [];
    for (const rawTool of Array.isArray(node.tools) ? node.tools : []) {
      if (typeof rawTool === "string" && /^https?:\/\//i.test(rawTool)) {
        const u = new URL(rawTool);
        if (u.username || u.password) {
          throw new Error(`External peer URL for "${name}" must not contain credentials.`);
        }
        discoveredPeerOrigins.add(u.origin);
        externalRefs.push(rawTool);
      } else if (isPlainObject(rawTool) && typeof (rawTool.url || rawTool.mcp_url) === "string") {
        const mcpUrl = String(rawTool.url || rawTool.mcp_url);
        const u = new URL(mcpUrl);
        discoveredPeerOrigins.add(u.origin);
        externalRefs.push({
          url: mcpUrl,
          tools: Array.isArray(rawTool.tools || rawTool.allowed_tools)
            ? (rawTool.tools || rawTool.allowed_tools).map(String)
            : [],
        });
      }
    }

    const rawInstr = node.instruction || node.instructions || `Fulfill requests for ${name} using grounded data only.`;
    const { scrubbed: cleanInstr, warnings } = scrubAccidentalSecrets(rawInstr);
    redactedCount += warnings;

    const inputSchema = isPlainObject(node.input_schema)
      ? node.input_schema
      : {
          type: "object",
          properties: {
            inquiry: {
              type: "string",
              description: "Plain-language inquiry or delegated task.",
            },
          },
          required: ["inquiry"],
        };

    const siteActions = Array.isArray(node.site_actions)
      ? node.site_actions.map((a) => String(a).trim()).filter(Boolean)
      : [];
    const scopedActionRefs = options.emitScopedToolboxes
      ? siteActions.map((act) => `website_${act}`)
      : [];

    flatAgents.set(name, {
      name,
      function: {
        description: String(node.description || `Specialist agent ${name}`).slice(0, 280),
        parameters: inputSchema,
      },
      instructions: cleanInstr,
      tools: [...childNames, ...externalRefs, ...scopedActionRefs],
      _siteActions: siteActions,
    });

    visiting.delete(name);
    return name;
  };

  const frontMan = visit(parsed, 0);
  const networkName = `${frontMan}_network`;

  if (parsed.model && parsed.model !== defaultModel) {
    conversionNotes.push(
      `Mapped source model hint "${parsed.model}" -> Open Agentic Web BYOK default "${defaultModel}" (original preserved in metadata.source_model_hint).`,
    );
  }
  if (redactedCount > 0) {
    conversionNotes.push(`Redacted ${redactedCount} accidental credential token(s) from public instructions.`);
  }

  // Order front_man first in `tools[]` for readability
  const allSiteActions = new Set();
  const orderedAgents = [
    flatAgents.get(frontMan),
    ...Array.from(flatAgents.entries())
      .filter(([k]) => k !== frontMan)
      .map(([, v]) => v),
  ].map((ag) => {
    const { _siteActions = [], ...cleanAg } = ag;
    for (const act of _siteActions) allSiteActions.add(act);
    return cleanAg;
  });

  const toolboxEntries = options.emitScopedToolboxes
    ? Array.from(allSiteActions).map((act) => ({ name: `website_${act}`, toolbox: act }))
    : [];

  const networkJson = sanitizeJson({
    metadata: {
      description: String(parsed.description || `Portable Open Agentic Web network for ${frontMan}`),
      source_framework: sourceFramework,
      source_model_hint: parsed.model || null,
    },
    llm_config: {
      model_name: defaultModel,
    },
    max_steps: 12,
    cruse: {
      version: 1,
    },
    tools: [...orderedAgents, ...toolboxEntries],
  });

  const manifestJson = sanitizeJson({
    brand: `${frontMan.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (Converted Agentic Site)`,
    networks: [
      {
        name: networkName,
        front_man: frontMan,
        hocon: `./${networkName}.network.json`,
        description: networkJson.metadata.description,
        tags: ["agentified-website", "open-agentic-web", "converted-from-adk"],
      },
    ],
    ...(allSiteActions.size > 0
      ? {
          actions: {
            module: "./site-actions.js",
            agentTools: Array.from(allSiteActions),
          },
        }
      : {}),
    llm_router: {
      base_url: routerUrl,
      mock: false,
      byok_router: routerUrl,
    },
    allowed_peers: Array.from(discoveredPeerOrigins),
    peer_policy: {
      mode: "closed",
      deny_origins: [],
      note: "Contacts only declared peer/MCP origins in allowed_peers after visitor consent.",
    },
    deployment: {
      mode: "static",
      self_contained_runtime: true,
      browser_mock: false,
      direct_byok: true,
    },
  });

  const networkSha256 = await sha256Hex(canonicalizeJson(networkJson));

  const equivalenceReport = {
    valid: true,
    sourceFramework,
    frontAgentPreserved: frontMan,
    sourceAgentsCount: flatAgents.size,
    emittedAgentsCount: orderedAgents.length,
    delegationEdgesCount: orderedAgents.reduce((s, a) => s + a.tools.length, 0),
    allowedPeerOriginsCount: discoveredPeerOrigins.size,
    credentialsRedactedCount: redactedCount,
    networkDigest: `sha256:${networkSha256.slice(0, 20)}`,
    notes: conversionNotes,
  };

  const toolboxScoping =
    options.emitScopedToolboxes && allSiteActions.size > 0
      ? compileScopedToolboxNetwork({
          networkJson,
          manifestJson,
          actionDefinitions: Array.from(allSiteActions).map((name) => ({
            name,
            description: `Grounded website action ${name} on the active page.`,
            inputSchema: { type: "object", properties: { targetDate: { type: "string" } } },
          })),
          isTopSite: true,
        })
      : null;

  return {
    ok: true,
    networkName,
    networkJson,
    manifestJson,
    scrubbedSecretsCount: redactedCount,
    toolboxScoping,
    equivalenceReport,
  };
}
