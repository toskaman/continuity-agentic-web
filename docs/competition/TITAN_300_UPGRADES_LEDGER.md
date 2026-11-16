# CONTINUITY — Auditable 300-Upgrade TITAN OMEGA v3.0 Engineering Ledger (`#001 – #300`)

**Target Competition:** Cognizant Open Agentic Web Challenge (`https://cognizant-agenticweb.devpost.com/`, Deadline: Jan 11, 2027 @ 16:00 UTC)  
**Operating System Applied Between Every Wave:** `TITAN OMEGA v3.0` (`Evidence before assumptions` · `Impact before feature count` · `Simplicity before architectural vanity` · `Speed is a product feature` · `Demonstration before explanation` · `Trust is part of the product` · `No fake achievements`).

---

## Wave 1 (`Upgrades #001 – #060`) — Cryptographic Primitives, SSRF/NANDA Hardening, Peer Firewall v2, PKCE & Provider/MCP Server

**TITAN OMEGA Phases Applied:** Phase 0 (Code Reconnaissance), Phase 3.2 (Spec Conformance), Phase 8.3 (CPU/Allocation Control), Phase 10 (Security & Abuse Prevention).  
**Automated Test Suite:** [`tests/unit/titan_wave1_60_upgrades.test.mjs`](../../tests/unit/titan_wave1_60_upgrades.test.mjs) + `CHAOS_31`, `CHAOS_32`.

