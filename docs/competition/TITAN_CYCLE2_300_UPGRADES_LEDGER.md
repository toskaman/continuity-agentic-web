# CONTINUITY — TITAN OMEGA v3.0 Grand-Vision Cycle II Ledger (`300` New 1-to-1 Upgrades: `#301` – `#600`)

**Target Competition:** Cognizant Open Agentic Web Challenge (`https://cognizant-agenticweb.devpost.com/`, Deadline: Jan 11, 2027 @ 16:00 UTC)  
**Grand-Vision Objective:** Elevate CONTINUITY far beyond a hackathon demo into a foundational protocol, cryptographic verification layer, and developer/user platform for the Worldwide Agentic Web — guided between every wave by `prompt.txt` (`TITAN OMEGA v3.0` Phases 0–20).  
**Strict 1-to-1 Contract:** Every single entry `#301` through `#600` (`300` new upgrades, bringing the cumulative 1-to-1 verified total to **`600 / 600`**) is an individual, verifiable code/protocol/security/UX/CLI improvement enforced automatically in `tests/unit/titan_cycle2_waves9_14.test.mjs`.

---

## Wave 9 (`#301` – `#355`) — Official Issue #32 `engine.addCheck()` Runtime Safety Hooks, `@continuity/safety-hooks` (Luhn PAN & ISO 13616 Mod-97 IBAN Outbound DLP) & Post-Peer Turn-Taint Lock
*Guided by TITAN OMEGA Phases 1, 4, 7 & 10 + `cognizant-ai-labs/agentic-web` Issue #32 · Verified in [`tests/unit/titan_cycle2_waves9_14.test.mjs`](../../tests/unit/titan_cycle2_waves9_14.test.mjs).*

- **#301** (`skills/agentify-website/runtime/engine.js`): Initialize `this.safetyChecks = new Set()` on `Engine` instances.
- **#302** (`skills/agentify-website/runtime/engine.js`): Implement public `Engine.prototype.addCheck(check)` returning an `unsubscribe()` disposer (solves Cognizant Issue #32).
- **#303** (`skills/agentify-website/runtime/engine.js`): Implement `Engine.prototype.removeCheck(check)` explicit hook deregistration.
- **#304** (`skills/agentify-website/runtime/engine.js`): Implement `Engine.prototype._runSafetyHook(hookName, ...args)` sequential async hook dispatcher.
- **#305** (`skills/agentify-website/runtime/engine.js`): Implement `Engine.prototype._decideActionPolicy` monotonic `"allow" < "ask" < "refuse"` lattice evaluator.
- **#306** (`skills/agentify-website/runtime/engine.js`): Emit structured `safety_check` notes on `TraceBus` whenever `beforeAction` escalates or refuses.
- **#307** (`skills/agentify-website/runtime/engine.js`): Expose `runSafetyHook` & `decideActionPolicy` inside `_makeCtx` execution contexts.
- **#308** (`skills/agentify-website/runtime/engine.js`): Invoke `beforePeerRuns` in `resolveRemote` on freshly compiled partner networks (`cached: false`).
- **#309** (`skills/agentify-website/runtime/engine.js`): Invoke `beforePeerRuns` in `resolveRemote` on cached partner `Session` hits (`cached: true`).
- **#310** (`skills/agentify-website/runtime/engine.js`): Enforce `_decideActionPolicy` inside `submitActions` before executing CRUSE action proposals.
- **#311** (`skills/agentify-website/runtime/engine.js`): Initialize per-turn `peerAnswered: false` & `answeredPeers: new Set()` inside `runTurn` `composition`.
- **#312** (`skills/agentify-website/runtime/engine.js`): Invoke `beforePeerRequest(peerDescriptor, request, composition)` inside `Session.prototype.invoke` prior to peer execution.
- **#313** (`skills/agentify-website/runtime/engine.js`): Set `composition.peerAnswered = true`, record `answeredPeers`, and invoke `afterPeerAnswer` inside `Session.prototype.invoke`.
- **#314** (`skills/agentify-website/runtime/runner.js`): Call `ctx.decideActionPolicy` inside `dispatchToolCall` (`entry.kind === "website"`).
- **#315** (`skills/agentify-website/runtime/runner.js`): Fail closed with descriptive `Error` when `safetyVerdict === "refuse"` on a website action.
- **#316** (`skills/agentify-website/runtime/runner.js`): Upgrade `effect === "write"` website actions to require `confirmWebsiteActions` when `safetyVerdict === "ask"`.
- **#317** (`skills/agentify-website/runtime/runner.js`): Guard missing `confirmWebsiteActions` callback when a `write` action is dynamically escalated to `"ask"`.
- **#318** (`skills/agentify-website/runtime/runner.js`): Invoke `beforeMcpCall(mcpTarget, args, ctx.composition)` before `entry.client.callTool` in `runner.js`.
- **#319** (`skills/agentify-website/runtime/runner.js`): Mark `ctx.composition.peerAnswered = true` on third-party MCP responses and invoke `afterMcpAnswer`.
- **#320** (`packages/safety-hooks/package.json`): Publish zero-dependency Apache-2.0 package `@continuity/safety-hooks`.
- **#321** (`packages/safety-hooks/index.js`): Define frozen 35-country `IBAN_COUNTRY_LENGTHS` ISO 13616 length specification map.
- **#322** (`packages/safety-hooks/index.js`): Implement `matchesKnownCardPrefix` IIN & digit-length validator for Visa, Mastercard, Amex, Discover, and JCB.
- **#323** (`packages/safety-hooks/index.js`): Implement `isValidLuhnPan(rawDigits)` ISO/IEC 7812 Luhn checksum verifier rejecting uniform-digit strings & benign IDs.
- **#324** (`packages/safety-hooks/index.js`): Implement `detectLuhnPaymentCards(text)` boundary-aware scanner returning masked `4532••••••••0366` evidence only.
- **#325** (`packages/safety-hooks/index.js`): Implement `isValidMod97Iban(rawIban)` streaming ISO 13616 Mod-97-10 bank account checksum verifier.
- **#326** (`packages/safety-hooks/index.js`): Implement `detectValidIbans(text)` free-text IBAN extractor returning masked `DE89•••••••••••••••000` evidence.
- **#327** (`packages/safety-hooks/index.js`): Add `DLP-API-KEY` outbound secret rule (`sk-`, `otk_`, `AIza`, `AQ.`, `gsk_`, `ghp_`, `github_pat_`, `xoxb-`, `AKIA`, `rk_live_`, `sk_live_`, `Bearer`).
- **#328** (`packages/safety-hooks/index.js`): Add `DLP-JWT` outbound signed 3-part `eyJ...` JSON Web Token detector.
- **#329** (`packages/safety-hooks/index.js`): Add `DLP-PEM-KEY` outbound RSA/EC/OpenSSH/Encrypted PEM private key detector.
- **#330** (`packages/safety-hooks/index.js`): Add `DLP-SSN` outbound US Social Security Number format detector.
- **#331** (`packages/safety-hooks/index.js`): Implement bounded-depth (`<= 12`) recursive `collectPayloadStrings` walker over nested JSON objects/arrays.
- **#332** (`packages/safety-hooks/index.js`): Implement `scanOutboundPeerPayload(payload)` returning `deepFreezeJson` verdicts with masked evidence.
- **#333** (`packages/safety-hooks/index.js`): Implement `redactSensitiveText(rawText)` inline scrubber replacing Luhn PANs, Mod-97 IBANs, JWTs, SSNs, and keys.
- **#334** (`packages/safety-hooks/index.js`): Define `INBOUND_ANSWER_INJECTION_RE` catching partner prompt-injection overrides, `website_*` lures, and Markdown exfil beacons.
- **#335** (`packages/safety-hooks/index.js`): Implement `scanInboundPeerAnswer(answer)` returning frozen inbound taint diagnostics.
- **#336** (`packages/safety-hooks/index.js`): Implement bounded 256-entry `auditLog` ring buffer & `getAuditLog()` on `createOpenAgenticSafetyGuard`.
- **#337** (`packages/safety-hooks/index.js`): Implement `resetTurnState()` helper on `createOpenAgenticSafetyGuard`.
- **#338** (`packages/safety-hooks/index.js`): Wire `inspectPeerNetworkSafety` + `PeerTofuRegistry.verifyOrPin` inside `createOpenAgenticSafetyGuard.beforePeerRuns`.
- **#339** (`packages/safety-hooks/index.js`): Implement `onReconsentRequired` + `approveUpdatedPin` TOFU re-approval workflow inside `beforePeerRuns`.
- **#340** (`packages/safety-hooks/index.js`): Block outbound DLP violations inside `createOpenAgenticSafetyGuard.beforePeerRequest`.
- **#341** (`packages/safety-hooks/index.js`): Block outbound DLP violations on third-party MCP servers inside `createOpenAgenticSafetyGuard.beforeMcpCall`.
- **#342** (`packages/safety-hooks/index.js`): Track `suspiciousAnswerInTurn` inside `createOpenAgenticSafetyGuard.afterPeerAnswer`.
- **#343** (`packages/safety-hooks/index.js`): Track `suspiciousAnswerInTurn` on third-party MCP answers inside `createOpenAgenticSafetyGuard.afterMcpAnswer`.
- **#344** (`packages/safety-hooks/index.js`): Allow `effect: "read"` actions unconditionally in `createOpenAgenticSafetyGuard.beforeAction`.
- **#345** (`packages/safety-hooks/index.js`): Escalate post-peer `effect: "write"` actions to `"ask"` (visitor click) in `beforeAction` when `turn.peerAnswered === true`.
- **#346** (`packages/safety-hooks/index.js`): Refuse (`"refuse"`) post-peer `write` actions in `beforeAction` when `suspiciousAnswerInTurn === true`.
- **#347** (`scripts/build_all_networks.mjs`): Add `safety-hooks` to `PEER_VENDOR_PACKAGES` synced into all 4 peer websites.
- **#348** (`apps/continuity-web/site.js`): Replace legacy `resolveRemote` monkey-patch on Coordinator with `booted.engine.addCheck(AssistantMount.safetyGuard)`.
- **#349** (`design-system/peer-ui-kit.js`): Mount `engine.addCheck(engine.safetyGuard)` across MoveCo Express (`demo-moveco`).
- **#350** (`design-system/peer-ui-kit.js`): Mount `engine.addCheck(engine.safetyGuard)` across PermitFlow Civic Prep (`demo-permitflow`).
- **#351** (`design-system/peer-ui-kit.js`): Mount `engine.addCheck(engine.safetyGuard)` across HomeConnect Fiber (`demo-homeconnect`).
- **#352** (`design-system/peer-ui-kit.js`): Mount `engine.addCheck(engine.safetyGuard)` across PowerFlow Energy (`demo-powerflow`).
- **#353** (`skills/agentify-website/runtime/execution-stream.js`): Project `turn.safety_check` lifecycle events onto `engine.streamTurn()` async iterators.
- **#354** (`skills/agentify-website/runtime/execution-stream.js`): Bound `AsyncEventQueue.values` to `MAX_STREAM_QUEUE = 2048` events.
- **#355** (`skills/agentify-website/runtime/execution-stream.js`): Implement `AsyncEventQueue.prototype.return()` detaching `TraceBus` listener immediately on `for await` `break`.

