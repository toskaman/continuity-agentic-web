/**
 * @module @continuity/openrouter-pkce
 * Zero-Client-ID 1-Click OAuth 2.0 PKCE (RFC 7636 `S256`) Onboarding for Static Open Agentic Websites.
 *
 * Implements `cognizant-ai-labs/agentic-web` Issue #22 ("Add a 'Connect with OpenRouter' sign-in
 * to the AI model settings"):
 *  1. Generates cryptographic `code_verifier` + `S256` `code_challenge` + anti-CSRF `state` in
 *     tab-scoped `sessionStorage` with a strict 10-minute expiration window.
 *  2. Scrubs `?code=` and `?state=` from `window.location` IMMEDIATELY via `history.replaceState`
 *     before performing any network fetch so single-use codes never linger in browser history or Referer.
 *  3. Verifies anti-CSRF `state`, exchanges `{ code, code_verifier, code_challenge_method: "S256" }`
 *     over CORS against `https://openrouter.ai/api/v1/auth/keys`, and labels the key with the site brand.
 */

import { timingSafeEqualString } from "../shared-schemas/index.js";

const STORAGE_SLOT = "nsweb-openrouter-pkce-v1";
const PKCE_TTL_MS = 10 * 60 * 1000; // 10 minutes per OpenRouter PKCE specification

function assertSafePkceEndpointUrl(rawUrl, label) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new Error(`Invalid ${label} URL.`);
  }
  if (u.username || u.password) {
    throw new Error(`${label} must not embed credentials.`);
  }
  const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback)) {
    throw new Error(`${label} requires HTTPS (or loopback HTTP).`);
  }
  return u;
}

export function clearPendingOpenRouterPkce(storage = null) {
  const s = storage ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  try {
    s?.removeItem(STORAGE_SLOT);
  } catch {}
}

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 32) {
  const arr = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(arr);
  return bytesToBase64Url(arr);
}

export async function computePkceS256Challenge(verifier) {
  const data = new TextEncoder().encode(String(verifier));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(digest));
}

function scrubPkceParamsFromUrl(rawUrl) {
  const u = new URL(String(rawUrl));
  u.searchParams.delete("code");
  u.searchParams.delete("state");
  u.searchParams.delete("error");
  u.searchParams.delete("error_description");
  return u.toString();
}

/**
 * Start a 1-click OpenRouter OAuth PKCE S256 sign-in flow.
 *
 * @param {object} [options]
 * @param {string} [options.callbackUrl]
 * @param {Storage} [options.storage]
 * @param {string} [options.authBaseUrl="https://openrouter.ai/auth"]
 * @param {number} [options.nowMs]
 */
export async function createOpenRouterPkceAuthRequest(options = {}) {
  const storage = options.storage ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!storage) {
    throw new Error("OpenRouter PKCE requires sessionStorage to bind code_verifier and anti-CSRF state.");
  }
  const rawCallback =
    options.callbackUrl
    || (typeof location !== "undefined" ? scrubPkceParamsFromUrl(location.href) : "http://localhost:8080/");
  const cleanCallback = scrubPkceParamsFromUrl(rawCallback);
  assertSafePkceEndpointUrl(cleanCallback, "PKCE callback_url");

  const verifier = randomBase64Url(32); // 43-char RFC 7636 S256 verifier
  const state = randomBase64Url(24);
  const challenge = await computePkceS256Challenge(verifier);
  const createdAtMs = options.nowMs ?? Date.now();

  storage.setItem(
    STORAGE_SLOT,
    JSON.stringify({
      verifier,
      state,
      callbackUrl: cleanCallback,
      createdAtMs,
    }),
  );

  const authUrl = assertSafePkceEndpointUrl(options.authBaseUrl || "https://openrouter.ai/auth", "PKCE authBaseUrl");
  authUrl.searchParams.set("callback_url", cleanCallback);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  return {
    authUrl: authUrl.toString(),
    state,
    codeChallenge: challenge,
    callbackUrl: cleanCallback,
  };
}

