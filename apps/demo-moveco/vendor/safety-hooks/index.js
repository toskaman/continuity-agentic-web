/**
 * @module @continuity/safety-hooks
 * Composable Runtime Safety Hooks for the Worldwide Agentic Web (`engine.addCheck(...)`).
 *
 * Directly implements the public safety hook architecture requested in
 * `cognizant-ai-labs/agentic-web` Issue #32 ("Request: official hooks for safety checks
 * on partner networks and actions"):
 *  1. `beforePeerRuns(peer)`: Pre-execution `@continuity/peer-firewall` inspection +
 *     `PeerTofuRegistry` SHA-256 rug-pull pinning before any partner agent executes.
 *  2. `beforePeerRequest(peer, request)` & `beforeMcpCall(target, args)`: Outbound Data
 *     Loss Prevention (DLP) blocking ISO/IEC 7812 Luhn-valid payment cards (PANs),
 *     ISO 13616 Mod-97-10 IBANs, JWTs, PEM private keys, and cloud/LLM API keys from
 *     ever crossing an external partner or MCP boundary (masked in diagnostics).
 *  3. `afterPeerAnswer(peer, result, composition)`: Tracks external-data taint on the
 *     active turn and flags adversarial tool-invocation / beacon directives in peer replies.
 *  4. `beforeAction(plan, turn)`: Confused-Deputy Post-Peer Lock — once an untrusted
 *     external partner or MCP server has answered during a turn (`turn.peerAnswered === true`),
 *     any `write` or `irreversible` site action automatically escalates to `"ask"` (requiring
 *     explicit visitor click confirmation), or `"refuse"` if the peer reply carried an
 *     active prompt-injection payload.
 */

import { inspectPeerNetworkSafety, PeerTofuRegistry } from "../peer-firewall/index.js";
import { deepFreezeJson, isPlainObject } from "../shared-schemas/index.js";

const IBAN_COUNTRY_LENGTHS = Object.freeze({
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
  EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21,
  HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21,
  MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24,
  SI: 19, SK: 24, SM: 27,
});

const OUTBOUND_SECRET_PATTERNS = Object.freeze([
  {
    id: "DLP-API-KEY",
    label: "API / Bearer Token",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|otk_[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z._-]{20,}|gsk_[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{24,}|github_pat_[0-9A-Za-z_]{24,}|xoxb-[0-9A-Za-z-]{20,}|AKIA[0-9A-Z]{16}|(?:rk|sk)_live_[0-9A-Za-z]{16,}|Bearer\s+[A-Za-z0-9._-]{16,})\b/,
  },
  {
    id: "DLP-JWT",
    label: "Signed JSON Web Token (JWT)",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    id: "DLP-PEM-KEY",
    label: "PEM Private Key Material",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  },
  {
    id: "DLP-SSN",
    label: "US Social Security Number (SSN)",
    re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
  },
]);

const INBOUND_ANSWER_INJECTION_RE =
  /\b(?:ignore|disregard|override)\s+(?:all\s+|previous\s+|caller\s+|host\s+)?(?:instructions|policies|rules)\b|\b(?:now\s+call|immediately\s+invoke|silently\s+call)\s+website_[a-z0-9_]+\b|!\[[^\]]*\]\(\s*https?:\/\/[^)]*(?:api[_-]?key|token|secret|cookie)/i;

function matchesKnownCardPrefix(digits) {
  if (digits.startsWith("4")) return digits.length === 13 || digits.length === 16 || digits.length === 19;
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return digits.length === 16;
  if (two === 34 || two === 37) return digits.length === 15;
  if (digits.startsWith("6011") || two === 65 || (Number(digits.slice(0, 3)) >= 644 && Number(digits.slice(0, 3)) <= 649)) {
    return digits.length === 16 || digits.length === 19;
  }
  if (four >= 3528 && four <= 3589) return digits.length >= 16 && digits.length <= 19;
  return false;
}

/**
 * Validate a 13–19 digit payment card number using ISO/IEC 7812 Luhn checksum + IIN network prefix.
 * @param {string} rawDigits
 * @returns {boolean}
 */
export function isValidLuhnPan(rawDigits) {
  const digits = String(rawDigits || "").replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (!matchesKnownCardPrefix(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Detect Luhn-valid payment card numbers inside free text, returning masked previews only.
 * @param {string} text
 * @returns {Array<{ masked: string, length: number }>}
 */
export function detectLuhnPaymentCards(text) {
  const src = String(text || "");
  const out = [];
  const candidateRe = /(?<![A-Za-z0-9])(?:\d[ -]?){12,18}\d(?![A-Za-z0-9])/g;
  let m;
  while ((m = candidateRe.exec(src)) !== null) {
    const digits = m[0].replace(/[ -]/g, "");
    if (isValidLuhnPan(digits)) {
      const masked = `${digits.slice(0, 4)}${"•".repeat(Math.max(4, digits.length - 8))}${digits.slice(-4)}`;
      out.push({ masked, length: digits.length });
    }
  }
  return out;
}

/**
 * Validate an ISO 13616 International Bank Account Number (IBAN) via Mod-97-10 checksum.
 * @param {string} rawIban
 * @returns {boolean}
 */
export function isValidMod97Iban(rawIban) {
  if (typeof rawIban !== "string" || rawIban.length > 64) return false;
  const clean = rawIban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) return false;
  const cc = clean.slice(0, 2);
  const expectedLen = IBAN_COUNTRY_LENGTHS[cc];
  if (expectedLen && clean.length !== expectedLen) return false;
  if (!expectedLen && (clean.length < 15 || clean.length > 34)) return false;

  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let remainder = 0;
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      remainder = (remainder * 10 + (code - 48)) % 97;
    } else {
      const val = code - 55; // 'A' (65) -> 10 .. 'Z' (90) -> 35
      remainder = (remainder * 100 + val) % 97;
    }
  }
  return remainder === 1;
}

