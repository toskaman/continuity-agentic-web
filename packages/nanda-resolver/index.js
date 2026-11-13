/**
 * @module @continuity/nanda-resolver
 * Authority-Bound Discovery & Resolution Verifier for the Open Agentic Web.
 *
 * Implements the verification semantics of `draft-raskar-agentic-web-federated-resolution-02`
 * (Project NANDA / MIT Media Lab) and NANDA Index (`nandaindex.org`) A2A Agent Card structural checks:
 *
 * 1. Direct DNS-Anchored Precedence (§4.5 / §7.1): A validated direct HTTPS discovery anchor
 *    (`/.well-known/agent-card.json` + `/agent-manifest.json`) is preferred over registry indirection.
 * 2. Registry Provenance vs. Subject Authority Separation (§5.4 / §10.1): Registry presence alone
 *    never proves subject authorization; authority evidence, expiry, and monotonic sequence numbers
 *    are verified independently.
 * 3. Anti-Rollback Sequence Enforcement (§5.5): Rejects stale or replayed bindings whose `sequence`
 *    is lower than a previously observed valid binding for the same `(subject, issuer)` scope.
 * 4. NANDA Index A2A v1.0 Agent Card Structural Validator: Validates `name`, `description`, `version`,
 *    `supportedInterfaces`, `capabilities`, `defaultInputModes`, `defaultOutputModes`, and `skills`
 *    without credentials in URLs.
 */

import { canonicalizeJson, isPlainObject, sanitizeJson, sha256Hex } from "../shared-schemas/index.js";

const ALLOWED_METHODS = new Set(["artifact", "gateway"]);

/**
 * Validate an A2A v1.0 Agent Card (`/.well-known/agent-card.json`) against NANDA Index's
 * structural discovery checks (`projnanda/nanda-index-v2` README §"Identity, card checks").
 *
 * @param {unknown} card
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateA2aAgentCard(card) {
  const errors = [];
  if (!isPlainObject(card)) {
    return { valid: false, errors: ["Agent Card must be a JSON object."] };
  }

  for (const field of ["name", "description", "version"]) {
    if (typeof card[field] !== "string" || !card[field].trim()) {
      errors.push(`Agent Card requires nonempty string "${field}".`);
    }
  }

  const checkCleanHttpUrl = (rawUrl, label) => {
    try {
      const u = new URL(String(rawUrl));
      if (!["http:", "https:"].includes(u.protocol)) {
        errors.push(`${label} must use http or https.`);
      }
      if (u.username || u.password) {
        errors.push(`${label} must not embed credentials.`);
      }
    } catch {
      errors.push(`${label} must be a valid absolute URL.`);
    }
  };

  if (Array.isArray(card.supportedInterfaces) && card.supportedInterfaces.length > 0) {
    card.supportedInterfaces.forEach((iface, idx) => {
      if (!isPlainObject(iface)) {
        errors.push(`supportedInterfaces[${idx}] must be an object.`);
        return;
      }
      if (typeof iface.protocolBinding !== "string" || !iface.protocolBinding.trim()) {
        errors.push(`supportedInterfaces[${idx}].protocolBinding is required.`);
      }
      if (typeof iface.protocolVersion !== "string" || !iface.protocolVersion.trim()) {
        errors.push(`supportedInterfaces[${idx}].protocolVersion is required.`);
      }
      checkCleanHttpUrl(iface.url, `supportedInterfaces[${idx}].url`);
    });
  } else if (typeof card.url === "string" && card.url.trim()) {
    checkCleanHttpUrl(card.url, "url");
  } else {
    errors.push("Agent Card requires nonempty supportedInterfaces[] or legacy url.");
  }

  if (!isPlainObject(card.capabilities)) {
    errors.push("Agent Card capabilities must be an object.");
  }

  for (const modeKey of ["defaultInputModes", "defaultOutputModes"]) {
    if (
      !Array.isArray(card[modeKey])
      || card[modeKey].length === 0
      || card[modeKey].some((m) => typeof m !== "string" || !m.trim())
    ) {
      errors.push(`${modeKey} must be a nonempty array of nonempty strings.`);
    }
  }

  if (!Array.isArray(card.skills)) {
    errors.push("skills must be an array.");
  } else {
    card.skills.forEach((skill, idx) => {
      if (!isPlainObject(skill)) {
        errors.push(`skills[${idx}] must be an object.`);
        return;
      }
      for (const req of ["id", "name", "description"]) {
        if (typeof skill[req] !== "string" || !skill[req].trim()) {
          errors.push(`skills[${idx}].${req} must be a nonempty string.`);
        }
      }
      if (!Array.isArray(skill.tags) || skill.tags.some((t) => typeof t !== "string" || !t.trim())) {
        errors.push(`skills[${idx}].tags must be an array of nonempty strings.`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Stateful Authority-Bound Resolver implementing anti-rollback sequence tracking
 * and target-digest verification (`draft-raskar-agentic-web-federated-resolution-02` §5 & §7).
 */
