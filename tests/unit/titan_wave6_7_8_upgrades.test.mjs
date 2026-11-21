import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ContinuityCoordinatorPage } from "../../apps/continuity-web/script.js";
import { MoveCoPage } from "../../apps/demo-moveco/script.js";
import { PermitFlowPage } from "../../apps/demo-permitflow/script.js";
import { HomeConnectPage } from "../../apps/demo-homeconnect/script.js";
import { PowerFlowPage } from "../../apps/demo-powerflow/script.js";
import { CLI_VERSION, runContinuityCli } from "../../packages/nanda-resolver/cli.mjs";
import { startAllEcosystemServers } from "../../scripts/serve_ecosystem.mjs";
import { cloneData, plain } from "../../skills/agentify-website/runtime/actions.js";
import { loadTabByokSetup, resolveByokRouter, saveTabByokSetup } from "../../skills/agentify-website/runtime/byok.js";
import { LlmClient } from "../../skills/agentify-website/runtime/llm.js";
import { McpClient, readJsonRpcResponse } from "../../skills/agentify-website/runtime/mcp.js";
import { assertSafeRemoteUrl, RemoteRegistry, resolveUrl } from "../../skills/agentify-website/runtime/remote.js";
import { assertNoExternalImports, ToolSandbox, verifyIntegrity } from "../../skills/agentify-website/runtime/sandbox.js";
import { TraceBus } from "../../skills/agentify-website/runtime/trace.js";
import { randomUuid, sha256Hex } from "../../skills/agentify-website/runtime/web-crypto.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("Wave 6 (#195-#239) — Lazy adk-hocon-converter code-splitting, 4-peer reversible holds, resetToInitial, exportIcs, PEER_RESET & Ed25519 UI badges", async () => {
  const coordSrc = await readFile(path.join(ROOT, "apps", "continuity-web", "script.js"), "utf8");
  assert.equal(/from\s+["']\.\/vendor\/adk-hocon-converter\/index\.js["']/.test(coordSrc), false);
  assert.match(coordSrc, /import\(["']\.\/vendor\/adk-hocon-converter\/index\.js["']\)/);

  const page = new ContinuityCoordinatorPage();
  const sampleCfg = await page.loadSampleAdkConfig();
  const conv = await page.runAdkConversion(sampleCfg);
  assert.equal(conv.ok, true);

  // MoveCo peer lifecycle
  const mc = new MoveCoPage();
  assert.equal(mc.holdSlot("2027-11-19").ok, true);
  const mcRel = mc.releaseHold();
  assert.equal(mcRel.ok, true);
  assert.equal(mcRel.feeChargedEur, 0);
  assert.equal(mc.getState().activeHold, null);
  assert.match(mc.exportIcs(), /BEGIN:VCALENDAR/);
  mc.booking.scheduledDate = "2027-11-19";
  mc.resetToInitial();
  assert.equal(mc.booking.scheduledDate, "2027-11-16");

  // PermitFlow peer lifecycle
  const pf = new PermitFlowPage();
  assert.equal(pf.stageDraftDate("2027-11-19").ok, true);
  assert.equal(pf.clearPreview().ok, true);
  assert.equal(pf.getState().previewDate, null);
  assert.match(pf.exportIcs(), /PF-2049/);
  pf.dossier.scheduledDate = "2027-11-19";
  pf.resetToInitial();
  assert.equal(pf.dossier.scheduledDate, "2027-11-16");

  // HomeConnect peer lifecycle
  const hc = new HomeConnectPage();
  assert.equal(hc.holdWindow("2027-11-19").ok, true);
  assert.equal(hc.releaseHold().feeChargedEur, 0);
  assert.match(hc.exportIcs(), /HC-5510/);
  hc.appointment.scheduledDate = "2027-11-19";
  hc.resetToInitial();
  assert.equal(hc.appointment.scheduledDate, "2027-11-16");

  // PowerFlow peer lifecycle
  const pfw = new PowerFlowPage();
  assert.equal(pfw.stageDate("2027-11-19").ok, true);
  assert.equal(pfw.clearStaged().ok, true);
  assert.match(pfw.exportIcs(), /PFW-9921/);
  pfw.activation.scheduledDate = "2027-11-19";
  pfw.resetToInitial();
  assert.equal(pfw.activation.scheduledDate, "2027-11-16");

  // Verify peer-embed.html & peer-sync.js + ui.js across all 4 peers
  const embedTpl = await readFile(path.join(ROOT, "design-system", "peer-embed.html"), "utf8");
  assert.match(embedTpl, /strict-origin-when-cross-origin/);
  assert.match(embedTpl, /inter-var-latin\.woff2/);

  for (const dir of ["demo-moveco", "demo-permitflow", "demo-homeconnect", "demo-powerflow"]) {
    const syncSrc = await readFile(path.join(ROOT, "apps", dir, "peer-sync.js"), "utf8");
    const uiSrc = await readFile(path.join(ROOT, "apps", dir, "ui.js"), "utf8");
    assert.match(syncSrc, /PEER_RESET/);
    assert.match(syncSrc, /seenReceipts/);
    assert.match(uiSrc, /Ed25519 Verified/);
  }
});

test("Wave 7 (#240-#261) — Runtime ToolSandbox, sandbox-worker, RemoteRegistry & McpClient hardenings", async () => {
  // Comment-evaded dynamic import rejected fast
  assert.throws(
    () => assertNoExternalImports("export class X { run() { return import /*comment*/ ('https://evil.tld/x.js'); } }", "u.js"),
    /imports are not allowed/,
  );
  assert.throws(
    () => assertNoExternalImports("import // line comment\n('https://evil.tld/x.js');", "u.js"),
    /imports are not allowed/,
  );

  // SRI constant-time integrity check
  const sampleCode = "export class SafeTool { invoke() { return 'ok'; } }";
  const digestBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sampleCode));
  const validSri = `sha256-${btoa(String.fromCharCode(...new Uint8Array(digestBuf)))}`;
  await verifyIntegrity(sampleCode, validSri, "tool.js");
  await assert.rejects(() => verifyIntegrity(sampleCode + " ", validSri, "tool.js"), /integrity check failed/);

  // ToolSandbox.dispose() rejects unsettled pending calls & clears timers
  const sb = new ToolSandbox({ workerUrl: "blob:mock" });
  let terminated = 0;
  sb.worker = {
    postMessage: () => {},
    terminate: () => {
      terminated += 1;
    },
  };
  sb.bundles.set("https://peer.example/tool.js", sampleCode);
  const pendingInvoke = sb.invoke({
    bundleUrl: "https://peer.example/tool.js",
    className: "SafeTool",
    args: {},
    timeoutMs: 60000,
  });
  await new Promise((r) => setTimeout(r, 10));
  sb.dispose();
  await assert.rejects(() => pendingInvoke, /ToolSandbox disposed/);
  assert.equal(terminated, 1);

  // Worker lockdown source checks
  const workerSrc = await readFile(path.join(ROOT, "skills", "agentify-website", "runtime", "sandbox-worker.js"), "utf8");
  for (const api of ["BroadcastChannel", "WebTransport", "RTCPeerConnection", "SharedWorker", "caches", "indexedDB"]) {
    assert.match(workerSrc, new RegExp(`"${api}"`));
  }

  // Remote URL & cross-origin asset escape guards
  assert.throws(() => assertSafeRemoteUrl("http://insecure-remote.example/agent-manifest.json"), /HTTPS/);
  assert.throws(() => assertSafeRemoteUrl("https://user:pw@peer.example/agent-manifest.json"), /credentials/);
  assert.throws(
    () => resolveUrl("https://peer-a.example/sub", "https://evil-b.example/steal.network.json"),
    /must belong to publishing origin/,
  );
  assert.equal(
    resolveUrl("https://toskaman.github.io/continuity-agentic-web", "./continuity_coordinator.network.json"),
    "https://toskaman.github.io/continuity-agentic-web/continuity_coordinator.network.json",
  );

  const reg = new RemoteRegistry({ maxEntries: 2 });
  reg.set("https://a.example", "n1", { id: 1 });
  reg.set("https://b.example", "n2", { id: 2 });
  reg.set("https://c.example", "n3", { id: 3 });
  assert.equal(reg.cache.size, 2);
  assert.equal(reg.get("https://a.example", "n1"), undefined);
  reg.clear();
  assert.equal(reg.cache.size, 0);

  // McpClient transient init failure recovery + SSE buffer cap
  assert.throws(() => new McpClient({ url: "http://remote-insecure.example/mcp" }), /HTTPS/);
  let initCalls = 0;
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      initCalls += 1;
      if (initCalls === 1) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: initCalls, result: { tools: [{ name: "ping_tool" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const mcp = new McpClient({ url: "https://mcp.example/rpc" });
    await assert.rejects(() => mcp.listTools(), /MCP HTTP 503/);
    // Second call succeeds because ensureInit cleared this.initialized on failure!
    const tools = await mcp.listTools();
    assert.equal(tools.length, 1);
    mcp.close();
    assert.equal(mcp.initialized, null);
  } finally {
    globalThis.fetch = origFetch;
  }

  // SSE stream overflow guard & reader lock release
  const hugeStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("A".repeat(1_100_000)));
      controller.close();
    },
  });
  const fakeSseResp = new Response(hugeStream, { headers: { "Content-Type": "text/event-stream" } });
  await assert.rejects(() => readJsonRpcResponse(fakeSseResp, 1), /buffer exceeded/);
});

