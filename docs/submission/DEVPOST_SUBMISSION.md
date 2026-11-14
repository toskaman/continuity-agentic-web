# Devpost Submission Draft — CONTINUITY

> **Status:** Complete & Publicly Verified against Official Rules (`https://cognizant-agenticweb.devpost.com/rules`). All public HTTPS URLs, GitHub repositories, and 8 screenshots (`docs/submission/screenshots/`) are ready. Only the `< 2 minute` human-narrated YouTube URL and your Otari account email remain for you to paste when submitting.

---

## 1. Core Fields & Live Public URLs

- **Project Title:** `CONTINUITY — Safe Change Coordination for the Open Agentic Web`
- **Tagline:** `One change. Every commitment re-aligned across independent Open Agentic Websites.`
- **Public Open Agentic Website URL ("Try it out" link):** `https://toskaman.github.io/continuity-agentic-web/`
- **Public Source Code Repository URL:** `https://github.com/toskaman/continuity-agentic-web`
- **Independent Peer Agentic Website URLs (Cross-Origin Composition):**
  - `https://gpaschercher-sudo.github.io/moveco-agentic-peer/` (`moveco_dispatch`)
  - `https://gpaschercher-sudo.github.io/permitflow-agentic-peer/` (`permitflow_advisor`)
  - `https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/` (`homeconnect_scheduler`)
  - `https://gpaschercher-sudo.github.io/powerflow-agentic-peer/` (`powerflow_grid`)
- **Screenshot & Architecture Assets Ready to Upload (`docs/submission/screenshots/`):**
  1. `00_architecture_diagram.png` — System Topology & Trust Boundaries
  2. `01_continuity_mission_baseline.png` — Main Mission Coordinator & 6-Commitment SVG Graph
  3. `02_ripple_recovery_prepared_plan.png` — Ripple Failure Armed + Minimal-Change Plan Prepared
  4. `03_bound_approval_modal.png` — SHA-256 Bound Human Confirmation Dialog
  5. `04_committed_verified_ed25519.png` — Verified Commit & Ed25519 Provider Signatures
  6. `05_chaos_lab_15_passed.png` — Built-in Chaos Lab (`15/15` Distributed Fault Scenarios Passed)
  7. `06_open_agentic_web_runtime_otari_byok.png` — Cognizant Browser Runtime & Mozilla Otari BYOK Panel
  8. `07_independent_peer_moveco.png` — Standalone MoveCo Express Open Agentic Website
- **Built With:** `neuro-san`, `nsdeploy`, `open-agentic-web`, `mozilla-otari`, `project-nanda`, `a2a`, `mcp`, `javascript`, `web-crypto`, `html5`

---

## 2. Full Project Description (Copy-Ready Markdown)

### The Problem: Greenfield Planning Is Easy — Day-Two Changes Break Everything
Most AI agent demos plan something from scratch: order a pizza, pick a hotel, or draft an itinerary. Real life breaks **after** commitments are already confirmed. Moving a home relocation from Tuesday to Friday triggers a ripple effect across independent organizations — moving vans, curbside loading-bay permit preparation, fiber optic installation technicians, smart-meter electricity activation, buffer storage, and furniture delivery. Today, humans manually call six websites, repeat details, pay avoidable cancellation penalties, or accidentally cancel a working booking before a replacement is secured.

### The CONTINUITY Transformation
**CONTINUITY** is a decentralized Open Agentic Change Coordinator conforming to the **Worldwide Agentic Web MVP Specification (Profile 0.2)**. A visitor describes one schedule change in plain English:

> *"My move was originally scheduled for Tuesday, but I need to move everything to Friday. Update every affected service. Keep my current reservations until replacements are secured. Maintain my total budget below €700. Do not cancel anything or approve additional fees without my confirmation."*

CONTINUITY compiles hard constraints, analyzes bounded graph impact, interacts with independent Open Agentic Websites, holds replacement slots **before** touching existing reservations, computes deterministic minimal-change plans, binds user approvals cryptographically, executes with idempotency keys, and verifies Ed25519 provider receipts.

