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
const URL_SHAPED_KEY_RE = /(?:^|[_-])(?:url|uri|href|link|src)s?$/i;
const ACTIVE_DATA_URI_RE = /^data:\s*(?:text\/html|image\/svg\+xml|application\/(?:xhtml\+)?xml)/i;

/**
 * Validate ARD / NANDA `urn:air:<publisher-FQDN>:<namespace...>:<short-name>` syntax
 * (`projnanda/nanda-index-v2` §identifier URN formats + RFC 8141), explicitly rejecting
 * retired `urn:ai:*` forms.
 *
 * @param {string} urn
 * @returns {{ valid: boolean, reason?: string, domain?: string, namespace?: string, shortName?: string }}
 */
export function validateAirUrn(urn) {
  const raw = String(urn || "").trim();
  if (/^urn:ai:/i.test(raw)) {
    return { valid: false, reason: 'Retired "urn:ai:*" namespace is rejected; use "urn:air:<domain>:<ns>:<name>".' };
  }
  const parts = raw.split(":");
  if (parts.length < 5 || parts[0] !== "urn" || parts[1] !== "air") {
    return { valid: false, reason: 'Expected "urn:air:<publisher-FQDN>:<namespace...>:<short-name>".' };
  }
  const domain = parts[2];
  const shortName = parts[parts.length - 1];
  const namespace = parts.slice(3, -1).join(":");
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain) || domain.startsWith(".") || domain.endsWith(".")) {
    return { valid: false, reason: `Invalid publisher FQDN "${domain}" in AIR URN.` };
  }
  if (!namespace || !/^[a-z0-9:._-]+$/i.test(namespace)) {
    return { valid: false, reason: `Invalid namespace "${namespace}" in AIR URN.` };
  }
  if (!shortName || !/^[a-z0-9._@-]+$/i.test(shortName)) {
    return { valid: false, reason: `Invalid short-name "${shortName}" in AIR URN.` };
  }
  return { valid: true, domain: domain.toLowerCase(), namespace, shortName };
}

