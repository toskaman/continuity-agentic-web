import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalizeJson, sha256Hex } from "../../packages/shared-schemas/index.js";
import { AuthorityBoundResolver, validateA2aAgentCard } from "../../packages/nanda-resolver/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("N1 All five sites publish discovery cards pointing to their actual browser network", async () => {
  const dirs = [
    "apps/continuity-web",
    "apps/demo-moveco",
    "apps/demo-permitflow",
    "apps/demo-homeconnect",
    "apps/demo-powerflow",
  ];
  for (const dir of dirs) {
    const raw = await readFile(path.join(ROOT, dir, ".well-known", "agent-card.json"), "utf8");
    const card = JSON.parse(raw);
    const res = validateA2aAgentCard(card);
    assert.equal(res.valid, true, `${dir} agent-card failed: ${res.errors.join("; ")}`);
    assert.equal(card.supportedInterfaces, undefined);
    assert.equal(card.url, card.extensions["org.worldwideagenticweb"].networkUrl);
    await readFile(path.join(ROOT, dir, path.basename(new URL(card.url).pathname)), "utf8");
  }
});

test("N2 AuthorityBoundResolver enforces sequence anti-rollback, targetDigest integrity, and email/DNS rule", async () => {
  const resolver = new AuthorityBoundResolver();
  const artifact = { name: "MoveCo Express Assistant", version: "1.0.0" };
  const digest = `sha256:${await sha256Hex(canonicalizeJson(artifact))}`;

  const validBinding = {
    subject: "urn:air:toskaman.github.io:agent:moveco_dispatch",
    subjectType: "urn",
    method: "artifact",
    targetType: "application/a2a-agent-card+json",
    targetUrl: "https://toskaman.github.io/continuity-moveco-peer/.well-known/agent-card.json",
    targetDigest: digest,
    sequence: 5,
    issuedAt: "2027-11-13T08:00:00Z",
    expiresAt: "2027-11-14T08:00:00Z",
    authority: {
      type: "domain-control",
      issuer: "https://nandaindex.org",
      evidenceUrl: "https://toskaman.github.io/.well-known/nanda-proof",
    },
  };

  const ok = await resolver.verifyResolutionTarget(validBinding, {
    expectedSubject: validBinding.subject,
    nowIso: "2027-11-13T10:00:00Z",
    fetchedArtifact: artifact,
  });
  assert.equal(ok.ok, true);

  // Older sequence replay must be rejected (anti-rollback §5.5)
  const rollback = await resolver.verifyResolutionTarget(
    { ...validBinding, sequence: 4 },
    { nowIso: "2027-11-13T10:01:00Z" },
  );
  assert.equal(rollback.ok, false);
  assert.equal(rollback.code, "stale");

  // Tampered terminal artifact must fail targetDigest check (§10.3)
  const tampered = await resolver.verifyResolutionTarget(
    { ...validBinding, sequence: 6 },
    {
      nowIso: "2027-11-13T10:02:00Z",
      fetchedArtifact: { ...artifact, name: "Attacker Substituted Card" },
    },
  );
  assert.equal(tampered.ok, false);
  assert.equal(tampered.code, "unverifiable");

  // DNS zone authority alone cannot authorize an individual email account (§7.2)
  const emailAttack = await resolver.verifyResolutionTarget(
    {
      ...validBinding,
      subject: "alice@example.net",
      subjectType: "email",
      sequence: 1,
      authority: { type: "dns-zone-only", issuer: "https://evil-registry.example" },
    },
    { nowIso: "2027-11-13T10:02:00Z" },
  );
  assert.equal(emailAttack.ok, false);
  assert.equal(emailAttack.code, "unverifiable");
});
