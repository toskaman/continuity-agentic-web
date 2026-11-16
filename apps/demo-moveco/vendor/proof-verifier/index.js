/**
 * @module @continuity/proof-verifier
 * Provider Receipt Cryptographic Verification & Explicit Trust-Level Classification.
 *
 * Security Rules Enforced (Part X §11.4):
 * 1. Client-generated hashes prove local data consistency ONLY (`CLIENT_CONSISTENCY_HASH`), never provider authenticity.
 * 2. Unsigned API responses are explicitly classified as `UNSIGNED_PROVIDER_RESPONSE`.
 * 3. A public key embedded ONLY inside the untrusted response does NOT establish trust (`UNTRUSTED_SELF_ASSERTED_KEY`).
 * 4. Only Ed25519 signatures verified against independently pre-registered public keys in the
 *    application's trusted registry earn `VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE`.
 */

import { canonicalizeJson, sanitizeJson, sha256Hex, timingSafeEqualHex } from "../shared-schemas/index.js";

const UTF8_ENCODER = new TextEncoder();
const MONETARY_RECEIPT_KEYS = ["total_price_eur", "total_charged_eur", "base_price_eur", "change_fee_eur"];

export const PROOF_TRUST_LEVELS = Object.freeze({
  VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE: {
    level: "VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE",
    trusted: true,
    summary: "Verified Ed25519 signature against independently pre-registered demonstration provider public key.",
  },
  UNSIGNED_PROVIDER_RESPONSE: {
    level: "UNSIGNED_PROVIDER_RESPONSE",
    trusted: false,
    summary: "Unsigned HTTP/tool JSON response — unauthenticated transport payload.",
  },
  UNTRUSTED_SELF_ASSERTED_KEY: {
    level: "UNTRUSTED_SELF_ASSERTED_KEY",
    trusted: false,
    summary: "Signature carries an unpinned key not found in the coordinator's trusted registry — rejected as proof.",
  },
  INVALID_SIGNATURE_OR_TAMPERED: {
    level: "INVALID_SIGNATURE_OR_TAMPERED",
    trusted: false,
    summary: "Cryptographic signature check failed or payload hash mismatch — possible tampering/forgery.",
  },
  CLIENT_CONSISTENCY_HASH: {
    level: "CLIENT_CONSISTENCY_HASH",
    trusted: false,
    summary: "Client-computed SHA-256 digest — proves local payload integrity only, not provider attestation.",
  },
});

function bytesToBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64u) {
  const padded = String(b64u).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64u.length / 4) * 4, "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Generate an Ed25519 JWK keypair using standard Web Crypto (`SubtleCrypto`).
 * Used by demonstration provider services at startup or fixture setup; only the PUBLIC JWK
 * is registered with the CONTINUITY coordinator.
 */
export async function generateDemoProviderKeyPair(providerId) {
  const kp = await globalThis.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicJwk = await globalThis.crypto.subtle.exportKey("jwk", kp.publicKey);
  const privateJwk = await globalThis.crypto.subtle.exportKey("jwk", kp.privateKey);
  return {
    keyId: `demo-key-${providerId}-v1`,
    providerId,
    publicJwk,
    privateJwk,
  };
}

/**
 * Sign a canonical provider receipt payload using the provider's private Ed25519 JWK.
 * @param {Record<string, any>} receiptBody
 * @param {{ keyId: string, privateJwk: JsonWebKey }} signerKey
 */
