/**
 * @module @continuity/local-browser-router
 * Zero-Key Local & On-Device Inference Adapter for the Open Agentic Web (MVP Spec §4 & §7).
 *
 * Implements the `LlmClient` interface (`chat({ model, messages, tools, origin, parentSpan, onContentDelta, signal })`)
 * over two genuine zero-cloud-egress local runtimes:
 *  1. Chrome Built-in Prompt API (`globalThis.LanguageModel` / `globalThis.ai?.languageModel` — Gemini Nano on-device),
 *     using JSON Schema `responseConstraint` when `tools` are supplied so on-device models emit validated
 *     Neuro SAN `website_*` and partner network tool calls without cloud API keys.
 *  2. Local Loopback Ollama (`http://127.0.0.1:11434/v1`) auto-discovery probe with strict loopback-only boundary
 *     (never probes external origins or leaks credentials).
 */

import { isPlainObject, sanitizeJson } from "../shared-schemas/index.js";

const PREFERRED_LOCAL_MODEL_PATTERNS = [
  /qwen3/i,
  /qwen2\.5/i,
  /llama3\.[1-9]/i,
  /gemma4/i,
  /gemma3/i,
  /mistral/i,
  /deepseek/i,
];

function resolvePromptApiGlobal(env = globalThis) {
  if (env?.LanguageModel && typeof env.LanguageModel.create === "function") {
    return env.LanguageModel;
  }
  if (env?.ai?.languageModel && typeof env.ai.languageModel.create === "function") {
    return env.ai.languageModel;
  }
  return null;
}

/**
 * Probe available zero-key local inference backends on the visitor's machine without
 * contacting any non-loopback network host.
 *
 * @param {object} [options]
 * @param {any} [options.env=globalThis]
 * @param {typeof fetch} [options.fetchImpl=globalThis.fetch]
 * @param {string} [options.ollamaBaseUrl="http://127.0.0.1:11434/v1"]
 * @param {number} [options.timeoutMs=1200]
 */