---

## Wave 10 (`#356` – `#404`) — `@continuity/merkle-passport`: RFC 6962 Domain-Separated SHA-256 Merkle Mission Passports, Salted Selective-Disclosure Proofs, CPM Slack Engine & Federation Synthesizer
*Guided by TITAN OMEGA Phases 7, 8.2 & 10 · Verified in [`tests/unit/titan_cycle2_waves9_14.test.mjs`](../../tests/unit/titan_cycle2_waves9_14.test.mjs).*

- **#356** (`packages/merkle-passport/package.json`): Publish zero-dependency Apache-2.0 package `@continuity/merkle-passport`.
- **#357** (`packages/merkle-passport/index.js`): Define `continuity-merkle-passport/v1` & `continuity-selective-disclosure/v1` protocol identifiers.
- **#358** (`packages/merkle-passport/index.js`): Singleton `UTF8_ENCODER` + 256-entry `BYTE_TO_HEX` lookup table for sub-millisecond Merkle hashing.
- **#359** (`packages/merkle-passport/index.js`): Implement allocation-lean `bytesToHex` serializer.
- **#360** (`packages/merkle-passport/index.js`): Implement strict even-length `hexToBytes` parser rejecting non-hex input.
- **#361** (`packages/merkle-passport/index.js`): Implement WebCrypto CSPRNG 128-bit `randomSaltHex(16)` per-leaf privacy blinding generator.
- **#362** (`packages/merkle-passport/index.js`): Implement binary `sha256BytesHex` WebCrypto `SubtleCrypto.digest` wrapper.
- **#363** (`packages/merkle-passport/index.js`): Implement `largestPowerOfTwoLessThan(n)` exact RFC 6962 §2.1 subtree split (eliminates CVE-2012-2459 odd-leaf duplication).
- **#364** (`packages/merkle-passport/index.js`): Enforce 128..256-bit hex salt format in `hashSaltedMerkleLeaf`.
- **#365** (`packages/merkle-passport/index.js`): Canonicalize leaf payloads with RFC 8785 JCS & domain tag in `hashSaltedMerkleLeaf`.
- **#366** (`packages/merkle-passport/index.js`): Prepend `0x00` leaf domain-separation prefix byte in `hashSaltedMerkleLeaf`.
- **#367** (`packages/merkle-passport/index.js`): Enforce exact 32-byte left and right child digest lengths in `hashMerkleChildren`.
- **#368** (`packages/merkle-passport/index.js`): Prepend `0x01` interior-node domain-separation prefix byte (`0x01 || left32 || right32`) in `hashMerkleChildren`.
- **#369** (`packages/merkle-passport/index.js`): Handle RFC 6962 empty-tree `MTH([]) = SHA-256("")` base case in `computeMerkleRoot`.
- **#370** (`packages/merkle-passport/index.js`): Handle single-leaf `MTH([d_0]) = d_0` base case in `computeMerkleRoot`.
- **#371** (`packages/merkle-passport/index.js`): Recursively hash `k = largestPowerOfTwoLessThan(n)` left/right subtrees in `computeMerkleRoot`.
- **#372** (`packages/merkle-passport/index.js`): Validate `0 <= leafIndex < n` bounds in `buildMerkleInclusionPath`.
- **#373** (`packages/merkle-passport/index.js`): Emit `{ side: "right", hash }` sibling root when `leafIndex < k` in `buildMerkleInclusionPath`.
- **#374** (`packages/merkle-passport/index.js`): Emit `{ side: "left", hash }` sibling root when `leafIndex >= k` in `buildMerkleInclusionPath`.
- **#375** (`packages/merkle-passport/index.js`): Implement `expectedAuditSides(leafIndex, totalLeaves)` deterministic tree-geometry side sequence calculator.
- **#376** (`packages/merkle-passport/index.js`): Validate `totalLeaves` (`1..1024`), `leafIndex`, and 64-hex digests in `verifyMerkleInclusionPath`.
- **#377** (`packages/merkle-passport/index.js`): Reject audit-path truncation or extension attacks (`auditPath.length !== expectedSides.length`).
- **#378** (`packages/merkle-passport/index.js`): Reject left/right child-swap malleability (`step.side !== expectedSides[i]`) at every hop.
- **#379** (`packages/merkle-passport/index.js`): Constant-time `timingSafeEqualHex(current, expectedRootHex)` root comparison in `verifyMerkleInclusionPath`.
- **#380** (`packages/merkle-passport/index.js`): Guard empty mission graphs in `issueVerifiableMissionPassport`.
- **#381** (`packages/merkle-passport/index.js`): Compute JCS `receipt_payload_sha256` per committed operation leaf in `issueVerifiableMissionPassport`.
- **#382** (`packages/merkle-passport/index.js`): Assemble canonical baseline-vs-final commitment leaf descriptors in `issueVerifiableMissionPassport`.
- **#383** (`packages/merkle-passport/index.js`): Support deterministic `saltsByCommitment` overrides for reproducible test vectors.
- **#384** (`packages/merkle-passport/index.js`): Seal passport envelope with JCS `passport_sha256` and `deepFreezeJson`.
- **#385** (`packages/merkle-passport/index.js`): Validate passport scheme and target `commitmentId` existence in `createSelectiveDisclosureProof`.
- **#386** (`packages/merkle-passport/index.js`): Extract single-commitment proof with `blinded_siblings_count = totalLeaves - 1` (zero sibling fields included).
- **#387** (`packages/merkle-passport/index.js`): Support optional `includeBudgetProof` ZK hash-ladder attachment in `createSelectiveDisclosureProof`.
- **#388** (`packages/merkle-passport/index.js`): Seal selective presentation with JCS `presentation_sha256` and `deepFreezeJson`.
- **#389** (`packages/merkle-passport/index.js`): Sanitize untrusted presentation JSON via `sanitizeJson` at `verifySelectiveDisclosureProof` entry.
- **#390** (`packages/merkle-passport/index.js`): Verify `presentation_sha256` in constant time in `verifySelectiveDisclosureProof`.
- **#391** (`packages/merkle-passport/index.js`): Recompute `0x00` salted leaf digest and verify RFC 6962 inclusion path in `verifySelectiveDisclosureProof`.
- **#392** (`packages/merkle-passport/index.js`): Cross-verify `receipt_envelope.receipt_body` JCS digest against leaf `receipt_payload_sha256`.
- **#393** (`packages/merkle-passport/index.js`): Reject stripped `receipt_envelope` when leaf declares a non-null `receipt_payload_sha256`.
- **#394** (`packages/merkle-passport/index.js`): Verify Ed25519 provider receipt signature via `ReceiptVerifier` inside `verifySelectiveDisclosureProof`.
- **#395** (`packages/merkle-passport/index.js`): Verify attached ZK budget attestation with `expectedMissionId: clean.mission_id` binding.
- **#396** (`packages/merkle-passport/index.js`): Traverse `graph.topologicalOrder()` in `analyzeCriticalPathSlack`.
- **#397** (`packages/merkle-passport/index.js`): Isolate anchor-reachable commitments from untouched static commitments in `analyzeCriticalPathSlack`.
- **#398** (`packages/merkle-passport/index.js`): Compute negative-offset lead bounds for upstream `ON_OR_BEFORE` prerequisites (e.g. pre-op lab before surgery).
- **#399** (`packages/merkle-passport/index.js`): Compute forward pass `earliestOffsetDays` across `SAME_DAY_REQUIRED` and `ON_OR_AFTER` edges.
- **#400** (`packages/merkle-passport/index.js`): Compute backward pass `latestOffsetDays` & `maxBound` deadline propagation.
- **#401** (`packages/merkle-passport/index.js`): Emit exact per-node `slackDays`, `isCriticalPath` (`0d` slack), `criticalPathNodeIds`, and `scheduleSpanDays`.
- **#402** (`packages/merkle-passport/index.js`): Extract origin & partner network URL in `synthesizePeerFederationConfig`.
- **#403** (`packages/merkle-passport/index.js`): Auto-include `facts/<network>_facts` 1-turn fast-path URL when `MVP-FACTS` passes in `synthesizePeerFederationConfig`.
- **#404** (`packages/merkle-passport/index.js`): Emit ready-to-paste `allowed_peers` patch, HOCON `tools`/`link_labels`, and `engine.addCheck()` TOFU snippet.