### How Independent Open Agentic Websites Collaborate
We built and connected **five genuinely independent Open Agentic Websites**, each with its own origin, UI, `agent-manifest.json`, resolved Neuro SAN HOCON `.network.json`, `links.json`, `bridge/action-bridge.html`, Cognizant browser `runtime/`, and CORS-enabled MCP (`2025-06-18`) capability contract:
1. **CONTINUITY** (Primary Coordinator — `continuity_coordinator`)
2. **MoveCo Express** (Demonstration Moving Crew & 15-Min Slot Holds — `moveco_dispatch`)
3. **PermitFlow Civic Prep** (Demonstration Curbside Bay Notice Check & Dossier Drafts — `permitflow_advisor`; explicitly never claims access to municipal government databases)
4. **HomeConnect Fiber** (Demonstration Fiber ONT Technician Scheduling — `homeconnect_scheduler`)
5. **PowerFlow Energy** (Demonstration Smart-Meter Grid Energization — `powerflow_grid`)

When CONTINUITY consults a partner network, the visitor's browser displays an explicit **Consent Card** *before* any HTTP contact occurs, fetches the peer's declarative `.network.json`, and executes it locally inside the caller's browser on the visitor's chosen **Mozilla Otari** router — **never** exposing the visitor's API key or private `sly_data` to peer origins.

### Deterministic Safety Around Probabilistic Agents
LLMs interpret natural language and summarize options, but **cannot** override user safety policies:
- **Hard Invariant Guard (`@continuity/mission-core`):** Prompt injection or model hallucination cannot raise `maximum_budget_eur`, enable `unauthorized_cancellation`, or commit pre-approval writes.
- **Bounded Incremental Impact (`@continuity/impact-engine`):** Excludes unaffected commitments (`CityVault Storage` covering Nov 15–29 and `NordicLoom Saturday Delivery`), avoiding unnecessary network calls and fees.
- **Minimal-Change Optimizer (`@continuity/constraint-solver`):** Reproducibly ranks `Plan A (Minimum Changes)`, `Plan B (Lowest Cost)`, and `Plan C (Fastest Alignment)` — keeping `PowerFlow`'s valid Tuesday activation untouched so only `3 of 6` commitments change (`€649.00` normal / `€659.00` ripple recovery, both `<= €700.00`).
- **SHA-256 Approval Binding (`@continuity/approval-engine`):** Canonicalizes origin, capability, arguments, date, price, fees, and expiry; if a fee drifts by `€0.01`, the approval invalidates automatically.
- **14-State Saga & Unknown-Outcome Reconciliation (`@continuity/outcome-reconciliation`, `@continuity/saga-engine`):** Network timeouts after dispatch transition to `UNKNOWN -> RECONCILING` via idempotency keys rather than blindly retrying writes. Partial mid-saga failures halt cleanly without triggering unauthorized paid compensations.
- **Chaos Lab (`@continuity/chaos-lab`):** Interactive browser & CLI testbench verifying **15 deterministic distributed failure scenarios** (`15/15` passing).

