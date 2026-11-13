# Phase 0 — Initial Reconnaissance & Architecture Blueprint

**Date:** 2026-11-13
**Workspace:** `\\192.168.1.254\Disque 5 1\Hackatons\OpenAgenticWebChallenge`
**Status:** Verified & Ready for Implementation

---

## 1. Environment & Tooling Inventory

| Component | Detected State | Notes |
| --- | --- | --- |
| Workspace | Empty prior to initialization | Clean slate; zero risk of overwriting prior user code. |
| OS / Shell | Windows 10 x64 / PowerShell 5.1 | `git config core.autocrlf false` set so HOCON/JSON hashes match POSIX LF rules in `build_network.mjs`. |
| Node.js | `v26.13.1` | Exceeds `agentify-website` requirement (`>= 22.0.0`). Native `node:test`, `fetch`, `crypto.subtle` available. |
| npm | `11.20.0` | Available for TypeScript, Vitest, Playwright, and package workspaces. |
| Git & GitHub CLI | `git 2.54.0` + `gh` authenticated (`toskaman`) | Token scopes `repo`, `workflow`, `gist`, `read:org` active for repository and GitHub Pages / Actions deployment. |
| In-App Chromium Browser | Connected (`tools.browser.*`) | Live DOM snapshot, console inspection, network inspection, Lighthouse audit, and screenshot capture available. |

---

## 2. Official Specification & Reference Repository Forensics

Primary upstream sources cloned and inspected at commit level:

1. **`cognizant-ai-labs/agentic-web`** (Apache-2.0):
   - Specification: `docs/worldwide_agentic_web_mvp_spec.md` (**MVP Profile 0.2, 6 November 2026**).
   - Reference skill & runtime: `skills/agentify-website/runtime/` (derived from `nsdeploy` commit `53a787c`, 2026-11-11).
   - Official validators:
     - `skills/agentify-website/scripts/build_network.mjs` — parses `.hocon` with the browser runtime's own `hocon.js` & `kernel.js`, validates `agent-manifest.json`, writes `<network>.network.json`, `agent-mcp.json`, `.well-known/nsdeploy.json`, `.well-known/nsdeploy-agent.json`, and `bridge/action-bridge.html` + `bridge/agent-manifest.json`.
     - `skills/agentify-website/scripts/check_partner.mjs` — validates cross-origin CORS headers, manifest structure, network resolution, and action bridge framing.
     - `skills/agentify-website/scripts/serve_site.mjs` — serves static bundles with exact spec-compliant CORS and worker CSP headers.

2. **`cognizant-ai-lab/nsdeploy`** (Apache-2.0):
   - Reference browser runtime (`nsdeploy/runtime/`).
   - `cailville/` multi-site static demonstration (wedding/harbor scenario using `commerce_arbiter` and static peer networks).
   - `examples/actions_demo/` cross-origin MessageChannel `ActionBridgeClient` demonstration.

---

## 3. Critical Architectural Findings from Runtime Code Inspection

Inspecting `runtime/engine.js`, `runtime/runner.js`, `runtime/mcp.js`, and `runtime/action-transport.js` revealed five crucial constraints that directly shape CONTINUITY's architecture:

1. **Cross-Origin Peer Network Composition (`resolveRemote`):**
   - When an agent lists a full peer URL (e.g., `https://moveco.example/moveco_dispatch`) in `tools`, the caller's browser displays a consent card **before** any HTTP request touches the peer origin.
   - Upon approval, the browser fetches `<peer>/agent-manifest.json`, `<peer>/<network>.network.json`, `<peer>/links.json`, and loads `<peer>/bridge/action-bridge.html` in a sandboxed hidden iframe.
   - The peer's network executes **locally inside the caller's browser** using the **caller's active LLM router, BYOK key, model override, and step limit**. The peer never receives the user's LLM API key.
   - **Per-turn runtime budget (`engine.js:526`):** `maxRemoteCalls: 4`, `maxCallsPerPeer: 1`, `maxAgentCalls: 24`, `deadline: 90_000 ms`. Therefore, contacting up to 4 independent peer networks in a single turn fits cleanly inside the unmodified runtime budget!

