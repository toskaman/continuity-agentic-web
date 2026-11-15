import assert from "node:assert/strict";
import test from "node:test";
import { LlmClient } from "../../skills/agentify-website/runtime/llm.js";
import { normalizeModelName } from "../../skills/agentify-website/runtime/model.js";
import { API_KEY_PROVIDERS, providerForApiKey } from "../../skills/agentify-website/runtime/ui.js";

function makeSseResponse(chunks, status = 200, headers = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of chunks) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream", ...headers },
  });
}

test("Cycle 1.1 — AI model settings lists Otari first, routes EU keys to eu.api.otari.ai, leaves tk- untouched, and recognizes AQ. Gemini keys", () => {
  assert.equal(API_KEY_PROVIDERS[0].name, "Otari");

  const usOtari = providerForApiKey("otk_v1_us_" + "a".repeat(48));
  assert.equal(usOtari?.name, "Otari");
  assert.equal(usOtari?.router, "https://api.otari.ai/api/v1");
  assert.equal(usOtari?.model, "alibaba/qwen-3.5-35b-a3b");

  const euOtari = providerForApiKey("otk_v1_eu_" + "b".repeat(48));
  assert.equal(euOtari?.name, "Otari");
  assert.equal(euOtari?.router, "https://eu.api.otari.ai/api/v1");
  assert.equal(euOtari?.model, "alibaba/qwen-3.5-35b-a3b");

  assert.equal(providerForApiKey("tk-" + "c".repeat(48)), null, "Self-hosted tk- key must not route to hosted Otari");

  assert.equal(providerForApiKey("AIza" + "d".repeat(35))?.name, "Google AI Studio");
  assert.equal(providerForApiKey("AQ." + "e".repeat(40))?.name, "Google AI Studio");
  assert.equal(providerForApiKey("gsk_" + "f".repeat(40))?.name, "Groq");
  assert.equal(providerForApiKey("sk-proj-" + "g".repeat(40))?.name, "OpenAI");
  assert.equal(providerForApiKey("sk-ant-" + "h".repeat(40))?.name, "Anthropic");

  assert.equal(normalizeModelName("models/gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(normalizeModelName('"alibaba/qwen-3.5-35b-a3b"'), "alibaba/qwen-3.5-35b-a3b");
});

test("Cycle 1.2 — LlmClient separates Gemini parallel SSE tool calls sharing index 0, joins OpenAI split chunks, and preserves extra_content thought_signature", async () => {
  const sseLines = [
    `data: ${JSON.stringify({
      model: "gemini-2.5-flash",
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_moveco_1",
                type: "function",
                function: { name: "moveco_dispatch", arguments: '{"request":"moving"}' },
                extra_content: { google: { thought_signature: "sig_alpha_99" } },
              },
            ],
          },
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      model: "gemini-2.5-flash",
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_permit_2",
                type: "function",
                function: { name: "permitflow_advisor", arguments: '{"request":' },
                extra_content: { google: { thought_signature: "sig_beta_88" } },
              },
            ],
          },
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      model: "gemini-2.5-flash",
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '"parking"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    })}\n\n`,
    "data: [DONE]\n\n",
  ];

  const client = new LlmClient({
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: "AQ.fake_key_for_unit_test",
    retryDelaysMs: [0, 0],
    fetchImpl: async () => makeSseResponse(sseLines),
  });

  const res = await client.chat({
    model: "models/gemini-2.5-flash",
    messages: [{ role: "user", content: "Check both providers" }],
    tools: [
      { type: "function", function: { name: "moveco_dispatch", parameters: { type: "object" } } },
      { type: "function", function: { name: "permitflow_advisor", parameters: { type: "object" } } },
    ],
  });

  assert.equal(res.toolCalls.length, 2);
  assert.equal(res.toolCalls[0].id, "call_moveco_1");
  assert.equal(res.toolCalls[0].function.name, "moveco_dispatch");
  assert.deepEqual(JSON.parse(res.toolCalls[0].function.arguments), { request: "moving" });
  assert.equal(res.toolCalls[0].extra_content?.google?.thought_signature, "sig_alpha_99");

  assert.equal(res.toolCalls[1].id, "call_permit_2");
  assert.equal(res.toolCalls[1].function.name, "permitflow_advisor");
  assert.deepEqual(JSON.parse(res.toolCalls[1].function.arguments), { request: "parking" });
  assert.equal(res.toolCalls[1].extra_content?.google?.thought_signature, "sig_beta_88");
});

test("Cycle 1.3 — LlmClient retries transient 429/503 responses and fails fast without retrying on 401", async () => {
  let calls429 = 0;
  const retryClient = new LlmClient({
    baseUrl: "https://api.otari.ai/api/v1",
    apiKey: "otk_v1_us_fake",
    retryDelaysMs: [1, 1],
    fetchImpl: async () => {
      calls429 += 1;
      if (calls429 < 3) {
        return new Response("Rate limit exceeded", { status: 429 });
      }
      return makeSseResponse([
        `data: ${JSON.stringify({
          model: "alibaba/qwen-3.5-35b-a3b",
          choices: [{ delta: { content: "Recovered cleanly." }, finish_reason: "stop" }],
        })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    },
  });

  const okRes = await retryClient.chat({
    model: "alibaba/qwen-3.5-35b-a3b",
    messages: [{ role: "user", content: "Hello" }],
    tools: [],
  });
  assert.equal(calls429, 3);
  assert.equal(okRes.content, "Recovered cleanly.");

  let calls401 = 0;
  const authFailClient = new LlmClient({
    baseUrl: "https://api.otari.ai/api/v1",
    apiKey: "otk_v1_us_invalid",
    retryDelaysMs: [1, 1],
    fetchImpl: async () => {
      calls401 += 1;
      return new Response("Invalid API key", { status: 401 });
    },
  });

  await assert.rejects(
    () =>
      authFailClient.chat({
        model: "alibaba/qwen-3.5-35b-a3b",
        messages: [{ role: "user", content: "Hello" }],
        tools: [],
      }),
    /401|key/i,
  );
  assert.equal(calls401, 1, "401 authentication failure must never retry");
});