/**
 * Enforce `projnanda/nanda-index-v2` extension metadata safety rules:
 * - Max 16 KB serialized JSON, max 6 nesting levels.
 * - Reject active-content schemes (`javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, `data:application/xml`)
 *   at any depth, with strict blocking under URL-shaped keys (`url`, `uri`, `href`, `link`, `src`) and prose-only
 *   exemption elsewhere.
 *
 * @param {unknown} extensions
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNandaExtensionSafety(extensions) {
  if (extensions === undefined) return { valid: true, errors: [] };
  if (!isPlainObject(extensions)) {
    return { valid: false, errors: ["extensions must be a plain JSON object keyed by reverse-DNS namespace."] };
  }
  const serialized = JSON.stringify(extensions);
  if (new TextEncoder().encode(serialized).byteLength > 16_384) {
    return { valid: false, errors: ["extensions exceeds 16 KB limit."] };
  }

  const errors = [];
  const stripControls = (s) => String(s).replace(/[\u0000-\u001f\u007f]+/g, "").trim();

  const checkStringValue = (val, strictUrlContext, pathLabel) => {
    const clean = stripControls(val);
    if (ACTIVE_DATA_URI_RE.test(clean)) {
      errors.push(`${pathLabel}: active HTML/SVG/XML data: URI is prohibited.`);
      return;
    }
    const schemeMatch = clean.match(/^(javascript|vbscript)\s*:(.*)$/i);
    if (!schemeMatch) return;
    if (strictUrlContext) {
      errors.push(`${pathLabel}: ${schemeMatch[1]}: scheme is prohibited under URL-shaped field.`);
      return;
    }
    const rest = schemeMatch[2];
    if (!/^\s+[A-Za-z0-9 ,.&+-]+$/.test(rest)) {
      errors.push(`${pathLabel}: executable ${schemeMatch[1]}: payload is prohibited.`);
    }
  };

  const walk = (node, depth, strictUrlContext, pathLabel) => {
    if (depth > 6) {
      errors.push(`${pathLabel}: exceeds maximum nesting depth of 6.`);
      return;
    }
    if (typeof node === "string") {
      checkStringValue(node, strictUrlContext, pathLabel);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, depth + 1, strictUrlContext, `${pathLabel}[${idx}]`));
      return;
    }
    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        checkStringValue(k, true, `${pathLabel}.{key:${k}}`);
        const nextStrict = strictUrlContext || URL_SHAPED_KEY_RE.test(k);
        walk(v, depth + 1, nextStrict, `${pathLabel}.${k}`);
      }
    }
  };

  walk(extensions, 0, false, "extensions");
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Project NANDA AI Catalog (`/.well-known/ai-catalog.json`, media type `application/ai-catalog+json`).
 *
 * @param {unknown} catalog
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNandaAiCatalog(catalog) {
  const errors = [];
  if (!isPlainObject(catalog)) {
    return { valid: false, errors: ["AI Catalog must be a JSON object."] };
  }
  if (catalog.mediaType !== "application/ai-catalog+json") {
    errors.push('AI Catalog requires mediaType "application/ai-catalog+json".');
  }
  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    errors.push("AI Catalog requires a nonempty entries[] array.");
    return { valid: false, errors };
  }

  catalog.entries.forEach((entry, idx) => {
    if (!isPlainObject(entry)) {
      errors.push(`entries[${idx}] must be an object.`);
      return;
    }
    const urnCheck = validateAirUrn(entry.identifier);
    if (!urnCheck.valid) {
      errors.push(`entries[${idx}].identifier invalid: ${urnCheck.reason}`);
    }
    if (typeof entry.displayName !== "string" || !entry.displayName.trim()) {
      errors.push(`entries[${idx}].displayName is required.`);
    }
    if (typeof entry.type !== "string" || !entry.type.trim()) {
      errors.push(`entries[${idx}].type media type is required.`);
    }
    const hasUrl = typeof entry.url === "string" && entry.url.trim().length > 0;
    const hasData = isPlainObject(entry.data);
    if (hasUrl === hasData) {
      errors.push(`entries[${idx}] must provide exactly one of "url" XOR inline "data".`);
    }
    if (!isPlainObject(entry.publisher) || typeof entry.publisher.identifier !== "string") {
      errors.push(`entries[${idx}].publisher.identifier is required.`);
    }
    const extCheck = validateNandaExtensionSafety(entry.extensions);
    if (!extCheck.valid) {
      errors.push(...extCheck.errors.map((e) => `entries[${idx}].${e}`));
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Handle an experimental `POST /resolve` request per `draft-raskar-agentic-web-federated-resolution-02` §6.
 * Enforces:
 * - Prohibition of semantic search / recursive forwarding fields (`intent`, `capabilityQuery`, `nextRegistry`) -> 422 Problem JSON.
 * - Valid `identity`, `identityType`, and bounded `maxResults` (1..100).
 * - Anti-enumeration HTTP 200 with `targets: []` when no public binding matches.
 *
 * @param {unknown} reqBody
 * @param {object} config
 * @param {string} config.registryId
 * @param {Array<Record<string, any>>} config.bindings
 * @param {string} [config.nowIso]
 */
