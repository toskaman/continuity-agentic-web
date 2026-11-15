# CONTINUITY — Complete Pitch Suite & Judge Red-Team Q&A

Prepared for the **Cognizant Open Agentic Web Challenge** (`https://cognizant-agenticweb.devpost.com/`).

---

## 1. Multi-Horizon Pitches

### One-Sentence Pitch
> **CONTINUITY** transforms one slipped date across six independent websites from eighteen error-prone manual calls into one budget-bounded, hold-before-commit, Ed25519-verified change package executed directly in your browser.

### 15-Second Hook
> Every AI agent demo books a pizza or a flight from scratch. Real life breaks on **Day Two** — when your Tuesday move slips to Friday and six independent services collide at once. CONTINUITY coordinates independent Open Agentic Websites in your browser, holds replacements under your €700 cap *before* touching working bookings, and verifies every Ed25519 receipt in two clicks.

### 30-Second Value Pitch
> Shifting a home relocation, an outpatient surgery, or an expo freight delivery normally takes 18 manual lookups and rebookings across six separate companies — where canceling too early costs real fees or strands you without a replacement. With CONTINUITY, you state one change in plain English or drop your `.ics` calendar. CONTINUITY skips unaffected bookings completely, recovers from a full crew via sealed-bid Nash arbitration, locks 15-minute holds across independent Open Agentic Websites, and commits only after your SHA-256-bound confirmation.

### 60-Second Technical & Ecosystem Pitch
> CONTINUITY is a 100% browser-executed ecosystem of **five independent Open Agentic Websites** hosted across separate origins (`toskaman.github.io` and `gpaschercher-sudo.github.io`), conforming to **MVP Profile 0.2** on **Mozilla Otari** BYOK. Because probabilistic LLMs must never own user safety invariants, we built and open-sourced **24 zero-dependency Apache-2.0 modules**:
> - `@continuity/intake-compiler` turns raw confirmation emails or RFC 5545 `.ics` calendars into typed dependency graphs in under 2 ms and verifies exported cryptographic audit bundles offline.
> - `@continuity/impact-engine` and `@continuity/constraint-solver` prune unaffected commitments (`0` calls), plot the 4-objective **Pareto frontier** with NSGA-II crowding distances, and prescribe **exact minimal counterfactual relaxations** when constraints conflict.
> - `@continuity/mandate-arbiter` issues frozen SHA-256 mandates and resolves overflow bids via integer-cent **Nash bargaining** without leaking your budget ceiling.
> - `@continuity/cross-origin-bridge`, `@continuity/facts-publisher`, `@continuity/local-browser-router`, and `@continuity/webmcp-adapter` enable zero-server `postMessage` Ed25519 commits, single-turn `facts/` networks, zero-key on-device Gemini Nano / local Ollama inference, and W3C `navigator.modelContext` tools.
> - `@continuity/nanda-resolver` and `@continuity/adk-hocon-converter` provide a live **9/9 MVP 0.2 + Facts + Project NANDA (`urn:air`, `ai-catalog.json`, `POST /resolve`) Conformance Validator + SARIF CLI** and a **Google ADK → Neuro SAN HOCON converter** for the entire community.

---

## 2. Tough Judge Questions & Evidence-Backed Answers

### Q1 (Babak Hodjat — Multi-Agent Safety & Mandate Enforcement): *"How do you guarantee a hallucinating or prompt-injected LLM cannot raise the user's €700 budget, leak the ceiling to a seller, or auto-cancel an existing booking?"*
- **Answer:** Enforcement lives in deterministic JavaScript code, never in prompt wording alone:
  1. `compileMissionChange()` (`@continuity/mission-core`) strips any model-proposed `unauthorized_cancellation: true` or `commit_changes: true` and pins `authoritative_invariants` into a frozen SHA-256 mandate (`@continuity/mandate-arbiter`).
  2. `buildSanitizedPeerBoundaryRequest()` sends only `{ booking_ref, target_date }` across peer boundaries — `maximum_budget_eur` and `sly_data` are withheld (`Tests S2, S4, V2.6`).
  3. Every irreversible write requires a runtime-owned confirmation modal bound to canonical RFC-8785 JSON (`@continuity/approval-engine`); a `€0.01` fee drift invalidates the approval hash (`Test U7, BYPASS-02`).

