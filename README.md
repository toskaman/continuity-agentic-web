# CONTINUITY — Open Agentic Change Coordinator

**One change. Every commitment re-aligned.**

Built for the **[Cognizant Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/)** · Conforms 100% to the **[Worldwide Agentic Web MVP Specification (Profile 0.2)](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md)**.

---

## What CONTINUITY Does

When a real-world commitment changes (such as shifting a home relocation from Tuesday to Friday), **CONTINUITY**:
1. **Compiles** natural-language requests into schema-validated proposals while locking hard invariants (`maximum_budget_eur <= €700`, `preserve_existing_commitments = true`, `unauthorized_cancellation = false`).
2. **Analyzes Bounded Impact** over a typed dependency graph — excluding unaffected commitments (`CityVault Pod` and `NordicLoom Saturday Delivery` receive zero unnecessary calls).
3. **Composes Independent Open Agentic Websites** in the visitor's browser (`MoveCo Express`, `PermitFlow Civic Prep`, `HomeConnect Fiber`, `PowerFlow Energy`) using Cognizant's Neuro SAN HOCON format, browser runtime, consent cards, and Hosted **Mozilla Otari** BYOK inference (`https://api.otari.ai/api/v1`).
4. **Solves Minimal-Change Plans** deterministically (`Plan A — Minimum Changes`, `Plan B — Lowest Cost`, `Plan C — Fastest Alignment`), recovering automatically from injected ripple failures (e.g., MoveCo's primary Friday crew full).
5. **Prepares First, Commits Last** — placing reversible slot holds while keeping original bookings active, binding approvals with canonical SHA-256 digests (`€0.01` drift invalidates approval), executing with idempotency keys, reconciling `UNKNOWN` timeouts, and verifying **Ed25519 provider receipts**.

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
3. All **25 automated test suites** (unit, provider MCP contracts, cross-origin runtime composition & key isolation, adversarial security boundaries, and all **15 Chaos Lab scenarios**).

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
├── packages/                  # 11 Reusable Open-Source Community Modules (Apache-2.0)
│   ├── shared-schemas/        # Canonical JSON (JCS), SHA-256 Web Crypto, strict JSON Schema
│   ├── mission-core/          # Mission compiler & hard-invariant guard
│   ├── mission-graph/         # Open Mission Graph with 3-color DFS cycle rejection
│   ├── impact-engine/         # Bounded incremental dependency impact analyzer
│   ├── capability-adapter/    # Peer semantic normalization & untrusted response validation
│   ├── constraint-solver/     # Deterministic multi-objective Minimal-Change Optimizer
│   ├── approval-engine/       # Canonical SHA-256 bound approvals & TOCTOU replay guard
│   ├── outcome-reconciliation/# 14-state operation ledger & UNKNOWN timeout reconciler
│   ├── saga-engine/           # Prepare-first, commit-last Saga coordinator
│   ├── proof-verifier/        # Ed25519 receipt verification & explicit trust classification
│   └── chaos-lab/             # 15 deterministic failure-injection scenarios
├── providers/                 # Standalone CORS + MCP (2025-06-18) servers for each peer
├── skills/agentify-website/   # Official Cognizant runtime & compliance validators
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

- [Official Competition Compliance Audit](docs/competition/COMPLIANCE_AUDIT.md)
- [Technical Architecture & Topology](docs/architecture/ARCHITECTURE.md)
- [Initial Reconnaissance & Spec Analysis](docs/architecture/INITIAL_RECONNAISSANCE.md)
- [Competitive Landscape Analysis](docs/research/COMPETITIVE_ANALYSIS.md)
- [Threat Model, Security & Privacy](docs/security/THREAT_MODEL.md)
- [Chaos Lab Catalog (15 Scenarios)](docs/CHAOS_TEST_CATALOG.md)
- [Measured Before/After Benchmarks](docs/benchmarks/BEFORE_AFTER.md)
- [Three-Judge Red-Team Review](docs/competition/RED_TEAM_JUDGE_REVIEW.md)
- [Two-Minute Video Storyboard](docs/demo/VIDEO_STORYBOARD.md)
- [Devpost Submission Draft](docs/submission/DEVPOST_SUBMISSION.md)

---

## Honest Disclosures & License

- **Demonstration Providers:** `MoveCo`, `PermitFlow`, `HomeConnect`, and `PowerFlow` are independent demonstration services created for the Open Agentic Web Challenge. `PermitFlow` prepares demonstration application drafts only and never accesses or mutates municipal government databases.
- **Privacy & External LLM Routing:** Visitor messages and local `website_*` read outputs are sent only to the LLM router configured by the visitor in `⚙ AI model settings` (default: Hosted Mozilla Otari). Partner peer networks run locally in the visitor's browser and never receive the visitor's API key.
- **License:** Apache License 2.0 (`LICENSE`), preserving upstream Apache-2.0 notices for Cognizant's `agentic-web` / `nsdeploy` browser runtime.
