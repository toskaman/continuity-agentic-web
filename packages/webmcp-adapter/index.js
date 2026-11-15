/**
 * @module @continuity/webmcp-adapter
 * Dual-Protocol Bridge between Cognizant Open Agentic Web (`site-actions.js`)
 * and W3C / Browser-Native WebMCP (`navigator.modelContext`).
 *
 * Why this matters for the Open Agentic Web community:
 * - Cognizant's Open Agentic Web runtime exposes page capabilities to portable in-page
 *   Neuro SAN networks as `website_*` tools.
 * - Browser-native agents, assistive screen-reader agents, and W3C WebMCP extensions
 *   discover page tools via `navigator.modelContext.registerTool` / `provideContext`.
 * - `exposeActionsToWebMcp()` lets any Open Agentic Website publish ONE schema-validated
 *   action catalog to BOTH ecosystems simultaneously while enforcing strict human
 *   confirmation on `irreversible` writes.
 */

import { assertValidSchema, sanitizeJson } from "../shared-schemas/index.js";

/**
 * Collect action descriptors from a `registerActions(registry)` function and expose them
 * both on `navigator.modelContext` (when supported by the browser/extension) and on an
 * inspectable read-only diagnostic catalog (`globalThis.__continuityWebMcpCatalog`).
 *
 * @param {(actions: { register: (def: Record<string, any>) => void }) => void} registerActionsFn
 * @param {object} [options]
 * @param {string} [options.namespace="continuity"]
 * @param {(toolDef: Record<string, any>, args: Record<string, any>) => Promise<boolean>} [options.confirmIrreversible]
 * @returns {{
 *   namespace: string,
 *   nativeWebMcpDetected: boolean,
 *   registeredTools: Array<{ name: string, description: string, effect: string, inputSchema: Record<string, any> }>,
 *   invokeTool: (name: string, rawArgs?: Record<string, any>) => Promise<unknown>
 * }}
 */
const NEURO_SAN_FRAMEWORK_ARGS = new Set(["activation_capsule", "sly_data"]);

function stripNeuroSanFrameworkArgs(rawObj) {
  if (!rawObj || typeof rawObj !== "object" || Array.isArray(rawObj)) return rawObj;
  const copy = {};
  for (const [k, v] of Object.entries(rawObj)) {
    if (!NEURO_SAN_FRAMEWORK_ARGS.has(k)) {
      copy[k] = v;
    }
  }
  return copy;
}

export function exposeActionsToWebMcp(registerActionsFn, options = {}) {
  const namespace = String(options.namespace || "continuity").trim();
  /** @type {Map<string, Record<string, any>>} */
  const defs = new Map();

  registerActionsFn({
    register(def) {
      if (!def || typeof def.name !== "string" || typeof def.execute !== "function") {
        throw new Error("Invalid site action definition passed to WebMCP adapter.");
      }
      defs.set(def.name, def);
    },
  });

  const confirmGate =
    options.confirmIrreversible
    || (async (toolDef, args) => {
      if (typeof globalThis.confirm === "function") {
        return globalThis.confirm(
          `[${namespace}] Confirm irreversible action "${toolDef.name}"?\n\nArguments:\n${JSON.stringify(args, null, 2)}`,
        );
      }
      return false;
    });

  const invokeTool = async (name, rawArgs = {}) => {
    const def = defs.get(name);
    if (!def) {
      throw new Error(`Unknown WebMCP tool "${name}" in namespace "${namespace}".`);
    }
    const cleanArgs = stripNeuroSanFrameworkArgs(sanitizeJson(rawArgs ?? {}));
    const validated = def.inputSchema
      ? assertValidSchema(def.inputSchema, cleanArgs, `WebMCP(${name})`)
      : cleanArgs;

    if (def.effect === "irreversible") {
      const approved = await confirmGate(def, validated);
      if (!approved) {
        return { ok: false, cancelled: true, reason: "User declined irreversible WebMCP action confirmation." };
      }
    }

    return await def.execute(validated);
  };

  const webMcpTools = Array.from(defs.values()).map((def) => ({
    name: `${namespace}_${def.name}`,
    localName: def.name,
    description: def.description,
    effect: def.effect || "read",
    inputSchema: def.inputSchema || { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: (def.effect || "read") === "read",
      consequentialHint: def.effect === "irreversible",
      destructiveHint: def.effect === "irreversible",
      openAgenticWebBridge: true,
    },
    execute: (args) => invokeTool(def.name, args),
  }));

  let nativeWebMcpDetected = false;
  const docMc =
    options.documentModelContext
    ?? (typeof document !== "undefined" ? document.modelContext : undefined);
  const navMc =
    options.navigatorModelContext
    ?? (typeof navigator !== "undefined" ? navigator.modelContext : undefined);
  const targets = Array.from(new Set([docMc, navMc].filter(Boolean)));
  for (const mc of targets) {
    nativeWebMcpDetected = true;
    try {
      if (typeof mc.registerTool === "function") {
        for (const tool of webMcpTools) {
          mc.registerTool({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            execute: tool.execute,
          });
        }
      } else if (typeof mc.provideContext === "function") {
        mc.provideContext({ tools: webMcpTools });
      }
    } catch {
      // Fail safely if an experimental browser flag implements a partial WebMCP draft
    }
  }

  const summaryCatalog = {
    protocol: "webmcp-open-agentic-bridge/v1",
    namespace,
    nativeWebMcpDetected,
    registeredAt: new Date().toISOString(),
    tools: webMcpTools.map((t) => ({
      name: t.name,
      localName: t.localName,
      description: t.description,
      effect: t.effect,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
    invokeTool,
  };

  if (typeof globalThis !== "undefined") {
    globalThis.__continuityWebMcpCatalog = summaryCatalog;
  }

  return {
    namespace,
    nativeWebMcpDetected,
    registeredTools: summaryCatalog.tools,
    invokeTool,
  };
}