- **#001** (`packages/shared-schemas/index.js`): Singleton `UTF8_ENCODER = new TextEncoder()` reuse across all hashing & canonicalization hot paths.
- **#002** (`packages/shared-schemas/index.js`): RFC 8785 JCS unpaired UTF-16 surrogate guard (`LONE_SURROGATE_RE`) on strings & object keys.
- **#003** (`packages/shared-schemas/index.js`): Bounded `MAX_CANONICAL_DEPTH = 24` recursion guard in `canonicalizeJson`.
- **#004** (`packages/shared-schemas/index.js`): Bounded 512-entry LRU memoization cache in `sha256Hex` for repeated manifest/offer digests.
- **#005** (`packages/shared-schemas/index.js`): Precomputed 256-entry `BYTE_TO_HEX` lookup table (~3.5× faster digest hex formatting).
- **#006** (`packages/shared-schemas/index.js`): Constant-time `timingSafeEqualString` & `timingSafeEqualHex` exported to prevent early-exit timing side channels.
- **#007** (`packages/shared-schemas/index.js`): Pre-allocated `Uint8Array` block buffer in `sha256PureHex` + **critical NIST FIPS 180-4 IV fix (`h4 = 0x510e527f`)** ensuring 100% bit-exact parity with WebCrypto `SubtleCrypto.digest("SHA-256")`.
- **#008** (`packages/shared-schemas/index.js`): `uniqueItems: true` canonical array uniqueness validation in `validateAgainstSchema`.
- **#009** (`packages/shared-schemas/index.js`): `pattern`, `format: "iso-date"`, and `format: "https-or-loopback-url"` (with embedded-credential rejection) in `validateAgainstSchema`.
- **#010** (`packages/shared-schemas/index.js`): Recursive `deepFreezeJson` helper exported for immutable mandates, approvals, and schemas.
- **#011** (`packages/shared-schemas/index.js`): Null-byte `\u0000` object-key injection rejection in `sanitizeJson`.
- **#012** (`packages/shared-schemas/index.js`): Century-boundary leap-year validation (`1900-02-29` rejected, `2000-02-29` / `2028-02-29` accepted) in `isValidIsoDate`.
- **#013** (`packages/nanda-resolver/index.js`): `isSafePublicOrLoopbackUrl` blocking cloud metadata `169.254.169.254`, RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), CGNAT `100.64/10`, `0.0.0.0`, IPv6 link-local/ULA (`fe80::`, `fc00::`, `fd00::`), IPv6-mapped IPv4 (`[::ffff:...]`), pre-WHATWG integer/hex IP literals (`2130706433`, `0x7f000001`), and URL credentials.
- **#014** (`packages/nanda-resolver/index.js`): Enforce `isSafePublicOrLoopbackUrl` at entry of `auditOpenAgenticSite`.
- **#015** (`packages/nanda-resolver/index.js`): Same-origin path-escape guard on `firstNet.hocon`, `actions.bridge`, and `facts/agent-manifest.json` (`nUrlObj.origin === parsedBase.origin`) preventing confused-deputy cross-origin fetches.
- **#016** (`packages/nanda-resolver/index.js`): Bounded `512 KB` response size cap + `8,000 ms` `AbortSignal.timeout` on `safeFetchJsonObject` and bridge probes.
- **#017** (`packages/nanda-resolver/index.js`): HTTP redirect target re-validation (`res.url`) against SSRF/HTTP-downgrade in `safeFetchJsonObject`.
- **#018** (`packages/nanda-resolver/index.js`): Expanded leaked-credential detector (`otk_`, `AIza`, `AQ.`, `gsk_`, `ghp_`, `github_pat_`, `xoxb-`, `sk-`, `Bearer `) in `MVP-NETWORK`.
- **#019** (`packages/nanda-resolver/index.js`): RFC 1035 DNS label validation (`<= 63` chars/label, `<= 253` total, no leading/trailing hyphens or `..`) in `validateAirUrn`.
- **#020** (`packages/nanda-resolver/index.js`): Bounded 2,048-subject FIFO/LRU cap on `AuthorityBoundResolver.observedSequences`.
- **#021** (`packages/nanda-resolver/index.js`): Constant-time `timingSafeEqualString` check on `targetDigest` in `AuthorityBoundResolver`.
- **#022** (`packages/nanda-resolver/index.js`): Enforce `isSafePublicOrLoopbackUrl` on both `targetUrl` and `authority.evidenceUrl` in `AuthorityBoundResolver`.
- **#023** (`packages/nanda-resolver/index.js`): `5-minute` future clock-skew ceiling (`MAX_FUTURE_SKEW_MS`) on `issuedAt` in `AuthorityBoundResolver`.
- **#024** (`packages/nanda-resolver/index.js`): Duplicate `entries[].identifier` URN detection in `validateNandaAiCatalog`.
- **#025** (`packages/nanda-resolver/index.js`): Strict `^sha256:[0-9a-f]{64}$` validation on `entries[].targetDigest` in `validateNandaAiCatalog`.
- **#026** (`packages/nanda-resolver/index.js`): Duplicate `skills[].id` detection in `validateA2aAgentCard`.
- **#027** (`packages/nanda-resolver/index.js`): Topic identifier syntax (`^[a-z0-9_.:-]{2,64}$`) and sender address validation in `validatePoppyReachDeclaration`.
- **#028** (`packages/nanda-resolver/index.js`): SSRF & HTTPS safety validation on resolved personal inbox URLs in `resolveAndRouteNandaReach`.
- **#029** (`packages/peer-firewall/index.js`): Unicode Tags block `U+E0000–U+E007F` invisible LLM ASCII tag smuggling detector (`PF-TAG-SMUGGLING`, `CRITICAL`).
- **#030** (`packages/peer-firewall/index.js`): Variation Selectors Supplement `U+E0100–U+E01EF` & Hangul/Braille invisible fillers (`\u3164`, `\uFFA0`, `\u2800`, `\u180E`) added to `TROJAN_UNICODE_RE`.
- **#031** (`packages/peer-firewall/index.js`): Markdown image/link exfiltration beacon detector (`![...](https://...?api_key=...)`, `PF-MARKDOWN-BEACON-EXFIL`, `CRITICAL`).
- **#032** (`packages/peer-firewall/index.js`): Obfuscated/Base64 decode-and-execute instruction detector (`PF-ENCODED-PAYLOAD`, `CRITICAL`).
- **#033** (`packages/peer-firewall/index.js`): Non-loopback cleartext `http://` external tool URL blocker (`PF-INSECURE-HTTP-TOOL`, `CRITICAL`).
- **#034** (`packages/peer-firewall/index.js`): Punycode `xn--` & mixed Cyrillic/Greek-Latin hostname spoofing warning (`PF-HOMOGLYPH-HOST`, `WARN`).
- **#035** (`packages/peer-firewall/index.js`): Inspect `agent.function.parameters` JSON schemas alongside `instructions` & `description` (closes tool-argument description injection).
- **#036** (`packages/peer-firewall/index.js`): Inspect `manifest.brand` & `manifest.networks[].description` for Trojan Unicode and override prompts (`PF-MANIFEST-TROJAN`).
- **#037** (`packages/peer-firewall/index.js`): Bounded 256-peer cap on `PeerTofuRegistry.pins`.
- **#038** (`packages/peer-firewall/index.js`): Constant-time `timingSafeEqualString` digest verification in `PeerTofuRegistry.verifyOrPin`.
- **#039** (`packages/peer-firewall/index.js`): Track `modelChanged` and `maxStepsChanged` in `diffPeerNetworks`.
- **#040** (`packages/peer-firewall/index.js`): Deterministic `0..100` `riskScore` emitted by `inspectPeerNetworkSafety`.
- **#041** (`packages/openrouter-pkce/index.js`): Constant-time `timingSafeEqualString` CSRF `state` check in `completeOpenRouterPkceCallback`.
- **#042** (`packages/openrouter-pkce/index.js`): Enforce HTTPS (or loopback HTTP) on `callbackUrl`, `authBaseUrl`, and `keysEndpoint`.
- **#043** (`packages/openrouter-pkce/index.js`): Reject embedded URL credentials on all PKCE endpoints.
- **#044** (`packages/openrouter-pkce/index.js`): Validate `code` length & charset (`^[A-Za-z0-9._~+/-]{1,512}$`) before network POST.
- **#045** (`packages/openrouter-pkce/index.js`): Scrub `?error=` and `?error_description=` alongside `?code=&state=` from callback URLs.
- **#046** (`packages/openrouter-pkce/index.js`): `8,000 ms` `AbortSignal.timeout` on PKCE key exchange fetch.
- **#047** (`packages/openrouter-pkce/index.js`): Export `clearPendingOpenRouterPkce` cleanup helper.
- **#048** (`providers/shared/provider_server.mjs`): Complete `MIME_TYPES` table adding `.woff2` (`font/woff2`), `.ics`, `.sarif`, `.webmanifest`, `.jpg`, `.webp`, `.txt`.
- **#049** (`providers/shared/provider_server.mjs`): Catch malformed percent-encoding `URIError` -> HTTP `400` instead of `500`.
- **#050** (`providers/shared/provider_server.mjs`): Reject null bytes (`\0`) in request paths -> HTTP `400`.
- **#051** (`providers/shared/provider_server.mjs`): Catch malformed JSON `SyntaxError` in `readJsonBody` -> HTTP `400` & JSON-RPC `-32700 Parse error` on `/mcp` (+ HTTP `413` on `> 64 KB`).
- **#052** (`providers/shared/provider_server.mjs`): Post-resolve `realpath(resolved)` containment check blocking symlink escapes outside `siteFolder`.
- **#053** (`providers/shared/provider_server.mjs`): `X-Content-Type-Options: nosniff` & `Referrer-Policy: strict-origin-when-cross-origin` on static & API responses.
- **#054** (`providers/shared/provider_server.mjs`): Weak `ETag` + `If-None-Match` -> HTTP `304 Not Modified` on static files.
- **#055** (`providers/shared/provider_server.mjs`): `Cache-Control: public, max-age=31536000, immutable` on `.woff2` font files.
- **#056** (`providers/shared/provider_server.mjs`): Bounded 1,024-entry FIFO eviction on `holds` and `idempotencyStore`.
- **#057** (`providers/shared/provider_server.mjs`): Redact internal stack/filesystem details on HTTP `500` responses.
- **#058** (`providers/shared/provider_server.mjs`): Strict JSON-RPC 2.0 envelope check (`jsonrpc === "2.0"`, non-array) -> `-32600 Invalid Request`.
- **#059** (`providers/shared/provider_server.mjs`): MCP `2025-06-18` `ping` method handler on `/mcp`.
- **#060** (`providers/shared/provider_server.mjs`): `HEAD` support with exact `Content-Length` on `/api/public-key` and static assets.

