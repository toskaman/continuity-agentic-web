/**
 * Live-model verification (optional, needs a real Mozilla Otari key).
 *
 * Runs the real Cognizant `Engine` for CONTINUITY against the REAL hosted router and the
 * default model, composing the 4 peer networks served from disk on their own origins.
 * Unlike the unit/integration suites (stubbed router), nothing about the model is mocked.
 *
 * Key: env OTARI_API_KEY, or OTARI_API_KEY=... in the git-ignored .env.local.
 * The key is never printed and is asserted to reach the router host only.
 *
 * Usage: node scripts/verify_live_llm.mjs [--model <id>] [--json <out.json>]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "../skills/agentify-website/runtime/engine.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};

let key = process.env.OTARI_API_KEY || "";
if (!key) {
  const env = await readFile(path.join(ROOT, ".env.local"), "utf8").catch(() => "");
  key = (env.match(/^OTARI_API_KEY=(.+)$/m)?.[1] || "").trim();
}
if (!key) {
  console.log("SKIPPED: no OTARI_API_KEY (env or .env.local). Nothing was contacted.");
  process.exit(0);
}

const MODEL = arg("--model", "alibaba/qwen-3.5-35b-a3b");
const ROUTER = /^otk_v1_eu_/.test(key) ? "https://eu.api.otari.ai/api/v1" : "https://api.otari.ai/api/v1";
const folders = {
  "http://127.0.0.1:8080": "continuity-web",
  "http://127.0.0.1:8081": "demo-moveco",
  "http://localhost:8082": "demo-permitflow",
  "http://127.0.0.1:8083": "demo-homeconnect",
  "http://localhost:8084": "demo-powerflow",
};

const realFetch = globalThis.fetch;
const router = { calls: 0, errors: [], sentMaxTokens: 0, models: new Set() };
const peerHits = {};
let keyLeak = false;

globalThis.fetch = async (input, init = {}) => {
  const urlStr = typeof input === "string" ? input : input.url;
  const url = new URL(urlStr);
  const auth = new Headers(init.headers || {}).get("authorization") || "";
  if (urlStr.startsWith(ROUTER)) {
    router.calls += 1;
    try {
      const body = JSON.parse(init.body || "{}");
      if (body.model) router.models.add(body.model);
      if ("max_tokens" in body || "max_completion_tokens" in body) router.sentMaxTokens += 1;
    } catch {}
    const res = await realFetch(input, init);
    if (!res.ok) router.errors.push(`${res.status} ${(await res.clone().text()).slice(0, 200)}`);
    return res;
  }
  if (auth || urlStr.includes(key)) keyLeak = true;
  const dir = folders[url.origin];
  if (!dir) return new Response("Unknown origin", { status: 404 });
  if (url.origin !== "http://127.0.0.1:8080") peerHits[url.origin] = (peerHits[url.origin] || 0) + 1;
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  try {
    let text = await readFile(path.join(ROOT, "apps", dir, rel), "utf8");
    if (rel === "agent-manifest.json") {
      const parsed = JSON.parse(text); // Node has no DOM for page actions (same as the upstream linking test)
      delete parsed.actions;
      text = JSON.stringify(parsed);
    }
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": rel.endsWith(".json") ? "application/json" : "text/plain", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
};

const engine = new Engine({ originUrl: "http://127.0.0.1:8080", byokKey: key, routerOverride: ROUTER, modelOverride: MODEL });
const consents = [];
engine.onConsent = async (info) => {
  consents.push({ peer: info.peerOrigin, contactedBeforeConsent: Object.keys(peerHits).some((o) => new URL(o).host === info.peerOrigin) });
  return "allow";
};

const prompt = "Ask MoveCo, PermitFlow, HomeConnect, and PowerFlow what services each offers.";
const t0 = Date.now();
let reply = "";
let error = null;
try {
  reply = String(await engine.run(prompt));
} catch (err) {
  error = String(err?.message || err);
}
globalThis.fetch = realFetch;

const mentions = ["MoveCo", "PermitFlow", "HomeConnect", "PowerFlow"].filter((n) => new RegExp(n, "i").test(reply));
const result = {
  measuredAtIso: new Date().toISOString(),
  routerHost: new URL(ROUTER).host,
  model: MODEL,
  prompt,
  seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
  error,
  routerCalls: router.calls,
  routerErrors: router.errors,
  requestsWithExplicitMaxTokens: router.sentMaxTokens,
  modelsRequested: [...router.models],
  consentCards: consents.length,
  anyPeerContactedBeforeConsent: consents.some((c) => c.contactedBeforeConsent),
  peerOriginsContacted: Object.keys(peerHits).length,
  apiKeySentOutsideRouter: keyLeak,
  replyChars: reply.length,
  providersNamedInReply: mentions,
  replyExcerpt: reply.replace(/\s+/g, " ").slice(0, 400),
};
console.log(JSON.stringify(result, null, 2));
const out = arg("--json", "");
if (out) await writeFile(path.resolve(out), `${JSON.stringify(result, null, 2)}\n`, "utf8");
const ok = !error && router.errors.length === 0 && consents.length === 4 && !keyLeak && !result.anyPeerContactedBeforeConsent && mentions.length === 4;
console.log(ok ? "LIVE MODEL CHECK: PASS" : "LIVE MODEL CHECK: FAIL");
process.exit(ok ? 0 : 1);
