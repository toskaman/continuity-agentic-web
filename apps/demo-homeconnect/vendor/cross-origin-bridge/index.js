/**
 * @module @continuity/cross-origin-bridge
 * Zero-Server Cross-Origin Browser Capability & Ed25519 Receipt Bridge for Open Agentic Websites.
 *
 * Solves Section 7 ("Cross-site browser actions") of the Worldwide Agentic Web MVP Specification:
 * Static HTTPS Open Agentic Websites (e.g. GitHub Pages, Cloudflare Pages, S3) have no backend POST
 * server, yet independent agentic origins need a safe, browser-native way to expose typed quotes,
 * temporary holds, and cryptographically signed receipts across origins while respecting:
 *  1. Strict `event.origin` caller allowlists (`peer_policy` / `allowed_callers`).
 *  2. Origin-isolated WebCrypto Ed25519 private keys (peer private key NEVER leaves peer origin).
 *  3. Idempotency-key deduplication & `UNKNOWN` timeout semantics (never blind duplicate writes).
 *  4. Signed Receipt Handoff Tokens (`#continuity_receipt=<base64url>`) so opening a peer site in
 *     a top-level tab verifies its own Ed25519 signature and hydrates the committed booking even
 *     when modern browsers partition third-party iframe `localStorage` (CHIPS / State Partitioning).
 */

import { generateDemoProviderKeyPair, ReceiptVerifier, signProviderReceipt } from "../proof-verifier/index.js";
import { canonicalizeJson, isValidIsoDate, sanitizeJson, sha256Hex } from "../shared-schemas/index.js";

export const BRIDGE_PROTOCOL = "continuity-peer-rpc/v1";

