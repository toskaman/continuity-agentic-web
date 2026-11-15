# Threat Model, Security Architecture & Privacy Controls

**Project:** CONTINUITY — Open Agentic Change Coordinator
**Date:** 2026-11-13

---

## 1. Trust Boundaries

CONTINUITY operates across four distinct security boundaries in the Open Agentic Web:

1. **User & Browser Boundary (Authoritative Control Plane):**
   - Owns the authoritative mission state, hard constraints (`maximum_budget_eur`, `preserve_existing_commitments`, `unauthorized_cancellation: false`), BYOK LLM credentials, third-party origin consent decisions, and bound irreversible-action approvals.
2. **LLM Inference Router Boundary (Untrusted Probabilistic Reasoner):**
   - Receives user chat messages, declared tool schemas, and local read results on the user's chosen router (e.g., Hosted Mozilla Otari `https://api.otari.ai/api/v1`).
   - **Cannot** directly mutate authoritative mission invariants, bypass confirmation dialogs, or contact unlisted origins.
3. **Independent Peer Agentic Websites (`MoveCo`, `PermitFlow`, `HomeConnect`, `PowerFlow`):**
   - Cross-origin untrusted publishers. Their `.network.json` instructions and JSON responses are treated strictly as **untrusted data**, never as system policy.
   - Peer networks run locally inside the caller's browser on the **caller's router, model, and step limit (`max_steps: 12`)** and **never** receive the user's BYOK API key or `sly_data`.
4. **Provider Capability Endpoints (`/mcp` & `/api/*`):**
   - Independent stateful demonstration services enforcing JSON Schema input validation, `64 KB` body caps, idempotency keys, and Ed25519 receipt signing.

---

## 2. Threat Matrix & Verified Mitigations

