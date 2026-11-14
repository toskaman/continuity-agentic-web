# CONTINUITY — Open Agentic Change Coordinator

**One change. Every commitment re-aligned.**

Built for the **[Cognizant Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/)** · All 5 sites pass the official Cognizant validators (`build_network.mjs --check`, `check_partner.mjs`) for the **[Worldwide Agentic Web MVP Specification (Profile 0.2)](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md)**.

![CONTINUITY coordinator](docs/submission/screenshots/01_continuity_mission_baseline.png)

## Try it in 60 seconds (no API key needed)

1. Open **https://toskaman.github.io/continuity-agentic-web/** and click **Run the live demo** (top right).
2. CONTINUITY injects a real provider failure (MoveCo's Friday crew is full), recovers through an overflow partner, compares plans and holds replacements — your original bookings stay untouched.
3. The approval dialog lists every operation, price and provider. Click **Approve & commit**: three providers commit, three bookings stay untouched (two are never even contacted), and each commit returns an Ed25519-signed receipt.
4. Click a provider in the network map (e.g. **MoveCo Express**): its own site, on another origin, verifies the signed receipt and shows the new date.
5. Optional: **Try without a key** in *Ask CONTINUITY* runs the real agent networks, `website_*` tools and consent cards with a scripted model.

> Demo data: the four providers are independent demonstration services built for this challenge. No real bookings, payments or permits are touched.

## Live Public HTTPS Deployments (Verified Cross-Origin Ecosystem)

- **Primary Coordinator (`CONTINUITY`):** `https://toskaman.github.io/continuity-agentic-web/`
  - Public Manifest: `https://toskaman.github.io/continuity-agentic-web/agent-manifest.json`
  - Public Network JSON: `https://toskaman.github.io/continuity-agentic-web/continuity_coordinator.network.json`
  - Public A2A v1.0 Agent Card: `https://toskaman.github.io/continuity-agentic-web/.well-known/agent-card.json`
- **4 Independent Peer Websites (Distinct Origin `https://gpaschercher-sudo.github.io`):**
  - **Peer A — MoveCo Express:** `https://gpaschercher-sudo.github.io/moveco-agentic-peer/` (`moveco_dispatch`)
  - **Peer B — PermitFlow Civic Prep:** `https://gpaschercher-sudo.github.io/permitflow-agentic-peer/` (`permitflow_advisor`)
  - **Peer C — HomeConnect Fiber:** `https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/` (`homeconnect_scheduler`)
  - **Peer D — PowerFlow Energy:** `https://gpaschercher-sudo.github.io/powerflow-agentic-peer/` (`powerflow_grid`)
- **Public Source Repository:** `https://github.com/toskaman/continuity-agentic-web`

---

## What CONTINUITY Does

When a real-world commitment changes (such as shifting a home relocation, an outpatient surgical procedure, or an international product-launch freight slot from Tuesday to Friday), **CONTINUITY**:
1. **Compiles Any Schedule (`.ics` Calendar, Raw Confirmation Emails, or Plain English)** via `@continuity/intake-compiler` and `@continuity/mission-core`, inferring typed semantic dependency edges while locking hard invariants (`maximum_budget_eur`, `preserve_existing_commitments = true`, `unauthorized_cancellation = false`).
2. **Analyzes Bounded Impact** over a typed dependency DAG — excluding unaffected commitments (`CityVault Pod` and `NordicLoom Saturday Delivery` receive zero unnecessary calls).
3. **Executes Across a Zero-Server Cross-Origin Browser Mesh (`@continuity/cross-origin-bridge`) + Dual WebMCP (`@continuity/webmcp-adapter`)** — connecting `toskaman.github.io` and `gpaschercher-sudo.github.io` in the visitor's browser via origin-verified `postMessage` capability bridges, WebCrypto Ed25519 signing, Cognizant Neuro SAN HOCON networks, W3C `navigator.modelContext` WebMCP tools, consent cards, and Hosted **Mozilla Otari** BYOK inference (`https://api.otari.ai/api/v1`).
4. **Solves Pareto-Optimal Minimal-Change Plans & Counterfactual Budgets** (`Plan A — Minimum Changes`, `Plan B — Lowest Cost`, `Plan C — Fastest Alignment` + interactive What-If budget threshold sweep), recovering automatically from injected ripple failures (e.g., MoveCo's primary Friday crew full).
5. **Prepares First, Commits Last, and Exports Verifiable Artifacts** — placing reversible slot holds while keeping original bookings active, binding approvals with canonical SHA-256 digests (`€0.01` drift invalidates approval), reconciling `UNKNOWN` timeouts, verifying **Ed25519 provider receipts**, syncing top-level peer tabs via signed `#continuity_receipt` handoff tokens, and exporting updated **RFC 5545 `.ics` calendars** + **Signed Cryptographic Audit Bundles (`.json`)**.
6. **Audits Any Open Agentic Website Live** — built-in **MVP Profile 0.2 & Project NANDA / A2A v1.0 Conformance Verifier** (`auditOpenAgenticSite`).

---

## Quickstart (Node.js >= 22, Zero External Runtime Dependencies)

### 1. Start All 5 Independent Open Agentic Websites Locally

```bash
node scripts/serve_ecosystem.mjs
```

This starts five distinct origins with spec-compliant CORS and Sandbox Worker CSP headers:
- **CONTINUITY Coordinator:** `http://127.0.0.1:8080/` (`http://127.0.0.1:8080/continuity_coordinator`)
- **Peer A — MoveCo Express:** `http://127.0.0.1:8081/` (`http://127.0.0.1:8081/moveco_dispatch` + `/mcp`)
- **Peer B — PermitFlow Civic Prep:** `http://localhost:8082/` (`http://localhost:8082/permitflow_advisor` + `/mcp`)
- **Peer C — HomeConnect Fiber:** `http://127.0.0.1:8083/` (`http://127.0.0.1:8083/homeconnect_scheduler` + `/mcp`)
- **Peer D — PowerFlow Energy:** `http://localhost:8084/` (`http://localhost:8084/powerflow_grid` + `/mcp`)

*(Note: Linked sites alternate `127.0.0.1` and `localhost` locally as recommended by `skills/agentify-website/references/linking.md` so loopback BYOK cookies stay origin-isolated. After testing with a real API key locally, select **Delete setup** under `⚙ AI model settings → Advanced settings` and close the tab.)*

### 2. Run Full Compliance, Partner, Security & Chaos Test Gate

```bash
node scripts/run_all_tests.mjs
```

This single command executes:
1. Official Cognizant `build_network.mjs --check` across all 5 websites (**0 errors, 0 warnings**).
2. Official Cognizant `check_partner.mjs` across all 5 live origins (**CORS, manifests, networks, and `bridge/action-bridge.html` verified**).
3. All **38 automated tests in 12 suites** (unit, Google ADK → HOCON converter & cycle/secret guards, mandate & Nash bargaining bypasses, SHA-256 hash-chained ledger tamper detection, multi-domain intake & `.ics` round-trip, cross-origin browser bridge & signed receipt handoffs, WebMCP guardrails, live 7-point MVP 0.2 + NANDA conformance auditor, provider MCP contracts, cross-origin runtime composition & key isolation, adversarial security boundaries, and all **15 Chaos Lab scenarios**).

### 3. Reproduce Before/After Benchmarks (`N = 60` Live Cross-Origin Runs)

```bash
node scripts/run_benchmarks.mjs
```

---

## Repository Structure

```text
continuity/
├── apps/
│   ├── continuity-web/        # Primary Open Agentic Coordinator Website + SVG Graph + Chaos Lab
│   ├── demo-moveco/           # Peer A: Moving van crew & 15-min slot holds
│   ├── demo-permitflow/       # Peer B: Public curbside bay notice check & demo dossier drafts
│   ├── demo-homeconnect/      # Peer C: Fiber ONT technician scheduling & 10-min holds
│   └── demo-powerflow/        # Peer D: Remote smart-meter electricity energization
├── packages/                  # 17 Reusable Open-Source Community Modules (Apache-2.0)
│   ├── shared-schemas/        # Canonical JSON (JCS), SHA-256 Web Crypto, strict JSON Schema
│   ├── mission-core/          # Mission compiler & hard-invariant guard
│   ├── intake-compiler/       # Raw confirmation email + RFC 5545 .ics compiler & .ics/Audit exporter
│   ├── adk-hocon-converter/   # Google ADK / OpenAI Agents -> Portable Neuro SAN HOCON converter
│   ├── mission-graph/         # Open Mission Graph with 3-color DFS cycle rejection & DAG layout
│   ├── impact-engine/         # Bounded incremental dependency impact analyzer
│   ├── capability-adapter/    # Peer semantic normalization & untrusted response validation
│   ├── constraint-solver/     # Pareto-optimal Minimal-Change Optimizer & budget sensitivity sweep
│   ├── mandate-arbiter/       # Policy-bound SHA-256 mandates & sealed-bid integer-cent Nash arbiter
│   ├── cross-origin-bridge/   # Zero-server cross-origin postMessage RPC & signed Ed25519 handoff
│   ├── webmcp-adapter/        # Dual Cognizant website_* + W3C navigator.modelContext WebMCP bridge
│   ├── approval-engine/       # Canonical SHA-256 bound approvals & TOCTOU replay guard
│   ├── outcome-reconciliation/# 14-state SHA-256 hash-chained ledger & UNKNOWN timeout reconciler
│   ├── saga-engine/           # Prepare-first, commit-last Saga coordinator
│   ├── proof-verifier/        # Ed25519 receipt verification & explicit trust classification
│   ├── nanda-resolver/        # Project NANDA verifier, A2A v1.0 validator & live MVP 0.2 site auditor
│   └── chaos-lab/             # 15 deterministic failure-injection scenarios
├── providers/                 # Standalone CORS + MCP (2025-06-18) servers for each peer
├── skills/agentify-website/   # Official Cognizant runtime & compliance validators
├── design-system/             # Shared tokens, components, per-site themes (built by scripts/write_peer_styles.mjs)
├── scripts/                   # Ecosystem launcher, validator, origin rewriter & benchmark suite
├── tests/                     # Unit, Contract, Integration, Security & Chaos tests
└── docs/                      # Compliance audit, architecture, threat model, benchmarks, Devpost
```

---

## Public Static Hosting Headers (`_headers`)

When deploying any `apps/*` bundle to a public HTTPS host (Netlify, Cloudflare Pages, GitHub Pages, S3/CloudFront), configure `scripts/configure_origins.mjs` with the HTTPS URLs and serve:
- `Access-Control-Allow-Origin: *` on `/agent-manifest.json`, `/<network>.network.json`, `/links.json`, `/agent-mcp.json`, `/.well-known/nsdeploy.json`, and `/.well-known/nsdeploy-agent.json`.
- `Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'` on `/runtime/sandbox-worker.js`.
- Do **not** block framing (`X-Frame-Options`) on `/bridge/action-bridge.html`.

---

## Documentation Index

- [TITAN OMEGA v3.0 Domination Audit & Report](docs/competition/TITAN_V3_DOMINATION_REPORT.md)
- [24-Month Global Hackathon Winner Intelligence (2024–2026)](docs/research/GLOBAL_HACKATHON_WINNER_INTELLIGENCE_2024_2026.md)
- [Official Competition Compliance Audit](docs/competition/COMPLIANCE_AUDIT.md)
- [Technical Architecture & Topology](docs/architecture/ARCHITECTURE.md)
- [Initial Reconnaissance & Spec Analysis](docs/architecture/INITIAL_RECONNAISSANCE.md)
- [Competitive Landscape Analysis](docs/research/COMPETITIVE_ANALYSIS.md)
- [Threat Model, Security & Privacy](docs/security/THREAT_MODEL.md)
- [Chaos Lab Catalog (15 Scenarios)](docs/CHAOS_TEST_CATALOG.md)
- [Measured Before/After Benchmarks](docs/benchmarks/BEFORE_AFTER.md)
- [Chromium Performance Trace & V8 Heap Audit](docs/benchmarks/BROWSER_PERF_AND_MEMORY_AUDIT.md)
- [Three-Judge Red-Team Review](docs/competition/RED_TEAM_JUDGE_REVIEW.md)
- [Complete Pitch Suite & Tough Judge Q&A](docs/submission/PITCH_AND_JUDGE_QA_DECK.md)
- [Video Production Bible & QC Report](docs/video-production/VIDEO_QC_AND_REVIEW_REPORT.md)
- [Devpost Submission Draft](docs/submission/DEVPOST_SUBMISSION.md)
- [Human-Narrated Video Recording Script (< 2 min)](docs/submission/VIDEO_RECORDING_SCRIPT.md)
- [Design System](design-system/README.md)

---

## Honest Disclosures & License

- **Demonstration Providers:** `MoveCo`, `PermitFlow`, `HomeConnect`, and `PowerFlow` are independent demonstration services created for the Open Agentic Web Challenge. `PermitFlow` prepares demonstration application drafts only and never accesses or mutates municipal government databases.
- **Privacy & External LLM Routing:** Visitor messages and local `website_*` read outputs are sent only to the LLM router configured by the visitor in `⚙ AI model settings` (default: Hosted Mozilla Otari). Partner peer networks run locally in the visitor's browser and never receive the visitor's API key.
- **License:** Apache License 2.0 (`LICENSE`), preserving upstream Apache-2.0 notices for Cognizant's `agentic-web` / `nsdeploy` browser runtime.
