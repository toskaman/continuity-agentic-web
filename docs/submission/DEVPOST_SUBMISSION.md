# Devpost Submission Draft — CONTINUITY

> **Status (Nov 14, 2026):** Public URLs live and verified end to end after the UI redesign; 13 fresh screenshots in `docs/submission/screenshots/`. **Still required from the entrant:** (1) a new < 2 min video **narrated in your own voice** (Rules: the entrant must explain the project; the existing `CONTINUITY_JURY_MASTER_OMEGA.mp4` uses Kokoro TTS and the pre-redesign UI, so it must not be submitted) — script in `VIDEO_RECORDING_SCRIPT.md`; (2) your Otari account email; (3) the YouTube link.

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
  10. `14_community_builder_kit.png` — Standalone 6-tool Open Agentic Web Community Builder Kit (`community-kit.html`)
  11. `00_architecture_diagram.png` — Topology & trust boundaries
- **Built With:** `neuro-san`, `nsdeploy`, `open-agentic-web`, `mozilla-otari`, `project-nanda`, `a2a`, `mcp`, `javascript`, `web-crypto`, `html5`

---

## 2. Full Project Description (Copy-Ready Markdown)

### In one sentence
When one date in your life changes, CONTINUITY asks every affected provider's own agentic website what is possible, holds replacements before releasing anything, and lets you approve one verified plan instead of calling six companies.

### Try it in 60 seconds — no API key
Open https://toskaman.github.io/continuity-agentic-web/?demo=1 — the demo starts by itself (or click **Run the live demo**). A provider failure is injected and recovered, plans are compared, replacements are held, and an approval dialog opens. Approve: three providers commit with signed receipts and three bookings stay untouched. The page then shows the four providers' real pages, framed from their own origin: each verifies its signed receipt itself and updates its booking in front of you.

### The problem
Agent demos usually plan something new. Real life breaks *after* things are booked. Moving house from Tuesday to Friday touches a moving crew, a parking permit, a fiber installation, an electricity activation, storage and a furniture delivery — six companies, six websites, and a real risk of cancelling a working booking before a replacement exists, or paying fees nobody needed to pay.

### What CONTINUITY does
1. **Understands the change.** You write it in plain English (or import confirmation emails or an `.ics` calendar). It becomes hard rules: budget cap, keep existing bookings until replaced, never cancel without asking.
2. **Finds only what is affected.** A dependency graph of your bookings shows which ones really move. Bookings outside the change are never contacted.
3. **Asks each provider's own agentic website.** Each provider publishes its own `agent-manifest.json` and agent network. CONTINUITY shows a consent card before contacting one, and sends it only the booking reference and target date.
4. **Compares plans.** A deterministic optimizer ranks plans by changes, cost and speed (Plan A minimum changes, B lowest cost, C fastest — merged when one plan wins several), with a what-if budget slider.
5. **Holds first, commits last.** Replacements are held while your original bookings stay active. You approve once; the approval is bound to the exact operations and prices (a €0.01 change invalidates it).
6. **Verifies.** Every commit returns an Ed25519-signed receipt. Each provider site verifies it on its own origin. You can export the updated calendar and a signed audit file.