| # | Threat | Attack Vector | Implemented Mitigation | Automated Test Proof |
| --- | --- | --- | --- | --- |
| **T1** | **Prompt Injection / Constraint Downgrade** | Malicious text in user input or peer reply tries to raise budget or set `unauthorized_cancellation: true`. | `compileMissionChange()` (`packages/mission-core`) strips pre-approval commit/cancel flags and enforces authoritative hard invariants deterministically; `{grounding_rules}` marks tool outputs as data. | `S2`, `CHAOS_09` |
| **T2** | **BYOK Credential Leakage to Peers** | Peer manifest attempts to override `llm_router` or read visitor's API key. | `engine.js` (`selectPeerRouter`) forces peer networks onto caller's active router; `Authorization` header only sent to `ROUTER_URL`. Local testing separates hosts (`127.0.0.1` vs `localhost`) to avoid loopback cookie sharing. | `I1` |
| **T3** | **Unconsented Cross-Origin Contact** | Agent contacts external peer or MCP server without user awareness. | Closed `peer_policy` (`allowed_peers` allowlist) + mandatory interactive consent card shown **before** any HTTP fetch to peer manifest/network. Declining sends `0` bytes. | `I1`, `I2`, `S4` |
| **T4** | **Approval Drift / Bait-and-Switch** | Provider changes fee or date between user confirmation and commit dispatch. | `ApprovalEngine` computes canonical RFC-8785-style JSON + SHA-256 `approvalHash` over origin, capability, arguments, date, price, fees, and expiry. Any `€0.01` drift invalidates approval. | `U7`, `CHAOS_02` |
| **T5** | **Approval Replay & Concurrent Double-Spend** | Replaying a consumed `approval_id` or concurrent double-click race. | Synchronous reservation of `consumedOperationIds` prior to async hash verification guarantees single-use execution. | `S5`, `CHAOS_04` |
| **T6** | **Duplicate Writes on Network Timeout** | Socket drops after provider already committed reservation. | Explicit `UNKNOWN -> RECONCILING` state transition queries provider status with `idempotency_key`; never blindly retries an unknown write. | `C3`, `CHAOS_03`, `CHAOS_15` |
| **T7** | **Forged or Self-Asserted Provider Receipts** | Hostile response attaches a tampered receipt or unpinned inline public key. | `ReceiptVerifier` (`packages/proof-verifier`) verifies Ed25519 signatures exclusively against independently pre-registered public JWKs and labels unsigned responses `UNSIGNED_PROVIDER_RESPONSE`. | `S3`, `CHAOS_05` |
| **T8** | **Malformed JSON / Prototype Pollution** | Peer returns `__proto__`, `constructor`, `10 MB` payload, or `2026-02-30`. | `sanitizeJson()` rejects forbidden keys and payloads `> 128 KB`; `validateAgainstSchema()` enforces strict ISO calendar dates and `additionalProperties: false`. | `U8`, `C2`, `S1`, `CHAOS_10` |
| **T9** | **Infinite Delegation / Graph Exhaustion** | Cyclic dependencies or runaway multi-agent loops. | `MissionGraph` 3-color DFS rejects cycles (`maxDepth: 16`, `maxNodes: 64`); runtime enforces `maxRemoteCalls: 4`, `maxCallsPerPeer: 1`, `maxAgentCalls: 24`, `max_steps: 12`, `90s` deadline. | `U5`, `CHAOS_12` |
| **T10** | **Excessive Personal Data Disclosure** | Sending full itinerary, budget ceiling, or customer PII to every provider. | Impact Engine skips unaffected providers completely; affected peers receive only `booking_ref` + `target_date` (audited in UI **Privacy & Data Minimization** panel); `{partner_rules}` forbids PII in peer handoffs; `sly_data` deny-by-default. | `U3`, `I1`, `S4` |
| **T11** | **Hidden DOM Prompt Injection in `data-agent-facts`** | Malicious or misconfigured HTML hides instructions inside `display:none`, `hidden`, `aria-hidden="true"`, closed `<details>`, or `<input>` attributes. | `extractMarkedPageFacts()` (`@continuity/facts-publisher`) fails closed at build time whenever any marked element is hidden, folded, on a form/script tag, or matches credential patterns. | `Cycle 3.1` |
| **T12** | **Active-Content URLs in Discovery Extensions** | Attacker registers `javascript:`, `vbscript:`, or `data:text/html` / `data:image/svg+xml` links inside A2A or NANDA `extensions`. | `validateNandaExtensionSafety()` (`@continuity/nanda-resolver`) enforces `16 KB` / `6-level` bounds and blocks active-content URI schemes at every nesting depth. | `Cycle 4.1` |
| **T13** | **Cross-Provider Receipt Spoofing & `#continuity_receipt` XSS** | Compromised `MoveCo` key signs a `PermitFlow` receipt, or crafted URL hash injects `<img onerror=...>` inside `scheduled_date`. | `ReceiptVerifier` binds `providerId -> keyId/publicJwk`; `verifySignedReceiptHandoff()` validates strict `YYYY-MM-DD` calendar dates, `receipt_id`/`booking_ref` regexes, and `provider_id`. | `S6–S8`, `CHAOS_16` |
| **T14** | **Post-Export Audit Bundle Tampering & NANDA Rollback** | Exported audit JSON is altered by `€0.01` offline, or stale NANDA resolution `sequence` is replayed. | `verifyExportedAuditBundle()` checks canonical JCS SHA-256 + genesis Saga hash chain + WebCrypto Ed25519 signatures; `AuthorityBoundResolver` rejects decreasing `sequence` numbers. | `Cycle 6`, `CHAOS_17`, `CHAOS_20` |

---

## 3. Honest Cryptographic & Privacy Disclosures

1. **Client Hash vs. Provider Signature:** `approvalHash` (SHA-256) proves local integrity between what the user reviewed and what the coordinator dispatches. Provider authenticity relies on Ed25519 signatures verified against pinned demonstration public keys (`VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE`).
2. **External LLM Data Flow:** When the visitor configures an external LLM router (such as Hosted Mozilla Otari or OpenAI), chat prompts and `website_*` read results are sent over HTTPS to that chosen LLM provider. CONTINUITY states this clearly in the UI above the assistant panel.
3. **Patched Runtime `write` Tool Behavior:** Following Cognizant's official `agentify-website` runtime (`skills/agentify-website/runtime/README.md`), `read` and reversible `write` actions (such as staging a non-destructive preview or temporary slot hold) execute without a modal dialog, while all final commitment mutations are marked `irreversible` and gated by `AssistantMount.review` confirmation dialogs.
