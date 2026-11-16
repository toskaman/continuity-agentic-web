/**
 * @module @continuity/merkle-passport
 * RFC 6962 Domain-Separated SHA-256 Merkle Mission Passports, Salted Selective-Disclosure Proofs,
 * Critical-Path Method (CPM) Slack Analyzer, and Live Peer Federation Config Synthesizer.
 *
 * Why this pushes CONTINUITY far beyond a single-session coordinator:
 *  1. Third-Party Selective Disclosure (`continuity-merkle-passport/v1`): After re-aligning 5–6
 *     providers, a person often needs to prove ONE specific commitment (e.g., to a landlord,
 *     employer, customs officer, or clinic) WITHOUT disclosing their other 5 bookings, medical
 *     visits, or private budget ceiling.
 *  2. RFC 6962 §2.1 Cryptographic Soundness: Uses `0x00` leaf prefix, `0x01` interior-node prefix,
 *     exact power-of-two subtree splitting (`largestPowerOfTwoLessThan`), and 128-bit per-leaf
 *     random salts — immune to both Merkle second-preimage tree-height attacks and CVE-2012-2459
 *     odd-leaf duplication attacks.
 *  3. Critical-Path Slack Analysis (CPM): Computes forward/backward temporal bounds and exact
 *     float (`slackDays`) on every commitment in a `MissionGraph`.
 */

import { addDaysIso, diffDaysIso } from "../mission-core/index.js";
import { EDGE_TYPES } from "../mission-graph/index.js";
import { ReceiptVerifier } from "../proof-verifier/index.js";
import {
  canonicalizeJson,
  deepFreezeJson,
  isPlainObject,
  sanitizeJson,
  sha256Hex,
  timingSafeEqualHex,
} from "../shared-schemas/index.js";
import { verifyBlindedBudgetAttestation } from "../zk-budget-attestation/index.js";

