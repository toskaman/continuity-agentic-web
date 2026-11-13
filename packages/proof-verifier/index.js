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

import { canonicalizeJson, sanitizeJson, sha256Hex } from "../shared-schemas/index.js";

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
    new TextEncoder().encode(canonical),
  );
  return {
    receipt_body: cleanBody,
    proof: {
      algorithm: "Ed25519",
      key_id: signerKey.keyId,
      payload_sha256: bodySha256,
      signature_b64u: bytesToBase64Url(new Uint8Array(sigBuffer)),
    },
  };
}

/**
 * Verify a provider receipt against an independently configured map of trusted public JWKs.
 * Never trusts a public key supplied inside `envelope` itself.
 */
export class ReceiptVerifier {
  /**
   * @param {Record<string, { keyId: string, publicJwk: JsonWebKey }>} [trustedProviderKeys]
   */
  constructor(trustedProviderKeys = {}) {
    /** @type {Map<string, { keyId: string, publicJwk: JsonWebKey }>} */
    this.trustedByProvider = new Map(Object.entries(trustedProviderKeys));
  }

  registerTrustedProviderKey(providerId, keyId, publicJwk) {
    this.trustedByProvider.set(providerId, { keyId, publicJwk: sanitizeJson(publicJwk) });
  }

  /**
   * Verify a receipt envelope and return explicit trust classification.
   * @param {string} expectedProviderId
   * @param {Record<string, any>} envelope
   */
  async verifyReceipt(expectedProviderId, envelope) {
    if (!envelope || typeof envelope !== "object") {
      return {
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        detail: "Missing or non-object receipt envelope.",
      };
    }

    const body = envelope.receipt_body;
    const proof = envelope.proof;

    if (!body || typeof body !== "object") {
      return {
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        detail: "Receipt envelope contains no structured receipt_body.",
      };
    }

    const canonical = canonicalizeJson(body);
    const computedHash = await sha256Hex(canonical);

    // Unsigned response path: honest classification, never masquerades as cryptographic attestation
    if (!proof || !proof.signature_b64u) {
      return {
        valid: false,
        ...PROOF_TRUST_LEVELS.UNSIGNED_PROVIDER_RESPONSE,
        payload_sha256: computedHash,
        detail: "Provider returned an unsigned response body.",
      };
    }

    // Reject if the response tries to smuggle its own inline publicKey without matching pinned registry
    const pinned = this.trustedByProvider.get(expectedProviderId);
    if (!pinned || pinned.keyId !== proof.key_id || body.provider_id !== expectedProviderId) {
      return {
        valid: false,
        ...PROOF_TRUST_LEVELS.UNTRUSTED_SELF_ASSERTED_KEY,
        payload_sha256: computedHash,
        detail: `Key "${proof.key_id}" for provider "${body.provider_id}" is not pinned in trusted coordinator registry for "${expectedProviderId}".`,
      };
    }

    if (proof.payload_sha256 && proof.payload_sha256 !== computedHash) {
      return {
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: "Receipt payload_sha256 does not match canonical body digest.",
      };
    }

    try {
      const pubKey = await globalThis.crypto.subtle.importKey(
        "jwk",
        pinned.publicJwk,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      const sigBytes = base64UrlToBytes(proof.signature_b64u);
      const verified = await globalThis.crypto.subtle.verify(
        { name: "Ed25519" },
        pubKey,
        sigBytes,
        new TextEncoder().encode(canonical),
      );
      if (!verified) {
        return {
          valid: false,
          ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
          payload_sha256: computedHash,
          detail: "Ed25519 signature verification returned false.",
        };
      }
      return {
        valid: true,
        ...PROOF_TRUST_LEVELS.VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE,
        key_id: pinned.keyId,
        payload_sha256: computedHash,
      };
    } catch (err) {
      return {
        valid: false,
        ...PROOF_TRUST_LEVELS.INVALID_SIGNATURE_OR_TAMPERED,
        payload_sha256: computedHash,
        detail: `Signature verification error: ${err.message}`,
      };
    }
  }
}