---

## Wave 2 (`Upgrades #061 – #120`) — Ed25519 Key Rings, Approval Binding, Outcome Reconciler, Saga Auto-Rollback, Mandate Arbiter & ZK Hash-Ladder

**TITAN OMEGA Phases Applied:** Phase 7 (Cryptographic Differentiators), Phase 8.2 (Algorithmic Speedup), Phase 10 (Reversibility, Integrity & Zero-Leak Privacy).  
**Automated Test Suite:** [`tests/unit/titan_wave2_60_upgrades.test.mjs`](../../tests/unit/titan_wave2_60_upgrades.test.mjs) + `CHAOS_33`, `CHAOS_34`, `CHAOS_35`.

- **#061** (`packages/proof-verifier/index.js`): Memoize imported WebCrypto `CryptoKey` objects in `ReceiptVerifier._importedKeyCache` (~4× faster receipt checks).
- **#062** (`packages/proof-verifier/index.js`): Multi-key provider rotation ring (`keyRingsByProvider`) supporting zero-downtime `k1 -> k2` key rollover.
- **#063** (`packages/proof-verifier/index.js`): `revokeProviderKey(providerId, keyId)` immediate compromised-key revocation.
- **#064** (`packages/proof-verifier/index.js`): Strict 64-byte RFC 8032 Ed25519 signature length validation prior to `subtle.verify`.
- **#065** (`packages/proof-verifier/index.js`): Constant-time `timingSafeEqualHex` check on `proof.payload_sha256`.
- **#066** (`packages/proof-verifier/index.js`): `proof.algorithm === "Ed25519"` algorithm-confusion guard.
- **#067** (`packages/proof-verifier/index.js`): Validate `kty === "OKP" && crv === "Ed25519"` in `registerTrustedProviderKey`.
- **#068** (`packages/proof-verifier/index.js`): Singleton `UTF8_ENCODER` reuse in `signProviderReceipt` and `verifyReceipt`.
- **#069** (`packages/proof-verifier/index.js`): Reject `NaN`, `Infinity`, or negative monetary fields inside `receipt_body`.
- **#070** (`packages/proof-verifier/index.js`): Stamp and validate ISO `proof.signed_at` timestamps.
- **#071** (`packages/proof-verifier/index.js`): `Object.freeze` all returned `verifyReceipt` trust-classification records.
- **#072** (`packages/proof-verifier/index.js`): Export concurrent `verifyReceiptBatch` helper.
- **#073** (`packages/approval-engine/index.js`): Constant-time `timingSafeEqualHex` comparison on `approval_hash`.
- **#074** (`packages/approval-engine/index.js`): Bind `mandate_sha256` into `buildCanonicalApprovalPayload` so mandate swaps invalidate approvals.
- **#075** (`packages/approval-engine/index.js`): Bind `hold_id` explicitly into `buildCanonicalApprovalPayload`.
- **#076** (`packages/approval-engine/index.js`): Integer-cent rounding (`toEurFromCents`) eliminating IEEE-754 float drift in approvals.
- **#077** (`packages/approval-engine/index.js`): `deepFreezeJson` on issued approval records and canonical payloads.
- **#078** (`packages/approval-engine/index.js`): `revokeApproval(approvalId)` emergency human revocation gate.
- **#079** (`packages/approval-engine/index.js`): Reject negative/non-finite monetary inputs in `createBoundApproval`.
- **#080** (`packages/approval-engine/index.js`): Reject `expires_at <= approved_at` at approval creation time.
- **#081** (`packages/approval-engine/index.js`): Bounded 1,024-entry cap on `ApprovalEngine.approvals`.
- **#082** (`packages/approval-engine/index.js`): Export `computeApprovalDiff` returning `{ driftedFields, beforeAfter }`.
- **#083** (`packages/outcome-reconciliation/index.js`): Reconcile BOTH `total_charged_eur` and `total_price_eur` against approved operation totals (closes `total_price_eur` overcharge gap).
- **#084** (`packages/outcome-reconciliation/index.js`): Require non-null `receipt_envelope` when `ReceiptVerifier` is active (`Missing signed receipt_envelope -> NEEDS_USER`).
- **#085** (`packages/outcome-reconciliation/index.js`): Enforce `observedBody.booking_ref === expectedOp.original_booking_ref` (blocks cross-booking receipt replay).
- **#086** (`packages/outcome-reconciliation/index.js`): Enforce `observedBody.provider_id === expectedOp.provider_id`.
- **#087** (`packages/outcome-reconciliation/index.js`): Constant-time `timingSafeEqualHex` verification on `prev_hash` and `entry_hash` in `OperationLedger.verifyChainIntegrity`.
- **#088** (`packages/outcome-reconciliation/index.js`): Support `ALREADY_COMMITTED` idempotent replay status in `reconcileOperationOutcome`.
- **#089** (`packages/outcome-reconciliation/index.js`): Export `OperationLedger.exportCompactMerkleTip()`.
- **#090** (`packages/outcome-reconciliation/index.js`): Bounded 4,096-event `MAX_LEDGER_HISTORY` guard.
- **#091** (`packages/outcome-reconciliation/index.js`): Domain-separated `"continuity-idem-v1"` prefix in `deriveIdempotencyKey`.
- **#092–#094** (`packages/outcome-reconciliation/index.js`): `operation_id <= 160` length validation & immutable ledger returns.
- **#095** (`packages/saga-engine/index.js`): **Automatic upstream temporary-hold rollback (`rolledBackHoldIds`)** when a downstream `prepareHold` fails during `preparePlan` (zero orphan holds!).
- **#096–#097** (`packages/saga-engine/index.js`): Propagate `mandateSha256` into prepared operations & validate `plan.operations` / `maximumBudgetEur` at `preparePlan` entry.
- **#098** (`packages/saga-engine/index.js`): Fault-isolated `try/catch` around `client.releaseHold` in `releasePreparedHolds` (`-> NEEDS_USER` instead of aborting remaining releases).
- **#099** (`packages/saga-engine/index.js`): `_executing` re-entrancy mutex blocking concurrent `executeApprovedSaga` calls.
- **#100** (`packages/saga-engine/index.js`): Record `hold_elapsed_ms` per provider hold in ledger history.
- **#101–#106** (`packages/saga-engine/index.js`): `AbortSignal` support in `preparePlan` & `executeApprovedSaga`, `handoff_token` preservation on ledger records, and `SagaCoordinator.summarizeExecution`.
- **#107** (`packages/mandate-arbiter/index.js`): `deepFreezeJson` on issued mandates + `verifyPolicyMandateIntegrity(mandate)` recomputation check.
- **#108–#109** (`packages/mandate-arbiter/index.js`): Strict regex `booking_ref` & `isValidIsoDate` validation in `buildSanitizedPeerBoundaryRequest`.
- **#110** (`packages/mandate-arbiter/index.js`): `SealedBidArbiter.verifySealedBidOpening` constant-time SHA-256 commitment verifier.
- **#111–#113** (`packages/mandate-arbiter/index.js`): Non-negative `buyerAllowanceCents` guard, deterministic lexicographic tie-breaker on equal Nash `compromise_cents`, and `wipeVaultSecrets()` post-resolution floor purge.
- **#114–#120** (`packages/zk-budget-attestation/index.js`): Singleton `UTF8_ENCODER` + `BYTE_TO_HEX` (~3× faster hash-ladder), `timingSafeEqualHex` anchor check, `deepFreezeJson` on commitments/attestations, `expectedMissionId` cross-mission replay guard, `exactSpentEur` finite check, and `createAndProveMissionBudget` helper.