---

## Wave 11 (`#405` – `#460`) — Interactive Before→After CPM Gantt Strip, Selective-Disclosure Passport Tab, `Ctrl+K` Command Palette, Progressive Voice Dictation & Runtime Core Hardenings
*Guided by TITAN OMEGA Phases 6, 9 & 12 · Verified in [`tests/unit/titan_cycle2_waves9_14.test.mjs`](../../tests/unit/titan_cycle2_waves9_14.test.mjs).*

- **#405** (`apps/continuity-web/modules/schedule-gantt-view.js`): Create `renderScheduleGanttView` computing live CPM slack over active `MissionGraph`.
- **#406** (`apps/continuity-web/modules/schedule-gantt-view.js`): Compute baseline-vs-projected/prepared/committed date delta per commitment row.
- **#407** (`apps/continuity-web/modules/schedule-gantt-view.js`): Render `⚡ Critical · 0d slack` badge for zero-float critical-path commitments.
- **#408** (`apps/continuity-web/modules/schedule-gantt-view.js`): Render `+Nd float` badge for positive-slack commitments (e.g. HomeConnect Fiber `+1d float`).
- **#409** (`apps/continuity-web/modules/schedule-gantt-view.js`): Render `🛡 Untouched` badge for out-of-scope protected commitments.
- **#410** (`apps/continuity-web/modules/schedule-gantt-view.js`): Expose `aria-pressed` state on `.gantt-row` buttons synchronized with `selectedNodeId`.
- **#411** (`apps/continuity-web/modules/schedule-gantt-view.js`): Wire `.gantt-row` click handler to select & inspect the corresponding node in `#mission-graph-svg`.
- **#412** (`apps/continuity-web/modules/schedule-gantt-view.js`): Render critical-node count and `scheduleSpanDays` summary in `.gantt-head`.
- **#413** (`apps/continuity-web/index.html`): Mount `#schedule-gantt-strip` landmark region inside `#mission` graph panel.
- **#414** (`apps/continuity-web/index.html`): Add `#cmd-palette-open-btn` (`Quick actions Ctrl K`) trigger in site header.
- **#415** (`apps/continuity-web/index.html`): Add accessible `<dialog id="cmd-palette-dialog">` modal with `#cmd-palette-search` & `#cmd-palette-list`.
- **#416** (`apps/continuity-web/ui.js`): Define 11 instant `QUICK_COMMANDS` covering scenarios, Ripple recovery, Merkle Passport, Chaos Lab, Spec Auditor & theme toggle.
- **#417** (`apps/continuity-web/ui.js`): Implement live case-insensitive substring filtering in `renderCmdPalette(filterText)`.
- **#418** (`apps/continuity-web/ui.js`): Bind global `Ctrl+K` / `Meta+K` keyboard shortcut toggling `#cmd-palette-dialog`.
- **#419** (`apps/continuity-web/ui.js`): Bind `#cmd-palette-open-btn` and `#cmd-palette-close-btn` modal lifecycle controls.
- **#420** (`apps/continuity-web/index.html`): Add progressive-enhancement `#voice-dictate-btn` (`hidden` by default when unsupported) next to `#mission-input`.
- **#421** (`apps/continuity-web/script.js`): Detect `SpeechRecognition || webkitSpeechRecognition` and unhide `#voice-dictate-btn` only on supporting browsers.
- **#422** (`apps/continuity-web/script.js`): Transcribe spoken schedule changes into `#mission-input` and trigger `analyzeAndPrepareChange` automatically.
- **#423** (`apps/continuity-web/script.js`): Cleanly handle `SpeechRecognition` `onend`, `onerror`, and toggle-stop states on `#voice-dictate-btn`.
- **#424** (`apps/continuity-web/index.html`): Add `#tab-btn-passport` (`Merkle passport`) WAI-ARIA tab to Trust Center tablist.
- **#425** (`apps/continuity-web/index.html`): Add `#tab-panel-passport` panel with `#passport-commitment-select`, `#passport-generate-btn`, `#passport-verify-btn`, `#passport-tamper-btn`, and `#passport-download-btn`.
- **#426** (`apps/continuity-web/script.js`): Initialize and reset `lastPassport` & `lastSelectiveProof` in `constructor` and `resetMission`.
- **#427** (`apps/continuity-web/script.js`): Implement `populatePassportCommitmentSelect` dynamically syncing options with active scenario/imported commitments.
- **#428** (`apps/continuity-web/script.js`): Implement `generateSelectivePassportProof` using lazy `import("./vendor/merkle-passport/index.js")`.
- **#429** (`apps/continuity-web/script.js`): Implement `verifyCurrentSelectiveProof` reporting RFC 6962 root, blinded sibling count, Ed25519 & ZK status.
- **#430** (`apps/continuity-web/script.js`): Implement `simulateSelectiveProofTamper` demonstrating 1-field date forgery detection on `#passport-status-banner`.
- **#431** (`apps/continuity-web/script.js`): Wire `#passport-download-btn` exporting `${mission_id}-${commitment_id}-selective-proof.json`.
- **#432** (`apps/continuity-web/script.js`): Auto-generate default selective proof when `#tab-btn-passport` is opened for the first time.
- **#433** (`apps/continuity-web/script.js`): Include live `criticalPathSummary` inside `ContinuityCoordinatorPage.prototype.getState()` for `website_*` & WebMCP tools.
- **#434** (`apps/continuity-web/site.js`): Add zero-key `ContinuityScriptedReplayLlm` intent emitting a live CRUSE `cpm_slack_table` widget for Critical-Path queries.
- **#435** (`apps/continuity-web/index.html`): Add `Critical-path slack` 1-click prompt chip in `#assistant` suggested prompts bar.
- **#436** (`apps/continuity-web/modules/trust-tables-view.js`): Render 1-click `Copy federation HOCON` (`[data-copy-federation]`) button on every audited site in `#auditor-tbody`.
- **#437** (`apps/continuity-web/modules/trust-tables-view.js`): Synthesize & copy/download HOCON `tools` + `link_labels` + `engine.addCheck()` snippet on `[data-copy-federation]` click.
- **#438** (`packages/intake-compiler/index.js`): Compute RFC 6962 `merkle_operations_root_sha256` inside `exportVerifiableAuditBundle` (5th cryptographic primitive in Audit Bundle).
- **#439** (`packages/intake-compiler/index.js`): Recompute and enforce `merkleOperationsRootValid` inside `verifyExportedAuditBundle`.
- **#440** (`skills/agentify-website/runtime/hocon.js`): Block `__proto__`, `prototype`, and `constructor` keys (`FORBIDDEN_HOCON_KEYS`) in `HoconParser.parseObjectBody`.
- **#441** (`skills/agentify-website/runtime/hocon.js`): Block `FORBIDDEN_HOCON_KEYS` in `deepMerge` closing prototype-pollution via untrusted peer HOCON merges.
- **#442** (`skills/agentify-website/runtime/hocon.js`): Enforce `512 KB` (`MAX_HOCON_CHARS = 524_288`) input size cap in `parseHocon`.
- **#443** (`skills/agentify-website/runtime/hocon.js`): Enforce `MAX_HOCON_DEPTH = 32` nesting guard in `HoconParser.parseObject` and `parseArray`.
- **#444** (`skills/agentify-website/runtime/hocon.js`): Validate 4-digit hex `\uXXXX` escapes in `HoconParser.parseQuotedString` preventing `NaN -> \u0000` injection.
- **#445** (`skills/agentify-website/runtime/hocon.js`): Enforce `Object.prototype` / `null` prototype check in `hocon.isPlainObject`.
- **#446** (`skills/agentify-website/runtime/kernel.js`): Freeze `ChatMessageType` enum with `Object.freeze`.
- **#447** (`skills/agentify-website/runtime/kernel.js`): Strip `FORBIDDEN_SLY_KEYS` (`__proto__`, `prototype`, `constructor`) on wildcard `"*"` `filterSlyData` copies.
- **#448** (`skills/agentify-website/runtime/kernel.js`): Use `Object.hasOwn` and `FORBIDDEN_SLY_KEYS` on explicit key allowlists in `filterSlyData`.
- **#449** (`skills/agentify-website/runtime/cruse.js`): Enforce `Object.prototype` / `null` prototype check in `cruse.js` `object(v)` helper.
- **#450** (`skills/agentify-website/runtime/cruse.js`): Enforce `MAX_CRUSE_DEPTH = 16` recursion guard in `cruse.js` `canonical(value)`.
- **#451** (`skills/agentify-website/runtime/cruse.js`): Cap `normalizePresentation` candidate list to `MAX_CRUSE_COMPONENTS = 24` widgets per turn.
- **#452** (`skills/agentify-website/runtime/turn-control.js`): Bound `TurnControl.steer` queue depth to `MAX_STEER_QUEUE = 16` pending inputs.
- **#453** (`skills/agentify-website/runtime/turn-control.js`): Clamp `TurnControl.steer` text length to `MAX_STEER_CHARS = 8192` chars.
- **#454** (`skills/agentify-website/runtime/provider-error.js`): Scrub accidental `?key=` / `?api_key=` / `?token=` query parameters from `routerUrl` before formatting `ProviderError` messages.
- **#455** (`skills/agentify-website/runtime/provider-error.js`): Add Mozilla Otari (`otk_` US/EU routing) troubleshooting guidance in `ProviderError.friendly`.
- **#456** (`skills/agentify-website/runtime/provider-error.js`): Add Google AI Studio (`/v1beta/openai` + `AIza`/`AQ.`) troubleshooting guidance in `ProviderError.friendly`.
- **#457** (`apps/demo-moveco/ui.js`): Add interactive `Release (€0)` (`[data-peer-release]`) button inside active hold banner on MoveCo Express.
- **#458** (`apps/demo-permitflow/ui.js`): Add interactive `Clear preview` (`[data-peer-release]`) button inside staged preview banner on PermitFlow Civic Prep.
- **#459** (`apps/demo-homeconnect/ui.js`): Add interactive `Release (€0)` (`[data-peer-release]`) button inside active hold banner on HomeConnect Fiber.
- **#460** (`apps/demo-powerflow/ui.js`): Add interactive `Clear staged` (`[data-peer-release]`) button inside staged date banner on PowerFlow Energy.