### How it uses the Open Agentic Web
Five independent websites on two origins — CONTINUITY (`toskaman.github.io`) and four providers (`gpaschercher-sudo.github.io`): MoveCo Express, PermitFlow Civic Prep, HomeConnect Fiber and PowerFlow Energy — connected as a **bidirectional Open Agentic Web mesh** (CONTINUITY consults all four providers, and each provider's assistant can also consult CONTINUITY cross-origin). Each publishes its own UI, `agent-manifest.json`, resolved `.network.json`, single-turn `facts/<network>_facts` network, browser `runtime/`, action bridge, Project NANDA `ai-catalog.json` (`urn:air:...`), and A2A v1.0 agent card. Provider networks run in the visitor's browser on the visitor's own model router (default: Mozilla Otari, plus optional zero-key on-device Chrome `LanguageModel` / local Ollama), so providers never see the visitor's API key. All five sites pass `build_network.mjs --check` (0 warnings) and all 9 `check_partner.mjs` bidirectional checks. Site actions are also exposed through WebMCP (`navigator.modelContext`).

### Why you can trust it
- The language model interprets and explains; it cannot raise the budget, enable cancellations or commit anything. Those rules are enforced in code.
- Network timeouts after a commit become `UNKNOWN` and are reconciled, not blindly retried.
- **Checked with a real model, not only mocks:** the real engine on hosted Otari with the default model consulted all four providers — 4 consent cards, no provider contacted before consent, API key sent to the router only (`docs/benchmarks/LIVE_MODEL_CHECK.md`).
- **Chaos Lab:** 42 failure scenarios (forged & cross-provider spoofed receipts, BroadcastChannel sub-origin forgeries, SSRF & cross-origin manifest escapes, Luhn card & Mod-97 IBAN outbound DLP leaks, post-peer confused-deputy write escalations, RFC 6962 Merkle second-preimage & selective-disclosure proofs, price drift after approval, timeouts, Unicode Tag & Markdown beacon exfiltrations, TOFU SHA-256 rug-pulls, NANDA Reach `410` card moves, hash-ladder overspend & cross-mission replays, Ed25519 key revocations, partial hold rollbacks, sub-agent toolbox escalations, chained multi-wave replans, mandate floor exhaustion, post-export bundle tampering…) run in your browser.
- **Measured:** 180 end-to-end sagas across 5 regimes (`40` normal relocation + `40` ripple recovery on 5 live origins + `30` outpatient surgery + `30` expo freight + `40` hybrid cold-start `.ics` runs), 100% verified completion, 0 cancel calls, 3/3 signed receipts per run; full live 5-origin run ~10 ms median on loopback, plus an empirical uncoordinated split-brain probe showing 2 premature mutations when MoveCo's Friday van is full (`docs/benchmarks/BEFORE_AFTER.md`). **117 automated tests in 32 suites** (including real Headless Chromium CDP Desktop & `390x844` Mobile E2E) pass in CI. Lighthouse 13.6 scores all five sites 100 on desktop in Performance, Accessibility, Best Practices, SEO and the new **Agentic Browsing** category (`docs/benchmarks/BROWSER_PERF_AND_MEMORY_AUDIT.md`).

### Shared with the community (Apache-2.0)
- **Live 6-Tool Community Builder Kit Web App:** `https://toskaman.github.io/continuity-agentic-web/community-kit.html` — zero-backend 9-point MVP 0.2 & Project NANDA validator (tested live against external community peers) + GitHub Actions SARIF `.yml` generator, visible-DOM `data-agent-facts` → `facts/` compiler (with build-time hidden prompt-injection guard), NANDA `ai-catalog.json` + Poppy `nandaindex.org/reach` `poppy.json` + A2A `agent-card.json` generator, multi-agent Neuro SAN converter, offline zero-trust cryptographic audit bundle verifier, and pre-execution Peer Instruction Firewall & TOFU Rug-Pull scanner.
- **26 zero-dependency ES modules (`packages/*`):** cross-origin browser bridge with signed `#continuity_receipt` handoff for static sites; official Issue #32 `engine.addCheck()` runtime safety hooks with ISO/IEC 7812 Luhn payment-card & ISO 13616 Mod-97 IBAN outbound DLP and post-peer taint lock (`@continuity/safety-hooks`); RFC 6962 domain-separated SHA-256 Merkle Mission Passports with salted 1-booking selective disclosure and Critical-Path Slack analyzer (`@continuity/merkle-passport`); pre-execution peer instruction firewall & TOFU SHA-256 rug-pull guard (`@continuity/peer-firewall`); zero-client-ID 1-click OpenRouter OAuth PKCE S256 onboarding (`@continuity/openrouter-pkce`); least-privilege sub-agent `website_*` toolbox scoper & token optimizer (`@continuity/toolbox-scoper`); zero-ceiling-leak SHA-256 hash-ladder budget range proof (`@continuity/zk-budget-attestation`); hybrid Open Agentic Web + legacy Hold-First transition playbook (`@continuity/transition-playbook`) solving the cold-start transition for personal `.ics`/email schedules; 9-point MVP 0.2 + Facts + NANDA (`urn:air`, `ai-catalog.json`, Poppy `nandaindex.org/reach` v1, `POST /resolve` `draft-raskar-02`) conformance auditor & SARIF/bundle-verifier CLI; zero-key on-device Chrome `LanguageModel` (Gemini Nano) & local Ollama router; visible `data-agent-facts` compiler; Pareto + counterfactual MUS relaxation + 6-day horizon sweep solver; Google ADK / OpenAI Agents → Neuro SAN HOCON converter; email/`.ics`/JSON intake compiler & offline cryptographic bundle verifier; and dual `document.modelContext` + `navigator.modelContext` WebMCP confirmation adapter.

### What is real and what is a demo
The protocols are real: separate origins, CORS, MCP, signed receipts, consent, approvals. The four providers are demonstration services built for this challenge. No real bookings, payments or municipal permits are touched; PermitFlow only prepares draft applications.

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