export const PASSPORT_SCHEME = "continuity-merkle-passport/v1";
export const PROOF_SCHEME = "continuity-selective-disclosure/v1";
const UTF8_ENCODER = new TextEncoder();
const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function bytesToHex(u8) {
  let out = "";
  for (let i = 0; i < u8.length; i++) out += BYTE_TO_HEX[u8[i]];
  return out;
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("Invalid hexadecimal digest string.");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomSaltHex(byteLen = 16) {
  const bytes = new Uint8Array(byteLen);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256BytesHex(rawBytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", rawBytes);
  return bytesToHex(new Uint8Array(digest));
}

export function largestPowerOfTwoLessThan(n) {
  if (!Number.isInteger(n) || n <= 1) return 0;
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/**
 * Compute RFC 6962 §2.1 domain-separated leaf hash: `SHA-256(0x00 || canonicalLeafBytes)`.
 * @param {Record<string, any>} leafData
 * @param {string} leafSaltHex
 * @returns {Promise<string>}
 */
export async function hashSaltedMerkleLeaf(leafData, leafSaltHex) {
  if (typeof leafSaltHex !== "string" || !/^[0-9a-f]{32,64}$/i.test(leafSaltHex)) {
    throw new Error("Merkle leaf salt must be 128..256 bits of hex.");
  }
  const payloadBytes = UTF8_ENCODER.encode(
    canonicalizeJson({
      domain: PASSPORT_SCHEME,
      salt: leafSaltHex.toLowerCase(),
      leaf: sanitizeJson(leafData),
    }),
  );
  const prefixed = new Uint8Array(1 + payloadBytes.length);
  prefixed[0] = 0x00;
  prefixed.set(payloadBytes, 1);
  return await sha256BytesHex(prefixed);
}

/**
 * Compute RFC 6962 §2.1 domain-separated interior node hash: `SHA-256(0x01 || left32 || right32)`.
 * @param {string} leftHex
 * @param {string} rightHex
 * @returns {Promise<string>}
 */
export async function hashMerkleChildren(leftHex, rightHex) {
  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  if (left.length !== 32 || right.length !== 32) {
    throw new Error("Merkle child hashes must be 32-byte SHA-256 digests.");
  }
  const combined = new Uint8Array(65);
  combined[0] = 0x01;
  combined.set(left, 1);
  combined.set(right, 33);
  return await sha256BytesHex(combined);
}

/**
 * Compute RFC 6962 Merkle Tree Hash `MTH(leafHashes)` over `0..N` leaf digests.
 * @param {string[]} leafHashes
 * @returns {Promise<string>}
 */
export async function computeMerkleRoot(leafHashes) {
  const n = leafHashes.length;
  if (n === 0) {
    return await sha256BytesHex(new Uint8Array(0));
  }
  if (n === 1) {
    return leafHashes[0].toLowerCase();
  }
  const k = largestPowerOfTwoLessThan(n);
  const leftRoot = await computeMerkleRoot(leafHashes.slice(0, k));
  const rightRoot = await computeMerkleRoot(leafHashes.slice(k, n));
  return await hashMerkleChildren(leftRoot, rightRoot);
}

/**
 * Build RFC 6962 inclusion audit path `PATH(leafIndex, leafHashes)` (bottom-up).
 * @param {number} leafIndex
 * @param {string[]} leafHashes
 * @returns {Promise<Array<{ side: "left" | "right", hash: string }>>}
 */
export async function buildMerkleInclusionPath(leafIndex, leafHashes) {
  const n = leafHashes.length;
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= n) {
    throw new Error(`Invalid leafIndex ${leafIndex} for tree of size ${n}.`);
  }
  if (n === 1) return [];
  const k = largestPowerOfTwoLessThan(n);
  if (leafIndex < k) {
    const subPath = await buildMerkleInclusionPath(leafIndex, leafHashes.slice(0, k));
    const rightSiblingHash = await computeMerkleRoot(leafHashes.slice(k, n));
    return [...subPath, { side: "right", hash: rightSiblingHash }];
  }
  const subPath = await buildMerkleInclusionPath(leafIndex - k, leafHashes.slice(k, n));
  const leftSiblingHash = await computeMerkleRoot(leafHashes.slice(0, k));
  return [...subPath, { side: "left", hash: leftSiblingHash }];
}

function expectedAuditSides(leafIndex, totalLeaves) {
  const sides = [];
  const descend = (idx, count) => {
    if (count <= 1) return;
    const k = largestPowerOfTwoLessThan(count);
    if (idx < k) {
      descend(idx, k);
      sides.push("right");
    } else {
      descend(idx - k, count - k);
      sides.push("left");
    }
  };
  descend(leafIndex, totalLeaves);
  return sides;
}

/**
 * Verify an RFC 6962 inclusion audit path against `expectedRootHex`, enforcing exact tree geometry
 * derived from `(leafIndex, totalLeaves)` so depth/side malleability is impossible.
 */
export async function verifyMerkleInclusionPath({
  leafHashHex,
  leafIndex,
  totalLeaves,
  auditPath,
  expectedRootHex,
}) {
  if (
    !Number.isInteger(totalLeaves)
    || totalLeaves < 1
    || totalLeaves > 1024
    || !Number.isInteger(leafIndex)
    || leafIndex < 0
    || leafIndex >= totalLeaves
    || !Array.isArray(auditPath)
    || typeof leafHashHex !== "string"
    || !/^[0-9a-f]{64}$/i.test(leafHashHex)
    || typeof expectedRootHex !== "string"
    || !/^[0-9a-f]{64}$/i.test(expectedRootHex)
  ) {
    return { valid: false, reason: "Malformed Merkle inclusion proof parameters." };
  }

  const expectedSides = expectedAuditSides(leafIndex, totalLeaves);
  if (auditPath.length !== expectedSides.length) {
    return {
      valid: false,
      reason: `Audit path length ${auditPath.length} does not match canonical RFC 6962 depth ${expectedSides.length} for (${leafIndex}/${totalLeaves}).`,
    };
  }

  let current = leafHashHex.toLowerCase();
  for (let i = 0; i < auditPath.length; i++) {
    const step = auditPath[i];
    if (!step || step.side !== expectedSides[i] || typeof step.hash !== "string" || !/^[0-9a-f]{64}$/i.test(step.hash)) {
      return { valid: false, reason: `Invalid Merkle audit step #${i} (expected side=${expectedSides[i]}).` };
    }
    current =
      step.side === "right"
        ? await hashMerkleChildren(current, step.hash)
        : await hashMerkleChildren(step.hash, current);
  }

  const valid = timingSafeEqualHex(current, expectedRootHex);
  return {
    valid,
    recomputedRootHex: current,
    reason: valid
      ? `RFC 6962 Merkle path verified (${auditPath.length} hop(s) -> root ${current.slice(0, 16)}…).`
      : "Merkle root mismatch: leaf payload, salt, or audit path was tampered.",
  };
}

/**
 * Issue a Verifiable Merkle Mission Passport (`continuity-merkle-passport/v1`) over all commitments,
 * their final post-Saga states, attached Ed25519 receipts, and optional ZK budget attestation.
 */
export async function issueVerifiableMissionPassport({
  mission,
  graph,
  operations = [],
  trustedProviderKeys = {},
  zkBudgetAttestation = null,
  saltsByCommitment = {},
}) {
  const nodes = Array.from(graph.nodes.values());
  if (!nodes.length) {
    throw new Error("Cannot issue Merkle Mission Passport for an empty graph.");
  }
  const baselineById = new Map((mission.commitments || []).map((c) => [c.id, c]));
  const opsByCommitment = new Map((operations || []).map((o) => [o.commitment_id, o]));

  const privateLeaves = [];
  const leafHashes = [];

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    const baseCmt = baselineById.get(node.id) || node;
    const op = opsByCommitment.get(node.id) || null;
    const receiptEnv = op?.receipt_envelope || null;
    const receiptSha256 = receiptEnv ? await sha256Hex(canonicalizeJson(receiptEnv.receipt_body)) : null;

    const leafData = {
      mission_id: String(mission.mission_id),
      commitment_id: String(node.id),
      title: String(node.title),
      provider_id: String(op?.provider_id || node.provider_id),
      provider_name: String(op?.provider_name || node.provider_name),
      booking_ref: String(receiptEnv?.receipt_body?.booking_ref || node.booking_ref),
      baseline_date: String(baseCmt.scheduled_date),
      final_date: String(op?.state === "COMMITTED" ? op.proposed_date : node.scheduled_date),
      window: String(receiptEnv?.receipt_body?.window || node.window || ""),
      final_state: String(op?.state === "COMMITTED" ? "COMMITTED_VERIFIED" : node.visual_state || "UNCHANGED"),
      receipt_payload_sha256: receiptSha256,
    };

    const leafSaltHex =
      saltsByCommitment[node.id] && /^[0-9a-f]{32,64}$/i.test(saltsByCommitment[node.id])
        ? saltsByCommitment[node.id].toLowerCase()
        : randomSaltHex(16);
    const leafHashHex = await hashSaltedMerkleLeaf(leafData, leafSaltHex);
    leafHashes.push(leafHashHex);

    const pid = leafData.provider_id;
    privateLeaves.push({
      leafIndex: idx,
      leafHashHex,
      leafSaltHex,
      leafData,
      receipt_envelope: receiptEnv ? sanitizeJson(receiptEnv) : null,
      providerKeyDescriptor: trustedProviderKeys[pid] ? sanitizeJson(trustedProviderKeys[pid]) : null,
    });
  }

  const merkleRoot = await computeMerkleRoot(leafHashes);
  const passportCore = {
    scheme: PASSPORT_SCHEME,
    mission_id: String(mission.mission_id),
    issued_at: new Date().toISOString(),
    total_leaves: privateLeaves.length,
    merkle_root_sha256: merkleRoot,
    zk_budget_attestation: zkBudgetAttestation ? sanitizeJson(zkBudgetAttestation) : null,
  };
  const passportSha256 = await sha256Hex(canonicalizeJson(passportCore));

  return deepFreezeJson({
    ...passportCore,
    passport_sha256: passportSha256,
    leaf_hashes: leafHashes,
    private_leaves: privateLeaves,
  });
}

/**
 * Extract a zero-sibling-leak Selective-Disclosure Presentation proving ONE commitment (`commitmentId`)
 * against `passport.merkle_root_sha256` while keeping all other commitments 100% blinded.
 */
export async function createSelectiveDisclosureProof(passport, commitmentId, options = {}) {
  if (!passport || passport.scheme !== PASSPORT_SCHEME || !Array.isArray(passport.private_leaves)) {
    throw new Error("Invalid Merkle Mission Passport supplied.");
  }
  const target = passport.private_leaves.find((l) => l.leafData.commitment_id === commitmentId);
  if (!target) {
    throw new Error(`Commitment "${commitmentId}" not found in Merkle Mission Passport.`);
  }
  const auditPath = await buildMerkleInclusionPath(target.leafIndex, passport.leaf_hashes);
  const includeBudgetProof = options.includeBudgetProof !== false;

  const core = {
    scheme: PROOF_SCHEME,
    passport_scheme: PASSPORT_SCHEME,
    mission_id: passport.mission_id,
    merkle_root_sha256: passport.merkle_root_sha256,
    total_leaves: passport.total_leaves,
    blinded_siblings_count: Math.max(0, passport.total_leaves - 1),
    leaf_index: target.leafIndex,
    leaf_salt_hex: target.leafSaltHex,
    disclosed_commitment: target.leafData,
    audit_path: auditPath,
    receipt_envelope: target.receipt_envelope,
    demo_provider_public_key: target.providerKeyDescriptor,
    zk_budget_attestation: includeBudgetProof ? passport.zk_budget_attestation : null,
  };
  const presentationSha256 = await sha256Hex(canonicalizeJson(core));
  return deepFreezeJson({
    ...core,
    presentation_sha256: presentationSha256,
  });
}

/**
 * Verify a Selective-Disclosure Presentation independently (RFC 6962 Merkle path + JCS digest +
 * Ed25519 provider receipt + optional ZK hash-ladder budget proof).
 */
export async function verifySelectiveDisclosureProof(presentation, options = {}) {
  if (!isPlainObject(presentation) || presentation.scheme !== PROOF_SCHEME) {
    return { valid: false, errors: ["Malformed selective-disclosure presentation."] };
  }
  const clean = sanitizeJson(presentation);
  const errors = [];

  const { presentation_sha256: declaredHash, ...core } = clean;
  const computedPresHash = await sha256Hex(canonicalizeJson(core));
  const envelopeIntact = typeof declaredHash === "string" && timingSafeEqualHex(computedPresHash, declaredHash);
  if (!envelopeIntact) {
    errors.push("Presentation JCS SHA-256 integrity check failed.");
  }

  let merkleValid = false;
  let recomputedRootHex = null;
  try {
    const leafHashHex = await hashSaltedMerkleLeaf(clean.disclosed_commitment, clean.leaf_salt_hex);
    const merkleCheck = await verifyMerkleInclusionPath({
      leafHashHex,
      leafIndex: clean.leaf_index,
      totalLeaves: clean.total_leaves,
      auditPath: clean.audit_path,
      expectedRootHex: clean.merkle_root_sha256,
    });
    merkleValid = merkleCheck.valid;
    recomputedRootHex = merkleCheck.recomputedRootHex || null;
    if (!merkleCheck.valid) errors.push(merkleCheck.reason);
  } catch (err) {
    errors.push(`Merkle leaf verification error: ${err.message}`);
  }

  let receiptValid = null;
  const cmt = clean.disclosed_commitment || {};
  if (clean.receipt_envelope) {
    const bodyHash = await sha256Hex(canonicalizeJson(clean.receipt_envelope.receipt_body || {}));
    if (!cmt.receipt_payload_sha256 || !timingSafeEqualHex(bodyHash, cmt.receipt_payload_sha256)) {
      receiptValid = false;
      errors.push("Attached receipt_body digest does not match Merkle leaf receipt_payload_sha256.");
    } else {
      const keyMap = options.trustedProviderKeys
        ? options.trustedProviderKeys
        : clean.demo_provider_public_key
          ? { [cmt.provider_id]: clean.demo_provider_public_key }
          : {};
      const verifier = new ReceiptVerifier(keyMap);
      const rCheck = await verifier.verifyReceipt(cmt.provider_id, clean.receipt_envelope);
      receiptValid = rCheck.valid;
      if (!rCheck.valid) errors.push(`Ed25519 receipt invalid: ${rCheck.detail}`);
    }
  } else if (cmt.receipt_payload_sha256) {
    receiptValid = false;
    errors.push("Merkle leaf declares receipt_payload_sha256, but receipt_envelope was stripped.");
  }

  let zkBudgetValid = null;
  if (clean.zk_budget_attestation) {
    const zkCheck = await verifyBlindedBudgetAttestation(clean.zk_budget_attestation, {
      expectedMissionId: clean.mission_id,
    });
    zkBudgetValid = zkCheck.valid;
    if (!zkCheck.valid) errors.push(`ZK budget attestation invalid: ${zkCheck.reason}`);
  }

  return deepFreezeJson({
    valid: errors.length === 0,
    envelopeIntact,
    merkleValid,
    recomputedRootHex,
    receiptValid,
    zkBudgetValid,
    disclosedCommitmentId: cmt.commitment_id || null,
    blindedSiblingsCount: Number(clean.blinded_siblings_count ?? 0),
    errors,
  });
}

/**
 * Critical-Path Method (CPM) Forward/Backward Pass & Temporal Float (`slackDays`) Analyzer
 * over any `MissionGraph`.
 */
export function analyzeCriticalPathSlack(graph, targetAnchorDate, anchorCommitmentId = null) {
  const topoIds = graph.topologicalOrder();
  if (!topoIds.length) {
    return deepFreezeJson({ scheduleSpanDays: 0, criticalPathNodeIds: [], nodes: [] });
  }
  const anchorId = anchorCommitmentId && graph.nodes.has(anchorCommitmentId) ? anchorCommitmentId : topoIds[0];
  const anchorNode = graph.nodes.get(anchorId);
  const refDate = targetAnchorDate || anchorNode.scheduled_date;

  // Identify nodes reachable from anchorId via dependency/prerequisite edges
  const reachable = new Set([anchorId]);
  for (const id of topoIds) {
    if (!reachable.has(id)) continue;
    for (const e of graph.outgoingEdges(id)) {
      if (e.type === EDGE_TYPES.ALTERNATIVE_PROVIDER || e.type === EDGE_TYPES.COMPENSATION_LINK) continue;
      if (e.type === EDGE_TYPES.WITHIN_COVERAGE_SPAN) {
        const cs = e.rule?.coverageStart;
        const ce = e.rule?.coverageEnd;
        if (cs && ce && refDate >= cs && refDate <= ce) continue;
      }
      reachable.add(e.to);
    }
  }
  // Include upstream prerequisites feeding into anchorId ONLY if their existing date violates [minOffset, maxOffset]
  for (const e of graph.edges) {
    if (e.type === EDGE_TYPES.ON_OR_BEFORE && reachable.has(e.to)) {
      const fromNode = graph.nodes.get(e.from);
      const lead = diffDaysIso(fromNode.scheduled_date, refDate);
      const minLead = e.rule?.minOffsetDays ?? 0;
      const maxLead = e.rule?.maxOffsetDays ?? 365;
      if (lead < minLead || lead > maxLead) {
        reachable.add(e.from);
      }
    }
  }

  const earliest = new Map();
  const maxBound = new Map();
  for (const id of topoIds) {
    const n = graph.nodes.get(id);
    if (!reachable.has(id)) {
      const staticOff = diffDaysIso(refDate, n.scheduled_date);
      earliest.set(id, staticOff);
      maxBound.set(id, staticOff);
    } else if (id === anchorId) {
      earliest.set(id, 0);
      maxBound.set(id, 0);
    } else {
      earliest.set(id, -Infinity);
      maxBound.set(id, Infinity);
    }
  }

  // Handle upstream ON_OR_BEFORE prerequisites relative to anchor (e.g. lab <= anchor - minOffset)
  for (const e of graph.edges) {
    if (e.type === EDGE_TYPES.ON_OR_BEFORE && reachable.has(e.from) && reachable.has(e.to)) {
      const targetEarliest = earliest.get(e.to) === -Infinity ? 0 : earliest.get(e.to);
      const minLead = e.rule?.minOffsetDays ?? 0;
      const maxLead = e.rule?.maxOffsetDays ?? minLead;
      earliest.set(e.from, targetEarliest - maxLead);
      maxBound.set(e.from, targetEarliest - minLead);
    }
  }

  // Forward pass over topological order
  for (const u of topoIds) {
    if (!reachable.has(u)) continue;
    if (earliest.get(u) === -Infinity) earliest.set(u, 0);
    const esU = earliest.get(u);
    for (const e of graph.outgoingEdges(u)) {
      if (!reachable.has(e.to)) continue;
      if (e.type === EDGE_TYPES.SAME_DAY_REQUIRED) {
        earliest.set(e.to, Math.max(earliest.get(e.to), esU));
        maxBound.set(e.to, Math.min(maxBound.get(e.to), esU));
      } else if (e.type === EDGE_TYPES.ON_OR_AFTER) {
        const minOff = e.rule?.minOffsetDays ?? 0;
        const maxOff = e.rule?.maxOffsetDays ?? minOff + 2;
        earliest.set(e.to, Math.max(earliest.get(e.to), esU + minOff));
        maxBound.set(e.to, Math.min(maxBound.get(e.to), esU + maxOff));
      }
    }
  }

  let maxEarliest = 0;
  let minEarliest = 0;
  for (const id of reachable) {
    maxEarliest = Math.max(maxEarliest, earliest.get(id) || 0);
    minEarliest = Math.min(minEarliest, earliest.get(id) || 0);
  }

  // Backward pass for latest allowable offset
  const latest = new Map();
  for (const id of topoIds) {
    if (!reachable.has(id)) {
      latest.set(id, earliest.get(id));
    } else {
      const cap = maxBound.get(id);
      latest.set(id, Number.isFinite(cap) ? cap : maxEarliest);
    }
  }

  for (let i = topoIds.length - 1; i >= 0; i--) {
    const u = topoIds[i];
    if (!reachable.has(u)) continue;
    for (const e of graph.outgoingEdges(u)) {
      if (!reachable.has(e.to)) continue;
      const lfV = latest.get(e.to);
      if (e.type === EDGE_TYPES.SAME_DAY_REQUIRED) {
        latest.set(u, Math.min(latest.get(u), lfV));
      } else if (e.type === EDGE_TYPES.ON_OR_AFTER) {
        const minOff = e.rule?.minOffsetDays ?? 0;
        latest.set(u, Math.min(latest.get(u), lfV - minOff));
      }
    }
  }

  const nodeReports = topoIds.map((id) => {
    const n = graph.nodes.get(id);
    const isReach = reachable.has(id);
    const es = earliest.get(id) ?? 0;
    const ls = Math.max(es, latest.get(id) ?? es);
    const slackDays = isReach ? ls - es : null;
    const isCriticalPath = isReach && slackDays === 0;
    return {
      nodeId: id,
      title: n.title,
      providerName: n.provider_name,
      bookingRef: n.booking_ref,
      baselineDate: n.scheduled_date,
      projectedEarliestDate: isReach ? addDaysIso(refDate, es) : n.scheduled_date,
      projectedLatestDate: isReach ? addDaysIso(refDate, ls) : n.scheduled_date,
      earliestOffsetDays: es,
      latestOffsetDays: ls,
      slackDays,
      isCriticalPath,
      unaffected: !isReach,
    };
  });

  return deepFreezeJson({
    anchorCommitmentId: anchorId,
    targetAnchorDate: refDate,
    scheduleSpanDays: maxEarliest - minEarliest,
    criticalPathNodeIds: nodeReports.filter((r) => r.isCriticalPath).map((r) => r.nodeId),
    nodes: nodeReports,
  });
}

/**
 * Synthesize ready-to-paste Open Agentic Web federation config (`allowed_peers`, HOCON `tools`,
 * `link_labels`, `facts/` fast-path, and `engine.addCheck` TOFU snippet) for any audited peer URL.
 */
export function synthesizePeerFederationConfig(auditReport) {
  if (!auditReport || !auditReport.siteBaseUrl) {
    throw new Error("Valid auditReport with siteBaseUrl is required.");
  }
  const base = String(auditReport.siteBaseUrl).replace(/\/+$/, "");
  let origin;
  try {
    origin = new URL(base).origin;
  } catch {
    throw new Error(`Invalid siteBaseUrl "${auditReport.siteBaseUrl}" in synthesizePeerFederationConfig.`);
  }
  const netName = auditReport.networkName || "partner_network";
  const partnerUrl = `${base}/${netName}`;
  const factsCheck = (auditReport.checks || []).find((c) => c.id === "MVP-FACTS" && c.status === "PASS");
  const factsUrl = factsCheck ? `${base}/facts/${netName}_facts` : null;

  return deepFreezeJson({
    peerOrigin: origin,
    partnerNetworkUrl: partnerUrl,
    factsNetworkUrl: factsUrl,
    manifestDigest: auditReport.manifestDigest || null,
    networkDigest: auditReport.networkDigest || null,
    manifestPatch: {
      allowed_peers: [origin],
    },
    hoconSnippet: [
      `# Add inside your calling agent's tools array:`,
      `tools = ["${partnerUrl}"${factsUrl ? `, "${factsUrl}"` : ""}]`,
      `link_labels {`,
      `  "${partnerUrl}": "${netName} (Federated Peer)"`,
      ...(factsUrl ? [`  "${factsUrl}": "${netName} — Public Facts (1-Turn)"`] : []),
      `}`,
    ].join("\n"),
    safetyHookSnippet: [
      `import { createOpenAgenticSafetyGuard } from "@continuity/safety-hooks";`,
      `engine.addCheck(createOpenAgenticSafetyGuard()); // Enforces Firewall + TOFU (${auditReport.networkDigest || "sha256"}) + Luhn/IBAN DLP + Post-Peer Taint Lock`,
    ].join("\n"),
  });
}