---

## Wave 12 (`#461` – `#505`) — Community Builder Kit v3 (`8` Interactive Tools, `8` WebMCP Tools, `26` Modules) & `continuity-audit v2.2.0` (`--verify-passport`, `--scan-dlp`)
*Guided by TITAN OMEGA Phases 13–15 · Verified in [`tests/unit/titan_cycle2_waves9_14.test.mjs`](../../tests/unit/titan_cycle2_waves9_14.test.mjs) & [`tests/integration/live_browser_cdp_e2e.test.mjs`](../../tests/integration/live_browser_cdp_e2e.test.mjs).*

- **#461** (`apps/continuity-web/community-kit.html`): Add `#safety-hooks-tool`, `#passport-fed-tool`, and `26 Modules` links to Community Builder Kit header nav.
- **#462** (`apps/continuity-web/community-kit.html`): Update Builder Kit hero spec pill to `WebMCP · 8 builder tools` and `26 zero-dependency ES modules`.
- **#463** (`apps/continuity-web/community-kit.html`): Add Tool 7 `#safety-hooks-tool` section (`Runtime engine.addCheck() Safety Hooks & Luhn / IBAN Outbound DLP`).
- **#464** (`apps/continuity-web/community-kit.html`): Add `#kit-dlp-clean-btn`, `#kit-dlp-attack-btn`, `#kit-dlp-scan-btn`, and `#kit-dlp-copy-hook-btn` controls.
- **#465** (`apps/continuity-web/community-kit.html`): Add accessible `<label for="kit-dlp-input">` & `<label for="kit-dlp-out">` code panels in Tool 7.
- **#466** (`apps/continuity-web/community-kit.html`): Add Tool 8 `#passport-fed-tool` section (`RFC 6962 Selective-Disclosure Merkle Proof Generator & Verifier`).
- **#467** (`apps/continuity-web/community-kit.html`): Add `#kit-merkle-sample-btn`, `#kit-merkle-tamper-btn`, `#kit-merkle-verify-btn`, and `#kit-merkle-json` controls.
- **#468** (`apps/continuity-web/community-kit.html`): Update `#mods-heading` to `26 Zero-Dependency @continuity/* Community Modules`.
- **#469** (`apps/continuity-web/community-kit.js`): Import `@continuity/safety-hooks` (`createOpenAgenticSafetyGuard`, `scanInboundPeerAnswer`, `scanOutboundPeerPayload`).
- **#470** (`apps/continuity-web/community-kit.js`): Import `@continuity/merkle-passport` (`issueVerifiableMissionPassport`, `createSelectiveDisclosureProof`, `verifySelectiveDisclosureProof`).
- **#471** (`apps/continuity-web/community-kit.js`): Add `@continuity/safety-hooks` row to `COMMUNITY_MODULES` catalog.
- **#472** (`apps/continuity-web/community-kit.js`): Add `@continuity/merkle-passport` row to `COMMUNITY_MODULES` catalog (`26` modules total).
- **#473** (`apps/continuity-web/community-kit.js`): Update `@continuity/chaos-lab` catalog entry to `42` deterministic scenarios.
- **#474** (`apps/continuity-web/community-kit.js`): Define `SAFE_DLP_SAMPLE` benign relocation request (`MC-8841`, `PRM-7510299481`) for Tool 7.
- **#475** (`apps/continuity-web/community-kit.js`): Define `ATTACK_DLP_SAMPLE` combining Luhn Visa PAN, German Mod-97 IBAN, Otari key, and inbound prompt injection.
- **#476** (`apps/continuity-web/community-kit.js`): Implement `runDlpSim()` evaluating `beforePeerRequest`, `afterPeerAnswer`, and `beforeAction` live in the browser.
- **#477** (`apps/continuity-web/community-kit.js`): Bind `#kit-dlp-clean-btn`, `#kit-dlp-attack-btn`, and `#kit-dlp-scan-btn` event handlers.
- **#478** (`apps/continuity-web/community-kit.js`): Bind `#kit-dlp-copy-hook-btn` copying/downloading drop-in `engine.addCheck(createOpenAgenticSafetyGuard())` code.
- **#479** (`apps/continuity-web/community-kit.js`): Implement `buildSampleSelectiveProof()` generating a live Ed25519-signed 1-of-6 RFC 6962 Merkle presentation.
- **#480** (`apps/continuity-web/community-kit.js`): Implement `runVerifyMerkle(rawText)` verifying pasted or generated selective-disclosure proofs in Tool 8.
- **#481** (`apps/continuity-web/community-kit.js`): Bind `#kit-merkle-sample-btn` auto-populating & verifying a fresh 1-of-6 presentation.
- **#482** (`apps/continuity-web/community-kit.js`): Bind `#kit-merkle-tamper-btn` mutating `final_date` to demonstrate instant RFC 6962 root & JCS mismatch detection.
- **#483** (`apps/continuity-web/community-kit.js`): Bind `#kit-merkle-verify-btn` for arbitrary pasted `continuity-selective-disclosure/v1` JSON.
- **#484** (`apps/continuity-web/community-kit.js`): Register WebMCP tool #7 `continuity_kit_scan_outbound_safety_dlp` on `navigator.modelContext` & `document.modelContext`.
- **#485** (`apps/continuity-web/community-kit.js`): Register WebMCP tool #8 `continuity_kit_verify_selective_merkle_proof` on `navigator.modelContext` & `document.modelContext`.
- **#486** (`packages/nanda-resolver/cli.mjs`): Bump `CLI_VERSION` to `"2.2.0"`.
- **#487** (`packages/nanda-resolver/cli.mjs`): Import `verifySelectiveDisclosureProof` & `scanOutboundPeerPayload` into `continuity-audit` CLI.
- **#488** (`packages/nanda-resolver/cli.mjs`): Document `--verify-passport <path>` and `--scan-dlp <text-or-json>` in `HELP_TEXT`.
- **#489** (`packages/nanda-resolver/cli.mjs`): Parse `--scan-dlp` CLI flag and run `scanOutboundPeerPayload`.
- **#490** (`packages/nanda-resolver/cli.mjs`): Emit masked human-readable or `--json` DLP report with exit code `0` (clean) / `1` (blocked).
- **#491** (`packages/nanda-resolver/cli.mjs`): Parse `--verify-passport <path>` CLI flag with missing-argument validation (`exit 1`).
- **#492** (`packages/nanda-resolver/cli.mjs`): Verify RFC 6962 Selective-Disclosure Merkle JSON files offline via `--verify-passport` (`--json` & text modes).
- **#493** (`apps/demo-moveco/ui.js`): Add 1-click `↓ .ics` (`[data-peer-ics]`) calendar download button in MoveCo booking card footer.
- **#494** (`apps/demo-moveco/ui.js`): Bind `URL.createObjectURL` + `URL.revokeObjectURL` `.ics` download handler on MoveCo (`MC-8841.ics`).
- **#495** (`apps/demo-permitflow/ui.js`): Add 1-click `↓ .ics` (`[data-peer-ics]`) calendar download button in PermitFlow dossier card footer.
- **#496** (`apps/demo-permitflow/ui.js`): Bind `.ics` download handler on PermitFlow (`PF-2049.ics`).
- **#497** (`apps/demo-homeconnect/ui.js`): Add 1-click `↓ .ics` (`[data-peer-ics]`) calendar download button in HomeConnect appointment card footer.
- **#498** (`apps/demo-homeconnect/ui.js`): Bind `.ics` download handler on HomeConnect (`HC-5510.ics`).
- **#499** (`apps/demo-powerflow/ui.js`): Add 1-click `↓ .ics` (`[data-peer-ics]`) calendar download button in PowerFlow activation card footer.
- **#500** (`apps/demo-powerflow/ui.js`): Bind `.ics` download handler on PowerFlow (`PFW-9921.ics`).

