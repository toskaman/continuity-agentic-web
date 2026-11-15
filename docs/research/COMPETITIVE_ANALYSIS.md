# Competitive Intelligence & Standards Landscape Analysis

**Project:** CONTINUITY — Open Agentic Change Coordinator
**Date:** 2026-11-13

---

## 1. Executive Summary

Most multi-agent demonstrations focus on **greenfield planning** ("plan a trip", "order a pizza", "organize a wedding from scratch"). In real life, the hardest, highest-friction human problem is **day-two change coordination**: an existing plan with confirmed reservations across independent organizations hits a schedule shift, and one date change triggers a cascade of fees, unavailable slots, and premature cancellations.

CONTINUITY targets **safe multi-provider change reconciliation on the Open Agentic Web** — combining Cognizant's browser-executed portable Neuro SAN HOCON networks with deterministic impact analysis, minimal-change optimization, prepare-first/commit-last execution, and outcome reconciliation.

---

## 2. Detailed Comparison Matrix

| System / Project | Category | What It Solves | Architecture | Supports Independent Open Agentic Sites? | Manages Post-Booking Changes? | Safe Hold-Before-Release Coordination? | Key Gap Addressed by CONTINUITY |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Cognizant `agentic-web` Examples** (`pizza_restaurant`, `guesthouse`, `harbor_tours`) | Official Reference Agentic Sites | Single-site booking/cart actions (`website_*` tools) + basic informational peer handoff (`linking.md`). | Browser-run `.network.json` + static HTML/JS + BYOK Otari/OpenAI. | Yes (2-site informational linking). | Partial (single-site look up & cancel only). | No. Cancelling and rebooking are manual, uncoordinated steps. | Coordinates **multi-site** dependencies, computes minimal-change plans, and holds replacements before touching existing commitments. |
| **Cognizant `nsDeploy` Cailville** (`cailville/*`) | Multi-Agent Community Demo | Greenfield community discovery and bilateral sealed-bid room price negotiation (`commerce_arbiter`). | 14 static/hosted Neuro SAN networks + Python steward/arbiter backend. | Yes (Neuro SAN HOCON + `nsdeploy` runtime). | No. Focuses on initial discovery and first-time room purchase. | No. No dependency graph across existing commitments or ripple-effect replanning. | Distinct domain (relocation & utility commitments) and distinct mechanism: **post-commitment change impact analysis, minimal-change solver, and unknown-outcome reconciliation**. |
| **Traditional Workflow / Saga Engines** (Temporal, Camunda, AWS Step Functions) | Backend Distributed Orchestration | Durable server-side microservice sagas within one enterprise boundary. | Centralized server cluster, pre-compiled code workflows, private service credentials. | No. Requires centralized backend integration; not browser-executed open web artifacts. | Only for pre-coded internal microservices. | Supports coded sagas, but assumes developer-owned APIs. | Brings Saga safety, explicit `UNKNOWN` state reconciliation, and approval binding to **user-driven browser composition across independent public websites**. |
| **Consumer Relocation / Travel Aggregators** (Updater, MovingWaldo, Kayak, TripIt) | Centralized SaaS Marketplaces | Aggregates partner listings or parses confirmation emails into a static itinerary. | Closed proprietary backend + partner affiliate APIs. | No. Closed platform; providers do not own portable public agent networks. | Mostly manual links/checklists or single-vendor rebooking. | No cross-provider hold-and-swap with user budget invariants. | Eliminates the centralized middleman: each provider publishes its own `agent-manifest.json` + MCP/site capabilities, composed in the user's browser on the user's chosen LLM router. |
| **Generic Multi-Agent Frameworks** (LangGraph, CrewAI, AutoGen) | Developer Agent SDKs | General-purpose LLM tool calling and multi-agent loops in Python/TS. | Code-defined graphs running on developer servers. | No native web manifest, browser consent card, or cross-origin `allowed_peers` model. | Relies on unconstrained LLM reasoning unless custom-built. | No built-in deterministic constraint solver or approval hash binding. | Separates **probabilistic LLM intent parsing** from **deterministic graph impact, bounded optimization, and cryptographic approval binding**. |
| **Early Open Agentic Web Community Sites** (`Plainly`, `Shutdown Clerk`, `Agent Customs` — `agentic-web` PRs #27, #29, #31, Nov 2026) | Single-Site & Inspector Challenge Entries | Client-side document PII redaction (`Plainly`), GitHub vendor-deprecation scanning (`Shutdown Clerk`), or standalone peer instruction inspection (`Agent Customs`). | Static single-site or test-range `agentify-website` bundles. | Yes (single-site or test-range peer calls). | No. Stateless single-session analysis. | No multi-origin holds, budget mandates, or signed provider receipts. | Coordinates **5 bidirectional websites across 2 origins** on stateful post-booking dependencies with hold-before-release, Nash arbitration, Ed25519 receipts, Poppy `nandaindex.org/reach` post-tab continuity, **in-engine pre-execution peer firewall & TOFU pinning**, AND ships **24 reusable modules + 6-tool `community-kit.html`**. |

---

## 3. Relevant Open Standards & Established Patterns (Proper Attribution)

CONTINUITY builds upon established distributed-systems and agentic standards without claiming to invent them:

1. **Worldwide Agentic Web MVP Specification (Profile 0.2, Cognizant AI Lab):**
   - Provides the normative `agent-manifest.json`, portable Neuro SAN HOCON `.network.json`, `links.json`, browser-side execution, BYOK router isolation, and third-party origin consent cards.
2. **Neuro SAN HOCON Representation (`cognizant-ai-lab/neuro-san`):**
   - Declarative JSON/HOCON multi-agent graph format (`metadata`, `llm_config`, `commondefs`, `tools`, `cruse`).
3. **Model Context Protocol — MCP (`2025-06-18` Streamable HTTP JSON-RPC 2.0):**
   - Used for typed, CORS-enabled remote provider capabilities (`initialize`, `tools/list`, `tools/call`) alongside local `website_*` actions.
4. **CRUSE (Context-Reactive User Experience, Cognizant AI Lab):**
   - Declarative UI presentation widgets (`table`, `choice`, `form`, `info`, `report`, `chart`) rendered safely by the browser runtime without executing arbitrary LLM HTML/JS.
5. **Saga Pattern (Garcia-Molina & Salem, 1987) & Two-Phase Reservation / Hold Semantics:**
   - Distributed commitments across autonomous organizations cannot share an ACID database lock. CONTINUITY explicitly models **Prepare / Temporary Hold** (where supported by the provider contract) followed by **User-Authorized Commit** and **Explicit Compensation Operations**, never claiming cross-company ACID atomicity.
6. **Idempotency Keys & Outcome Reconciliation:**
   - Inspired by Stripe/IETF `Idempotency-Key` patterns and the MVP Spec Section 3.1 requirement ("Timeouts and disconnects after a write begins MUST be reported as having an unknown outcome... the browser runtime MUST NOT independently repeat a write whose outcome is unknown").
7. **Canonical JSON (RFC 8785 / JCS principles) & Web Crypto (`SubtleCrypto`):**
   - Used for deterministic SHA-256 approval binding digests (`approvalHash`) and Ed25519 provider receipt signature verification against pre-registered demonstration public keys.

---

## 4. Genuine Differentiators of CONTINUITY

1. **Deterministic Boundary Around Probabilistic Agents:** The LLM translates natural-language change requests and explains trade-offs, while `@continuity/impact-engine` and `@continuity/constraint-solver` deterministically compute affected subgraphs and feasible minimal-change plans. Hard constraints (e.g., `maxBudgetEur <= 700`, `noUnauthorizedCancellation`) cannot be downgraded by prompt injection or model hallucination.
2. **Unaffected Commitment Preservation:** In our 6-commitment relocation scenario, moving from Tuesday to Friday affects Tuesday commitments and Wednesday dependencies that conflict, while preserving unrelated/compatible commitments untouched — avoiding unnecessary provider calls and cancellation penalties.
3. **Prepare-First, Commit-Last Safety:** Original reservations remain active while replacement holds/quotes are verified and cryptographically bound to the user's approval.
4. **Reusable Open-Source Building Blocks for the Community:** Published as clean, zero-bloat modular ES/TypeScript packages (`mission-core`, `mission-graph`, `impact-engine`, `constraint-solver`, `capability-adapter`, `approval-engine`, `saga-engine`, `outcome-reconciliation`, `proof-verifier`, `chaos-lab`) directly usable by any Open Agentic Web builder.
