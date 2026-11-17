# Devpost Submission Draft — CONTINUITY

> **Status (Nov 17, 2026):** Public URLs live and verified end to end (night theme by default). **Still required from the entrant:** (1) record your own voice over `CONTINUITY_v2_voice_ready.mp4` with `docs/video-production/v2/TELEPROMPTER_voice_ready.md` (Rules: the entrant must explain the project — never submit a TTS-narrated cut); (2) your Otari account email (form only); (3) the public YouTube link; (4) optional but strong: results of the 5-person timed user test (`docs/impact/USER_TEST_PROTOCOL.md`).

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
- **Screenshots to upload (`docs/submission/screenshots/`, captured from the redesigned UI):**
  0. **`13_live_provider_wall.png` — use this as the cover image.** Four real provider pages, framed from their own origin, each showing *Receipt Verified* after one approval (captured on the public deployment)
  1. `01_continuity_mission_baseline.png` — Landing: one change, every commitment re-aligned + live network map
  2. `02_ripple_recovery_prepared_plan.png` — Mission map + Approval Center after a provider failure is recovered
  3. `08_pareto_frontier_and_hold_countdown.png` — Plan comparison (A/C/Alternative) + what-if budget frontier
  4. `03_bound_approval_modal.png` — SHA-256-bound human approval dialog
  5. `04_committed_verified_ed25519.png` — Committed & verified with Ed25519 receipts
  6. `05_chaos_lab_15_passed.png` — Chaos Lab: 42 failure scenarios passing in the browser
  7. `09_mandate_arbiter_and_bypasses_denied.png` — Mandate & arbiter: 4 bypass attempts denied
  8. `06_open_agentic_web_runtime_otari_byok.png` — Open Agentic Web runtime, consent cards, Otari BYOK
  9. `07`, `10`, `11`, `12` — The four independent provider sites (MoveCo, PermitFlow, HomeConnect, PowerFlow)
  10. `14_community_builder_kit.png` — Standalone 8-tool Open Agentic Web Community Builder Kit (`community-kit.html`)
  11. `00_architecture_diagram.png` — Topology & trust boundaries
- **Built With:** `neuro-san`, `nsdeploy`, `open-agentic-web`, `mozilla-otari`, `project-nanda`, `a2a`, `mcp`, `javascript`, `web-crypto`, `html5`

---

## 2. Full Project Description (Copy-Ready Markdown)

### In one sentence
You change one date; CONTINUITY asks every affected company's own agentic website what is possible, holds the replacements, and lets you approve one plan — nothing is cancelled without you.

### Try it in 60 seconds — no API key
Open https://toskaman.github.io/continuity-agentic-web/?demo=1. The demo starts by itself: a provider failure is injected and recovered, plans are compared, replacements are held and the approval dialog opens. Approve, then scroll to **Watch the providers react**: the four providers' own pages, loaded cross-origin, each verify their signed receipt and update the booking in front of you.

### The problem
Agent demos usually book something new. Real life breaks *after* things are booked. Moving house from Tuesday to Friday touches a moving crew, a parking permit, a fiber installation, an electricity switch-on, storage and a furniture delivery — six bookings, six websites (~18 manual steps by our task model), and a real risk of cancelling a working booking before its replacement exists.

### What CONTINUITY does
1. **Understands the change** — plain English, pasted confirmation emails or an `.ics` calendar become hard rules: budget cap, hold before release, never cancel without asking.
2. **Finds only what is affected** — 3 of the 6 bookings move; bookings outside the change are never contacted.
3. **Asks each provider's own agentic website** — after a consent card, and sending only the booking reference and the new date.
4. **Compares plans** — fewest changes, lowest cost, fastest; with a what-if budget slider.
5. **Holds first, commits last** — one approval, cryptographically bound to the exact operations and prices (a €0.01 drift invalidates it).
6. **Verifies** — every commit returns a signed receipt that the provider's page checks itself; you get the updated calendar and an audit file.