2. **Isolation of `website_*` Tools vs. Grounded Remote Capabilities (MCP):**
   - In `runner.js:201`, `website_*` tools (`availability: "local-only"`) are **only** exposed when `ctx.isTop === true` (i.e., when a human visits that site directly). When a peer network runs inside a caller's browser, `ctx.isTop === false`, so the peer network does **not** get its own DOM `website_*` tools.
   - However, **every** agent (including a peer network running inside the caller's browser, or the primary CONTINUITY coordinator) **can** invoke a CORS-enabled **MCP JSON-RPC 2.0 HTTP server** (`mcp.js`, protocol `2025-06-18`) declared in `tools` as `{ "url": "https://.../mcp", "tools": [...] }` provided its origin is listed in that network's `allowed_peers`!
   - **Architectural Synthesis:**
     - Each independent peer website (**MoveCo**, **PermitFlow**, **HomeConnect**, **PowerFlow**) is a full standalone Open Agentic Website with its own UI, `agent-manifest.json`, `<network>.network.json`, `runtime/`, `website_*` local tools, **and** its own independent MCP capability endpoint (`/mcp`) with persistent state, quotes, holds, idempotency keys, and Ed25519/HMAC cryptographic receipts.
     - When a user visits MoveCo directly, MoveCo's assistant uses `website_*` tools to interact with MoveCo's page.
     - When CONTINUITY loads MoveCo's peer network (or calls provider MCP capabilities after user consent), real live availability, temporary holds, quotes, rescheduling, and status reconciliation are executed across independent origins with full CORS and user-consent enforcement.
     - In addition, deterministic browser-local simulation adapters mirror the exact same provider contracts so judges can also test offline/static GitHub Pages deployments with zero server setup, clearly labelled as **Live Independent Origin Mode** vs. **Deterministic Browser Simulation Mode**.

3. **Mozilla Otari Compatibility:**
   - Default router in `agent-manifest.json`: `https://api.otari.ai/api/v1` (`byok_router: "https://api.otari.ai/api/v1"`).
   - Default model in `.hocon`: `alibaba/qwen-3.5-35b-a3b` (verified in Cognizant's `docs/providers/otari.md` to support browser CORS + tool calling without the `max_tokens` context-window bug).

4. **Naming & Brand Check (`CONTINUITY`):**
   - Searched Devpost, GitHub (`continuity agentic`), and web search. Existing GitHub repos using "continuity" focus on coding-agent session memory (`intent-continuity`, `openclaw-plugin-continuity`), not multi-provider Open Agentic Web commitment change coordination.
   - Working name **CONTINUITY** ("CONTINUITY — Open Agentic Change Coordinator") has no conflicting Devpost entry in the Open Agentic Web Challenge. Alternative brandable names documented if commercial trademark filing is later desired: **ReAlign**, **RippleSafe**, **CommitMesh**.

---

## 4. Competition Schedule Verification (Europe/Paris Time)

Verified directly from `https://cognizant-agenticweb.devpost.com/rules` on 2026-11-13:

| Milestone | Official Pacific Time (PST / UTC-8) | UTC | Europe/Paris (CET / UTC+1) |
| --- | --- | --- | --- |
| Submission Period Opens | Nov 11, 2026 @ 8:00 PM PST | Nov 12, 2026 @ 04:00 UTC | **Nov 12, 2026 @ 05:00 CET** |
| Submission Deadline | Jan 11, 2027 @ 8:00 AM PST | Jan 11, 2027 @ 16:00 UTC | **Jan 11, 2027 @ 17:00 CET** |
| Judging Period | Jan 11, 2027 (10:00 AM PST) – Jan 18, 2027 (5:00 PM PST) | Jan 11 (18:00 UTC) – Jan 19 (01:00 UTC) | **Jan 11 (19:00 CET) – Jan 19, 2027 (02:00 CET)** |
| Winners Announced | Around Jan 19, 2027 @ 8:00 AM PST | Jan 19, 2027 @ 16:00 UTC | **Jan 19, 2027 @ 17:00 CET** |

---

## 5. Execution Plan Summary

1. **Reusable Open-Source Packages (`packages/*`):**
   - `@continuity/shared-schemas` — Strict runtime JSON Schema & deterministic canonical JSON serializer + Web Crypto SHA-256 / Ed25519 receipt verifier.
   - `@continuity/mission-core` — Mission compiler, hard invariants vs. soft preferences validator, deterministic NL-to-Mission parser + LLM structured-proposal validator.
   - `@continuity/mission-graph` — Open Mission Graph (typed nodes, dependency edges, temporal/resource constraints, observed vs. assumed state).
   - `@continuity/impact-engine` — Bounded incremental subgraph impact analyzer with metrics (nodes examined, providers contacted, operations avoided).
   - `@continuity/constraint-solver` — Deterministic Minimal-Change Optimizer generating Plan A (Min Changes), Plan B (Lowest Cost), Plan C (Fastest Resolution) subject to hard constraints.
   - `@continuity/capability-adapter` — Semantic normalization across heterogeneous peer capabilities (`reschedule_booking`, `prepare_permit_draft`, `modify_appointment`, `hold_slot`, etc.).
   - `@continuity/approval-engine` — Cryptographically bound canonical operation approvals with automatic invalidation on price/date/argument drift.
   - `@continuity/outcome-reconciliation` & `@continuity/saga-engine` — 14-state explicit operation state machine (`DRAFT` -> `COMMITTED` / `UNKNOWN` / `RECONCILING` / `COMPENSATED` / `NEEDS_USER`), idempotency keys, prepare-first/commit-last execution, and safe Saga recovery.
   - `@continuity/chaos-lab` — 15 deterministic failure-injection scenarios with reproducible assertions and Before/After benchmark runner.

2. **Five Independent Open Agentic Websites (`apps/*` + `providers/*`):**
   - `apps/continuity-web` (Primary Coordinator)
   - `apps/demo-moveco` (Peer A — Moving reservations, quotes, temporary holds, rescheduling, signed Ed25519 receipts)
   - `apps/demo-permitflow` (Peer B — Municipal parking permit public eligibility & draft preparation; explicitly labeled simulation, never claims government API mutation)
   - `apps/demo-homeconnect` (Peer C — Fiber broadband installation appointments)
   - `apps/demo-powerflow` (Peer D — Electricity activation scheduling)

3. **Compliance & Verification:**
   - Every site embeds the exact `agentify-website/runtime` unchanged and passes `build_network.mjs --check` with **0 errors and 0 warnings** and `check_partner.mjs` with **0 errors**.