export async function probeLocalInferenceBackends(options = {}) {
  const env = options.env || globalThis;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const ollamaBaseUrl = String(options.ollamaBaseUrl || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
  const timeoutMs = Number(options.timeoutMs || 1200);

  let chromeBuiltIn = { supported: false, status: "unavailable" };
  const promptApi = resolvePromptApiGlobal(env);
  if (promptApi) {
    try {
      let status = "available";
      if (typeof promptApi.availability === "function") {
        status = await promptApi.availability();
      } else if (typeof promptApi.capabilities === "function") {
        const caps = await promptApi.capabilities();
        status = caps?.available || "available";
      }
      const usable = status === "available" || status === "readily" || status === "downloadable" || status === "after-download";
      chromeBuiltIn = { supported: usable, status: String(status) };
    } catch (err) {
      chromeBuiltIn = { supported: false, status: `error: ${err.message}` };
    }
  }

  let ollamaLoopback = { supported: false, baseUrl: ollamaBaseUrl, models: [], recommendedModel: null };
  // Security boundary: ONLY probe explicit loopback addresses automatically
  let isSafeLoopback = false;
  try {
    const parsed = new URL(ollamaBaseUrl);
    isSafeLoopback =
      parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  } catch {
    isSafeLoopback = false;
  }

  if (isSafeLoopback && typeof fetchImpl === "function") {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${ollamaBaseUrl}/models`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (res.ok) {
        const body = sanitizeJson(await res.json());
        const models = (Array.isArray(body?.data) ? body.data : [])
          .map((m) => String(m?.id || "").trim())
          .filter(Boolean);
        if (models.length > 0) {
          let recommended = models[0];
          for (const rx of PREFERRED_LOCAL_MODEL_PATTERNS) {
            const hit = models.find((id) => rx.test(id));
            if (hit) {
              recommended = hit;
              break;
            }
          }
          ollamaLoopback = {
            supported: true,
            baseUrl: ollamaBaseUrl,
            models,
            recommendedModel: recommended,
          };
        }
      }
    } catch {
      // Loopback Ollama not running or CORS not enabled on local daemon — expected when absent
    } finally {
      clearTimeout(timer);
    }
  }

  const preferredBackend = chromeBuiltIn.supported
    ? "chrome-prompt-api"
    : ollamaLoopback.supported
      ? "ollama-loopback"
      : "none";

  return {
    preferredBackend,
    chromeBuiltIn,
    ollamaLoopback,
  };
}

/**
 * Build the JSON Schema `responseConstraint` used to turn Chrome's Built-in `LanguageModel`
 * (Gemini Nano) into a deterministic structured tool-calling agent client.
 *
 * @param {Array<Record<string, any>>} tools
 */
export function buildNanoToolDecisionSchema(tools = []) {
  const names = tools.map((t) => t?.function?.name).filter(Boolean);
  return {
    type: "object",
    additionalProperties: false,
    required: ["decision", "toolName", "toolArgumentsJson", "finalResponse"],
    properties: {
      decision: {
        type: "string",
        enum: names.length > 0 ? ["call_tool", "respond"] : ["respond"],
      },
      toolName: {
        type: "string",
        enum: names.length > 0 ? ["", ...names] : [""],
      },
      toolArgumentsJson: {
        type: "string",
      },
      finalResponse: {
        type: "string",
      },
    },
  };
}

/**
 * Serialize OpenAI-compatible `messages` + `tools` into a compact, grounded prompt
 * suitable for on-device context windows (4k–8k tokens) without leaking credentials.
 */
export function formatMessagesForOnDeviceModel(messages = [], tools = []) {
  const systemParts = [];
  const transcriptParts = [];

  for (const m of messages) {
    if (!m) continue;
    if (m.role === "system") {
      systemParts.push(String(m.content || "").slice(0, 3200));
    } else if (m.role === "user") {
      transcriptParts.push(`USER: ${String(m.content || "").slice(0, 1500)}`);
    } else if (m.role === "assistant") {
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const summary = m.tool_calls
          .map((tc) => `${tc.function?.name}(${tc.function?.arguments || "{}"})`)
          .join(", ");
        transcriptParts.push(`ASSISTANT_TOOL_CALL: ${summary}`);
      } else if (m.content) {
        transcriptParts.push(`ASSISTANT: ${String(m.content).slice(0, 1200)}`);
      }
    } else if (m.role === "tool") {
      transcriptParts.push(`TOOL_RESULT (${m.name || "tool"}): ${String(m.content || "").slice(0, 2200)}`);
    }
  }

  const toolCatalog = (tools || [])
    .map((t) => {
      const fn = t?.function;
      if (!fn?.name) return null;
      return `- ${fn.name}: ${String(fn.description || "").slice(0, 220)} | schema=${JSON.stringify(fn.parameters || { type: "object" })}`;
    })
    .filter(Boolean)
    .join("\n");

  const toolInstruction = toolCatalog
    ? `\nAVAILABLE TOOLS:\n${toolCatalog}\n\nReturn valid JSON matching the constraint: set decision="call_tool", toolName to an exact tool name, and toolArgumentsJson to a JSON object string when a tool is needed; otherwise set decision="respond", toolName="", toolArgumentsJson="{}", and write the grounded reply in finalResponse.`
    : "\nRespond concisely using only grounded facts from the conversation.";

  return {
    systemPrompt: `${systemParts.join("\n\n")}${toolInstruction}`.trim(),
    userPrompt: transcriptParts.slice(-10).join("\n\n") || "Hello",
  };
}

/**
 * Pluggable On-Device Browser Prompt API (`LanguageModel` / Gemini Nano) client
 * conforming to the Open Agentic Web runtime `LlmClient` contract.
 */
export class ChromeBuiltInPromptLlm {
  /**
   * @param {object} [options]
   * @param {any} [options.trace]
   * @param {any} [options.env=globalThis]
   */
  constructor(options = {}) {
    this.trace = options.trace || null;
    this.env = options.env || globalThis;
    this.mock = false;
    this.baseUrl = "browser://chrome-language-model";
    this._callSeq = 0;
  }

  async chat({ messages = [], tools = [], origin, parentSpan, onContentDelta, signal }) {
    const promptApi = resolvePromptApiGlobal(this.env);
    if (!promptApi) {
      throw new Error("Chrome Built-in LanguageModel API is not enabled in this browser.");
    }

    const span = this.trace?.start("model_call", {
      parent: parentSpan,
      origin,
      model: "chrome-built-in/gemini-nano",
      mock: false,
      routerHost: "on-device-browser-npu",
      endpoint: "browser://chrome-language-model",
      keySource: "none (on-device)",
      toolNames: (tools || []).map((t) => t.function?.name).filter(Boolean),
    });

    const { systemPrompt, userPrompt } = formatMessagesForOnDeviceModel(messages, tools);
    let session = null;

    try {
      signal?.throwIfAborted?.();
      session = await promptApi.create({
        initialPrompts: systemPrompt ? [{ role: "system", content: systemPrompt }] : undefined,
        signal,
      });

      if (tools && tools.length > 0) {
        const schema = buildNanoToolDecisionSchema(tools);
        const raw = await session.prompt(userPrompt, {
          responseConstraint: schema,
          signal,
        });
        const parsed = sanitizeJson(JSON.parse(String(raw || "{}")));
        const allowedNames = new Set(tools.map((t) => t?.function?.name).filter(Boolean));

        if (parsed?.decision === "call_tool" && allowedNames.has(parsed.toolName)) {
          let cleanArgsObj = {};
          try {
            const candidate = JSON.parse(parsed.toolArgumentsJson || "{}");
            if (isPlainObject(candidate)) cleanArgsObj = sanitizeJson(candidate);
          } catch {
            cleanArgsObj = {};
          }
          this._callSeq += 1;
          const out = {
            content: "",
            toolCalls: [
              {
                id: `nano_call_${this._callSeq}_${parsed.toolName}`,
                type: "function",
                function: {
                  name: parsed.toolName,
                  arguments: JSON.stringify(cleanArgsObj),
                },
              },
            ],
            finishReason: "tool_calls",
            usage: null,
            model: "chrome-built-in/gemini-nano",
          };
          this.trace?.end(span, {
            finishReason: "tool_calls",
            contentChars: 0,
            toolCalls: [parsed.toolName],
            mock: false,
            verifiedReal: true,
            respModel: out.model,
            routeKind: "on-device-prompt-api",
          });
          return out;
        }

        const text = String(parsed?.finalResponse || raw || "").trim();
        onContentDelta?.(text);
        this.trace?.end(span, {
          finishReason: "stop",
          contentChars: text.length,
          toolCalls: [],
          mock: false,
          verifiedReal: true,
          respModel: "chrome-built-in/gemini-nano",
          routeKind: "on-device-prompt-api",
        });
        return {
          content: text,
          toolCalls: [],
          finishReason: "stop",
          usage: null,
          model: "chrome-built-in/gemini-nano",
        };
      }

      const text = String(await session.prompt(userPrompt, { signal })).trim();
      onContentDelta?.(text);
      this.trace?.end(span, {
        finishReason: "stop",
        contentChars: text.length,
        toolCalls: [],
        mock: false,
        verifiedReal: true,
        respModel: "chrome-built-in/gemini-nano",
        routeKind: "on-device-prompt-api",
      });
      return {
        content: text,
        toolCalls: [],
        finishReason: "stop",
        usage: null,
        model: "chrome-built-in/gemini-nano",
      };
    } catch (err) {
      this.trace?.fail(span, err);
      throw err;
    } finally {
      try {
        session?.destroy?.();
      } catch {
        // Ignore session teardown errors
      }
    }
  }
}
