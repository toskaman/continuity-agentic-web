# Technical Architecture — CONTINUITY

## 1. System Topology Diagram

```mermaid
flowchart TB
    subgraph Browser["Visitor's Standard Web Browser (Open Agentic Web Runtime)"]
        UI["CONTINUITY Web UI\n(Mission Input · SVG Graph · Change Package · Chaos Lab)"]
        RT["Cognizant Browser Runtime\n(engine.js · runner.js · actions.js · mcp.js · cruse.js)"]
        NET["continuity_coordinator.network.json\nFront: continuity_orchestrator\nSpecialist: peer_network_specialist"]
        CORE["Deterministic Core Engines (@continuity/*)\nMission Compiler · Impact Engine · Minimal-Change Solver\nApproval Engine (SHA-256) · Saga & Reconciliation · Ed25519 Verifier"]
        UI <--> CORE
        UI <--> RT
        RT --> NET
        RT <-->|"website_* site actions"| CORE
    end

    subgraph Router["User-Selected LLM Router (BYOK / Default)"]
        OTARI["Mozilla Otari Gateway\nhttps://api.otari.ai/api/v1\nModel: alibaba/qwen-3.5-35b-a3b"]
    end

    subgraph Peers["4 Independent Open Agentic Websites (Distinct Origins + CORS)"]
        P1["Peer A: MoveCo Express\nagent-manifest.json + moveco_dispatch.network.json\n+ /mcp (Quotes, 15m Holds, Ed25519 Receipts)"]
        P2["Peer B: PermitFlow Civic Prep\nagent-manifest.json + permitflow_advisor.network.json\n+ /mcp (Demo Dossier Prep Only)"]
        P3["Peer C: HomeConnect Fiber\nagent-manifest.json + homeconnect_scheduler.network.json\n+ /mcp (Technician Windows & 10m Holds)"]
        P4["Peer D: PowerFlow Energy\nagent-manifest.json + powerflow_grid.network.json\n+ /mcp (Smart-Meter Energization)"]
    end

    RT -->|"HTTPS + Bearer BYOK Key\n(Never sent to Peers)"| OTARI
    RT -->|"1. User Consent Card\n2. Fetch Manifest + Network JSON\n3. Run Locally in Caller Browser"| P1 & P2 & P3 & P4
    CORE <-->|"Bounded Impact Quotes, Holds, Idempotent Commits\n& Ed25519 Signed Receipts"| P1 & P2 & P3 & P4
```

---

## 2. Architectural Separation of Concerns

### 2.1 Probabilistic Layer vs. Deterministic Safety Kernel
- **Probabilistic Layer (Neuro SAN HOCON Agents):** Interprets natural-language requests, delegates cross-origin informational queries across partner networks after visitor consent, and renders CRUSE summaries.
- **Deterministic Safety Kernel (`packages/*`):**
  1. `@continuity/shared-schemas` — Strict JSON Schema validator, prototype-pollution blocker, RFC-8785-style canonical JSON serializer, and Web Crypto SHA-256 digest.
  2. `@continuity/mission-core` — Validates change proposals and prevents any downgrade of hard invariants (`maximum_budget_eur <= €700`, `preserve_existing_commitments = true`, `unauthorized_cancellation = false`).
  3. `@continuity/mission-graph` — Acyclic typed commitment graph separating observed provider facts from dependency semantics (`SAME_DAY_REQUIRED`, `ON_OR_AFTER`, `ON_OR_BEFORE`, `WITHIN_COVERAGE_SPAN`).
  4. `@continuity/impact-engine` — Bounded BFS impact propagation that excludes unaffected commitments (`CityVault Pod` and `NordicLoom Delivery` receive zero network calls).
  5. `@continuity/capability-adapter` — Normalizes heterogeneous provider schemas while preserving operational flags (`supports_hold`, `reversible`, `creates_final_booking`).
  6. `@continuity/constraint-solver` — Reproducible weighted multi-objective optimizer generating `PLAN_A_MINIMAL_CHANGE`, `PLAN_B_LOWEST_COST`, and `PLAN_C_FASTEST_RESOLUTION`.
  7. `@continuity/approval-engine` — Binds human consent to canonical operation parameters via SHA-256 and blocks replay or `€0.01` price drift.
  8. `@continuity/outcome-reconciliation` & `@continuity/saga-engine` — 14-state explicit state machine (`DRAFT` -> `PREPARED` -> `AWAITING_APPROVAL` -> `APPROVED` -> `DISPATCHED` -> `UNKNOWN` / `RECONCILING` -> `COMMITTED` / `NEEDS_USER`) implementing **Prepare-First, Commit-Last** execution.
  9. `@continuity/proof-verifier` — Verifies Ed25519 provider receipts against pinned demonstration public JWKs.
  10. `@continuity/chaos-lab` — 15 deterministic fault-injection scenarios runnable via CLI or browser tab.

---

## 3. Open Agentic Web Compliance Details

Every one of the 5 websites (`apps/continuity-web`, `apps/demo-moveco`, `apps/demo-permitflow`, `apps/demo-homeconnect`, `apps/demo-powerflow`) publishes:
- `/agent-manifest.json` (`Access-Control-Allow-Origin: *`)
- `/<network>.network.json` (`Access-Control-Allow-Origin: *`)
- `/links.json` (`Access-Control-Allow-Origin: *`)
- `/agent-mcp.json`, `/.well-known/nsdeploy.json`, `/.well-known/nsdeploy-agent.json` (`Access-Control-Allow-Origin: *`)
- `/bridge/action-bridge.html` & `/bridge/agent-manifest.json` (frameable, zero exposed local page code)
- `/runtime/*` (with strict `Content-Security-Policy` on `/runtime/sandbox-worker.js`)
