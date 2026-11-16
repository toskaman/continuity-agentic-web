/**
 * @module @continuity/shared-schemas
 * Strict runtime JSON Schema validator, prototype-pollution guard, and RFC 8785-inspired
 * deterministic canonical JSON serialization for approval hashing and provider contracts.
 * Zero external runtime dependencies; runs identically in Chromium browsers and Node >= 22.
 */

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_PAYLOAD_BYTES = 131_072; // 128 KB bounded payload guard
const MAX_SCHEMA_DEPTH = 12;
const MAX_CANONICAL_DEPTH = 24;
const MAX_SHA256_CACHE_ENTRIES = 512;
const UTF8_ENCODER = new TextEncoder();
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
const SHA256_LRU_CACHE = new Map();

/**
 * Constant-time string equality check (prevents early-exit timing side channels on digests, nonces, and OAuth states).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bytesA = UTF8_ENCODER.encode(a);
  const bytesB = UTF8_ENCODER.encode(b);
  const maxLen = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Constant-time lowercase hexadecimal digest comparison.
 * @param {string} hexA
 * @param {string} hexB
 * @returns {boolean}
 */
export function timingSafeEqualHex(hexA, hexB) {
  if (typeof hexA !== "string" || typeof hexB !== "string") return false;
  return timingSafeEqualString(hexA.toLowerCase(), hexB.toLowerCase());
}

/**
 * Deeply freeze a sanitized JSON-compatible value so authoritative invariants cannot be mutated in-place.
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
export function deepFreezeJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeJson(item);
  } else {
    for (const key of Object.keys(value)) {
      deepFreezeJson(value[key]);
    }
  }
  return Object.freeze(value);
}

/**
 * Check whether a value is a plain JSON object.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-clone plain JSON data while rejecting prototype pollution keys and oversized payloads.
 * @template T
 * @param {T} value
 * @param {number} [maxBytes=MAX_PAYLOAD_BYTES]
 * @returns {T}
 */
export function sanitizeJson(value, maxBytes = MAX_PAYLOAD_BYTES) {
  const raw = JSON.stringify(value);
  if (typeof raw !== "string") {
    throw new Error("Value is not JSON-serializable.");
  }
  if (raw.length > maxBytes) {
    throw new Error(`JSON payload exceeds maximum size (${raw.length} > ${maxBytes} chars).`);
  }
  return JSON.parse(raw, (key, val) => {
    if (FORBIDDEN_KEYS.has(key) || key.includes("\u0000")) {
      throw new Error(`Forbidden object key "${key}" rejected.`);
    }
    return val;
  });
}

/**
 * Deterministically serialize any JSON-compatible value with lexicographically sorted keys
 * and normalized numbers (following RFC 8785 / JCS principles for JSON data).
 * @param {unknown} value
 * @param {number} [depth=0]
 * @returns {string}
 */
