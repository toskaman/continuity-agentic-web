import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNanoToolDecisionSchema,
  ChromeBuiltInPromptLlm,
  probeLocalInferenceBackends,
} from "../../packages/local-browser-router/index.js";

test("Cycle 2.1 — probeLocalInferenceBackends detects Chrome LanguageModel, probes loopback Ollama safely, and refuses non-loopback probes", async () => {
  const withNano = await probeLocalInferenceBackends({
    env: {
      LanguageModel: {
        availability: async () => "available",
        create: async () => ({}),
      },
    },
    fetchImpl: async () => {
      throw new Error("loopback down");
    },
  });
  assert.equal(withNano.preferredBackend, "chrome-prompt-api");
  assert.equal(withNano.chromeBuiltIn.supported, true);

  const withOllama = await probeLocalInferenceBackends({
    env: {},
    ollamaBaseUrl: "http://127.0.0.1:11434/v1",
    fetchImpl: async (url) => {
      assert.equal(url, "http://127.0.0.1:11434/v1/models");
      return new Response(
        JSON.stringify({
          data: [{ id: "embed-only:latest" }, { id: "qwen3:8b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  assert.equal(withOllama.preferredBackend, "ollama-loopback");
  assert.equal(withOllama.ollamaLoopback.recommendedModel, "qwen3:8b");

  let externalContacted = false;
  const blockedExternal = await probeLocalInferenceBackends({
    env: {},
    ollamaBaseUrl: "https://evil.example.org/v1",
    fetchImpl: async () => {
      externalContacted = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(externalContacted, false, "Must NEVER auto-probe non-loopback origins");
  assert.equal(blockedExternal.preferredBackend, "none");
});

test("Cycle 2.2 — ChromeBuiltInPromptLlm enforces JSON Schema responseConstraint for tool calls and destroys session cleanly", async () => {
  let destroyed = false;
  let capturedConstraint = null;

  const fakeEnv = {
    LanguageModel: {
      availability: async () => "available",
      create: async () => ({
        prompt: async (_input, opts) => {
          capturedConstraint = opts?.responseConstraint;
          return JSON.stringify({
            decision: "call_tool",
            toolName: "website_get_mission_state",
            toolArgumentsJson: '{"__proto__":{"polluted":true}}',
            finalResponse: "",
          });
        },
        destroy: () => {
          destroyed = true;
        },
      }),
    },
  };

  const llm = new ChromeBuiltInPromptLlm({ env: fakeEnv });
  const tools = [
    {
      type: "function",
      function: {
        name: "website_get_mission_state",
        description: "Read current mission state",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  const schema = buildNanoToolDecisionSchema(tools);
  assert.deepEqual(schema.properties.toolName.enum, ["", "website_get_mission_state"]);

  const res = await llm.chat({
    messages: [{ role: "user", content: "What is my Tuesday schedule?" }],
    tools,
  });

  assert.ok(capturedConstraint, "Must pass responseConstraint schema to LanguageModel.prompt");
  assert.equal(res.finishReason, "tool_calls");
  assert.equal(res.toolCalls.length, 1);
  assert.equal(res.toolCalls[0].function.name, "website_get_mission_state");
  assert.equal(res.toolCalls[0].function.arguments, "{}", "Prototype pollution keys must be stripped");
  assert.equal(destroyed, true, "On-device session must be destroyed in finally block");
});