export class AuthorityBoundResolver {
  constructor() {
    /** @type {Map<string, number>} `(subject::issuer) -> highestValidSequence` */
    this.observedSequences = new Map();
    /** @type {Set<string>} Explicitly revoked `(subject::sequence)` entries */
    this.revokedBindings = new Set();
  }

  markRevoked(subject, sequence) {
    this.revokedBindings.add(`${subject}::${sequence}`);
  }

  /**
   * Evaluate a Resolution Target Object per `draft-raskar-agentic-web-federated-resolution-02` §5.2–5.6.
   *
   * @param {Record<string, any>} target
   * @param {object} [options]
   * @param {string} [options.expectedSubject]
   * @param {string} [options.nowIso]
   * @param {Record<string, any>} [options.fetchedArtifact] - Optional terminal artifact to verify `targetDigest`
   */
  async verifyResolutionTarget(target, options = {}) {
    const nowMs = Date.parse(options.nowIso || new Date().toISOString());
    const clean = sanitizeJson(target);

    if (!clean || typeof clean.subject !== "string" || !clean.subject.trim()) {
      return { ok: false, code: "malformed-response", reason: "Missing subject identity." };
    }
    if (options.expectedSubject && clean.subject !== options.expectedSubject) {
      return {
        ok: false,
        code: "policy-rejected",
        reason: `Target subject "${clean.subject}" does not match requested "${options.expectedSubject}".`,
      };
    }
    if (!ALLOWED_METHODS.has(clean.method)) {
      return { ok: false, code: "unsupported-target", reason: `Unsupported target method "${clean.method}".` };
    }
    if (clean.targetType === "application/resolution-registry+json") {
      return {
        ok: false,
        code: "policy-rejected",
        reason: "Recursive registry-to-registry forwarding is prohibited (§6.6).",
      };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(clean.targetUrl);
    } catch {
      return { ok: false, code: "malformed-response", reason: "Invalid targetUrl." };
    }
    const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && isLoopback)) {
      return { ok: false, code: "policy-rejected", reason: "Public targetUrl requires HTTPS." };
    }

    if (!Number.isInteger(clean.sequence) || clean.sequence < 0) {
      return { ok: false, code: "malformed-response", reason: "sequence must be a non-negative integer." };
    }

    const issuedMs = Date.parse(clean.issuedAt);
    const expiresMs = Date.parse(clean.expiresAt);
    if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || expiresMs <= issuedMs) {
      return { ok: false, code: "malformed-response", reason: "Invalid issuedAt/expiresAt bounds." };
    }
    if (nowMs >= expiresMs) {
      return { ok: false, code: "stale", reason: `Binding expired at ${clean.expiresAt}.` };
    }

    if (this.revokedBindings.has(`${clean.subject}::${clean.sequence}`)) {
      return { ok: false, code: "revoked", reason: `Binding sequence ${clean.sequence} has been revoked.` };
    }

    const auth = clean.authority;
    if (!isPlainObject(auth) || typeof auth.type !== "string" || typeof auth.issuer !== "string") {
      return {
        ok: false,
        code: "unverifiable",
        reason: "Missing subject-specific Authority Evidence (registry provenance alone is insufficient).",
      };
    }

    // Enforce email vs DNS zone rule (§4.5 & §7.2): DNS zone control does NOT authorize individual email accounts
    if (clean.subjectType === "email" && auth.type === "dns-zone-only") {
      return {
        ok: false,
        code: "unverifiable",
        reason: "DNS zone control alone cannot authorize a provider-managed individual email identity (§7.2).",
      };
    }

    const scopeKey = `${clean.subject}::${auth.issuer}`;
    const prevSeq = this.observedSequences.get(scopeKey);
    if (prevSeq !== undefined && clean.sequence < prevSeq) {
      return {
        ok: false,
        code: "stale",
        reason: `Anti-rollback triggered: sequence ${clean.sequence} < previously observed ${prevSeq}.`,
      };
    }

    if (clean.targetDigest && options.fetchedArtifact !== undefined) {
      const computed = `sha256:${await sha256Hex(canonicalizeJson(options.fetchedArtifact))}`;
      if (computed !== clean.targetDigest) {
        return {
          ok: false,
          code: "unverifiable",
          reason: `Target digest mismatch: expected ${clean.targetDigest}, computed ${computed}.`,
        };
      }
    }

    this.observedSequences.set(scopeKey, clean.sequence);
    return {
      ok: true,
      code: "verified",
      subject: clean.subject,
      targetUrl: clean.targetUrl,
      sequence: clean.sequence,
      authorityType: auth.type,
    };
  }
}
