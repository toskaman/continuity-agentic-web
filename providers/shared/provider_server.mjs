/**
 * Independent Open Agentic Provider Server + MCP JSON-RPC 2.0 (`2025-06-18`) Endpoint.
 *
 * Serves:
 * 1. Full static Open Agentic Website bundle (`index.html`, `agent-manifest.json`,
 *    `<network>.network.json`, `links.json`, `agent-mcp.json`, `.well-known/*`, `bridge/*`, `runtime/*`)
 *    with exact CORS and Sandbox Worker CSP headers required by the MVP Spec.
 * 2. CORS-enabled `/mcp` JSON-RPC 2.0 endpoint (`initialize`, `notifications/initialized`,
 *    `tools/list`, `tools/call`) compatible with `runtime/mcp.js`.
 * 3. Typed REST endpoints `/api/state`, `/api/quote`, `/api/hold`, `/api/commit`, `/api/status`, `/api/reset`
 *    with idempotency key deduplication, schema validation, and Ed25519 signed receipts.
 */

import { readFile, realpath, stat } from "node:fs/promises";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import { canonicalizeJson, sha256Hex, validateAgainstSchema } from "../../packages/shared-schemas/index.js";
import { generateDemoProviderKeyPair, signProviderReceipt } from "../../packages/proof-verifier/index.js";
import { encodeSignedReceiptHandoff } from "../../packages/cross-origin-bridge/index.js";
import { handleFederatedResolutionRequest } from "../../packages/nanda-resolver/index.js";

const WORKER_CSP = "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'";
const MAX_PROVIDER_STORE_ENTRIES = 1024;