/**
 * Detect valid ISO 13616 Mod-97 IBANs inside free text, returning masked previews only.
 * @param {string} text
 * @returns {Array<{ country: string, masked: string }>}
 */
export function detectValidIbans(text) {
  const src = String(text || "");
  const out = [];
  const candidateRe = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi;
  let m;
  while ((m = candidateRe.exec(src)) !== null) {
    const compact = m[0].replace(/\s+/g, "").toUpperCase();
    if (isValidMod97Iban(compact)) {
      const masked = `${compact.slice(0, 4)}${"•".repeat(Math.max(6, compact.length - 7))}${compact.slice(-3)}`;
      out.push({ country: compact.slice(0, 2), masked });
    }
  }
  return out;
}

function collectPayloadStrings(value, acc = [], depth = 0) {
  if (depth > 12 || value == null || acc.length >= 512) return acc;
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPayloadStrings(item, acc, depth + 1);
  } else if (isPlainObject(value) || typeof value === "object") {
    for (const v of Object.values(value)) collectPayloadStrings(v, acc, depth + 1);
  }
  return acc;
}

/**
 * Scan any outbound peer or MCP payload for payment cards, IBANs, JWTs, PEM keys, and API tokens.
 * Never echoes raw secrets in findings.
 * @param {unknown} payload
 */
export function scanOutboundPeerPayload(payload) {
  const joined = collectPayloadStrings(payload).join("\n");
  const findings = [];

  for (const card of detectLuhnPaymentCards(joined)) {
    findings.push({
      ruleId: "DLP-LUHN-CARD",
      severity: "CRITICAL",
      label: "Payment Card Number (ISO/IEC 7812 Luhn Verified)",
      maskedEvidence: card.masked,
    });
  }

  for (const iban of detectValidIbans(joined)) {
    findings.push({
      ruleId: "DLP-IBAN-MOD97",
      severity: "CRITICAL",
      label: `Bank Account IBAN (${iban.country} · ISO 13616 Mod-97 Verified)`,
      maskedEvidence: iban.masked,
    });
  }

  for (const pat of OUTBOUND_SECRET_PATTERNS) {
    const match = joined.match(pat.re);
    if (match) {
      const raw = match[0];
      const masked = raw.length > 10 ? `${raw.slice(0, 5)}••••••${raw.slice(-3)}` : "[REDACTED]";
      findings.push({
        ruleId: pat.id,
        severity: "CRITICAL",
        label: pat.label,
        maskedEvidence: masked,
      });
    }
  }

  return deepFreezeJson({
    safe: findings.length === 0,
    blockedCount: findings.length,
    findings,
  });
}

export function redactSensitiveText(rawText) {
  let out = String(rawText || "");
  out = out.replace(/(?<![A-Za-z0-9])(?:\d[ -]?){12,18}\d(?![A-Za-z0-9])/g, (m) =>
    isValidLuhnPan(m) ? "[REDACTED_CARD]" : m,
  );
  out = out.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi, (m) =>
    isValidMod97Iban(m) ? "[REDACTED_IBAN]" : m,
  );
  for (const pat of OUTBOUND_SECRET_PATTERNS) {
    out = out.replace(new RegExp(pat.re.source, "g"), `[REDACTED_${pat.id}]`);
  }
  return out;
}

/**
 * Scan an inbound peer or MCP response for confused-deputy tool-call directives or beacons.
 * @param {unknown} answer
 */
export function scanInboundPeerAnswer(answer) {
  const text = typeof answer === "string" ? answer : String(answer?.text ?? JSON.stringify(answer ?? ""));
  const match = text.match(INBOUND_ANSWER_INJECTION_RE);
  return deepFreezeJson({
    suspicious: Boolean(match),
    evidence: match ? match[0].slice(0, 96) : null,
  });
}

/**
 * Create a complete Issue #32 runtime safety hook object ready for `engine.addCheck(...)`.
 *
 * @param {object} [options]
 * @param {PeerTofuRegistry} [options.tofuRegistry]
 * @param {(info: { origin: string, purpose: string }) => Promise<boolean>} [options.onReconsentRequired]
 * @param {boolean} [options.escalateWriteAfterPeer=true]
 * @param {boolean} [options.refuseWriteAfterSuspiciousAnswer=true]
 */
