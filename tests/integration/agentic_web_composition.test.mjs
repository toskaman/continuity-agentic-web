import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Engine } from "../../skills/agentify-website/runtime/engine.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FAKE_BYOK_KEY = "sk-visitor-secret-never-leak-9999";
const ROUTER_URL = "http://127.0.0.1:29999/api/v1";

/**
 * Serves static bundles in-memory over intercepted `fetch` so we can inspect EVERY header,
 * URL, origin, consent decision, and model parameter sent by the real Cognizant `Engine`.
 */
async function createInMemoryAgenticWeb() {
  const folders = {
    "http://127.0.0.1:8080": path.join(ROOT, "apps", "continuity-web"),
    "http://127.0.0.1:8081": path.join(ROOT, "apps", "demo-moveco"),
    "http://localhost:8082": path.join(ROOT, "apps", "demo-permitflow"),
    "http://127.0.0.1:8083": path.join(ROOT, "apps", "demo-homeconnect"),
    "http://localhost:8084": path.join(ROOT, "apps", "demo-powerflow"),
  };

  const requestLog = [];
  const routerCalls = [];

  const stubFetch = async (input, init = {}) => {
    const urlStr = typeof input === "string" ? input : input.url;
    const url = new URL(urlStr);
    const headers = new Headers(init.headers || {});
    const authHeader = headers.get("authorization") || "";

    requestLog.push({
      url: urlStr,
      origin: url.origin,
      pathname: url.pathname,
      hasAuthHeader: Boolean(authHeader),
      authValue: authHeader,
    });

    // Mock LLM Router (OpenAI-compatible SSE stream)
    if (urlStr.startsWith(ROUTER_URL)) {
      const body = JSON.parse(init.body || "{}");
      routerCalls.push({ body, authHeader });

      const sysText = body.messages?.[0]?.content || "";
      const toolNames = (body.tools || []).map((t) => t.function.name);
      const hasToolMsg = body.messages?.some((m) => m.role === "tool");

      let replyContent = "Completed.";
      let toolCallsDelta = null;

      if (!hasToolMsg && toolNames.includes("peer_network_specialist")) {
        toolCallsDelta = [
          {
            index: 0,
            id: "call_spec_1",
            type: "function",
            function: {
              name: "peer_network_specialist",
              arguments: JSON.stringify({
                request: "Ask MoveCo, PermitFlow, HomeConnect, and PowerFlow what services they offer.",
              }),
            },
          },
        ];
      } else if (!hasToolMsg && toolNames.includes("moveco_dispatch")) {
        // Call all 4 independent peer origins in parallel/sequence within the 4-remote-call budget!
        toolCallsDelta = [
          {
            index: 0,
            id: "call_p1",
            type: "function",
            function: {
              name: "moveco_dispatch",
              arguments: JSON.stringify({ request: "What moving van and slot hold services do you offer?" }),
            },
          },
          {
            index: 1,
            id: "call_p2",
            type: "function",
            function: {
              name: "permitflow_advisor",
              arguments: JSON.stringify({ request: "What curbside bay eligibility services do you offer?" }),
            },
          },
          {
            index: 2,
            id: "call_p3",
            type: "function",
            function: {
              name: "homeconnect_scheduler",
              arguments: JSON.stringify({ request: "What fiber technician scheduling services do you offer?" }),
            },
          },
          {
            index: 3,
            id: "call_p4",
            type: "function",
            function: {
              name: "powerflow_grid",
              arguments: JSON.stringify({ request: "What smart-meter energization services do you offer?" }),
            },
          },
        ];
      } else if (sysText.includes("You are the assistant on the MoveCo Express website")) {
        replyContent = "MoveCo Express offers residential Luton van crews, 15-minute slot holds, and booking rescheduling on its own page.";
      } else if (sysText.includes("You are the assistant on the PermitFlow Civic Prep website")) {
        replyContent = "PermitFlow prepares demonstration curbside loading-bay application drafts (no municipal database access).";
      } else if (sysText.includes("You are the assistant on the HomeConnect Fiber website")) {
        replyContent = "HomeConnect Fiber schedules 2 Gbps ONT installation technicians and 10-minute window holds.";
      } else if (sysText.includes("You are the assistant on the PowerFlow Energy website")) {
        replyContent = "PowerFlow Energy manages remote smart-meter electricity energization dates.";
      } else {
        replyContent = "All 4 independent peer networks responded with their grounded capabilities.";
      }

      const chunk = toolCallsDelta
        ? {
            id: "chatcmpl-1",
            model: body.model,
            choices: [{ index: 0, delta: { tool_calls: toolCallsDelta }, finish_reason: "tool_calls" }],
          }
        : {
            id: "chatcmpl-2",
            model: body.model,
            choices: [{ index: 0, delta: { content: replyContent }, finish_reason: "stop" }],
          };

      const sse = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
      return new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    // Serve static files from the 5 independent site folders
    const siteDir = folders[url.origin];
    if (!siteDir) {
      return new Response("Unknown origin", { status: 404 });
    }
    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    try {
      let text = await readFile(path.join(siteDir, rel), "utf8");
      // Strip actions block in headless Node test (Node has no DOM iframe for bridge), matching Cognizant's linking.test.mjs
      if (rel === "agent-manifest.json") {
        const parsed = JSON.parse(text);
        delete parsed.actions;
        text = JSON.stringify(parsed);
      }
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": rel.endsWith(".json") ? "application/json" : "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  };

  return { stubFetch, requestLog, routerCalls };
}

test("I1 Real Browser Runtime composes CONTINUITY with all 4 independent peer origins, enforces consent BEFORE contact, and never leaks BYOK key", async () => {
  const { stubFetch, requestLog, routerCalls } = await createInMemoryAgenticWeb();
  const prevFetch = globalThis.fetch;
  globalThis.fetch = stubFetch;

  try {
    const engine = new Engine({
      originUrl: "http://127.0.0.1:8080",
      byokKey: FAKE_BYOK_KEY,
      routerOverride: ROUTER_URL,
      modelOverride: "alibaba/qwen-3.5-35b-a3b",
    });

    const consentEvents = [];
    engine.onConsent = async (info) => {
      // CRITICAL INVARIANT: Before user approves consent for `info.peerOrigin`, ZERO HTTP requests may have hit that peer!
      const prematureHits = requestLog.filter((r) => new URL(r.origin).host === info.peerOrigin);
      assert.equal(
        prematureHits.length,
        0,
        `Premature network contact to ${info.peerOrigin} before consent!`,
      );
      consentEvents.push(info);
      return "allow";
    };

    const reply = await engine.run(
      "Ask MoveCo, PermitFlow, HomeConnect, and PowerFlow what services each offers.",
      { slyData: { private_mission_secret: "TOP_SECRET_DO_NOT_SHARE" } },
    );

    assert.match(reply, /4 independent peer networks responded/i);
    assert.equal(consentEvents.length, 4, "Should prompt consent for all 4 independent peer origins");

    const peerHostsConsent = consentEvents.map((c) => c.peerOrigin).sort();
    assert.deepEqual(peerHostsConsent, [
      "127.0.0.1:8081",
      "127.0.0.1:8083",
      "localhost:8082",
      "localhost:8084",
    ]);

    // Verify BYOK API key went ONLY to ROUTER_URL and NEVER to any of the 4 peer origins
    for (const req of requestLog) {
      if (req.url.startsWith(ROUTER_URL)) {
        assert.equal(req.authValue, `Bearer ${FAKE_BYOK_KEY}`);
      } else {
        assert.equal(req.hasAuthHeader, false, `API key leaked to ${req.url}!`);
        assert.ok(!req.url.includes(FAKE_BYOK_KEY), `API key leaked in URL ${req.url}!`);
      }
    }

    // Verify all peer networks ran on the caller's selected model
    assert.ok(routerCalls.length >= 6);
    for (const call of routerCalls) {
      assert.equal(call.body.model, "alibaba/qwen-3.5-35b-a3b");
      // Verify private sly_data secret never entered any prompt
      assert.ok(!JSON.stringify(call.body.messages).includes("TOP_SECRET_DO_NOT_SHARE"));
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("I2 Declining consent contacts zero files on the declined peer origin", async () => {
  const { stubFetch, requestLog } = await createInMemoryAgenticWeb();
  const prevFetch = globalThis.fetch;
  globalThis.fetch = stubFetch;

  try {
    const engine = new Engine({
      originUrl: "http://127.0.0.1:8080",
      byokKey: FAKE_BYOK_KEY,
      routerOverride: ROUTER_URL,
      modelOverride: "alibaba/qwen-3.5-35b-a3b",
    });

    engine.onConsent = async () => "decline";

    await engine.run("Ask MoveCo, PermitFlow, HomeConnect, and PowerFlow what services each offers.");

    const peerOrigins = new Set([
      "http://127.0.0.1:8081",
      "http://localhost:8082",
      "http://127.0.0.1:8083",
      "http://localhost:8084",
    ]);
    const peerRequests = requestLog.filter((r) => peerOrigins.has(r.origin));
    assert.equal(peerRequests.length, 0, "Declined peers must receive zero HTTP requests");
  } finally {
    globalThis.fetch = prevFetch;
  }
});