### Three proofs that it works
1. **Independent websites really cooperate.** CONTINUITY (`toskaman.github.io`) and four separately deployed provider sites (`gpaschercher-sudo.github.io/...`) each publish their own `agent-manifest.json`, agent network and action bridge. On approval, each provider page verifies an Ed25519 receipt *in its own browsing context* before it moves the booking — visible live on the provider wall.
2. **Nothing is ever cancelled by accident.** 180 end-to-end runs across 5 scenarios (relocation, provider failure, outpatient surgery, expo freight, calendar import): 100 % verified completion, **0 cancel calls**, 3/3 signed receipts per run (`docs/benchmarks/BEFORE_AFTER.md`).
3. **Safety is code, not a prompt.** The language model explains and drafts; it cannot raise the budget, cancel or commit. **42 failure scenarios** (forged receipts, price drift after approval, timeouts, data leaks, manifest tampering…) run in your browser in the Chaos Lab; 117 automated tests in 32 suites pass; Lighthouse 100 in every category including *Agentic Browsing*.

### How it uses the Open Agentic Web (Profile 0.2)
Every site ships its UI, `agent-manifest.json`, resolved `.network.json`, a single-turn `facts/` network, the browser `runtime/`, an action bridge, a NANDA `ai-catalog.json` and an A2A agent card. The mesh is bidirectional: CONTINUITY consults the providers and each provider's assistant can consult CONTINUITY. Provider networks run in the visitor's browser on the visitor's own model router (default **Mozilla Otari**, or zero-key on-device models), so no provider ever sees the visitor's API key. Site actions are also exposed through WebMCP.

### Shared with the community (Apache-2.0)
- **Builder Kit** (`community-kit.html`, zero backend): validate any site against the 9-point MVP 0.2 checklist, generate NANDA / A2A cards, convert Google ADK or OpenAI Agents configs to Neuro SAN, scan peer instructions before executing them, verify audit bundles offline.
- **26 zero-dependency ES modules** (`packages/*`) — cross-origin receipt bridge for static sites, bound approvals, saga engine, impact engine, constraint solver, safety hooks, conformance auditor… Technical details: `README.md`.

### What is real and what is a demo
The protocols are real: separate deployments, CORS, MCP, consent, signed receipts, bound approvals. The four providers are demonstration services built for this challenge. No real bookings, payments or municipal permits are touched; PermitFlow only prepares draft applications.

### Built during the challenge
First commit November 13, 2026, after the submission period opened (November 11, 2026, 8:00 pm PT).

---

## 3. Mozilla Otari Usage & Constructive Feedback (Required When Using Otari)

- **Otari Account Email:** paste it in the Devpost form only (kept out of this public repo; stored locally in the git-ignored `.env.local`).
- **Verified Nov 14, 2026 with the entrant's own Otari key:** `alibaba/qwen-3.5-35b-a3b` is listed, returns a correct tool call, and the endpoint allows browser (CORS) requests.
- **Second issue found (optional extra feedback):** *"EU keys (`otk_v1_eu_…`) are rejected by `api.otari.ai` with HTTP 421 and must use `eu.api.otari.ai`; a redirect, or a region field in the dashboard's copy-paste snippet, would save browser apps from a confusing first error. Our sites now switch the URL automatically when an EU key is pasted."*
- **How Otari Is Used:** All 5 Open Agentic Websites configure Hosted Mozilla Otari (`https://api.otari.ai/api/v1`) as their default CORS-enabled browser `llm_router` and `byok_router` with `alibaba/qwen-3.5-35b-a3b` for multi-agent tool calling, allowing visitors to bring one Otari key across all composed peer networks without site-funded server proxies.
- **Two-Sentence Feedback on Problem Faced & Suggested Improvement:**
  > *"When calling Hosted Otari (`https://api.otari.ai/api/v1/chat/completions`) directly from a browser runtime that omits an explicit `max_tokens` field, certain open-weight models (such as `alibaba/qwen3-14b` and `alibaba/qwen3-30b-a3b`) fail on every turn with HTTP 400 because the upstream defaults `max_tokens` to the model's entire 40,960-token context window, leaving zero room for the prompt. Having Otari clamp default `max_tokens` to `min(default_cap, context_window - prompt_tokens)` (and exposing a `tool_calling_verified` filter on `GET /api/v1/models`) would make zero-backend browser agent sites work reliably across every listed model."*