export function createOpenAgenticSafetyGuard(options = {}) {
  const tofuRegistry = options.tofuRegistry || new PeerTofuRegistry(null);
  const escalateWriteAfterPeer = options.escalateWriteAfterPeer !== false;
  const refuseWriteAfterSuspiciousAnswer = options.refuseWriteAfterSuspiciousAnswer !== false;
  const auditLog = [];
  let suspiciousAnswerInTurn = false;

  const record = (entry) => {
    if (auditLog.length >= 256) auditLog.shift();
    auditLog.push({ at: new Date().toISOString(), ...entry });
  };

  return {
    tofuRegistry,
    getAuditLog: () => auditLog.map((x) => ({ ...x })),
    resetTurnState: () => {
      suspiciousAnswerInTurn = false;
    },

    async beforePeerRuns(peer) {
      suspiciousAnswerInTurn = false;
      const networkJson = peer?.network?.config;
      if (!networkJson) return;
      const siteBaseUrl = peer.base || peer.url || "https://peer.unknown/";
      const manifestJson = peer.manifest || { networks: [{ name: peer.network.name || "peer" }] };
      const inspection = await inspectPeerNetworkSafety({ siteBaseUrl, manifestJson, networkJson });
      const tofu = tofuRegistry.verifyOrPin(inspection);
      record({
        hook: "beforePeerRuns",
        peer: siteBaseUrl,
        verdict: inspection.verdict,
        tofuStatus: tofu.status,
      });
      if (!inspection.safe) {
        throw new Error(tofu.reason);
      }
      if (tofu.requiresReconsent) {
        if (typeof options.onReconsentRequired !== "function") {
          throw new Error(`Partner artifact digest changed (${tofu.previousBundleSha256.slice(0, 12)}… -> ${tofu.nextBundleSha256.slice(0, 12)}…); re-consent required.`);
        }
        const ok = await options.onReconsentRequired({
          origin: siteBaseUrl,
          purpose: `Partner artifact digest changed since first approval (${tofu.previousBundleSha256.slice(0, 16)}… → ${tofu.nextBundleSha256.slice(0, 16)}…). Re-approve updated network?`,
        });
        if (!ok) {
          throw new Error("Visitor declined re-consent after partner artifact digest change.");
        }
        tofuRegistry.approveUpdatedPin(inspection);
      }
    },

    async beforePeerRequest(peer, request) {
      const dlp = scanOutboundPeerPayload(request);
      record({
        hook: "beforePeerRequest",
        peer: peer?.base || "peer",
        safe: dlp.safe,
        rules: dlp.findings.map((f) => f.ruleId),
      });
      if (!dlp.safe) {
        const summary = dlp.findings.map((f) => `${f.label} (${f.maskedEvidence})`).join(", ");
        throw new Error(`Outbound DLP blocked sensitive data from being sent to partner: ${summary}.`);
      }
    },

    async beforeMcpCall(target, args) {
      if (!target?.thirdParty) return;
      const dlp = scanOutboundPeerPayload(args);
      record({
        hook: "beforeMcpCall",
        peer: target?.url || "mcp",
        safe: dlp.safe,
        rules: dlp.findings.map((f) => f.ruleId),
      });
      if (!dlp.safe) {
        const summary = dlp.findings.map((f) => `${f.label} (${f.maskedEvidence})`).join(", ");
        throw new Error(`Outbound DLP blocked sensitive data from being sent to third-party MCP tool: ${summary}.`);
      }
    },

    async afterPeerAnswer(peer, result, composition) {
      const scan = scanInboundPeerAnswer(result);
      if (scan.suspicious) {
        suspiciousAnswerInTurn = true;
        if (composition) composition.suspiciousPeerAnswer = true;
      }
      record({
        hook: "afterPeerAnswer",
        peer: peer?.base || "peer",
        suspicious: scan.suspicious,
        evidence: scan.evidence,
      });
    },

    async afterMcpAnswer(target, result, composition) {
      if (!target?.thirdParty) return;
      const scan = scanInboundPeerAnswer(result);
      if (scan.suspicious) {
        suspiciousAnswerInTurn = true;
        if (composition) composition.suspiciousPeerAnswer = true;
      }
      record({
        hook: "afterMcpAnswer",
        peer: target?.url || "mcp",
        suspicious: scan.suspicious,
      });
    },

    async beforeAction(plan, turn) {
      const effect = turn?.actionMeta?.effect || plan?.calls?.[0]?.effect || "write";
      if (effect === "read") return "allow";
      if (turn?.peerAnswered) {
        if (refuseWriteAfterSuspiciousAnswer && suspiciousAnswerInTurn) {
          record({ hook: "beforeAction", decision: "refuse", reason: "suspicious_peer_answer_in_turn" });
          return "refuse";
        }
        if (escalateWriteAfterPeer) {
          record({ hook: "beforeAction", decision: "ask", reason: "post_peer_taint_lock" });
          return "ask";
        }
      }
      return "allow";
    },
  };
}