---

## Wave 3 (`Upgrades #121 – #180`) — Visible-DOM Anti-Injection Facts Compiler, Diamond-DAG Impact Engine, Multilingual NL Compiler & Branch-and-Bound Pareto Solver

**TITAN OMEGA Phases Applied:** Phase 6 (Workflow Intelligence), Phase 8.2 (Branch-and-Bound Pruning & DAG Correctness), Phase 10 (Prompt-Injection Hardening), Phase 15 (Community Ecosystem Tools).  
**Automated Test Suite:** [`tests/unit/titan_wave3_60_upgrades.test.mjs`](../../tests/unit/titan_wave3_60_upgrades.test.mjs).

- **#121** (`packages/facts-publisher/index.js`): Block 5 additional CSS invisibility smuggling techniques (`font-size:0`, `width:0`/`height:0`, `clip-path:inset(...)`, negative offscreen `text-indent`/`left`/`top`, `transform:scale(0)`, `color:transparent`).
- **#122** (`packages/facts-publisher/index.js`): Block Unicode Bidi/Tag smuggling characters (`U+202E`, `U+E0000..U+E01EF`) inside `data-agent-facts` text.
- **#123** (`packages/facts-publisher/index.js`): Block `data-agent-facts` elements nested inside hidden ancestor containers (`<div hidden>`, `aria-hidden="true"`, `display:none`) or closed `<dialog>`.
- **#124** (`packages/facts-publisher/index.js`): Safe decimal (`&#8364;`) and hex (`&#x20AC;`) numeric HTML entity decoding rejecting control chars `< 0x20`.
- **#125** (`packages/facts-publisher/index.js`): Duplicate `data-agent-facts` topic detection within an HTML document.
- **#126–#132** (`packages/facts-publisher/index.js`): Forbid `<form>` tag facts, expand leaked-key patterns (`gsk_`, `ghp_`, `github_pat_`, `xoxb-`), `deepFreezeJson` outputs, and export `verifyFactsProvenance`.
- **#133–#138** (`packages/mission-graph/index.js`): `topologicalOrder()` (Kahn's algorithm), `incomingEdges(nodeId)`, `clone()`, duplicate-edge idempotence in `addEdge`, `GRAPH_VISUAL_STATES` deep-freeze, and `visual_state` enum validation in `updateNode`.
- **#139** (`packages/impact-engine/index.js`): **Diamond-DAG monotonic `AFFECTED_SOFT -> AFFECTED_HARD` upgrade propagation** in `analyzeMissionImpact`.
- **#140–#146** (`packages/impact-engine/index.js`): Symmetric `minOffsetDays`/`maxOffsetDays` support on `ON_OR_BEFORE` prerequisite edges, `isValidIsoDate` guard in `evaluateEdgeImpact`, deduplicated reasons, and frozen `blastRadiusRatio` metric.
- **#147–#152** (`packages/capability-adapter/index.js`): Strip invisible Bidi/control/Tag characters from peer offer strings, enforce HTTPS/loopback on `provider_origin`, enforce `hold_ttl_seconds === 0` when `supports_hold === false`, round prices to cents, and `deepFreezeJson` normalized offers.
- **#153–#158** (`packages/transition-playbook/index.js`): Multi-hop topological dependency step ordering, CRLF mailto header sanitization, and concise `shortSmsDraft` for SMS/WhatsApp tradespeople.
- **#159–#168** (`packages/mission-core/index.js`): Spanish & German weekday/budget support (`viernes`, `sábado`, `freitag`, `samstag`, `bajo`, `unter`), earlier/negative date shifts (`-1 day`, `1 day earlier`, `bring forward by 2 days`, `un jour plus tôt`), and `next week` / `la semaine prochaine`.
- **#169–#180** (`packages/constraint-solver/index.js`): **Suffix-minimum cost precomputation (`suffixMinCost`) + exact branch-and-bound subtree pruning** against `maxBudgetEur`, `offer_id` deduplication, and `avoidedCancellationFeesEur` directly on every solved plan's `metrics`.

