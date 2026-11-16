// remote.js — the RemoteNetworkLoader intrinsic: fetch a peer origin's published
// agent network (manifest + HOCON + coded-tool bundle) and make it runnable
// locally. This is the "fetch-and-run-locally" cross-origin composition model:
// there is no agent server — the caller's browser runs the peer's published files.

const MAX_REMOTE_BYTES = 524_288; // 512 KB cap on remote manifests & network definitions

export function assertSafeRemoteUrl(rawUrl) {
  const str = String(rawUrl || "").trim();
  if (!str) throw new Error("empty remote URL");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(str)) return str; // relative path resolved against page origin
  let u;
  try {
    u = new URL(str);
  } catch {
    throw new Error(`invalid remote URL '${str}'`);
  }
  if (u.username || u.password) {
    throw new Error(`remote URL must not embed credentials: ${str}`);
  }
  const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback)) {
    throw new Error(`remote URL requires HTTPS (or loopback HTTP): ${str}`);
  }
  return u.href;
}

export async function fetchManifest(originUrl) {
  const base = String(originUrl || "").replace(/\/$/, "");
  const url = `${base}/agent-manifest.json`;
  assertSafeRemoteUrl(url);
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(10000) : undefined;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!resp.ok) throw new Error(`manifest fetch ${resp.status} for ${url}`);
  const text = await resp.text();
  if (text.length > MAX_REMOTE_BYTES) {
    throw new Error(`manifest at ${url} exceeds ${MAX_REMOTE_BYTES} byte limit`);
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<")) {
    throw new Error(`manifest fetch returned HTML fallback instead of JSON for ${url}`);
  }
  const manifest = JSON.parse(text);
  return { manifest, base, url };
}

export async function fetchText(url) {
  assertSafeRemoteUrl(url);
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(10000) : undefined;
  const resp = await fetch(url, signal ? { signal } : undefined);
  if (!resp.ok) throw new Error(`fetch ${resp.status} for ${url}`);
  const text = await resp.text();
  if (text.length > MAX_REMOTE_BYTES) {
    throw new Error(`remote asset ${url} exceeds ${MAX_REMOTE_BYTES} byte limit`);
  }
  return text;
}

// Resolve a relative path against an origin base while enforcing same-origin containment.
export function resolveUrl(base, path) {
  const rawPath = String(path || "").trim();
  if (/^https?:\/\//i.test(rawPath)) {
    assertSafeRemoteUrl(rawPath);
    if (/^https?:\/\//i.test(String(base || ""))) {
      if (new URL(rawPath).origin !== new URL(base).origin) {
        throw new Error(`remote asset '${rawPath}' must belong to publishing origin '${new URL(base).origin}'`);
      }
    }
    return rawPath;
  }
  const cleanRel = rawPath.replace(/^\.\//, "");
  return base.replace(/\/$/, "") + (cleanRel.startsWith("/") ? cleanRel : "/" + cleanRel);
}

// Caches compiled peer sessions and enforces cycle + depth limits across hops.
export class RemoteRegistry {
  constructor({ maxDepth = 5, maxEntries = 64, trace } = {}) {
    this.maxDepth = maxDepth;
    this.maxEntries = maxEntries;
    this.trace = trace;
    this.cache = new Map(); // key: `${origin}::${agentName}` -> Session
  }

  cacheKey(origin, agentName) {
    return `${origin}::${agentName}`;
  }

  get(origin, agentName) {
    return this.cache.get(this.cacheKey(origin, agentName));
  }

  set(origin, agentName, session) {
    const key = this.cacheKey(origin, agentName);
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, session);
  }

  clear() {
    this.cache.clear();
  }

  checkCycle(chain, origin, agentName) {
    const key = this.cacheKey(origin, agentName);
    if (chain.includes(key)) {
      const error = new Error(`composition cycle detected: ${[...chain, key].join(" -> ")}`);
      error.code = "COMPOSITION_CYCLE";
      throw error;
    }
    if (chain.length >= this.maxDepth) {
      const error = new Error(`composition depth limit (${this.maxDepth}) exceeded`);
      error.code = "COMPOSITION_DEPTH";
      throw error;
    }
  }
}