function encodeBase64UrlJson(obj) {
  const utf8 = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64UrlJson(token) {
  const padded = String(token)
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(token.length / 4) * 4, "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return sanitizeJson(JSON.parse(new TextDecoder().decode(bytes)));
}

/**
 * Create a self-signed cross-tab receipt handoff token (`base64url`) containing the
 * Ed25519-signed receipt envelope and the peer's public JWK.
 * When the peer site opens in a top-level tab, it verifies `envelope` against `publicJwk`
 * (and checks `provider_id` + `origin`) before applying any state mutation.
 *
 * @param {Record<string, any>} signedEnvelope
 * @param {{ keyId: string, publicJwk: JsonWebKey }} keyMeta
 * @param {string} peerOrigin
 */
export function encodeSignedReceiptHandoff(signedEnvelope, keyMeta, peerOrigin) {
  return encodeBase64UrlJson({
    v: 1,
    peerOrigin,
    keyId: keyMeta.keyId,
    publicJwk: keyMeta.publicJwk,
    envelope: signedEnvelope,
  });
}

/**
 * Verify a `#continuity_receipt=...` handoff token for `expectedProviderId`.
 * Rejects tampered payloads, mismatched provider IDs, invalid ISO dates, HTML/script strings,
 * mismatched origins, or forged Ed25519 signatures.
 *
 * @param {string} expectedProviderId
 * @param {string} rawToken
 * @param {object} [options]
 * @param {string} [options.expectedOrigin]
 * @param {{ keyId: string, publicJwk: JsonWebKey }} [options.pinnedKey]
 */
export async function verifySignedReceiptHandoff(expectedProviderId, rawToken, options = {}) {
  try {
    const parsed = decodeBase64UrlJson(rawToken);
    if (!parsed || parsed.v !== 1 || !parsed.publicJwk || !parsed.envelope) {
      return { valid: false, reason: "Malformed handoff token." };
    }
    if (options.expectedOrigin && parsed.peerOrigin) {
      const cleanExpected = String(options.expectedOrigin).replace(/\/+$/, "");
      const cleanTokenOrigin = String(parsed.peerOrigin).replace(/\/+$/, "");
      if (cleanExpected !== cleanTokenOrigin) {
        return { valid: false, reason: `Handoff token origin "${cleanTokenOrigin}" does not match "${cleanExpected}".` };
      }
    }
    const rb = parsed.envelope?.receipt_body;
    if (!rb || !isValidIsoDate(rb.scheduled_date)) {
      return { valid: false, reason: "Handoff receipt scheduled_date must be a valid YYYY-MM-DD calendar date." };
    }
    if (typeof rb.receipt_id !== "string" || !/^[A-Za-z0-9_.:-]{3,96}$/.test(rb.receipt_id)) {
      return { valid: false, reason: "Invalid receipt_id format in handoff token." };
    }
    if (rb.booking_ref !== undefined && !/^[A-Za-z0-9_-]{2,48}$/.test(String(rb.booking_ref))) {
      return { valid: false, reason: "Invalid booking_ref format in handoff token." };
    }

    const activeKey = options.pinnedKey || {
      keyId: parsed.keyId,
      publicJwk: parsed.publicJwk,
    };
    const verifier = new ReceiptVerifier({
      [expectedProviderId]: activeKey,
    });
    const check = await verifier.verifyReceipt(expectedProviderId, parsed.envelope);
    if (!check.valid) {
      return { valid: false, reason: check.detail || "Invalid Ed25519 signature." };
    }
    return {
      valid: true,
      trustSource: options.pinnedKey ? "PINNED_PROVIDER_KEY" : "CROSS_PARTITION_HANDOFF_ENVELOPE",
      peerOrigin: parsed.peerOrigin,
      receiptBody: parsed.envelope.receipt_body,
      proof: parsed.envelope.proof,
    };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

/**
 * Load or generate an origin-scoped Ed25519 provider keypair in browser storage (or memory fallback).
 * @param {string} providerId
 */
export async function getOrCreateOriginKeyPair(providerId) {
  const storageKey = `continuity_ed25519_key_${providerId}_v1`;
  const hasBrowserStorage = typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  try {
    if (hasBrowserStorage) {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = sanitizeJson(JSON.parse(raw));
        if (parsed?.keyId && parsed?.publicJwk && parsed?.privateJwk) {
          return parsed;
        }
      }
    }
  } catch {
    // Storage disabled or sandboxed — fall through to ephemeral WebCrypto keypair
  }
  const generated = await generateDemoProviderKeyPair(providerId);
  try {
    if (hasBrowserStorage) {
      window.localStorage.setItem(storageKey, JSON.stringify(generated));
    }
  } catch {
    // Ignore quota/sandbox warning
  }
  return generated;
}

/**
 * Build the canonical stateful domain engine for any of the 4 independent Open Agentic Peers
 * (`moveco`, `permitflow`, `homeconnect`, `powerflow`) so static browser bridges and Node servers
 * enforce identical schemas, hold rules, ripple recovery, and Ed25519 receipt structures.
 *
 * @param {"moveco" | "permitflow" | "homeconnect" | "powerflow"} providerId
 * @param {object} [options]
 * @param {string} [options.origin]
 */
export function createPeerBrowserDomainEngine(providerId, options = {}) {
  const origin =
    options.origin
    || (typeof location !== "undefined" ? `${location.origin}${location.pathname.replace(/\/[^/]*$/, "")}` : `https://peer.local/${providerId}`);

  const initialByProvider = {
    moveco: () => ({
      injected_scenario: "normal",
      booking: {
        booking_ref: "MC-8841",
        commitment_id: "cmt_moveco_van",
        status: "CONFIRMED",
        scheduled_date: "2026-11-17",
        window: "08:00–13:00",
        base_price_eur: 390,
        change_fee_eur: 25,
      },
    }),
    permitflow: () => ({
      injected_scenario: "normal",
      booking: {
        booking_ref: "PF-2049",
        commitment_id: "cmt_permitflow_bay",
        status: "PREPARED_DOSSIER",
        scheduled_date: "2026-11-17",
        window: "07:30–14:00",
        base_price_eur: 35,
        change_fee_eur: 10,
      },
    }),
    homeconnect: () => ({
      injected_scenario: "normal",
      booking: {
        booking_ref: "HC-5510",
        commitment_id: "cmt_homeconnect_fiber",
        status: "CONFIRMED",
        scheduled_date: "2026-11-17",
        window: "14:00–17:00",
        base_price_eur: 49,
        change_fee_eur: 0,
      },
    }),
    powerflow: () => ({
      injected_scenario: "normal",
      booking: {
        booking_ref: "PFW-9921",
        commitment_id: "cmt_powerflow_grid",
        status: "CONFIRMED",
        scheduled_date: "2026-11-17",
        window: "08:00–12:00",
        base_price_eur: 30,
        change_fee_eur: 0,
      },
    }),
  };

  if (!initialByProvider[providerId]) {
    throw new Error(`Unsupported peer providerId "${providerId}".`);
  }

  let state = initialByProvider[providerId]();
  const holds = new Map();
  const idempotencyStore = new Map();
  let signerPromise = null;

  const ensureSigner = () => {
    if (!signerPromise) signerPromise = getOrCreateOriginKeyPair(providerId);
    return signerPromise;
  };

  const reset = (injectScenario = "normal") => {
    state = initialByProvider[providerId]();
    state.injected_scenario = injectScenario;
    holds.clear();
    idempotencyStore.clear();
    return { ok: true, providerId, injected_scenario: state.injected_scenario };
  };

  const callTool = async (tool, rawArgs = {}) => {
    const args = sanitizeJson(rawArgs);
    const signer = await ensureSigner();

    // 1. QUOTE TOOLS
    if (
      ["get_moving_quote", "check_bay_eligibility", "list_technician_windows", "check_grid_windows"].includes(tool)
    ) {
      const targetDate = String(args.target_date || "");
      if (!isValidIsoDate(targetDate)) {
        return { ok: false, reason: `Invalid ISO target_date "${targetDate}".` };
      }

      if (providerId === "moveco") {
        const ripple = state.injected_scenario === "primary_fri_full";
        const offers = ripple
          ? [
              {
                offer_id: "off_moveco_partner_overflow_fri",
                commitment_id: "cmt_moveco_van",
                provider_id: "moveco",
                provider_name: "MoveCo Partner Overflow Fleet (Demo)",
                provider_origin: origin,
                raw_capability: "reschedule_van_booking",
                semantic_kind: "REPLACE_WITH_BACKUP_PROVIDER",
                proposed_date: targetDate,
                window: "09:30–14:30",
                base_price_eur: 405,
                change_fee_eur: 0,
                cancellation_penalty_eur: 20,
                supports_hold: true,
                hold_ttl_seconds: 900,
                reversible: false,
                creates_final_booking: true,
                requires_user_approval: true,
                supports_idempotency: true,
                supports_status_reconciliation: true,
                is_replacement_provider: true,
                expires_at: "2027-01-20T23:59:59Z",
                disclosure_note:
                  "Cross-Origin Bridge: Primary 08:00 crew full; MoveCo Partner Overflow Fleet offered while MC-8841 stays held.",
              },
            ]
          : [
              {
                offer_id: "off_moveco_fri_am",
                commitment_id: "cmt_moveco_van",
                provider_id: "moveco",
                provider_name: "MoveCo Express (Demo)",
                provider_origin: origin,
                raw_capability: "reschedule_van_booking",
                semantic_kind: "RESCHEDULE_IN_PLACE",
                proposed_date: targetDate,
                window: "08:00–13:00",
                base_price_eur: 390,
                change_fee_eur: 25,
                cancellation_penalty_eur: 0,
                supports_hold: true,
                hold_ttl_seconds: 900,
                reversible: false,
                creates_final_booking: true,
                requires_user_approval: true,
                supports_idempotency: true,
                supports_status_reconciliation: true,
                is_replacement_provider: false,
                expires_at: "2027-01-20T23:59:59Z",
              },
            ];
        return {
          ok: true,
          primary_refused: ripple,
          refusal_reason: ripple
            ? `Primary MoveCo 08:00 crew is at 100% capacity on ${targetDate}; partner overflow slot returned over cross-origin bridge.`
            : null,
          offers,
        };
      }

      if (providerId === "permitflow") {
        return {
          ok: true,
          offers: [
            {
              offer_id: `off_permitflow_${targetDate}`,
              commitment_id: "cmt_permitflow_bay",
              provider_id: "permitflow",
              provider_name: "PermitFlow Civic Prep (Demo)",
              provider_origin: origin,
              raw_capability: "prepare_permit_date_update",
              semantic_kind: "PREPARE_PERMIT_DOSSIER",
              proposed_date: targetDate,
              window: "07:30–14:00",
              base_price_eur: 35,
              change_fee_eur: 10,
              cancellation_penalty_eur: 0,
              supports_hold: false,
              hold_ttl_seconds: 0,
              reversible: true,
              creates_final_booking: false,
              requires_user_approval: true,
              supports_idempotency: true,
              supports_status_reconciliation: true,
              is_replacement_provider: false,
              expires_at: "2027-01-20T23:59:59Z",
            },
          ],
        };
      }

      if (providerId === "homeconnect") {
        const nextDayDate = new Date(Date.parse(`${targetDate}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10);
        return {
          ok: true,
          offers: [
            {
              offer_id: "off_homeconnect_fri_pm",
              commitment_id: "cmt_homeconnect_fiber",
              provider_id: "homeconnect",
              provider_name: "HomeConnect Fiber (Demo)",
              provider_origin: origin,
              raw_capability: "change_fiber_appointment",
              semantic_kind: "RESCHEDULE_IN_PLACE",
              proposed_date: targetDate,
              window: "14:00–17:00",
              base_price_eur: 49,
              change_fee_eur: 0,
              cancellation_penalty_eur: 0,
              supports_hold: true,
              hold_ttl_seconds: 600,
              reversible: false,
              creates_final_booking: true,
              requires_user_approval: true,
              supports_idempotency: true,
              supports_status_reconciliation: true,
              is_replacement_provider: false,
              expires_at: "2027-01-20T23:59:59Z",
            },
            {
              offer_id: "off_homeconnect_sat_am",
              commitment_id: "cmt_homeconnect_fiber",
              provider_id: "homeconnect",
              provider_name: "HomeConnect Fiber (Demo)",
              provider_origin: origin,
              raw_capability: "change_fiber_appointment",
              semantic_kind: "RESCHEDULE_IN_PLACE",
              proposed_date: nextDayDate,
              window: "09:00–12:00",
              base_price_eur: 39,
              change_fee_eur: 0,
              cancellation_penalty_eur: 0,
              supports_hold: true,
              hold_ttl_seconds: 600,
              reversible: false,
              creates_final_booking: true,
              requires_user_approval: true,
              supports_idempotency: true,
              supports_status_reconciliation: true,
              is_replacement_provider: false,
              expires_at: "2027-01-20T23:59:59Z",
            },
          ],
        };
      }

      if (providerId === "powerflow") {
        return {
          ok: true,
          offers: [
            {
              offer_id: `off_powerflow_${targetDate}`,
              commitment_id: "cmt_powerflow_grid",
              provider_id: "powerflow",
              provider_name: "PowerFlow Energy (Demo)",
              provider_origin: origin,
              raw_capability: "shift_grid_activation",
              semantic_kind: "RESCHEDULE_IN_PLACE",
              proposed_date: targetDate,
              window: "08:00–12:00",
              base_price_eur: 30,
              change_fee_eur: 0,
              cancellation_penalty_eur: 0,
              supports_hold: false,
              hold_ttl_seconds: 0,
              reversible: false,
              creates_final_booking: true,
              requires_user_approval: true,
              supports_idempotency: true,
              supports_status_reconciliation: true,
              is_replacement_provider: false,
              expires_at: "2027-01-20T23:59:59Z",
            },
          ],
        };
      }
    }

    // 2. HOLD TOOLS
    if (["hold_moving_slot", "hold_technician_slot"].includes(tool)) {
      const idem = String(args.idempotency_key || "");
      if (holds.has(idem)) return holds.get(idem);
      const prefix = providerId === "moveco" ? "hold_mc" : "hold_hc";
      const holdResp = {
        ok: true,
        hold_id: `${prefix}_${holds.size + 1}`,
        booking_ref: args.booking_ref,
        offer_id: args.offer_id,
        proposed_date: args.proposed_date,
        original_booking_preserved: true,
        expires_at: "2027-01-20T23:59:59Z",
      };
      holds.set(idem, holdResp);
      return holdResp;
    }

    // 3. COMMIT TOOLS (Signed with origin-isolated Ed25519 private key!)
    if (
      [
        "reschedule_van_booking",
        "prepare_permit_date_update",
        "change_fiber_appointment",
        "shift_grid_activation",
      ].includes(tool)
    ) {
      const idem = String(args.idempotency_key || "");
      if (idempotencyStore.has(idem)) {
        return idempotencyStore.get(idem);
      }

      let basePrice = state.booking.base_price_eur;
      let changeFee = state.booking.change_fee_eur;
      if (providerId === "moveco" && args.offer_id === "off_moveco_partner_overflow_fri") {
        basePrice = 405;
        changeFee = 0;
      } else if (providerId === "homeconnect" && args.offer_id === "off_homeconnect_sat_am") {
        basePrice = 39;
        changeFee = 0;
      }

      state.booking.scheduled_date = args.new_date;
      if (args.window) state.booking.window = args.window;
      state.booking.status = providerId === "permitflow" ? "PREPARED_DOSSIER_UPDATED" : "CONFIRMED";

      const receiptBody = {
        receipt_id: `rcpt_${providerId}_${idempotencyStore.size + 1}`,
        provider_id: providerId,
        booking_ref: args.booking_ref || state.booking.booking_ref,
        operation: tool,
        idempotency_key: idem,
        committed_status: "COMMITTED",
        scheduled_date: state.booking.scheduled_date,
        window: state.booking.window,
        base_price_eur: basePrice,
        change_fee_eur: changeFee,
        total_price_eur: basePrice + changeFee,
        issued_at: new Date().toISOString(),
      };

      const signedEnvelope = await signProviderReceipt(receiptBody, signer);
      const handoffToken = encodeSignedReceiptHandoff(signedEnvelope, signer, origin);
      const fullResult = {
        ok: true,
        execution_state: "COMMITTED",
        status: providerId === "permitflow" ? "PREPARED_DOSSIER" : "CONFIRMED",
        booking: { ...state.booking },
        receipt_envelope: signedEnvelope,
        handoff_token: handoffToken,
      };
      idempotencyStore.set(idem, fullResult);
      return fullResult;
    }

    // 4. STATUS RECONCILIATION TOOLS
    if (
      ["get_booking_status", "get_dossier_status", "get_appointment_status", "get_activation_status"].includes(tool)
    ) {
      const idem = String(args.idempotency_key || "");
      if (idem && idempotencyStore.has(idem)) {
        const prev = idempotencyStore.get(idem);
        return {
          ok: true,
          execution_state: "COMMITTED",
          operation_status: "COMMITTED",
          booking: prev.booking,
          receipt_envelope: prev.receipt_envelope,
          handoff_token: prev.handoff_token,
        };
      }
      return {
        ok: true,
        execution_state: "NOT_FOUND_NEVER_EXECUTED",
        operation_status: "NOT_COMMITTED",
        booking: { ...state.booking },
      };
    }

    return { ok: false, reason: `Unsupported peer tool "${tool}" on ${providerId}.` };
  };

  return {
    providerId,
    ensureSigner,
    reset,
    callTool,
    getState: () => JSON.parse(JSON.stringify(state)),
  };
}

/**
 * Mount the origin-checked `postMessage` RPC listener inside a peer site's `peer-rpc-bridge.html`.
 *
 * @param {object} config
 * @param {"moveco" | "permitflow" | "homeconnect" | "powerflow"} config.providerId
 * @param {string[]} config.allowedCallerOrigins
 */
export function mountPeerRpcBridgeServer({ providerId, allowedCallerOrigins = [] }) {
  if (typeof window === "undefined") return null;
  const allowSet = new Set([
    window.location.origin,
    "https://toskaman.github.io",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    ...allowedCallerOrigins,
  ]);

  const isLoopbackHost = ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);
  const isAllowedOrigin = (origin) => {
    if (allowSet.has(origin)) return true;
    if (isLoopbackHost && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(origin || ""))) {
      return true;
    }
    return false;
  };

  const engine = createPeerBrowserDomainEngine(providerId);
  const channel =
    typeof BroadcastChannel === "function" ? new BroadcastChannel(`continuity-peer-${providerId}`) : null;

  const onMessage = async (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.protocol !== BRIDGE_PROTOCOL || !msg.requestId) return;
    try {
      if (JSON.stringify(msg).length > 16_384) return;
    } catch {
      return;
    }

    const reply = (payload) => {
      event.source?.postMessage(
        {
          protocol: BRIDGE_PROTOCOL,
          requestId: msg.requestId,
          providerId,
          ...payload,
        },
        event.origin,
      );
    };

    try {
      if (msg.method === "HANDSHAKE") {
        const signer = await engine.ensureSigner();
        reply({
          ok: true,
          keyId: signer.keyId,
          publicJwk: signer.publicJwk,
          peerOrigin: window.location.origin,
        });
        return;
      }

      if (msg.method === "RESET") {
        const res = engine.reset(msg.injectScenario || "normal");
        channel?.postMessage({ type: "PEER_RESET", state: engine.getState() });
        reply(res);
        return;
      }

      if (msg.method === "CALL_TOOL") {
        const res = await engine.callTool(msg.tool, msg.arguments || {});
        if (res?.execution_state === "COMMITTED") {
          channel?.postMessage({ type: "PEER_COMMITTED", result: res });
        }
        reply({ ok: true, result: res });
        return;
      }

      reply({ ok: false, error: `Unknown bridge method "${msg.method}".` });
    } catch (err) {
      reply({ ok: false, error: err.message });
    }
  };

  window.addEventListener("message", onMessage);
  return { engine, destroy: () => window.removeEventListener("message", onMessage) };
}

/**
 * Caller-side Cross-Origin Browser Mesh Client.
 * Connects to peer `peer-rpc-bridge.html` iframes across independent HTTPS origins, pins their
 * WebCrypto Ed25519 public JWKs in a `ReceiptVerifier`, and returns Saga-compatible clients!
 */
export class CrossOriginBridgeClient {
  /**
   * @param {Record<string, string>} peerOrigins - Map of `providerId -> baseUrl` (e.g. `https://gpaschercher-sudo.github.io/moveco-agentic-peer`)
   * @param {object} [options]
   * @param {number} [options.timeoutMs=2400]
   */
  constructor(peerOrigins, options = {}) {
    this.peerOrigins = { ...peerOrigins };
    this.timeoutMs = options.timeoutMs ?? 2400;
    /** @type {Map<string, { iframe: HTMLIFrameElement, targetOrigin: string }>} */
    this.frames = new Map();
    /** @type {Map<string, { resolve: Function, reject: Function, timer: any, expectedOrigin: string }>} */
    this.pending = new Map();
    /** @type {Record<string, string>} Latest verified `#continuity_receipt` handoff token per peer */
    this.latestHandoffTokens = {};
    this.seq = 0;
    this.connected = false;
    this.verifier = new ReceiptVerifier();
    this._boundOnMessage = this._onMessage.bind(this);
  }

  _onMessage(event) {
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.protocol !== BRIDGE_PROTOCOL || !msg.requestId) return;
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;
    if (event.origin !== entry.expectedOrigin) return;
    clearTimeout(entry.timer);
    this.pending.delete(msg.requestId);
    if (msg.ok === false && msg.error) {
      entry.reject(new Error(msg.error));
    } else {
      entry.resolve(msg);
    }
  }

  _rpc(providerId, payload) {
    const frameInfo = this.frames.get(providerId);
    if (!frameInfo || !frameInfo.iframe.contentWindow) {
      return Promise.reject(new Error(`Cross-origin bridge iframe not mounted for "${providerId}".`));
    }
    const requestId = `brpc_${providerId}_${++this.seq}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        const err = new Error(`Cross-origin bridge timeout (${this.timeoutMs}ms) contacting ${providerId}.`);
        err.code = "ETIMEDOUT";
        reject(err);
      }, this.timeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        expectedOrigin: frameInfo.targetOrigin,
      });

      frameInfo.iframe.contentWindow.postMessage(
        {
          protocol: BRIDGE_PROTOCOL,
          requestId,
          ...payload,
        },
        frameInfo.targetOrigin,
      );
    });
  }

  /**
   * Mount hidden sandboxed iframes to all 4 peer websites and perform origin-verified `HANDSHAKE`.
   * Returns `true` when all peers respond with valid Ed25519 public JWKs.
   */
  async connectAll() {
    if (typeof document === "undefined" || typeof window === "undefined") return false;
    window.removeEventListener("message", this._boundOnMessage);
    window.addEventListener("message", this._boundOnMessage);

    let container = document.querySelector("#continuity-peer-bridges");
    if (!container) {
      container = document.createElement("div");
      container.id = "continuity-peer-bridges";
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      document.body.appendChild(container);
    }

    try {
      for (const [pid, baseUrl] of Object.entries(this.peerOrigins)) {
        if (!this.frames.has(pid)) {
          const cleanBase = String(baseUrl).replace(/\/+$/, "");
          const bridgeUrl = `${cleanBase}/peer-rpc-bridge.html`;
          const targetOrigin = new URL(bridgeUrl).origin;

          const iframe = document.createElement("iframe");
          iframe.src = bridgeUrl;
          iframe.title = `${pid} cross-origin capability bridge`;
          iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
          iframe.style.display = "none";

          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`Bridge load timeout: ${bridgeUrl}`)), this.timeoutMs);
            iframe.addEventListener(
              "load",
              () => {
                clearTimeout(t);
                resolve(true);
              },
              { once: true },
            );
            iframe.addEventListener(
              "error",
              () => {
                clearTimeout(t);
                reject(new Error(`Bridge load failed: ${bridgeUrl}`));
              },
              { once: true },
            );
            container.appendChild(iframe);
          });

          this.frames.set(pid, { iframe, targetOrigin });
        }

        const hs = await this._rpc(pid, { method: "HANDSHAKE" });
        if (!hs?.publicJwk || !hs?.keyId) {
          throw new Error(`Invalid handshake from peer "${pid}".`);
        }
        this.verifier.registerTrustedProviderKey(pid, hs.keyId, hs.publicJwk);
      }

      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("message", this._boundOnMessage);
    }
    for (const [, p] of this.pending.entries()) {
      clearTimeout(p.timer);
    }
    this.pending.clear();
    for (const [, info] of this.frames.entries()) {
      try {
        info.iframe.remove();
      } catch {}
    }
    this.frames.clear();
    this.connected = false;
  }

  async resetAll({ rippleFailureInjected = false } = {}) {
    this.latestHandoffTokens = {};
    if (!this.connected) return;
    await Promise.allSettled(
      Object.keys(this.peerOrigins).map((pid) =>
        this._rpc(pid, {
          method: "RESET",
          injectScenario: pid === "moveco" && rippleFailureInjected ? "primary_fri_full" : "normal",
        }),
      ),
    );
  }

  /**
   * Return `{ clients, verifier }` matching the exact interface consumed by `SagaCoordinator`.
   */
  buildSagaHarness() {
    const toolMap = {
      moveco: {
        quote: "get_moving_quote",
        hold: "hold_moving_slot",
        commit: "reschedule_van_booking",
        status: "get_booking_status",
      },
      permitflow: {
        quote: "check_bay_eligibility",
        hold: null,
        commit: "prepare_permit_date_update",
        status: "get_dossier_status",
      },
      homeconnect: {
        quote: "list_technician_windows",
        hold: "hold_technician_slot",
        commit: "change_fiber_appointment",
        status: "get_appointment_status",
      },
      powerflow: {
        quote: "check_grid_windows",
        hold: null,
        commit: "shift_grid_activation",
        status: "get_activation_status",
      },
    };

    const clients = {};
    for (const [pid, map] of Object.entries(toolMap)) {
      const callTool = async (tool, args) => {
        const rpcResp = await this._rpc(pid, { method: "CALL_TOOL", tool, arguments: args });
        const result = rpcResp.result;
        if (result?.handoff_token) {
          this.latestHandoffTokens[pid] = result.handoff_token;
        }
        return result;
      };

      clients[pid] = {
        quote: (bookingRef, targetDate) => callTool(map.quote, { booking_ref: bookingRef, target_date: targetDate }),
        ...(map.hold
          ? {
              prepareHold: ({ bookingRef, offerId, proposedDate, idempotencyKey }) =>
                callTool(map.hold, {
                  booking_ref: bookingRef,
                  offer_id: offerId,
                  proposed_date: proposedDate,
                  idempotency_key: idempotencyKey,
                }),
            }
          : {}),
        executeCommit: ({ idempotencyKey, arguments: a }) =>
          callTool(map.commit, {
            booking_ref: a.booking_ref,
            new_date: a.new_date,
            window: a.window,
            offer_id: a.offer_id,
            ...(a.hold_id ? { hold_id: a.hold_id } : {}),
            idempotency_key: idempotencyKey,
          }),
        queryStatus: ({ bookingRef, idempotencyKey }) =>
          callTool(map.status, {
            booking_ref: bookingRef,
            ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          }),
      };
    }

    return { clients, verifier: this.verifier };
  }
}