export function handleFederatedResolutionRequest(reqBody, { registryId, bindings = [], nowIso }) {
  const now = nowIso || new Date().toISOString();
  const problem = (status, code, title, detail) => ({
    httpStatus: status,
    contentType: "application/problem+json; charset=utf-8",
    body: {
      type: `${String(registryId).replace(/\/$/, "")}/problems/${code}`,
      title,
      status,
      code,
      ...(detail ? { detail } : {}),
    },
  });

  if (!isPlainObject(reqBody)) {
    return problem(400, "malformed-request", "Resolution request must be a JSON object");
  }

  for (const forbidden of ["intent", "capabilityQuery", "nextRegistry"]) {
    if (Object.hasOwn(reqBody, forbidden)) {
      return problem(
        422,
        "policy-rejected",
        `Field "${forbidden}" is prohibited in known-subject-resolution-02 (§6.2)`,
      );
    }
  }

  const identity = typeof reqBody.identity === "string" ? reqBody.identity.trim() : "";
  const identityType = typeof reqBody.identityType === "string" ? reqBody.identityType.trim() : "";
  if (!identity || !identityType) {
    return problem(422, "malformed-request", "Both identity and identityType are required (§6.2)");
  }

  const maxResults = reqBody.maxResults === undefined ? 3 : Number(reqBody.maxResults);
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
    return problem(422, "malformed-request", "maxResults must be an integer between 1 and 100 (§6.2)");
  }

  const acceptedMethods = Array.isArray(reqBody.acceptedMethods)
    ? new Set(reqBody.acceptedMethods)
    : ALLOWED_METHODS;

  const nowMs = Date.parse(now);
  const matched = bindings
    .filter(
      (b) =>
        b.subject === identity
        && b.subjectType === identityType
        && acceptedMethods.has(b.method)
        && Date.parse(b.expiresAt) > nowMs,
    )
    .slice(0, maxResults);

  return {
    httpStatus: 200,
    contentType: "application/json; charset=utf-8",
    body: {
      registry: {
        id: registryId,
        profile: "known-subject-resolution-02",
        issuedAt: now,
      },
      subject: identity,
      subjectType: identityType,
      targets: matched,
    },
  };
}

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

  if (card.extensions !== undefined) {
    const extSafety = validateNandaExtensionSafety(card.extensions);
    if (!extSafety.valid) {
      errors.push(...extSafety.errors);
    }
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

/**
 * Live Open Agentic Web MVP Profile 0.2 + Project NANDA A2A v1.0 Conformance Auditor.
 * Can be called from any browser or Node.js tool to inspect a candidate Open Agentic Website URL
 * and return a deterministic 7-point compliance & cryptographic digest report.
 *
 * @param {string} siteBaseUrl - Base URL of the Open Agentic Website (e.g. `https://toskaman.github.io/continuity-agentic-web/`)
 * @param {typeof fetch} [fetchImpl=globalThis.fetch]
 */
export async function auditOpenAgenticSite(siteBaseUrl, fetchImpl = globalThis.fetch) {
  const base = String(siteBaseUrl || "").trim().replace(/\/+$/, "") + "/";
  /** @type {Array<{ id: string, check: string, status: "PASS" | "WARN" | "FAIL", detail: string }>} */
  const checks = [];
  let manifest = null;
  let networkJson = null;
  let agentCard = null;
  let manifestDigest = null;
  let networkDigest = null;

  try {
    const parsedBase = new URL(base);
    const isHttpsOrLoopback =
      parsedBase.protocol === "https:"
      || (parsedBase.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsedBase.hostname));
    checks.push({
      id: "MVP-HTTPS",
      check: "Transport Security (HTTPS or Loopback)",
      status: isHttpsOrLoopback ? "PASS" : "FAIL",
      detail: isHttpsOrLoopback ? `Valid origin ${parsedBase.origin}` : `Insecure non-loopback HTTP ${base}`,
    });
  } catch {
    return {
      ok: false,
      siteBaseUrl: base,
      score: "0 / 7",
      checks: [{ id: "MVP-URL", check: "Valid Site URL", status: "FAIL", detail: `Invalid URL "${siteBaseUrl}"` }],
    };
  }

  // 1. Fetch & validate agent-manifest.json
  try {
    const mUrl = new URL("agent-manifest.json", base).href;
    const res = await fetchImpl(mUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = sanitizeJson(await res.json());
    manifestDigest = `sha256:${(await sha256Hex(canonicalizeJson(manifest))).slice(0, 16)}`;
    const firstNet = Array.isArray(manifest.networks) ? manifest.networks[0] : null;
    const validManifest = Boolean(firstNet?.name && firstNet?.front_man && firstNet?.hocon);
    checks.push({
      id: "MVP-MANIFEST",
      check: "Public agent-manifest.json & Front Agent",
      status: validManifest ? "PASS" : "FAIL",
      detail: validManifest
        ? `Network "${firstNet.name}" -> front_man "${firstNet.front_man}" (${manifestDigest})`
        : "Missing networks[0].name, front_man, or hocon path.",
    });

    // 2. Fetch & validate resolved .network.json
    if (validManifest) {
      const nUrl = new URL(firstNet.hocon, base).href;
      const nRes = await fetchImpl(nUrl, { headers: { Accept: "application/json" } });
      if (!nRes.ok) throw new Error(`Network fetch HTTP ${nRes.status}`);
      const rawNetText = await nRes.text();
      networkJson = sanitizeJson(JSON.parse(rawNetText));
      networkDigest = `sha256:${(await sha256Hex(canonicalizeJson(networkJson))).slice(0, 16)}`;

      const toolsArr = Array.isArray(networkJson.tools) ? networkJson.tools : [];
      const hasFrontMan = toolsArr.some((t) => t?.name === firstNet.front_man);
      const hasUnresolvedInclude = /\binclude\s+["']/.test(rawNetText);
      const hasLeakedKey = /\bsk-[a-zA-Z0-9]{16,}|\bBearer\s+[a-zA-Z0-9._-]{16,}/.test(rawNetText);

      checks.push({
        id: "MVP-NETWORK",
        check: "Resolved Portable Neuro SAN .network.json",
        status: hasFrontMan && !hasUnresolvedInclude && !hasLeakedKey ? "PASS" : "FAIL",
        detail:
          hasFrontMan && !hasUnresolvedInclude && !hasLeakedKey
            ? `${toolsArr.length} agent(s) resolved, 0 unresolved includes, 0 embedded credentials (${networkDigest})`
            : "Front agent missing, unresolved HOCON include, or credential pattern detected.",
      });
    } else {
      checks.push({
        id: "MVP-NETWORK",
        check: "Resolved Portable Neuro SAN .network.json",
        status: "FAIL",
        detail: "Skipped because agent-manifest.json lacks network hocon path.",
      });
    }

    // 3. Pluggable Inference / BYOK Router Metadata
    const routerUrl = manifest.llm_router?.base_url || manifest.llm_router?.byok_router || "";
    checks.push({
      id: "MVP-INFERENCE",
      check: "Pluggable Inference & BYOK Router Policy",
      status: routerUrl ? "PASS" : "WARN",
      detail: routerUrl ? `Router configured (${routerUrl})` : "No explicit llm_router declared in manifest.",
    });

    // 4. Peer Policy & Trust Boundary
    const peerMode = manifest.peer_policy?.mode;
    const allowedPeers = Array.isArray(manifest.allowed_peers) ? manifest.allowed_peers.length : 0;
    checks.push({
      id: "MVP-TRUST",
      check: "Explicit Peer Policy & Origin Allowlist",
      status: peerMode === "closed" || peerMode === "open" ? "PASS" : "WARN",
      detail: peerMode
        ? `peer_policy.mode="${peerMode}" (${allowedPeers} allowed peer origin(s))`
        : "peer_policy metadata omitted.",
    });
  } catch (err) {
    checks.push({
      id: "MVP-MANIFEST",
      check: "Public agent-manifest.json & CORS Access",
      status: "FAIL",
      detail: `Failed to fetch/parse manifest: ${err.message}`,
    });
  }

  // 5. Action Bridge Check
  try {
    const bridgeRel = manifest?.actions?.bridge || "./bridge/action-bridge.html";
    const bRes = await fetchImpl(new URL(bridgeRel, base).href);
    checks.push({
      id: "MVP-BRIDGE",
      check: "Isolated Cross-Site Action Bridge Frame",
      status: bRes.ok ? "PASS" : "WARN",
      detail: bRes.ok ? `Reachable (${bridgeRel})` : `HTTP ${bRes.status} on ${bridgeRel}`,
    });
  } catch (err) {
    checks.push({
      id: "MVP-BRIDGE",
      check: "Isolated Cross-Site Action Bridge Frame",
      status: "WARN",
      detail: `Unavailable: ${err.message}`,
    });
  }

  // 6. Project NANDA / A2A v1.0 Agent Card (`/agent-card.json` subpath-safe mirror or `/.well-known/agent-card.json`)
  try {
    let cardRes = await fetchImpl(new URL("agent-card.json", base).href, {
      headers: { Accept: "application/json" },
    });
    if (!cardRes.ok) {
      cardRes = await fetchImpl(new URL(".well-known/agent-card.json", base).href, {
        headers: { Accept: "application/json" },
      });
    }
    if (cardRes.ok) {
      agentCard = sanitizeJson(await cardRes.json());
      const cardValidation = validateA2aAgentCard(agentCard);
      checks.push({
        id: "NANDA-A2A",
        check: "Project NANDA / A2A v1.0 Agent Card",
        status: cardValidation.valid ? "PASS" : "FAIL",
        detail: cardValidation.valid
          ? `Valid A2A v${agentCard.version} card · ${agentCard.skills?.length || 0} skill(s) declared`
          : `Invalid Agent Card: ${cardValidation.errors.join("; ")}`,
      });
    } else {
      checks.push({
        id: "NANDA-A2A",
        check: "Project NANDA / A2A v1.0 Agent Card",
        status: "WARN",
        detail: `Optional /.well-known/agent-card.json returned HTTP ${cardRes.status}`,
      });
    }
  } catch (err) {
    checks.push({
      id: "NANDA-A2A",
      check: "Project NANDA / A2A v1.0 Agent Card",
      status: "WARN",
      detail: `Optional card not fetched: ${err.message}`,
    });
  }

  // 7. Project NANDA AI Catalog (`ai-catalog.json` / `.well-known/ai-catalog.json`)
  try {
    let catRes = await fetchImpl(new URL("ai-catalog.json", base).href, {
      headers: { Accept: "application/json" },
    });
    if (!catRes.ok) {
      catRes = await fetchImpl(new URL(".well-known/ai-catalog.json", base).href, {
        headers: { Accept: "application/json" },
      });
    }
    if (catRes.ok) {
      const catJson = sanitizeJson(await catRes.json());
      const catCheck = validateNandaAiCatalog(catJson);
      checks.push({
        id: "NANDA-CATALOG",
        check: "Project NANDA AI Catalog & urn:air Binding",
        status: catCheck.valid ? "PASS" : "FAIL",
        detail: catCheck.valid
          ? `Valid AI Catalog · ${catJson.entries.length} AIR resource(s) (${catJson.entries[0]?.identifier})`
          : `Invalid AI Catalog: ${catCheck.errors.join("; ")}`,
      });
    } else {
      checks.push({
        id: "NANDA-CATALOG",
        check: "Project NANDA AI Catalog & urn:air Binding",
        status: "WARN",
        detail: `Optional /.well-known/ai-catalog.json returned HTTP ${catRes.status}`,
      });
    }
  } catch (err) {
    checks.push({
      id: "NANDA-CATALOG",
      check: "Project NANDA AI Catalog & urn:air Binding",
      status: "WARN",
      detail: `Optional AI Catalog not fetched: ${err.message}`,
    });
  }

  // 8. Public Single-Turn Facts Network (`facts/agent-manifest.json` + `facts/<network>_facts.network.json`)
  try {
    const fManRes = await fetchImpl(new URL("facts/agent-manifest.json", base).href, {
      headers: { Accept: "application/json" },
    });
    if (fManRes.ok) {
      const fManifest = sanitizeJson(await fManRes.json());
      const fNetEntry = fManifest?.networks?.[0];
      const fNetRes = fNetEntry?.hocon
        ? await fetchImpl(new URL(fNetEntry.hocon, new URL("facts/", base).href).href, {
            headers: { Accept: "application/json" },
          })
        : null;
      if (fNetRes?.ok) {
        const fNet = sanitizeJson(await fNetRes.json());
        const fAgent = fNet?.tools?.[0];
        const isToolFreeSingleTurn =
          Boolean(fAgent?.name) && Array.isArray(fAgent.tools) && fAgent.tools.length === 0;
        checks.push({
          id: "MVP-FACTS",
          check: "Single-Turn Public Facts Network (facts/)",
          status: isToolFreeSingleTurn ? "PASS" : "FAIL",
          detail: isToolFreeSingleTurn
            ? `Published "${fNetEntry.name}" (as of ${fNet?.metadata?.as_of || "current"}, 0 tools, 1-call peer ready)`
            : "Facts network must expose 1 front agent with tools: [].",
        });
      } else {
        checks.push({
          id: "MVP-FACTS",
          check: "Single-Turn Public Facts Network (facts/)",
          status: "FAIL",
          detail: "facts/agent-manifest.json present but facts network JSON unreachable.",
        });
      }
    } else {
      checks.push({
        id: "MVP-FACTS",
        check: "Single-Turn Public Facts Network (facts/)",
        status: "WARN",
        detail: `Optional facts/agent-manifest.json not published (HTTP ${fManRes.status})`,
      });
    }
  } catch (err) {
    checks.push({
      id: "MVP-FACTS",
      check: "Single-Turn Public Facts Network (facts/)",
      status: "WARN",
      detail: `Optional facts network not fetched: ${err.message}`,
    });
  }

  const passedCount = checks.filter((c) => c.status === "PASS").length;
  const failedCount = checks.filter((c) => c.status === "FAIL").length;

  return {
    ok: failedCount === 0,
    siteBaseUrl: base,
    networkName: manifest?.networks?.[0]?.name || null,
    manifestDigest,
    networkDigest,
    passedCount,
    totalChecks: checks.length,
    score: `${passedCount} / ${checks.length}`,
    checks,
  };
}