### Q2 (Babak Hodjat — Distributed Saga Atomicity): *"Two independent companies don't share an ACID database. What happens if MoveCo commits Friday and the network drops mid-flight on HomeConnect?"*
- **Answer:** `CONTINUITY` never claims cross-company ACID locks. Instead, `@continuity/outcome-reconciliation` and `@continuity/saga-engine` implement a **14-state SHA-256 hash-chained ledger**:
  1. **Prepare-First / Hold-Before-Commit:** Replacements are locked with 10–15 minute non-destructive holds (`hold_mc_1`, `hold_hc_1`) before any commit begins.
  2. **Never Blindly Retry Writes:** A post-dispatch timeout transitions to `UNKNOWN -> RECONCILING` and queries the provider's status endpoint using the deterministic `idempotency_key` (`CHAOS_03, CHAOS_04`).
  3. **Safe Partial Halt:** If a second provider hard-fails after one commit succeeded, the Saga halts in `PARTIAL_HALTED_SAFE` and surfaces explicit human compensation options rather than auto-triggering paid cancellation penalties (`CHAOS_09`).

### Q3 (Ramesh Raskar — Project NANDA & Open Discovery): *"How does CONTINUITY align with Project NANDA and avoid centralized platform lock-in?"*
- **Answer:** Every site publishes direct DNS/HTTPS-anchored Open Agentic Web artifacts (`agent-manifest.json`, `.network.json`, `links.json`, single-turn `facts/<network>_facts`) alongside NANDA-compliant A2A v1.0 Agent Cards (`/.well-known/agent-card.json`) AND **Project NANDA AI Catalogs** (`/.well-known/ai-catalog.json` with validated `urn:air:<host>:agent:<name>` identifiers, SHA-256 `targetDigest` bindings, and active-content extension guards). `@continuity/nanda-resolver` implements `draft-raskar-agentic-web-federated-resolution-02` (`POST /resolve` + `RFC 9457 application/problem+json` + anti-rollback sequence tracking) and ships both an in-browser **9/9 Conformance Auditor** and a standalone CLI (`npx continuity-audit --sarif` / `--verify-bundle`).

### Q4 (Risto Miikkulainen — Multi-Objective Optimization): *"Why isn't 'cheapest' always the right reschedule plan, and how does your solver handle conflicting or infeasible objectives?"*
- **Answer:** In real life, saving €10 by rescheduling two extra providers creates disruption, extra human approvals, and schedule lag. `@continuity/constraint-solver` evaluates the Cartesian space over **four minimization objectives** `(Changed Commitments, Total Cost €, Completion Span Days, Irreversible Ops)`, classifies the exact **non-dominated Pareto frontier** with NSGA-II crowding distances (`computeParetoFrontier`), sweeps counterfactual budget thresholds (`analyzeBudgetSensitivity`), and computes **Minimal Unsatisfiable Core (MUS) Counterfactual Relaxations** (`computeMinimalCounterfactualRelaxation`) so infeasible budgets or conflicting pins offer a 1-click mathematical minimum relaxation in `< 1 ms`.

### Q5 (Static Hosting & Zero Backend Cost): *"How do `toskaman.github.io` and `gpaschercher-sudo.github.io` exchange live quotes, holds, and Ed25519 receipts on static GitHub Pages with $0 server cost?"*
- **Answer:** We built `@continuity/cross-origin-bridge` (`peer-rpc-bridge.html`). Each peer origin runs an isolated iframe listener that checks `event.origin` against its allowlist, generates an origin-scoped **WebCrypto Ed25519** keypair whose private key never leaves `gpaschercher-sudo.github.io`, signs canonical receipts, and issues signed `#continuity_receipt` handoff tokens so opening `MoveCo Express ↗` in a top-level tab cryptographically verifies its own signature and hydrates Friday's reservation despite browser storage partitioning (`CHIPS`).

### Q6 (Judge Testing Without API Keys): *"Can a judge test both the coordinator and the Neuro SAN browser runtime without entering a private paid API key?"*
- **Answer:** Yes, in two complementary ways:
  1. The deterministic coordinator, Magic `.ics`/email intake, Pareto explorer, Chaos Lab, Mandate Arbiter, NANDA Auditor, and ADK Converter run 100% client-side with zero API key.
  2. In `#assistant`, `agent-manifest.json` defaults to production **Mozilla Otari BYOK (`mock: false`)**, while an explicitly labeled **`⚡ Enable Zero-Key Scripted Replay`** button lets judges exercise the real Neuro SAN `.network.json` graph, `website_*` tools, CRUSE bar charts, and cross-origin **Interactive Consent Cards** immediately with zero key setup.
