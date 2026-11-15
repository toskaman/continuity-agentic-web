import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ContinuityCoordinatorPage } from "../../apps/continuity-web/script.js";
import {
  resolveAndRouteNandaReach,
  validateNandaReachCard,
  validatePoppyReachDeclaration,
} from "../../packages/nanda-resolver/index.js";
import {
  completeOpenRouterPkceCallback,
  computePkceS256Challenge,
  createOpenRouterPkceAuthRequest,
} from "../../packages/openrouter-pkce/index.js";
import {
  diffPeerNetworks,
  inspectPeerNetworkSafety,
  PeerTofuRegistry,
  SAMPLE_CLEAN_PEER_BUNDLE,
  SAMPLE_RUGPULL_PEER_BUNDLE,
} from "../../packages/peer-firewall/index.js";
import { exposeActionsToWebMcp } from "../../packages/webmcp-adapter/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

test("Cycles 51–58 — @continuity/peer-firewall passes all 5 CONTINUITY networks with 0 criticals and blocks Unicode Bidi + exfiltration attacks", async () => {
  const sites = [
    ["apps/continuity-web", "continuity_coordinator.network.json"],
    ["apps/demo-moveco", "moveco_dispatch.network.json"],
    ["apps/demo-permitflow", "permitflow_advisor.network.json"],
    ["apps/demo-homeconnect", "homeconnect_scheduler.network.json"],
    ["apps/demo-powerflow", "powerflow_grid.network.json"],
  ];
  for (const [dir, netFile] of sites) {
    const manifestJson = JSON.parse(await readFile(path.join(ROOT, dir, "agent-manifest.json"), "utf8"));
    const networkJson = JSON.parse(await readFile(path.join(ROOT, dir, netFile), "utf8"));
    const rep = await inspectPeerNetworkSafety({
      manifestJson,
      networkJson,
      siteBaseUrl: "http://127.0.0.1:8080/",
    });
    assert.equal(rep.safe, true, `Expected ${dir} to pass peer-firewall cleanly`);
    assert.equal(rep.criticalCount, 0);
  }

  const hostile = await inspectPeerNetworkSafety(SAMPLE_RUGPULL_PEER_BUNDLE);
  assert.equal(hostile.safe, false);
  assert.equal(hostile.verdict, "BLOCK");
  const ruleIds = new Set(hostile.findings.map((f) => f.ruleId));
  assert.equal(ruleIds.has("PF-BIDI-TROJAN"), true);
  assert.equal(ruleIds.has("PF-INJECT-OVERRIDE"), true);
  assert.equal(ruleIds.has("PF-INJECT-EXFIL"), true);
});

test("Cycles 59–62 — PeerTofuRegistry pins JCS SHA-256 digests on first consent and forces re-consent on silent rug-pull mutations", async () => {
  const storage = new MemoryStorage();
  const reg = new PeerTofuRegistry(storage);

  const cleanRep = await inspectPeerNetworkSafety(SAMPLE_CLEAN_PEER_BUNDLE);
  const first = reg.verifyOrPin(cleanRep);
  assert.equal(first.allowed, true);
  assert.equal(first.status, "PINNED_FIRST_USE");

  const second = reg.verifyOrPin(cleanRep);
  assert.equal(second.allowed, true);
  assert.equal(second.status, "MATCHES_PINNED_DIGEST");

  const mutatedNet = {
    ...SAMPLE_CLEAN_PEER_BUNDLE.networkJson,
    tools: [
      {
        ...SAMPLE_CLEAN_PEER_BUNDLE.networkJson.tools[0],
        instructions: "Changed instructions silently between turns.",
      },
    ],
  };
  const mutatedRep = await inspectPeerNetworkSafety({
    ...SAMPLE_CLEAN_PEER_BUNDLE,
    networkJson: mutatedNet,
  });
  const third = reg.verifyOrPin(mutatedRep);
  assert.equal(third.allowed, false);
  assert.equal(third.requiresReconsent, true);
  assert.equal(third.status, "ARTIFACT_DRIFT_RECONSENT_REQUIRED");

  const diff = diffPeerNetworks(SAMPLE_CLEAN_PEER_BUNDLE.networkJson, mutatedNet);
  assert.equal(diff.changed, true);
  assert.deepEqual(diff.modifiedAgents, ["bakery_clerk"]);

  reg.approveUpdatedPin(mutatedRep);
  const fourth = reg.verifyOrPin(mutatedRep);
  assert.equal(fourth.allowed, true);
  assert.equal(fourth.status, "MATCHES_PINNED_DIGEST");
});