function createBoundedMap(maxEntries = MAX_PROVIDER_STORE_ENTRIES) {
  const map = new Map();
  const origSet = map.set.bind(map);
  map.set = (k, v) => {
    if (map.size >= maxEntries && !map.has(k)) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
    return origSet(k, v);
  };
  return map;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".sarif": "application/sarif+json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".ics": "text/calendar; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export class IndependentProviderHost {
  /**
   * @param {object} config
   * @param {string} config.providerId
   * @param {string} config.providerName
   * @param {string} config.siteFolder
   * @param {string} config.host
   * @param {number} config.port
   * @param {string} [config.openAs]
   * @param {() => Record<string, any>} config.createInitialState
   * @param {Array<Record<string, any>>} config.mcpTools
   * @param {Record<string, (state: any, args: any, helpers: any) => Promise<any> | any>} config.handlers
   */
  constructor(config) {
    this.config = config;
    this.root = null;
    this.server = null;
    this.keyPair = null;
    this.state = null;
    this.holds = createBoundedMap();
    this.idempotencyStore = createBoundedMap();
    this.publicFiles = new Set([
      "/agent-manifest.json",
      "/agent-card.json",
      "/ai-catalog.json",
      "/poppy.json",
      "/links.json",
      "/agent-mcp.json",
      "/facts/agent-manifest.json",
      "/facts/links.json",
      "/.well-known/nsdeploy.json",
      "/.well-known/nsdeploy-agent.json",
      "/.well-known/agent-card.json",
      "/.well-known/ai-catalog.json",
      "/.well-known/poppy.json",
    ]);
  }

  async init() {
    this.root = await realpath(this.config.siteFolder);
    this.keyPair = await generateDemoProviderKeyPair(this.config.providerId);
    this.resetState();

    try {
      const manifestRaw = await readFile(path.join(this.root, "agent-manifest.json"), "utf8");
      const manifest = JSON.parse(manifestRaw);
      for (const net of manifest.networks || []) {
        if (net.hocon) {
          const clean = "/" + String(net.hocon).replace(/^\.\//, "");
          this.publicFiles.add(clean);
        }
        if (net.name) {
          this.publicFiles.add(`/facts/${net.name}_facts.network.json`);
        }
      }
    } catch {
      // Static coordinator or unbuilt folder
    }
  }

  resetState() {
    this.state = this.config.createInitialState();
    this.holds.clear();
    this.idempotencyStore.clear();
  }

  publicKeyDescriptor() {
    return {
      providerId: this.config.providerId,
      keyId: this.keyPair.keyId,
      publicJwk: this.keyPair.publicJwk,
    };
  }

  async start() {
    await this.init();
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        const status = err?.httpStatus || 500;
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(
          JSON.stringify({
            ok: false,
            error: status < 500 ? err.message : "Internal provider server error.",
          }),
        );
      });
    });
    this.server.listen(this.config.port, this.config.host || "127.0.0.1");
    await once(this.server, "listening");
    const boundPort = this.server.address().port;

    // On Windows/macOS, `localhost` resolves to IPv6 `::1` before IPv4 `127.0.0.1`.
    // When `openAs === "localhost"`, mirror the listener strictly onto IPv6 loopback `::1`
    // (never `::` wildcard) so browsers hit zero TCP fallback latency while staying loopback-only.
    this.ipv6Server = null;
    if (this.config.openAs === "localhost") {
      try {
        const v6 = http.createServer((req, res) => {
          this.handleRequest(req, res).catch((err) => {
            const status = err?.httpStatus || 500;
            res.writeHead(status, {
              "Content-Type": "application/json; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(
              JSON.stringify({
                ok: false,
                error: status < 500 ? err.message : "Internal provider server error.",
              }),
            );
          });
        });
        v6.on("error", () => {});
        v6.listen(boundPort, "::1");
        await Promise.race([
          once(v6, "listening"),
          new Promise((r) => setTimeout(r, 80)),
        ]);
        if (v6.listening) this.ipv6Server = v6;
      } catch {
        this.ipv6Server = null;
      }
    }
    return boundPort;
  }

  async stop() {
    if (this.ipv6Server) {
      await new Promise((resolve) => this.ipv6Server.close(resolve));
      this.ipv6Server = null;
    }
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }

  origin() {
    const port = this.server?.address()?.port ?? this.config.port;
    const host = this.config.openAs || this.config.host || "127.0.0.1";
    return `http://${host}:${port}`;
  }

  async readJsonBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 65_536) {
        const err = new Error("Request body exceeds 64 KB limit.");
        err.httpStatus = 413;
        throw err;
      }
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error("Malformed JSON request body.");
      err.httpStatus = 400;
      err.isJsonParseError = true;
      throw err;
    }
  }

  sendCorsJson(res, status, payload, method = "GET") {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Idempotency-Key",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end(method === "HEAD" ? undefined : body);
  }

  async handleRequest(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    // Handle CORS preflight on /mcp, /resolve, and /api/*
    if (req.method === "OPTIONS" && (pathname === "/mcp" || pathname === "/resolve" || pathname.startsWith("/api/"))) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Idempotency-Key",
        "Access-Control-Max-Age": "600",
      });
      res.end();
      return;
    }

    // 0. Experimental Federated Known-Subject Resolution Endpoint (`draft-raskar-02` §6 `POST /resolve`)
    if (req.method === "POST" && pathname === "/resolve") {
      const body = await this.readJsonBody(req);
      const baseOrigin = this.origin();
      const host = new URL(baseOrigin).hostname;
      let bindings = [];
      try {
        const cardRaw = await readFile(path.join(this.root, "agent-card.json"), "utf8");
        const cardJson = JSON.parse(cardRaw);
        const manifestRaw = await readFile(path.join(this.root, "agent-manifest.json"), "utf8");
        const manifestJson = JSON.parse(manifestRaw);
        const netName = manifestJson?.networks?.[0]?.name || this.config.providerId;
        const cardDigest = `sha256:${await sha256Hex(canonicalizeJson(cardJson))}`;
        const nowMs = Date.now();
        bindings = [
          {
            subject: `urn:air:${host}:agent:${netName}`,
            subjectType: "urn",
            method: "artifact",
            targetType: "application/a2a-agent-card+json",
            targetUrl: `${baseOrigin}/agent-card.json`,
            targetDigest: cardDigest,
            sequence: 1,
            issuedAt: new Date(nowMs - 60_000).toISOString(),
            expiresAt: new Date(nowMs + 86_400_000).toISOString(),
            authority: {
              type: "origin-self-published",
              issuer: baseOrigin,
              evidenceUrl: `${baseOrigin}/.well-known/ai-catalog.json`,
              targetDigest: cardDigest,
            },
          },
        ];
      } catch {
        bindings = [];
      }
      const outcome = handleFederatedResolutionRequest(body, {
        registryId: baseOrigin,
        bindings,
      });
      res.writeHead(outcome.httpStatus, {
        "Content-Type": outcome.contentType,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(outcome.body));
      return;
    }

    // 1. Public Provider Key Metadata (independent verification discovery)
    if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/public-key") {
      this.sendCorsJson(
        res,
        200,
        {
          simulation_service: true,
          ...this.publicKeyDescriptor(),
        },
        req.method,
      );
      return;
    }

    // 2. State inspection & deterministic reset for reproducible e2e / judge testing
    if (req.method === "GET" && pathname === "/api/state") {
      this.sendCorsJson(res, 200, {
        simulation_service: true,
        provider_id: this.config.providerId,
        provider_name: this.config.providerName,
        state: this.state,
        active_holds: Array.from(this.holds.values()),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/reset") {
      const body = await this.readJsonBody(req);
      this.resetState();
      if (body && typeof body.injectScenario === "string") {
        this.state.injected_scenario = body.injectScenario;
      }
      this.sendCorsJson(res, 200, { ok: true, state: this.state });
      return;
    }

    // 3. Direct REST capability endpoints (mirrors MCP tools with strict schema + idempotency)
    if (req.method === "POST" && pathname === "/api/call") {
      const body = await this.readJsonBody(req);
      const toolName = String(body.tool || "");
      const args = body.arguments || {};
      const result = await this.invokeCapability(toolName, args);
      this.sendCorsJson(res, result.httpStatus || 200, result.payload);
      return;
    }

    // 4. Official MCP JSON-RPC 2.0 HTTP Streamable Endpoint (`2025-06-18`)
    if (req.method === "POST" && pathname === "/mcp") {
      let rpc;
      try {
        rpc = await this.readJsonBody(req);
      } catch (err) {
        if (err?.isJsonParseError) {
          this.sendCorsJson(res, 400, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: malformed JSON." },
          });
          return;
        }
        throw err;
      }
      if (!rpc || typeof rpc !== "object" || Array.isArray(rpc) || rpc.jsonrpc !== "2.0") {
        this.sendCorsJson(res, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid JSON-RPC 2.0 request object." },
        });
        return;
      }
      const id = Object.hasOwn(rpc, "id") ? rpc.id : null;

      if (rpc.method === "ping") {
        this.sendCorsJson(res, 200, { jsonrpc: "2.0", id, result: {} });
        return;
      }

      if (rpc.method === "notifications/initialized") {
        res.writeHead(202, {
          "Access-Control-Allow-Origin": "*",
          "Mcp-Session-Id": `mcp-${this.config.providerId}-session`,
        });
        res.end();
        return;
      }

      if (rpc.method === "initialize") {
        this.sendCorsJson(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: {
              name: `${this.config.providerId}-mcp`,
              version: "1.0.0",
            },
          },
        });
        return;
      }

      if (rpc.method === "tools/list") {
        this.sendCorsJson(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            tools: this.config.mcpTools,
          },
        });
        return;
      }

      if (rpc.method === "tools/call") {
        const toolName = rpc.params?.name;
        const rawArgs = rpc.params?.arguments || {};
        const toolArgs =
          rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
            ? Object.fromEntries(
                Object.entries(rawArgs).filter(
                  ([k]) => k !== "activation_capsule" && k !== "sly_data",
                ),
              )
            : rawArgs;
        const invoked = await this.invokeCapability(toolName, toolArgs);
        const isError = invoked.httpStatus >= 400 || invoked.payload?.ok === false;
        this.sendCorsJson(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            isError,
            content: [
              {
                type: "text",
                text: JSON.stringify(invoked.payload),
              },
            ],
          },
        });
        return;
      }

      this.sendCorsJson(res, 200, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${rpc.method}` },
      });
      return;
    }

    // 5. Static Open Agentic Website File Serving (GET / HEAD / OPTIONS)
    if (req.method === "OPTIONS" && this.publicFiles.has(pathname)) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      });
      res.end();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }

    if (pathname.includes("\0")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }
    let relPath;
    try {
      relPath = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Malformed URI");
      return;
    }
    if (relPath.includes("\0")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }
    if (relPath.endsWith("/")) relPath += "index.html";
    const resolved = path.resolve(this.root, `.${relPath}`);
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    try {
      const realTarget = await realpath(resolved);
      if (!realTarget.startsWith(this.root + path.sep) && realTarget !== this.root) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
      const st = await stat(realTarget);
      if (!st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }
      const ext = path.extname(realTarget).toLowerCase();
      const etag = `W/"${st.size.toString(16)}-${Math.trunc(st.mtimeMs).toString(16)}"`;
      const headers = {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": ext === ".woff2" ? "public, max-age=31536000, immutable" : "no-store",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      };
      if (this.publicFiles.has(relPath)) {
        headers["Access-Control-Allow-Origin"] = "*";
      }
      if (relPath === "/runtime/sandbox-worker.js") {
        headers["Content-Security-Policy"] = WORKER_CSP;
      }
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      const content = req.method === "HEAD" ? null : await readFile(realTarget);
      headers["Content-Length"] = String(st.size);
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
      res.end("Not Found");
    }
  }

  async invokeCapability(toolName, args) {
    const toolSpec = this.config.mcpTools.find((t) => t.name === toolName);
    if (!toolSpec) {
      return {
        httpStatus: 404,
        payload: { ok: false, error: `Unknown capability "${toolName}" on ${this.config.providerId}.` },
      };
    }

    const schemaCheck = validateAgainstSchema(toolSpec.inputSchema, args);
    if (!schemaCheck.valid) {
      return {
        httpStatus: 400,
        payload: {
          ok: false,
          error: `Invalid arguments for ${toolName}: ${schemaCheck.errors.join("; ")}`,
        },
      };
    }

    const handler = this.config.handlers[toolName];
    const helpers = {
      holds: this.holds,
      idempotencyStore: this.idempotencyStore,
      signReceipt: (body) => signProviderReceipt(body, this.keyPair),
      origin: this.origin(),
    };

    const payload = await handler(this.state, args, helpers);
    if (payload && typeof payload === "object" && payload.receipt_envelope && !payload.handoff_token) {
      payload.handoff_token = encodeSignedReceiptHandoff(
        payload.receipt_envelope,
        this.keyPair,
        this.origin(),
      );
    }
    return {
      httpStatus: 200,
      payload,
    };
  }
}