export function canonicalizeJson(value, depth = 0) {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new Error(`Canonical JSON depth exceeds maximum (${MAX_CANONICAL_DEPTH}).`);
  }
  if (value === null) return "null";
  const type = typeof value;
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot canonicalize non-finite number.");
    }
    // Normalize -0 to 0
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (type === "string") {
    if (LONE_SURROGATE_RE.test(value)) {
      throw new Error("RFC 8785 JCS rejects unpaired UTF-16 surrogates in canonical strings.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item, depth + 1)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Forbidden key "${key}" in canonical serialization.`);
      }
      if (LONE_SURROGATE_RE.test(key)) {
        throw new Error("RFC 8785 JCS rejects unpaired UTF-16 surrogates in object keys.");
      }
      if (value[key] !== undefined) {
        parts.push(`${JSON.stringify(key)}:${canonicalizeJson(value[key], depth + 1)}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`Unsupported type "${type}" in canonicalizeJson.`);
}

/**
 * Compute SHA-256 hex digest using standard Web Crypto API (browser & Node >= 22) with bounded LRU memoization.
 * Includes a deterministic pure-JS SHA-256 fallback for non-secure HTTP contexts if subtle is absent.
 * @param {string} input
 * @returns {Promise<string>}
 */
export async function sha256Hex(input) {
  const text = String(input);
  if (text.length <= 8192 && SHA256_LRU_CACHE.has(text)) {
    const cached = SHA256_LRU_CACHE.get(text);
    SHA256_LRU_CACHE.delete(text);
    SHA256_LRU_CACHE.set(text, cached);
    return cached;
  }
  let hex;
  if (globalThis.crypto?.subtle) {
    const bytes = UTF8_ENCODER.encode(text);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    let out = "";
    for (let i = 0; i < digest.length; i++) {
      out += BYTE_TO_HEX[digest[i]];
    }
    hex = out;
  } else {
    hex = sha256PureHex(text);
  }
  if (text.length <= 8192) {
    if (SHA256_LRU_CACHE.size >= MAX_SHA256_CACHE_ENTRIES) {
      const oldestKey = SHA256_LRU_CACHE.keys().next().value;
      SHA256_LRU_CACHE.delete(oldestKey);
    }
    SHA256_LRU_CACHE.set(text, hex);
  }
  return hex;
}

/**
 * Pure-JS FIPS 180-4 SHA-256 fallback (used only when Web Crypto subtle is unavailable on plain HTTP).
 * @param {string} asciiOrUtf8
 * @returns {string}
 */
export function sha256PureHex(asciiOrUtf8) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const srcBytes = UTF8_ENCODER.encode(asciiOrUtf8);
  const bitLen = srcBytes.length * 8;
  const padZeroCount = (55 - (srcBytes.length % 64) + 64) % 64;
  const totalLen = srcBytes.length + 1 + padZeroCount + 8;
  const bytes = new Uint8Array(totalLen);
  bytes.set(srcBytes, 0);
  bytes[srcBytes.length] = 0x80;
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  const tail = totalLen - 8;
  bytes[tail] = (hi >>> 24) & 0xff;
  bytes[tail + 1] = (hi >>> 16) & 0xff;
  bytes[tail + 2] = (hi >>> 8) & 0xff;
  bytes[tail + 3] = hi & 0xff;
  bytes[tail + 4] = (lo >>> 24) & 0xff;
  bytes[tail + 5] = (lo >>> 16) & 0xff;
  bytes[tail + 6] = (lo >>> 8) & 0xff;
  bytes[tail + 7] = lo & 0xff;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const W = new Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      W[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
      const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Validate ISO calendar date YYYY-MM-DD strictly (rejects 2026-02-30).
 * @param {string} value
 * @returns {boolean}
 */
export function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * Validate data against a strict JSON Schema subset.
 * Returns `{ valid: true, value }` or `{ valid: false, errors }`.
 * @param {Record<string, any>} schema
 * @param {unknown} data
 * @param {string} [path="$"]
 * @param {number} [depth=0]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgainstSchema(schema, data, path = "$", depth = 0) {
  const errors = [];
  if (depth > MAX_SCHEMA_DEPTH) {
    return { valid: false, errors: [`${path}: schema depth exceeds ${MAX_SCHEMA_DEPTH}`] };
  }
  if (!isPlainObject(schema)) {
    return { valid: false, errors: [`${path}: invalid schema definition`] };
  }

  if (schema.enum) {
    const matched = schema.enum.some((item) => canonicalizeJson(item) === canonicalizeJson(data));
    if (!matched) {
      errors.push(`${path}: must be one of [${schema.enum.map((x) => JSON.stringify(x)).join(", ")}]`);
      return { valid: false, errors };
    }
  }

  const expectedType = schema.type;
  if (expectedType === "object") {
    if (!isPlainObject(data)) {
      return { valid: false, errors: [`${path}: expected object`] };
    }
    const props = schema.properties || {};
    const required = schema.required || [];
    for (const reqKey of required) {
      if (!Object.hasOwn(data, reqKey) || data[reqKey] === undefined) {
        errors.push(`${path}.${reqKey}: required field is missing`);
      }
    }
    for (const [key, val] of Object.entries(data)) {
      if (FORBIDDEN_KEYS.has(key)) {
        errors.push(`${path}.${key}: forbidden key`);
        continue;
      }
      if (!Object.hasOwn(props, key)) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}.${key}: unexpected property not allowed by schema`);
        }
        continue;
      }
      if (val === null && props[key].nullable === true) {
        continue;
      }
      const sub = validateAgainstSchema(props[key], val, `${path}.${key}`, depth + 1);
      errors.push(...sub.errors);
    }
  } else if (expectedType === "array") {
    if (!Array.isArray(data)) {
      return { valid: false, errors: [`${path}: expected array`] };
    }
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${path}: array has fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`${path}: array exceeds maximum ${schema.maxItems} items`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (let idx = 0; idx < data.length; idx++) {
        const key = canonicalizeJson(data[idx]);
        if (seen.has(key)) {
          errors.push(`${path}[${idx}]: duplicate array item violates uniqueItems`);
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      data.forEach((item, idx) => {
        const sub = validateAgainstSchema(schema.items, item, `${path}[${idx}]`, depth + 1);
        errors.push(...sub.errors);
      });
    }
  } else if (expectedType === "string") {
    if (typeof data !== "string") {
      return { valid: false, errors: [`${path}: expected string`] };
    }
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path}: string shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push(`${path}: string exceeds maxLength ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined) {
      const re = schema.pattern instanceof RegExp ? schema.pattern : new RegExp(String(schema.pattern));
      if (!re.test(data)) {
        errors.push(`${path}: string does not match required pattern`);
      }
    }
    if ((schema.format === "date" || schema.format === "iso-date") && !isValidIsoDate(data)) {
      errors.push(`${path}: invalid YYYY-MM-DD date "${data}"`);
    }
    if (schema.format === "uri" || schema.format === "https-or-loopback-url") {
      try {
        const u = new URL(data);
        if (!["http:", "https:"].includes(u.protocol)) {
          errors.push(`${path}: URI must use http or https`);
        } else if (
          schema.format === "https-or-loopback-url"
          && u.protocol !== "https:"
          && !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
        ) {
          errors.push(`${path}: non-loopback URI must use https`);
        }
        if (u.username || u.password) {
          errors.push(`${path}: URI must not embed credentials`);
        }
      } catch {
        errors.push(`${path}: invalid URI "${data}"`);
      }
    }
  } else if (expectedType === "integer" || expectedType === "number") {
    if (typeof data !== "number" || !Number.isFinite(data)) {
      return { valid: false, errors: [`${path}: expected finite ${expectedType}`] };
    }
    if (expectedType === "integer" && !Number.isInteger(data)) {
      errors.push(`${path}: expected integer`);
    }
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${path}: ${data} is below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${path}: ${data} exceeds maximum ${schema.maximum}`);
    }
  } else if (expectedType === "boolean") {
    if (typeof data !== "boolean") {
      return { valid: false, errors: [`${path}: expected boolean`] };
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Assert schema compliance or throw a structured error.
 * @template T
 * @param {Record<string, any>} schema
 * @param {T} data
 * @param {string} [label="Payload"]
 * @returns {T}
 */
export function assertValidSchema(schema, data, label = "Payload") {
  const sanitized = sanitizeJson(data);
  const res = validateAgainstSchema(schema, sanitized);
  if (!res.valid) {
    const err = new Error(`${label} failed validation: ${res.errors.join("; ")}`);
    err.validationErrors = res.errors;
    throw err;
  }
  return sanitized;
}

export const MISSION_CHANGE_PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mission_id", "mission_type", "requested_change", "invariants", "preferences", "permissions"],
  properties: {
    mission_id: { type: "string", minLength: 3, maxLength: 64 },
    mission_type: {
      type: "string",
      enum: ["home_relocation", "event_coordination", "service_bundle", "care_coordination", "custom_imported"],
    },
    requested_change: {
      type: "object",
      additionalProperties: false,
      required: ["field", "previous_value", "new_value", "target_commitment_id"],
      properties: {
        field: { type: "string", enum: ["move_date", "appointment_date", "budget_cap"] },
        previous_value: { type: "string", minLength: 1, maxLength: 64 },
        new_value: { type: "string", minLength: 1, maxLength: 64 },
        target_commitment_id: { type: "string", minLength: 1, maxLength: 64 },
        summary: { type: "string", maxLength: 280 },
      },
    },
    invariants: {
      type: "object",
      additionalProperties: false,
      required: [
        "maximum_budget_eur",
        "preserve_existing_commitments",
        "destination_must_remain_unchanged",
        "unauthorized_cancellation",
        "no_additional_purchases_without_approval",
      ],
      properties: {
        maximum_budget_eur: { type: "number", minimum: 0, maximum: 100000 },
        preserve_existing_commitments: { type: "boolean" },
        destination_must_remain_unchanged: { type: "boolean" },
        unauthorized_cancellation: { type: "boolean", enum: [false] },
        no_additional_purchases_without_approval: { type: "boolean", enum: [true] },
        privacy_data_minimization: { type: "boolean" },
      },
    },
    preferences: {
      type: "object",
      additionalProperties: false,
      required: ["priority_mode", "prefer_existing_providers", "minimize_approvals"],
      properties: {
        priority_mode: { type: "string", enum: ["minimal_change", "lowest_cost", "fastest_resolution"] },
        prefer_existing_providers: { type: "boolean" },
        minimize_approvals: { type: "boolean" },
        preferred_window: { type: "string", enum: ["any", "morning", "afternoon"] },
      },
    },
    permissions: {
      type: "object",
      additionalProperties: false,
      required: [
        "search",
        "request_quotes",
        "prepare_changes",
        "commit_changes",
        "cancel_original_commitments",
      ],
      properties: {
        search: { type: "boolean" },
        request_quotes: { type: "boolean" },
        prepare_changes: { type: "boolean" },
        commit_changes: { type: "boolean" },
        cancel_original_commitments: { type: "boolean" },
      },
    },
  },
};
