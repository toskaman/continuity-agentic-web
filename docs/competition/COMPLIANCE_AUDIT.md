# Official Competition Compliance Audit — CONTINUITY

**Competition:** Open Agentic Web Challenge (Cognizant)
**Official Portal:** `https://cognizant-agenticweb.devpost.com/`
**Official Rules:** `https://cognizant-agenticweb.devpost.com/rules`
**Normative Spec:** `https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md` (MVP Profile 0.2, 6 November 2026)
**Audit Date:** 2026-11-13

---

## 1. Schedule & Timezone Verification (Europe/Paris — CET / UTC+1)

| Event | Official Rules (Pacific Time) | UTC | Europe/Paris (CET) | Status |
| --- | --- | --- | --- | --- |
| Submission Period Opens | Nov 11, 2026 @ 08:00 PM PST | Nov 12, 2026 @ 04:00 UTC | **Nov 12, 2026 @ 05:00 CET** | **VERIFIED** |
| Submission Deadline | Jan 11, 2027 @ 08:00 AM PST | Jan 11, 2027 @ 16:00 UTC | **Jan 11, 2027 @ 17:00 CET** | **VERIFIED** |
| Judging Period | Jan 11, 2027 (10:00 AM PST) – Jan 18, 2027 (05:00 PM PST) | Jan 11 (18:00 UTC) – Jan 19 (01:00 UTC) | **Jan 11 (19:00 CET) – Jan 19, 2027 (02:00 CET)** | **VERIFIED** |
| Winners Announced | Around Jan 19, 2027 @ 08:00 AM PST | Jan 19, 2027 @ 16:00 UTC | **Jan 19, 2027 @ 17:00 CET** | **VERIFIED** |

---

## 2. Stage One Pass/Fail Conformance Gate (MVP Profile 0.2 + Rules §4 & §6)

| Requirement | Official Source | Implementation Evidence | Status |
| --- | --- | --- | --- |
| **Publicly accessible `.json` agent network file** | Rules §4; MVP Spec §2 & §3.3 | `apps/continuity-web/continuity_coordinator.network.json` + 4 peer `.network.json` files compiled and validated via `build_network.mjs --check` with 0 errors and 0 warnings. | **TESTED** |
| **Public `agent-manifest.json`** | MVP Spec §1, §3.2, §3.3 | Published at root of all 5 sites (`apps/*/agent-manifest.json`), declaring `networks`, `front_man`, `hocon`, `llm_router`, `allowed_peers`, `peer_policy: "closed"`, `deployment: "static"`, and `actions`. | **TESTED** |
| **Browser `runtime` resource** | Rules §4; MVP Spec §3 | Exact unmodified Cognizant reference runtime (`skills/agentify-website/runtime/` from `nsdeploy` commit `53a787c`) embedded in `apps/*/runtime/`. Verified live in Chromium (`window.__nsweb.engine`). | **TESTED** |
| **Interactive user interface** | Rules §4 | Full accessible UI (`Lighthouse 100/100/100` *(re-measured after the redesign with Lighthouse 13.6.0 on all 5 live sites: 100 in every category on desktop — see `docs/benchmarks/BROWSER_PERF_AND_MEMORY_AUDIT.md` §3)*) with deterministic mission coordinator + embedded CRUSE/chat runtime mount (`#agent-app`). | **TESTED** |
| **Pluggable LLM & BYOK configuration UI** | Rules §4; MVP Spec §4 | Default router set to Hosted Mozilla Otari (`https://api.otari.ai/api/v1`, model `alibaba/qwen-3.5-35b-a3b`) with full `⚙ AI model settings` BYOK override panel. | **TESTED** |
| **Website interaction (`website_*` actions)** | Rules §4; MVP Spec §3.1 | `site-actions.js` registers typed `read`, `write`, and `irreversible` capabilities (`get_mission_state`, `analyze_and_prepare_change`, `select_change_plan`, `commit_prepared_change_package`). | **TESTED** |
| **Cross-origin peer network composition & consent** | MVP Spec §3.2 & §5 | `peer_network_specialist` links to 4 independent peer origins (`moveco_dispatch`, `permitflow_advisor`, `homeconnect_scheduler`, `powerflow_grid`). Verified by `tests/integration/agentic_web_composition.test.mjs` (`I1`, `I2`) and `check_partner.mjs`. | **TESTED** |
| **BYOK key isolation & `sly_data` privacy** | MVP Spec §4 & §5 | Proven in `I1` & `S4`: `Authorization: Bearer` header is transmitted exclusively to the active LLM router and NEVER to any peer origin; `sly_data` is deny-by-default (`{}`). | **TESTED** |
| **Unknown outcome non-retry safety** | MVP Spec §3.1 & §5 | Proven in `CHAOS_03` and `CHAOS_15`: timeouts after dispatch enter `UNKNOWN` -> `RECONCILING` via idempotency key and never blindly repeat writes. | **TESTED** |
| **Public HTTPS deployment** | Rules §4 ("Provide the URL to your (public) open agentic web site") | Live at `https://toskaman.github.io/continuity-agentic-web/` + 4 independent peers on `https://gpaschercher-sudo.github.io/*`. Verified live in Chromium (`Lighthouse 100/100/100` *(re-measured after the redesign with Lighthouse 13.6.0 on all 5 live sites: 100 in every category on desktop — see `docs/benchmarks/BROWSER_PERF_AND_MEMORY_AUDIT.md` §3)*, `0` console errors, `4/4` cross-origin `resolveRemote()` peer loads, `3/3` Ed25519 receipts, `15/15` Chaos Lab). | **TESTED** |
| **YouTube Demo Video (< 2 min, human voiceover)** | Rules §4 ("less than two (2) minutes... Entrant explaining the Project (not AI generated)") | Complete shot-by-shot storyboard & script prepared in `docs/demo/VIDEO_STORYBOARD.md`. Recording entrant's own voice & uploading to YouTube requires entrant action. | **BLOCKED** *(entrant human voice recording & YouTube upload required)* |
| **Mozilla Otari Registration & Feedback Note** | Devpost Overview ("Provide the email on your Otari account... sentence or two problem/improvement") | Otari default integration (`https://api.otari.ai/api/v1` + `alibaba/qwen-3.5-35b-a3b`) implemented; concrete technical feedback drafted in `docs/submission/DEVPOST_SUBMISSION.md` based on real `max_tokens` context-window behavior documented in `docs/providers/otari.md`. | **IMPLEMENTED** |
| **Open-Source License Compliance** | Rules §4 & §7 | Apache-2.0 `LICENSE` preserved at root and across all `@continuity/*` community packages, matching upstream `cognizant-ai-labs/agentic-web` and `nsdeploy`. | **VERIFIED** |