### Reusable Open-Source Contributions Shared With the Community
Under Apache-2.0, we built and share **17 zero-dependency ES modules** (`packages/*`) that any Open Agentic Web builder can drop into static browser sites or Node services:
1. **`@continuity/cross-origin-bridge`:** Solves static-hosting cross-site actions (MVP Spec §7) via origin-allowlisted `postMessage` capability bridges, origin-isolated WebCrypto Ed25519 signing, and signed `#continuity_receipt` top-level tab handoff tokens across storage-partitioned domains (`toskaman.github.io` ↔ `gpaschercher-sudo.github.io`).
2. **`@continuity/mandate-arbiter`:** Implements MVP Spec §7 *"Transactions negotiation and arbitration"* in the browser — issuing frozen SHA-256 policy-bound mandates, withholding buyer ceilings from providers, resolving overflow bids via integer-cent equal-weight linear Nash bargaining (`floor((U + S) / 2)` with Myerson–Satterthwaite disclosure), and rejecting `€0.01` price overrides or unapproved settlements.
3. **`@continuity/adk-hocon-converter`:** Implements MVP Spec §2.2 & §7 *"Framework converters"* — translating Google ADK (`LlmAgent` / `sub_agents`) or OpenAI Agents SDK JSON hierarchies into resolved, cycle-checked, credential-scrubbed `.network.json` + `agent-manifest.json` bundles with semantic equivalence verification.
4. **`@continuity/intake-compiler`:** Compiles pasted unstructured confirmation emails or standard RFC 5545 `.ics` calendars into typed dependency graphs in `<2 ms`, ships 3 multi-domain scenarios (Home Relocation, Outpatient Surgery & Care, Enterprise Expo Freight), and exports updated `.ics` calendars + SHA-256/Ed25519 audit bundles.
5. **`@continuity/webmcp-adapter`:** Dual-publishes any site's `site-actions.js` catalog to both Cognizant's Neuro SAN `website_*` runtime and W3C/Browser `navigator.modelContext` (WebMCP) with mandatory human confirmation gates on `irreversible` tools.
6. **`@continuity/nanda-resolver`:** Implements Project NANDA `draft-raskar-agentic-web-federated-resolution-02` sequence/authority verification, A2A v1.0 Agent Card validation, and a live 7-point **Open Agentic Web MVP 0.2 Conformance Auditor** (`auditOpenAgenticSite`) embedded directly in CONTINUITY's UI for community builders.
7. **Core Deterministic Safety & Pareto Suite (11 modules):** `@continuity/shared-schemas`, `@continuity/mission-core`, `@continuity/mission-graph` (topological DAG layout + cycle guard), `@continuity/impact-engine`, `@continuity/constraint-solver` (4-objective Pareto frontier + interactive SVG plot + counterfactual budget sweep), `@continuity/capability-adapter`, `@continuity/approval-engine`, `@continuity/outcome-reconciliation` (14-state SHA-256 hash-chained tamper-evident ledger), `@continuity/saga-engine`, `@continuity/proof-verifier`, and `@continuity/chaos-lab` (`15/15` fault scenarios).

### Honest Scope & Simulation Disclosure
All four provider peers are controlled, independent demonstration services built to prove real cross-origin HTTP, CORS, Neuro SAN browser composition, MCP `2025-06-18`, idempotency, and Ed25519 receipt verification. No real commercial bookings, credit-card charges, or municipal government permits are modified.

---

## 3. Mozilla Otari Usage & Constructive Feedback (Required When Using Otari)

- **Otari Account Email:** `[INSERT_YOUR_OTARI_ACCOUNT_EMAIL_HERE]`
- **How Otari Is Used:** All 5 Open Agentic Websites configure Hosted Mozilla Otari (`https://api.otari.ai/api/v1`) as their default CORS-enabled browser `llm_router` and `byok_router` with `alibaba/qwen-3.5-35b-a3b` for multi-agent tool calling, allowing visitors to bring one Otari key across all composed peer networks without site-funded server proxies.
- **Two-Sentence Feedback on Problem Faced & Suggested Improvement:**
  > *"When calling Hosted Otari (`https://api.otari.ai/api/v1/chat/completions`) directly from a browser runtime that omits an explicit `max_tokens` field, certain open-weight models (such as `alibaba/qwen3-14b` and `alibaba/qwen3-30b-a3b`) fail on every turn with HTTP 400 because the upstream defaults `max_tokens` to the model's entire 40,960-token context window, leaving zero room for the prompt. Having Otari clamp default `max_tokens` to `min(default_cap, context_window - prompt_tokens)` (and exposing a `tool_calling_verified` filter on `GET /api/v1/models`) would make zero-backend browser agent sites work reliably across every listed model."*