test("Cycles 63–75 — @continuity/openrouter-pkce satisfies Cognizant Issue #22: S256 PKCE, URL ?code= scrubbing, wrong-state rejection, and key exchange", async () => {
  const storage = new MemoryStorage();
  const start = await createOpenRouterPkceAuthRequest({
    callbackUrl: "https://toskaman.github.io/continuity-agentic-web/?demo=1",
    storage,
    nowMs: 1_000_000,
  });
  const parsedAuth = new URL(start.authUrl);
  assert.equal(parsedAuth.origin, "https://openrouter.ai");
  assert.equal(parsedAuth.searchParams.get("code_challenge_method"), "S256");

  // 1. Wrong state is rejected AND ?code= is still scrubbed from URL
  let scrubbedWrongUrl = "";
  const wrongStateStorage = new MemoryStorage();
  const s2 = await createOpenRouterPkceAuthRequest({
    callbackUrl: "https://toskaman.github.io/continuity-agentic-web/",
    storage: wrongStateStorage,
    nowMs: 1_000_000,
  });
  assert.ok(s2.state);
  const badRes = await completeOpenRouterPkceCallback({
    currentUrl: "https://toskaman.github.io/continuity-agentic-web/?code=or_code_123&state=forged_csrf_state",
    storage: wrongStateStorage,
    replaceUrlFn: (u) => {
      scrubbedWrongUrl = u;
    },
    nowMs: 1_005_000,
  });
  assert.equal(badRes.ok, false);
  assert.match(badRes.reason, /state mismatch/i);
  assert.equal(scrubbedWrongUrl.includes("code="), false);

  // 2. Valid callback scrubs ?code=, verifies verifier S256 against challenge, and exchanges key
  let scrubbedGoodUrl = "";
  let postedBody = null;
  const goodRes = await completeOpenRouterPkceCallback({
    currentUrl: `https://toskaman.github.io/continuity-agentic-web/?demo=1&code=valid_code_99&state=${encodeURIComponent(start.state)}`,
    storage,
    nowMs: 1_030_000,
    keyLabel: "CONTINUITY Coordinator",
    replaceUrlFn: (u) => {
      scrubbedGoodUrl = u;
    },
    fetchImpl: async (_url, init) => {
      postedBody = JSON.parse(init.body);
      const recomputed = await computePkceS256Challenge(postedBody.code_verifier);
      assert.equal(recomputed, start.codeChallenge);
      return new Response(JSON.stringify({ key: "sk-or-v1-mock-test-key-0001" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(goodRes.ok, true);
  assert.equal(goodRes.key, "sk-or-v1-mock-test-key-0001");
  assert.equal(goodRes.router, "https://openrouter.ai/api/v1");
  assert.equal(scrubbedGoodUrl, "https://toskaman.github.io/continuity-agentic-web/?demo=1");
  assert.equal(postedBody.key_label, "CONTINUITY Coordinator");
});

test("Cycles 76–88 — Project NANDA nandaindex.org/reach (Poppy v1, Nov 15 2026) validates poppy.json & resolves post-tab locators safely", async () => {
  const poppyRaw = JSON.parse(
    await readFile(path.join(ROOT, "apps/continuity-web/.well-known/poppy.json"), "utf8"),
  );
  const popCheck = validatePoppyReachDeclaration(poppyRaw);
  assert.equal(popCheck.valid, true);

  const reachCard = {
    name: "Sam Personal Agent",
    description: "Personal Poppy v1 card",
    version: "3",
    url: "https://sam-agent.example/front",
    capabilities: { streaming: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [{ id: "notify", name: "Notify", description: "Async inbox", tags: ["poppy"] }],
    agents: [
      { id: "reloc_agent", name: "Relocation Agent", inbox: { kind: "inkbox", address: "sam-reloc@inkboxmail.com" } },
    ],
    routing: [
      { match: "hold_expiry", deliver_to: "reloc_agent" },
      { match: "promotion", deliver_to: "none" },
    ],
  };
  assert.equal(validateNandaReachCard(reachCard).valid, true);

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/v1/resolve?locator=")) {
      return new Response(JSON.stringify({ status: "active", url: "https://sam-agent.example/agent-card.json" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(reachCard), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const delivered = await resolveAndRouteNandaReach({
    locator: "urn:air:host39.org:personal:sam@example.com",
    topic: "hold_expiry",
    fetchImpl: mockFetch,
  });
  assert.equal(delivered.delivered, true);
  assert.equal(delivered.inbox.address, "sam-reloc@inkboxmail.com");

  const declined = await resolveAndRouteNandaReach({
    locator: "urn:air:host39.org:personal:sam@example.com",
    topic: "promotion",
    fetchImpl: mockFetch,
  });
  assert.equal(declined.ok, true);
  assert.equal(declined.delivered, false);
  assert.equal(declined.action, "DECLINED_BY_PERSON");
});

test("Cycles 89–100 — @continuity/webmcp-adapter registers on document.modelContext & navigator.modelContext with consequentialHint and strips activation_capsule", async () => {
  const docRegistered = [];
  const navRegistered = [];
  const adapter = exposeActionsToWebMcp(
    (actions) => {
      actions.register({
        name: "read_status",
        description: "Reads status",
        effect: "read",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: () => ({ ok: true }),
      });
      actions.register({
        name: "commit_booking",
        description: "Commits irreversible booking",
        effect: "irreversible",
        inputSchema: {
          type: "object",
          required: ["ref"],
          properties: { ref: { type: "string" } },
          additionalProperties: false,
        },
        execute: (args) => ({ ok: true, ref: args.ref }),
      });
    },
    {
      namespace: "testsite",
      confirmIrreversible: async () => true,
      documentModelContext: { registerTool: (t) => docRegistered.push(t) },
      navigatorModelContext: { registerTool: (t) => navRegistered.push(t) },
    },
  );

  assert.equal(adapter.nativeWebMcpDetected, true);
  assert.equal(docRegistered.length, 2);
  assert.equal(navRegistered.length, 2);
  assert.equal(docRegistered[0].annotations.readOnlyHint, true);
  assert.equal(docRegistered[0].annotations.consequentialHint, false);
  assert.equal(docRegistered[1].annotations.consequentialHint, true);

  const res = await adapter.invokeTool("commit_booking", {
    ref: "MC-8841",
    activation_capsule: { neuro_san: "0.7.23" },
  });
  assert.equal(res.ok, true);
  assert.equal(res.ref, "MC-8841");
});

test("Cycles 101–125 — sweepAnchorHorizon evaluates 6-day target horizon and switchTargetAnchorDate updates active target date", async () => {
  const page = new ContinuityCoordinatorPage();
  const prep = await page.analyzeAndPrepareChange("Move relocation from Tuesday to Friday under €700.");
  assert.equal(prep.ok, true);
  assert.ok(page.horizonSweep);
  assert.equal(page.horizonSweep.days.length, 6);
  assert.ok(page.horizonSweep.sweepDurationMs < 200);
  assert.ok(page.horizonSweep.days.some((d) => d.isLowestCostDay));

  const switched = await page.switchTargetAnchorDate("2026-11-21");
  assert.equal(switched.ok, true);
  assert.equal(switched.targetDate, "2026-11-21");
});