export async function signProviderReceipt(receiptBody, signerKey) {
  const cleanBody = sanitizeJson(receiptBody);
  const canonical = canonicalizeJson(cleanBody);
  const bodySha256 = await sha256Hex(canonical);
  const privKey = await globalThis.crypto.subtle.importKey(
    "jwk",
    signerKey.privateJwk,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const sigBuffer = await globalThis.crypto.subtle.sign(
    { name: "Ed25519" },
    privKey,
    UTF8_ENCODER.encode(canonical),
  );
  return {
    receipt_body: cleanBody,
    proof: {
      algorithm: "Ed25519",
      key_id: signerKey.keyId,
      payload_sha256: bodySha256,
      signed_at: new Date().toISOString(),
      signature_b64u: bytesToBase64Url(new Uint8Array(sigBuffer)),
    },
  };
}

/**
 * Verify a provider receipt against an independently configured map of trusted public JWKs.
 * Supports multi-key rotation rings, explicit key revocation, and CryptoKey import memoization.
 * Never trusts a public key supplied inside `envelope` itself.
 */
export class ReceiptVerifier {
  /**
   * @param {Record<string, { keyId: string, publicJwk: JsonWebKey }>} [trustedProviderKeys]
   */
  constructor(trustedProviderKeys = {}) {
    /** @type {Map<string, { keyId: string, publicJwk: JsonWebKey }>} */
    this.trustedByProvider = new Map();
    /** @type {Map<string, Map<string, JsonWebKey>>} */
    this.keyRingsByProvider = new Map();
    /** @type {Set<string>} */
    this.revokedKeyIds = new Set();
    /** @type {Map<string, CryptoKey>} */
    this._importedKeyCache = new Map();

    for (const [pid, desc] of Object.entries(trustedProviderKeys || {})) {
      if (desc?.keyId && desc?.publicJwk) {
        this.registerTrustedProviderKey(pid, desc.keyId, desc.publicJwk);
      }
    }
  }

  registerTrustedProviderKey(providerId, keyId, publicJwk) {
    const cleanJwk = sanitizeJson(publicJwk);
    if (!cleanJwk || cleanJwk.kty !== "OKP" || cleanJwk.crv !== "Ed25519" || typeof cleanJwk.x !== "string") {
      throw new Error(`Invalid Ed25519 public JWK for provider "${providerId}".`);
    }
    this.trustedByProvider.set(providerId, { keyId, publicJwk: cleanJwk });
    let ring = this.keyRingsByProvider.get(providerId);
    if (!ring) {
      ring = new Map();
      this.keyRingsByProvider.set(providerId, ring);
    }
    ring.set(keyId, cleanJwk);
    this._importedKeyCache.delete(`${providerId}::${keyId}`);
  }

  revokeProviderKey(providerId, keyId) {
    this.revokedKeyIds.add(`${providerId}::${keyId}`);
    this._importedKeyCache.delete(`${providerId}::${keyId}`);
  }

  /**
   * Verify a receipt envelope and return explicit trust classification.
   * @param {string} expectedProviderId
   * @param {Record<string, any>} envelope
   */
  async verifyReceipt(expectedProviderId, envelope) {
    if (!envelope || typeof envelope !== "object") {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        detail: "Missing or non-object receipt envelope.",
      });
    }

    const body = envelope.receipt_body;
    const proof = envelope.proof;

    if (!body || typeof body !== "object") {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        detail: "Receipt envelope contains no structured receipt_body.",
      });
    }

    for (const mKey of MONETARY_RECEIPT_KEYS) {
      if (body[mKey] !== undefined && (typeof body[mKey] !== "number" || !Number.isFinite(body[mKey]) || body[mKey] < 0)) {
        return Object.freeze({
          valid: false,
          ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
          detail: `Invalid monetary field "${mKey}" in receipt_body.`,
        });
      }
    }

    const canonical = canonicalizeJson(body);
    const computedHash = await sha256Hex(canonical);

    // Unsigned response path: honest classification, never masquerades as cryptographic attestation
    if (!proof || !proof.signature_b64u) {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.UNSIGNED_PROVIDER_RESPONSE,
        payload_sha256: computedHash,
        detail: "Provider returned an unsigned response body.",
      });
    }

    if (proof.algorithm && proof.algorithm !== "Ed25519") {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: `Unsupported signature algorithm "${proof.algorithm}" (expected Ed25519).`,
      });
    }

    const cacheId = `${expectedProviderId}::${proof.key_id}`;
    if (this.revokedKeyIds.has(cacheId)) {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: `Provider key "${proof.key_id}" for "${expectedProviderId}" has been revoked.`,
      });
    }

    const ring = this.keyRingsByProvider.get(expectedProviderId);
    const activeJwk = ring?.get(proof.key_id) || (this.trustedByProvider.get(expectedProviderId)?.keyId === proof.key_id
      ? this.trustedByProvider.get(expectedProviderId).publicJwk
      : null);

    // Reject if the response tries to smuggle its own inline publicKey without matching pinned registry
    if (!activeJwk || body.provider_id !== expectedProviderId) {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.UNTRUSTED_SELF_ASSERTED_KEY,
        payload_sha256: computedHash,
        detail: `Key "${proof.key_id}" for provider "${body.provider_id}" is not pinned in trusted coordinator registry for "${expectedProviderId}".`,
      });
    }

    if (proof.payload_sha256 && !timingSafeEqualHex(proof.payload_sha256, computedHash)) {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: "Receipt payload_sha256 does not match canonical body digest.",
      });
    }

    if (proof.signed_at !== undefined && !Number.isFinite(Date.parse(String(proof.signed_at)))) {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: "Invalid ISO timestamp in proof.signed_at.",
      });
    }

    try {
      const sigBytes = base64UrlToBytes(proof.signature_b64u);
      if (sigBytes.length !== 64) {
        return Object.freeze({
          valid: false,
          ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
          payload_sha256: computedHash,
          detail: `Malformed Ed25519 signature length (${sigBytes.length} bytes != 64).`,
        });
      }
      let pubKey = this._importedKeyCache.get(cacheId);
      if (!pubKey) {
        pubKey = await globalThis.crypto.subtle.importKey(
          "jwk",
          activeJwk,
          { name: "Ed25519" },
          false,
          ["verify"],
        );
        this._importedKeyCache.set(cacheId, pubKey);
      }
      const verified = await globalThis.crypto.subtle.verify(
        { name: "Ed25519" },
        pubKey,
        sigBytes,
        UTF8_ENCODER.encode(canonical),
      );
      if (!verified) {
        return Object.freeze({
          valid: false,
          ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
          payload_sha256: computedHash,
          detail: "Ed25519 signature verification returned false.",
        });
      }
      return Object.freeze({
        valid: true,
        ...PROOF_TRUST_LEVELS.VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE,
        key_id: proof.key_id,
        payload_sha256: computedHash,
      });
    } catch (err) {
      return Object.freeze({
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: `Signature verification error: ${err.message}`,
      });
    }
  }
}

export async function verifyReceiptBatch(verifier, items = []) {
  const results = await Promise.all(
    items.map(({ providerId, envelope }) => verifier.verifyReceipt(providerId, envelope)),
  );
  return {
    allValid: results.length > 0 && results.every((r) => r.valid),
    verifiedCount: results.filter((r) => r.valid).length,
    totalCount: results.length,
    results,
  };
}