---

## Wave 13 (`#501` – `#550`) — 42-Scenario Chaos Lab (`CHAOS_37`–`CHAOS_42`), 7-Language NL Compiler (EN/FR/ES/DE/IT/PT/NL) & `N = 180` Benchmarks + Crypto/DLP Micro-Benchmarks
*Guided by TITAN OMEGA Phases 8, 10, 11 & 16 · Verified in [`tests/chaos/chaos_suite.test.mjs`](../../tests/chaos/chaos_suite.test.mjs) & [`tests/unit/titan_cycle2_waves9_14.test.mjs`](../../tests/unit/titan_cycle2_waves9_14.test.mjs).*

- **#501** (`packages/chaos-lab/index.js`): Import `@continuity/safety-hooks` primitives into `@continuity/chaos-lab`.
- **#502** (`packages/chaos-lab/index.js`): Import `@continuity/merkle-passport` primitives into `@continuity/chaos-lab`.
- **#503** (`packages/chaos-lab/index.js`): Add `CHAOS_37_LUHN_CARD_AND_MOD97_IBAN_OUTBOUND_DLP_BLOCKED` testing benign refs vs Visa PAN & German IBAN.
- **#504** (`packages/chaos-lab/index.js`): Verify `isValidLuhnPan` & `isValidMod97Iban` exact checksum discrimination inside `CHAOS_37`.
- **#505** (`packages/chaos-lab/index.js`): Add `CHAOS_38_POST_PEER_TAINT_ESCALATES_SILENT_WRITE_ACTION` testing clean-peer `"ask"` vs injected-peer `"refuse"`.
- **#506** (`packages/chaos-lab/index.js`): Verify `effect: "read"` remains `"allow"` after peer contact inside `CHAOS_38`.
- **#507** (`packages/chaos-lab/index.js`): Add `CHAOS_39_RFC6962_MERKLE_SECOND_PREIMAGE_ATTACK_BLOCKED` testing swapped sibling side & truncated audit path.
- **#508** (`packages/chaos-lab/index.js`): Add `CHAOS_40_SELECTIVE_DISCLOSURE_MERKLE_PROOF_BLINDS_SIBLINGS` verifying 1-of-6 Ed25519 proof & zero sibling string leaks.
- **#509** (`packages/chaos-lab/index.js`): Add `CHAOS_41_RUNTIME_ADDCHECK_BEFORE_PEER_RUNS_BLOCKS_TROJAN` testing `beforePeerRuns` firewall rejection.
- **#510** (`packages/chaos-lab/index.js`): Add `CHAOS_42_CRITICAL_PATH_ZERO_SLACK_BOTTLENECK_DETECTION` verifying `0d` critical path vs `+1d` float & untouched nodes.
- **#511** (`tests/chaos/chaos_suite.test.mjs`): Enforce `CHAOS_SCENARIOS.length === 42` and `42/42` pass invariant in `chaos_suite.test.mjs`.
- **#512** (`packages/mission-core/index.js`): Add Italian weekday normalization (`lunedì`, `martedì`, `mercoledì`, `giovedì`, `venerdì`, `sabato`, `domenica`).
- **#513** (`packages/mission-core/index.js`): Add Portuguese weekday normalization (`segunda-feira`..`sexta-feira`, `sábado`, `domingo`).
- **#514** (`packages/mission-core/index.js`): Add Dutch weekday normalization (`maandag`, `dinsdag`, `woensdag`, `donderdag`, `vrijdag`, `zaterdag`, `zondag`).
- **#515** (`packages/mission-core/index.js`): Add Italian/Portuguese/Dutch target prepositions (`per`, `para`, `naar`) in `compileMissionChange`.
- **#516** (`packages/mission-core/index.js`): Add Italian (`sotto`), Portuguese (`abaixo de`), and Dutch (`onder`) budget cap normalization.
- **#517** (`packages/mission-core/index.js`): Support English `"within €N"` and `"at most €N"` natural budget cap phrasing.
- **#518** (`packages/mission-core/index.js`): Support `"pull forward by N days"` negative relative date-shift phrasing.
- **#519** (`scripts/run_benchmarks.mjs`): Increase `SAMPLES` per primary live HTTP regime from `35` to `40` (`80` live 5-origin HTTP sagas).
- **#520** (`scripts/run_benchmarks.mjs`): Increase `outpatient_surgery` multi-domain benchmark runs from `25` to `30`.
- **#521** (`scripts/run_benchmarks.mjs`): Increase `product_launch_expo` freight benchmark runs from `25` to `30`.
- **#522** (`scripts/run_benchmarks.mjs`): Increase `hybridIcsRuns` Cold-Start Agentic+Legacy `.ics` benchmark runs from `30` to `40` (`N = 180` total sagas).
- **#523** (`scripts/run_benchmarks.mjs`): Add `N = 100` micro-benchmark loop for `issueVerifiableMissionPassport` + `createSelectiveDisclosureProof` + `verifySelectiveDisclosureProof`.
- **#524** (`scripts/run_benchmarks.mjs`): Add `N = 100` micro-benchmark loop for `scanOutboundPeerPayload` (Luhn PAN + Mod-97 IBAN + Secret DLP).
- **#525** (`scripts/run_benchmarks.mjs`): Add `N = 100` micro-benchmark loop for `analyzeCriticalPathSlack` forward/backward CPM pass.
- **#526** (`scripts/run_benchmarks.mjs`): Compute `medianMs` and `p95Ms` statistics (`statArr`) across all 3 new cryptographic/safety primitives.
- **#527** (`scripts/run_benchmarks.mjs`): Persist `cryptoAndSafetyMicroBenchmarks` into `docs/benchmarks/benchmark_results.json`.
- **#528** (`scripts/run_benchmarks.mjs`): Emit Section 4 markdown table (`Cryptographic & Runtime Safety Micro-Benchmarks`) into `docs/benchmarks/BEFORE_AFTER.md`.
- **#529** (`design-system/themes/continuity-web.css`): Style `.gantt-strip`, `.gantt-head`, and `.gantt-list` using theme-adaptive surface tokens.
- **#530** (`design-system/themes/continuity-web.css`): Style `.gantt-row` 3-column grid & `.is-selected` accent ring without offscreen transition contrast lag.
- **#531** (`design-system/themes/continuity-web.css`): Style `.slack-pill` semantic badges (`.slack-crit`, `.slack-float`, `.slack-safe`) with WCAG AA contrast in Light & Dark themes.
- **#532** (`design-system/themes/continuity-web.css`): Add `@media (max-width: 680px)` responsive single-column collapse for `.gantt-row` (`0` mobile horizontal overflow).
- **#533** (`design-system/themes/continuity-web.css`): Style `.top-actions kbd` shortcut badge for `#cmd-palette-open-btn`.
- **#534** (`design-system/themes/continuity-web.css`): Style `.cmd-palette-dialog` & `::backdrop` modal overlay for Light & Dark themes.
- **#535** (`design-system/themes/continuity-web.css`): Style `.cmd-palette-item` + `:hover` / `:focus-visible` high-contrast keyboard focus states.
- **#536** (`apps/continuity-web/index.html`): Synchronize hero Before/After proof fact to `0 cancel calls in 180 benchmark runs`.
- **#537** (`apps/continuity-web/index.html`): Synchronize Trust Center Chaos Lab tile & `#run-chaos-suite-btn` to `42` failure scenarios.
- **#538** (`docs/CHAOS_TEST_CATALOG.md`): Document `CHAOS_37` through `CHAOS_42` in the Chaos Test Catalog (`42` scenarios).
- **#539** (`docs/security/THREAT_MODEL.md`): Document `T25` (Outbound Luhn/IBAN DLP), `T26` (Post-Peer Taint Lock), `T27` (RFC 6962 Second-Preimage), and `T28` (Selective Sibling Blinding).
- **#540** (`scripts/capture_screenshots.mjs`): Update architecture SVG diagram (`00_architecture_diagram.svg`) with `@continuity/safety-hooks`, `@continuity/merkle-passport`, and `42/42` Chaos Lab.
- **#541** (`tests/integration/live_browser_cdp_e2e.test.mjs`): Upgrade Chromium E2E assertion to verify `42 / 42` Chaos scenarios pass in browser.
- **#542** (`tests/integration/live_browser_cdp_e2e.test.mjs`): Upgrade Chromium E2E assertion on `community-kit.html` to verify `26` module rows and `8` WebMCP tools.
- **#543** (`tests/contracts/docs_truth_contract.test.mjs`): Enforce `26` packages, `42` Chaos scenarios, `180` benchmark runs, `8` Builder Kit tools, `CHAOS_42`, and `T28` across docs & HTML.
- **#544** (`README.md`): Document `@continuity/safety-hooks`, `@continuity/merkle-passport`, `42` Chaos scenarios, and `26` open-source packages.
- **#545** (`docs/submission/DEVPOST_SUBMISSION.md`): Synchronize `26` modules, `42` Chaos scenarios, `180` benchmark sagas, and `117` automated tests.
- **#546** (`docs/architecture/ARCHITECTURE.md`): Add `@continuity/safety-hooks` (#25) and `@continuity/merkle-passport` (#26) to system architecture reference.
- **#547** (`docs/submission/PITCH_AND_JUDGE_QA_DECK.md`): Update judge Q&A deck with Issue #32 `engine.addCheck()` hooks and RFC 6962 Selective-Disclosure Merkle Passports.
- **#548** (`docs/competition/COMPLIANCE_AUDIT.md`): Update Stage Two rubric evidence with `8-tool` Builder Kit, `26` Apache-2.0 modules, and `N = 180` sagas.
- **#549** (`docs/competition/FINAL_READINESS_REPORT.md`): Update internal readiness & red-team matrices to `117` tests, `42` Chaos scenarios, `26` modules, and `N = 180`.
- **#550** (`tests/unit/titan_wave6_7_8_upgrades.test.mjs`): Update cumulative 1-to-1 ledger assertion to verify all `600` distinct upgrades (`#001`–`#600`).