test("Wave 7 (#262-#281) — TraceBus span eviction, actions plain() hardening, LlmClient JSON/trailing-SSE support & BYOK Node safety", async () => {
  const bus = new TraceBus({ maxEvents: 5 });
  const sp = bus.start("model_call");
  assert.equal(bus.spans.size, 1);
  bus.end(sp);
  assert.equal(bus.spans.size, 0);
  for (let i = 0; i < 8; i++) bus.note("tick", { i });
  assert.equal(bus.events.length, 5);
  bus.clear();
  assert.equal(bus.events.length, 0);

  assert.equal(plain({ a: 1 }), true);
  assert.equal(plain(new Date()), false);
  assert.equal(plain(/re/), false);
  assert.throws(() => cloneData({ "bad\u0000": 1 }), /Unsafe object key/);

  // LlmClient non-SSE application/json completion + trailing SSE chunk without \n
  assert.throws(() => new LlmClient({ baseUrl: "https://u:p@api.example/v1", apiKey: "k" }), /credentials/);
  const jsonLlm = new LlmClient({
    baseUrl: "https://api.example/v1",
    apiKey: "sk-test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          model: "qwen-test",
          choices: [{ message: { content: "Buffered JSON reply" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  });
  const jOut = await jsonLlm.chat({ model: "qwen-test", messages: [{ role: "user", content: "hi" }] });
  assert.equal(jOut.content, "Buffered JSON reply");

  const trailingSseLlm = new LlmClient({
    baseUrl: "https://api.example/v1",
    apiKey: "sk-test-key",
    fetchImpl: async () => {
      const stream = new ReadableStream({
        start(c) {
          // Deliberately NO trailing newline!
          c.enqueue(
            new TextEncoder().encode(
              'data: {"model":"qwen","choices":[{"delta":{"content":"TailChunk"},"finish_reason":"stop"}]}',
            ),
          );
          c.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const sOut = await trailingSseLlm.chat({ model: "qwen-test", messages: [{ role: "user", content: "hi" }] });
  assert.equal(sOut.content, "TailChunk");

  // web-crypto & byok helpers
  assert.match(randomUuid(), /^[0-9a-f-]{36}$/);
  assert.equal((await sha256Hex("abc")).length, 64);
  assert.equal(resolveByokRouter("https://user:secret@api.otari.ai/api/v1"), "");
  saveTabByokSetup(null);
  assert.equal(typeof loadTabByokSetup().key, "string");
});

test("Wave 8 (#282-#300) — continuity-audit v2.1 CLI (--help, --version, --check-firewall, --verify-facts, --check-poppy, --sarif) & zero-long-task perf doc", async () => {
  let helpOut = "";
  assert.equal(await runContinuityCli(["--help"], { stdout: (s) => (helpOut += s) }), 0);
  assert.match(helpOut, /--check-firewall/);
  assert.match(helpOut, /--verify-facts/);
  assert.match(helpOut, /--check-poppy/);

  let verOut = "";
  assert.equal(await runContinuityCli(["--version"], { stdout: (s) => (verOut += s) }), 0);
  assert.match(verOut, new RegExp(CLI_VERSION));

  const eco = await startAllEcosystemServers({
    continuity: 0,
    moveco: 0,
    permitflow: 0,
    homeconnect: 0,
    powerflow: 0,
  });
  try {
    let jsonOut = "";
    const code = await runContinuityCli(
      [
        "--json",
        "--check-firewall",
        "--verify-facts",
        "--check-poppy",
        `${eco.coordinator.origin()}/`,
        `${eco.peers.moveco.origin()}/`,
      ],
      { stdout: (s) => (jsonOut += s) },
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(jsonOut);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.reports[0].firewall.verdict, "ALLOW");
    assert.equal(parsed.reports[0].factsProvenance.valid, true);
    assert.equal(parsed.reports[0].poppyReach.valid, true);

    let sarifOut = "";
    const sarifCode = await runContinuityCli(
      ["--sarif", "--check-firewall", `${eco.coordinator.origin()}/`],
      { stdout: (s) => (sarifOut += s) },
    );
    assert.equal(sarifCode, 0);
    const sarif = JSON.parse(sarifOut);
    assert.equal(sarif.version, "2.1.0");
    assert.ok(sarif.runs[0].tool.driver.rules.some((r) => r.id === "EXT-FIREWALL"));
  } finally {
    await eco.stopAll();
  }

  const perfDoc = await readFile(path.join(ROOT, "docs", "benchmarks", "BROWSER_PERF_AND_MEMORY_AUDIT.md"), "utf8");
  assert.match(perfDoc, /longTasks:\s*0/);
});

test("Strict 1-to-1 Ledger Contract — Every single upgrade #001 through #300 is individually itemized with zero multi-number ranges", async () => {
  const ledger = await readFile(
    path.join(ROOT, "docs", "competition", "TITAN_300_UPGRADES_LEDGER.md"),
    "utf8",
  );
  // Forbid grouped multi-number bullet ranges like `- **#092–#094**` or `- **#256-#272**`
  assert.equal(/-\s+\*\*#\d{3}\s*[–-]\s*#\d{3}\*\*/.test(ledger), false, "Multi-number grouped range bullets are forbidden");

  const foundIds = new Set();
  for (const m of ledger.matchAll(/^-\s+\*\*#(\d{3})\*\*\s+\(`[^`]+`\):/gm)) {
    const id = m[1];
    assert.equal(foundIds.has(id), false, `Duplicate upgrade ID #${id}`);
    foundIds.add(id);
  }
  assert.equal(foundIds.size, 600, `Expected 600 distinct 1-to-1 upgrades (#001-#600), found ${foundIds.size}`);
  for (let n = 1; n <= 600; n++) {
    const key = String(n).padStart(3, "0");
    assert.equal(foundIds.has(key), true, `Missing itemized upgrade #${key}`);
  }
});