/**
 * Handle an incoming `?code=...&state=...` redirect from OpenRouter PKCE.
 * Always scrubs `code` and `state` from the URL first, even if validation fails!
 *
 * @param {object} [options]
 * @param {string} [options.currentUrl]
 * @param {Storage} [options.storage]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.keysEndpoint="https://openrouter.ai/api/v1/auth/keys"]
 * @param {string} [options.keyLabel="CONTINUITY Open Agentic Web"]
 * @param {(cleanUrl: string) => void} [options.replaceUrlFn]
 * @param {number} [options.nowMs]
 */
export async function completeOpenRouterPkceCallback(options = {}) {
  const rawUrl = options.currentUrl ?? (typeof location !== "undefined" ? location.href : "");
  if (!rawUrl) return { handled: false };

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { handled: false };
  }

  const code = parsed.searchParams.get("code");
  if (!code) {
    return { handled: false };
  }
  const returnedState = parsed.searchParams.get("state") || "";
  const cleanedUrl = scrubPkceParamsFromUrl(rawUrl);

  // Immediately scrub single-use OAuth code & state from the browser URL bar
  if (typeof options.replaceUrlFn === "function") {
    options.replaceUrlFn(cleanedUrl);
  } else if (typeof history !== "undefined" && typeof history.replaceState === "function") {
    try {
      const rel = new URL(cleanedUrl);
      history.replaceState(null, "", `${rel.pathname}${rel.search}${rel.hash}`);
    } catch {}
  }

  const storage = options.storage ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!storage) {
    return { handled: true, ok: false, cleanedUrl, reason: "Missing sessionStorage for PKCE verification." };
  }

  let saved = null;
  try {
    const rawSaved = storage.getItem(STORAGE_SLOT);
    storage.removeItem(STORAGE_SLOT); // Single-use consumption!
    saved = rawSaved ? JSON.parse(rawSaved) : null;
  } catch {
    saved = null;
  }

  if (!saved || typeof saved.verifier !== "string" || typeof saved.state !== "string") {
    return {
      handled: true,
      ok: false,
      cleanedUrl,
      reason: "No pending OpenRouter PKCE sign-in found in this tab.",
    };
  }

  if (!returnedState || !timingSafeEqualString(returnedState, saved.state)) {
    return {
      handled: true,
      ok: false,
      cleanedUrl,
      reason: "OpenRouter PKCE state mismatch — potential CSRF callback rejected.",
    };
  }
  if (!/^[A-Za-z0-9._~+/-]{1,512}$/.test(code)) {
    return {
      handled: true,
      ok: false,
      cleanedUrl,
      reason: "Malformed OAuth authorization code rejected.",
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(saved.createdAtMs) || nowMs - saved.createdAtMs > PKCE_TTL_MS) {
    return {
      handled: true,
      ok: false,
      cleanedUrl,
      reason: "OpenRouter PKCE authorization code expired (> 10 minutes).",
    };
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const endpoint = options.keysEndpoint || "https://openrouter.ai/api/v1/auth/keys";
  try {
    assertSafePkceEndpointUrl(endpoint, "PKCE keysEndpoint");
  } catch (err) {
    return { handled: true, ok: false, cleanedUrl, reason: err.message };
  }
  const keyLabel = String(options.keyLabel || "CONTINUITY Open Agentic Web").slice(0, 64);

  try {
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        code,
        code_verifier: saved.verifier,
        code_challenge_method: "S256",
        key_label: keyLabel,
      }),
    });
    if (!res.ok) {
      return {
        handled: true,
        ok: false,
        cleanedUrl,
        reason: `OpenRouter key exchange failed with HTTP ${res.status}.`,
      };
    }
    const payload = await res.json();
    const apiKey = typeof payload?.key === "string" ? payload.key.trim() : "";
    if (!apiKey) {
      return {
        handled: true,
        ok: false,
        cleanedUrl,
        reason: "OpenRouter key exchange response did not contain a valid key.",
      };
    }
    return {
      handled: true,
      ok: true,
      key: apiKey,
      router: "https://openrouter.ai/api/v1",
      keyLabel,
      cleanedUrl,
    };
  } catch (err) {
    return {
      handled: true,
      ok: false,
      cleanedUrl,
      reason: `OpenRouter key exchange network error: ${err.message}`,
    };
  }
}