---

## Wave 14 (`#551` – `#600`) — Deep Protocol Invariants, Cross-Package Determinism Guards & Comprehensive Cycle II Verification Suite
*Guided by TITAN OMEGA Phases 17–20 · Verified in [`tests/unit/titan_cycle2_waves9_14.test.mjs`](../../tests/unit/titan_cycle2_waves9_14.test.mjs).*

- **#551** (`packages/merkle-passport/index.js`): Export `PASSPORT_SCHEME` & `PROOF_SCHEME` constants for external verifiers.
- **#552** (`packages/merkle-passport/index.js`): Reject negative or non-integer `leafIndex` in `verifyMerkleInclusionPath`.
- **#553** (`packages/merkle-passport/index.js`): Reject `totalLeaves > 1024` bounded DoS guard in `verifyMerkleInclusionPath`.
- **#554** (`packages/merkle-passport/index.js`): Enforce lowercase canonical hex normalization on single-leaf `computeMerkleRoot`.
- **#555** (`packages/merkle-passport/index.js`): Preserve `window` & `provider_name` from signed `receipt_body` when committed in `issueVerifiableMissionPassport`.
- **#556** (`packages/merkle-passport/index.js`): Redact all `N - 1` sibling salts and `receipt_envelope` objects inside `createSelectiveDisclosureProof`.
- **#557** (`packages/merkle-passport/index.js`): Support caller-supplied `trustedProviderKeys` override taking precedence over `demo_provider_public_key` in `verifySelectiveDisclosureProof`.
- **#558** (`packages/merkle-passport/index.js`): Handle empty `MissionGraph` (`0` nodes) gracefully in `analyzeCriticalPathSlack` returning frozen empty report.
- **#559** (`packages/merkle-passport/index.js`): Ignore `ALTERNATIVE_PROVIDER` & `COMPENSATION_LINK` non-temporal edges during CPM reachability & forward/backward passes.
- **#560** (`packages/merkle-passport/index.js`): Clamp `latestOffsetDays >= earliestOffsetDays` preventing negative float under tight deadline caps in `analyzeCriticalPathSlack`.
- **#561** (`packages/safety-hooks/index.js`): Reject card strings shorter than 13 digits or longer than 19 digits in `isValidLuhnPan`.
- **#562** (`packages/safety-hooks/index.js`): Reject all-zero or repeated-digit (`1111111111111111`) strings in `isValidLuhnPan`.
- **#563** (`packages/safety-hooks/index.js`): Enforce non-alphanumeric word boundaries around candidate PAN sequences in `detectLuhnPaymentCards`.
- **#564** (`packages/safety-hooks/index.js`): Enforce `15..34` char ISO 13616 fallback length bounds for unlisted country codes in `isValidMod97Iban`.
- **#565** (`packages/safety-hooks/index.js`): Support both spaced (`DE89 3704 ...`) and compact (`DE893704...`) IBAN formats in `detectValidIbans`.
- **#566** (`packages/safety-hooks/index.js`): Mask middle digits of detected PANs (`••••`) and IBANs so `scanOutboundPeerPayload` never retains plaintext PII in memory logs.
- **#567** (`packages/safety-hooks/index.js`): Skip outbound MCP DLP checks when `target.thirdParty === false` (same-origin local MCP routes).
- **#568** (`packages/safety-hooks/index.js`): Support configurable `escalateWriteAfterPeer: false` opt-out in `createOpenAgenticSafetyGuard`.
- **#569** (`packages/safety-hooks/index.js`): Support configurable `refuseWriteAfterSuspiciousAnswer: false` opt-out in `createOpenAgenticSafetyGuard`.
- **#570** (`packages/safety-hooks/index.js`): Reset `suspiciousAnswerInTurn = false` at start of `beforePeerRuns` for clean turn isolation.
- **#571** (`skills/agentify-website/runtime/engine.js`): Validate `addCheck` argument is a non-null object (`throw new Error("engine.addCheck requires a hook object.")`).
- **#572** (`skills/agentify-website/runtime/engine.js`): Ignore unknown return values from `beforeAction` while honoring `"allow"`, `"ask"`, and `"refuse"`.
- **#573** (`skills/agentify-website/runtime/engine.js`): Pass `answeredPeers` array snapshot and `remoteCalls` count inside `turnInfo` to `beforeAction`.
- **#574** (`skills/agentify-website/runtime/engine.js`): Retain `_lastTurnComposition` on `Engine` so post-turn CRUSE `submitActions` clicks inherit `peerAnswered` taint state.
- **#575** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 9 unit test verifying `Engine.prototype.addCheck` / `removeCheck` lifecycle, `beforePeerRuns` block, `beforePeerRequest` Luhn/IBAN block, and `beforeAction` post-peer escalation.
- **#576** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 9 DLP precision test verifying real Visa/Mastercard/Amex PANs & FR/DE/GB IBANs are caught while `MC-8841` & `PRM-7510299481` pass with `0` false positives.
- **#577** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 9 `redactSensitiveText` test verifying inline `[REDACTED_CARD]`, `[REDACTED_IBAN]`, `[REDACTED_DLP-SSN]`, and `[REDACTED_DLP-API-KEY]` scrubbing.
- **#578** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 10 RFC 6962 Merkle Tree test across tree sizes `n = 0, 1, 2, 3, 5, 6, 7` verifying inclusion paths for every leaf index `0..n-1`.
- **#579** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 10 Selective-Disclosure Passport test proving 1-of-6 commitment + Ed25519 receipt + ZK budget ladder while confirming `0` sibling leaks.
- **#580** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 10 tamper & stripping test confirming `verifySelectiveDisclosureProof` rejects stripped `receipt_envelope`, mutated `leaf_salt_hex`, and swapped `audit_path` sides.
- **#581** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 10 Critical-Path Slack test across `home_relocation` and `outpatient_surgery` (`ON_OR_BEFORE` negative lead offset!).
- **#582** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 10 `synthesizePeerFederationConfig` test verifying `allowed_peers`, HOCON `tools` + `facts/` fast-path, and `engine.addCheck` output.
- **#583** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 11 Coordinator `generateSelectivePassportProof`, `verifyCurrentSelectiveProof`, `simulateSelectiveProofTamper` & `criticalPathSummary` state test.
- **#584** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 11 5-primitive `exportVerifiableAuditBundle` / `verifyExportedAuditBundle` test verifying `merkle_operations_root_sha256` catches operation-array tampering.
- **#585** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 11 runtime `parseHocon` prototype-pollution (`__proto__`), `\uZZZZ` invalid hex escape, and `MAX_HOCON_DEPTH` rejection tests.
- **#586** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 11 runtime `filterSlyData`, `cruse.normalizePresentation`, `TurnControl.steer`, `AsyncEventQueue.return()`, and `ProviderError.friendly` (Otari/Gemini + key scrub) tests.
- **#587** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 11 `ContinuityScriptedReplayLlm` zero-key CRUSE `cpm_slack_table` generation test.
- **#588** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 12 `runContinuityCli` `--scan-dlp` (clean exit `0` & Visa/IBAN blocked exit `1`) test.
- **#589** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 12 `runContinuityCli` `--verify-passport` (intact exit `0` & tampered exit `1`) offline file verification test.
- **#590** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 13 7-language natural-language compiler test verifying Italian (`venerdì`, `sotto`), Portuguese (`sexta-feira`, `abaixo de`), and Dutch (`vrijdag`, `onder`) + `"pull forward by 1 day"`.
- **#591** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 13 4-peer UI source verification confirming `[data-peer-ics]` and `[data-peer-release]` exist across MoveCo, PermitFlow, HomeConnect & PowerFlow.
- **#592** (`tests/unit/titan_cycle2_waves9_14.test.mjs`): Add Wave 14 strict 1-to-1 Cycle II contract test asserting every `#301`..`#600` (`300` distinct items, `0` grouped ranges) exists in `TITAN_CYCLE2_300_UPGRADES_LEDGER.md` and `#001`..`#600` (`600` distinct items) in `TITAN_300_UPGRADES_LEDGER.md`.
- **#593** (`packages/merkle-passport/index.js`): Export `PASSPORT_SCHEME` and `PROOF_SCHEME` named constants at module top level.
- **#594** (`packages/merkle-passport/index.js`): Validate `auditReport.siteBaseUrl` URL syntax in `synthesizePeerFederationConfig` with clear error message.
- **#595** (`packages/safety-hooks/index.js`): Freeze `OUTBOUND_SECRET_PATTERNS` rule array via `Object.freeze` to prevent runtime rule mutation.
- **#596** (`packages/safety-hooks/index.js`): Validate `rawIban` max length `<= 64` before regex scanning in `isValidMod97Iban` against ReDoS.
- **#597** (`packages/safety-hooks/index.js`): Clamp `collectPayloadStrings` total collected string count (`<= 512` strings) preventing huge-array CPU stalls.
- **#598** (`apps/continuity-web/modules/schedule-gantt-view.js`): Guard missing `page.mission` or empty `cpm.nodes` cleanly in `renderScheduleGanttView`.
- **#599** (`apps/continuity-web/ui.js`): Focus first matching `.cmd-palette-item` on `ArrowDown` inside `#cmd-palette-search` for 1-hand keyboard execution.
- **#600** (`apps/continuity-web/ui.js`): Support `ArrowDown` / `ArrowUp` cyclic keyboard focus navigation across `.cmd-palette-item` buttons inside `#cmd-palette-dialog`.