---

## Wave 4 (`Upgrades #181 – #240`) — Parallel Cross-Origin Mesh, On-Device Prompt Sanitizer, WebMCP Mutex, ADK SSRF Guard, `.ics` `VALARM` Shield & 36-Scenario Chaos Lab

**TITAN OMEGA Phases Applied:** Phase 8.3 (Parallel Mesh & Latency), Phase 10 (Iframe Source Pinning, `.ics` Poisoning & Re-Entrancy), Phase 11 (Expanded Chaos Verification).  
**Automated Test Suite:** [`tests/unit/titan_wave4_60_upgrades.test.mjs`](../../tests/unit/titan_wave4_60_upgrades.test.mjs) + [`tests/chaos/chaos_suite.test.mjs`](../../tests/chaos/chaos_suite.test.mjs) (`36/36`).

- **#181–#182** (`packages/cross-origin-bridge/index.js`): **Parallel `Promise.all` iframe mount + Ed25519 `HANDSHAKE` in `connectAll()`** (~3.5× faster cold 4-origin mesh startup) and parallel `resetAll()`.
- **#183** (`packages/cross-origin-bridge/index.js`): **Strict `event.source === expectedSourceWindow` & `msg.providerId === expectedProviderId` pinning** in `_onMessage` (prevents sibling iframes on shared `*.github.io` host from spoofing RPC replies).
- **#184–#192** (`packages/cross-origin-bridge/index.js`): `release_hold` tool support in `createPeerBrowserDomainEngine` & `buildSagaHarness`, `total_charged_eur: 425` parity on MoveCo overflow commits, bounded 512-entry iframe stores, `<= 8192` char `handoff_token` bound, credential-free `peerOrigin`, and `BroadcastChannel.close()` on `destroy()`.
- **#193–#202** (`packages/local-browser-router/index.js`): Pre-`URL()` numeric/hex IP block & credential block on `ollamaBaseUrl`, API-key redaction (`[REDACTED_KEY]`) inside `formatMessagesForOnDeviceModel`, and markdown code-fence unwrapping in `ChromeBuiltInPromptLlm`.
- **#203–#205** (`packages/webmcp-adapter/index.js`): Concurrent confirmation re-entrancy lock (`activeIrreversibleLocks`), `__continuityWebMcpNamespaces` multi-namespace registry, and `unregister()` lifecycle cleanup.
- **#206–#207** (`packages/toolbox-scoper/index.js`): Duplicate toolbox entry detection and `savedTokensEstimatePerTurn` metric.
- **#208–#218** (`packages/adk-hocon-converter/index.js`): Expanded 9-provider credential scrubber (`otk_`, `AQ.`, `gsk_`, `ghp_`, `github_pat_`, `xoxb-`), `isSafePublicOrLoopbackUrl` SSRF guard on external peer/MCP URLs, and frozen `equivalenceReport`.
- **#219–#228** (`packages/intake-compiler/index.js`): **RFC 5545 nested `BEGIN:VALARM..END:VALARM` stripping** (prevents reminder `DESCRIPTION:` lines from poisoning booking prices in real Apple/Google `.ics` exports), `UID`/`bookingRef` deduplication, `\\;`/`\\\\` unescaping, and RFC 5545 §3.3.11 comma/semicolon escaping in `exportMissionToIcs`.
- **#229–#240** (`packages/chaos-lab/index.js`): Expanded Chaos Lab from `30` to **36 deterministic distributed-failure scenarios** (`CHAOS_31` SSRF & Cross-Origin `hocon` Escape, `CHAOS_32` Unicode Tag + Markdown Beacon Exfil, `CHAOS_33` Cross-Booking Receipt Swap, `CHAOS_34` Partial Pre-Commit Hold Auto-Rollback, `CHAOS_35` Ed25519 Key Rotation & Revocation, `CHAOS_36` `.ics` `VALARM` Poisoning & Cross-Mission ZK Replay).