---

## 3. Official Judging Rubric Matrix (4 Equally Weighted Criteria — 25% Each)

Verified from Official Rules §6 ("evaluated in Stage Two based on the following equally weighted criteria"):

1. **Technological Implementation (25%):**
   - *Evidence:* 5 spec-compliant Open Agentic Websites in a **bidirectional cross-origin mesh** passing `build_network.mjs --check` (0 errors, 0 warnings) & all 9 `check_partner.mjs` checks, single-turn `facts/<network>_facts` networks, Project NANDA `ai-catalog.json` + Poppy `nandaindex.org/reach` v1 `poppy.json` + `POST /resolve` (`draft-raskar-02` §6), pre-execution `@continuity/peer-firewall` & TOFU SHA-256 pinning, 1-click OpenRouter OAuth PKCE S256, MCP `2025-06-18` JSON-RPC 2.0 servers, deterministic `@continuity/impact-engine` + `@continuity/constraint-solver` (NSGA-II Pareto + counterfactual MUS relaxation + 6-day horizon sweep), SHA-256 bound approvals, `€0` pre-commit hold release, Ed25519 receipt & offline bundle verification, modular ES UI (`modules/*.js`), **117/117 automated tests in 32 suites** (including Headless Chromium Desktop & Mobile CDP E2E).
2. **Design (25%):**
   - *Evidence:* Unified 5-identity design system (`Lighthouse 100` across all 5 categories incl. Agentic Browsing), zero horizontal overflow at `390x844` mobile & `1440x900` desktop, keyboard-navigable SVG Mission Dependency Graph (`ArrowLeft/Right` + `p` pin toggle + non-color state icons/badges), 1-click `?demo=1` judge path, explicit `Release holds (€0)` reversibility button, and live 4-origin provider reaction wall.
3. **Potential Impact (25%):**
   - *Evidence:* Solves day-two multi-provider schedule changes across 3 modeled domains + drag-and-drop `.ics`/email/JSON import with **Hybrid Hold-First Transition Playbooks (`@continuity/transition-playbook`)** for unagentified real-world vendors, AND contributes both the **standalone 8-tool Community Builder Kit (`community-kit.html`)** and **26 zero-dependency Apache-2.0 modules** (`packages/*` + `continuity-audit --sarif` / `--verify-bundle` / `--verify-passport` CLI). Measured `N = 180` sagas + live split-brain failure probe in `docs/benchmarks/BEFORE_AFTER.md`.
4. **Quality of the Idea (25%):**
   - *Evidence:* Moves beyond greenfield single-site chatbots to **day-two safe post-commitment change reconciliation** across autonomous websites (hold-before-release, unaffected commitment preservation, counterfactual relaxation, unknown-outcome reconciliation, zero-trust offline receipt verification).