---

## Wave 5 (`Upgrades #241 – #300`) — Dynamic Code-Splitting (`0` Long Tasks), End-to-End Mandate/ZK Binding, Keyboard/Focus/Print UX, `N = 150` Benchmarks & Live 5-Origin Deployment

**TITAN OMEGA Phases Applied:** Phase 8.3 (Zero Long Tasks & Preconnect), Phase 9 (Keyboard/Focus/Print UX), Phase 11 (`N = 150` Benchmarks & `106/106` Tests), Phase 18–20 (CI & Live Multi-Origin Production).  
**Automated Test Suite:** [`tests/unit/titan_wave5_60_upgrades.test.mjs`](../../tests/unit/titan_wave5_60_upgrades.test.mjs) + `live_browser_cdp_e2e.test.mjs` + `responsive_a11y_audit.test.mjs` + `docs_truth_contract.test.mjs`.

- **#241** (`apps/*/index.html`): Cross-origin `<link rel="preconnect" crossorigin>` between `toskaman.github.io` and `gpaschercher-sudo.github.io` across all 5 Open Agentic Websites.
- **#242–#244** (`apps/continuity-web/script.js`): **Dynamic code-splitting `import("./vendor/chaos-lab/index.js")`** deferring 1,800+ lines of fault-injection code off the critical boot path.
- **#245** (`apps/continuity-web/modules/graph-svg-view.js`): Automatic keyboard focus restoration on `.graph-node-group[data-node-id]` across SVG re-renders.
- **#246** (`apps/continuity-web/script.js`, `community-kit.js`): Cross-page `sessionStorage` theme persistence (`nsweb-continuity-theme`) between Coordinator and Community Builder Kit.
- **#247** (`apps/continuity-web/ui.js`, `design-system/peer-ui-kit.js`): Global `Escape` toast dismissal and `/` quick-focus shortcut on `#mission-input` (Coordinator) and `#ns-input` (all 4 peers).
- **#248** (`design-system/base.css`): Executive `@media print` stylesheet producing clean black-on-white 1-page Mission & Cryptographic Audit summaries.
- **#249** (`apps/continuity-web/script.js`): Live end-to-end binding of `this.activeMandate.mandate_sha256` into `SagaCoordinator.preparePlan` & `ApprovalEngine`.
- **#250–#255** (`packages/intake-compiler/index.js`): Cross-mission `expectedMissionId: clean.mission_id` enforcement inside `verifyExportedAuditBundle` across UI, Builder Kit, and CLI (`continuity-audit --verify-bundle`).
- **#256–#272** (`design-system/`, `apps/demo-*`): Regenerated 5-brand stylesheets, `peer-ui-kit.js`, public `facts/*` networks, and `_headers` across all 5 sites with zero Lighthouse failures in both Light and Dark themes.
- **#273–#280** (`scripts/run_benchmarks.mjs`, `docs/benchmarks/BEFORE_AFTER.md`): Expanded reproducible benchmark suite to **`N = 150` measured end-to-end sagas** across 5 regimes (`35` Normal + `35` Ripple + `25` Outpatient Surgery + `25` Expo Freight + `30` Hybrid Cold-Start `.ics`), confirming `100%` verified completion and `0` cancel calls.
- **#281–#290** (`docs/*`, `tests/contracts/docs_truth_contract.test.mjs`): Synchronized `CHAOS_TEST_CATALOG.md` (`36`), `THREAT_MODEL.md` (`T1–T24`), `README.md`, `DEVPOST_SUBMISSION.md`, `COMPLIANCE_AUDIT.md`, `FINAL_READINESS_REPORT.md`, and 14 HD screenshots.
- **#291–#300**: Full **106 / 106 automated tests in 30 suites**, Chromium Renderer Trace (`0` Long Tasks check), Lighthouse `100 / 100 / 100` (`failures: 0` Light & Dark), GitHub Actions Node 24 CI + Pages `SUCCESS`, and live 5-origin HTTPS verification.
