# TITAN CINEMA OMEGA — JURY COVERAGE MATRIX, EVIDENCE LEDGER, VISUAL BIBLE & DEMO RUNBOOK

> **Superseded (Nov 14, 2026).** This material documents the earlier, pre-redesign interface and a synthetic (Kokoro TTS) narration, which the Official Rules do not allow for the submitted video. Use [`docs/submission/VIDEO_RECORDING_SCRIPT.md`](../submission/VIDEO_RECORDING_SCRIPT.md) for the entrant-narrated video.


**Project:** CONTINUITY — Safe Multi-Provider Change Coordinator for the Open Agentic Web
**Competition:** Cognizant Open Agentic Web Challenge (`https://cognizant-agenticweb.devpost.com/rules`)
**Official Video Limit:** Strictly **< 120.00 seconds** (2 minutes). Target Master Duration: **104–112 seconds**.
**Important Rule Disclosure (Rules §4):** The final Devpost YouTube submission requires the **Entrant explaining the Project in their own human voice (not AI-generated)**. This TITAN CINEMA OMEGA master (`CONTINUITY_JURY_MASTER_OMEGA.mp4`) uses **Kokoro-82M (`am_michael`)** as requested by the production prompt to deliver the complete reference cut, exact timing cues, `.srt` subtitles, and audio/visual blueprint; we also export a clean voice-ready stems guide so you can record your 108-second live voiceover track seamlessly if desired.

---

## 1. Central Creative Proposition

> We transform **fragmented, error-prone manual rescheduling across six independent relocation services** into **one safe, budget-bounded, cryptographically verified change package**, by **composing portable browser-executed Open Agentic Web peer networks with a deterministic Minimal-Change & Hold-Before-Commit Saga Engine**, demonstrated by **live 5-origin execution, Ripple Failure overflow recovery, Ed25519 provider receipts, and a 15-scenario Chaos Lab**.

---

## 2. Jury Coverage Matrix (Official Criteria — 25% Each)

| Official Criterion / Judge Persona | What the Reviewer Needs to Believe | Exact Scene Addressing It | Evidence Source | Status |
| --- | --- | --- | --- | --- |
| **Stage One Gate — Conforming Open Agentic Website** | Public `agent-manifest.json`, resolved `.network.json`, browser `runtime/`, UI, and Otari BYOK settings exist and run in standard browsers. | **Scene 3** (Open Agentic Web Topology) & **Scene 7** (Runtime + Mozilla Otari BYOK) | `apps/*/agent-manifest.json`, `build_all_networks.mjs --check`, live `https://toskaman.github.io/continuity-agentic-web/` | **VERIFIED** |
| **1. Technological Implementation (25%)** *(Babak Hodjat — Neuro SAN / Multi-Agent Safety)* | Real cross-origin peer composition, consent-before-contact, BYOK key isolation, deterministic invariants, SHA-256 approval binding, Ed25519 receipts, unknown-outcome reconciliation. | **Scene 3, Scene 4, Scene 5, Scene 6, Scene 7** | `packages/*`, `tests/integration/agentic_web_composition.test.mjs`, `tests/chaos/chaos_suite.test.mjs` (`27/27` pass) | **VERIFIED** |
| **2. Design (25%)** | Cohesive, enterprise-grade software product (`Lighthouse 100/100/100`), instant comprehension, accessible state badges (never color alone), clean progressive disclosure. | **Scene 2, Scene 4, Scene 5, Scene 6** | Live UI captures (`1920×1080`), Chromium Lighthouse `100/100/100` across all 5 URLs | **VERIFIED** |
| **3. Potential Impact (25%)** *(Ramesh Raskar — MIT NANDA & Community Blocks)* | Solves real day-two multi-company change pain (`18` manual actions -> `2`) AND contributes **12 open-source Apache-2.0 packages** including `@continuity/nanda-resolver` & A2A v1.0 Agent Cards. | **Scene 1, Scene 2** (Before/After), **Scene 3** (NANDA/A2A), **Scene 7 & Scene 8** (12 Open-Source Modules + Benchmarks) | `packages/*` (12 modules), `docs/benchmarks/BEFORE_AFTER.md` (`N=60` live runs) | **VERIFIED** |
| **4. Quality of the Idea (25%)** *(Risto Miikkulainen — Optimization & Novelty)* | Non-obvious leap beyond greenfield chatbots: **post-commitment Minimal-Change Optimization** + **Hold-Before-Release** + **Ripple Failure Recovery** without touching unaffected commitments. | **Scene 1, Scene 4, Scene 5** | `packages/impact-engine`, `packages/constraint-solver`, `MoveCo` overflow crew recovery | **VERIFIED** |

---

## 3. Evidence Ledger (Claim Traceability)

| Claim ID | Spoken / On-Screen Claim | Claim Type | Evidence Source | Verification Method | Visual Proof in Film |
| --- | --- | --- | --- | --- | --- |
| **CLM-01** | Shifting a move from Tuesday to Friday normally takes 18 manual lookups, checks, and rebookings across 6 services — reduced to 2 user actions in CONTINUITY. | **REPRODUCIBLE TEST / STRUCTURAL COUNT** | `docs/benchmarks/BEFORE_AFTER.md` | `node scripts/run_benchmarks.mjs` (`N=60` runs) | Scene 2 animated 2D Before/After workflow comparison |
| **CLM-02** | 5 independent Open Agentic Websites expose `agent-manifest.json`, Neuro SAN `.network.json`, A2A v1.0 `agent-card.json`, and run in the visitor's browser on Mozilla Otari BYOK without leaking the API key. | **LIVE / REAL PRODUCT** | `apps/*/agent-manifest.json`, `tests/integration/agentic_web_composition.test.mjs` | `check_partner.mjs` + `I1`/`I2` tests + HTTPS browser verification | Scene 3 Blender 3D multi-origin mesh + Scene 7 live Otari runtime & MoveCo peer site |
| **CLM-03** | Bounded Impact Engine excludes unaffected commitments (`CityVault Pod` Nov 15–29 & `NordicLoom Saturday Delivery`) — `0` unnecessary calls; Minimal-Change Solver preserves `PowerFlow` Tuesday (`3` changed, `3` preserved untouched). | **RECORDED REAL PRODUCT** | `packages/impact-engine/index.js`, `packages/constraint-solver/index.js` | `U3`, `U4` unit tests + recorded Chromium interaction | Scene 4 & Scene 5 live UI KPI `3 / 6` Affected, `3` Preserved Untouched |
| **CLM-04** | When MoveCo's primary Friday 08:00 crew is full (injected Ripple Failure), CONTINUITY recovers via MoveCo Partner Overflow Fleet at `€659.00` (`<= €700.00` hard cap) while keeping original bookings held (`hold_mc_1`, `hold_hc_1`). | **RECORDED REAL PRODUCT (LABELED SIMULATION PROVIDERS)** | `providers/shared/peer_definitions.mjs`, `packages/saga-engine/index.js` | `CHAOS_07` + live browser capture | Scene 4 & Scene 5 amber MoveCo Alert + `Plan A €659.00` + active hold IDs |
| **CLM-05** | Human approvals are SHA-256 bound to canonical JSON parameters (`€0.01` fee drift invalidates approval); commits reconcile `3/3` `VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE` receipts. | **RECORDED REAL PRODUCT + REPRODUCIBLE TEST** | `packages/approval-engine/index.js`, `packages/proof-verifier/index.js` | `U7`, `C3`, `S3`, `CHAOS_02`, `CHAOS_05` | Scene 6 real modal confirmation click -> green `✓ COMMITTED` graph & Ed25519 badges |
| **CLM-06** | Built-in Chaos Lab passes `15/15` distributed fault scenarios (`UNKNOWN` timeout reconciliation without duplicate writes, forged receipt rejection, cycle guard, partial-halt safety) + `27/27` automated tests & `12` Apache-2.0 modules. | **RECORDED REAL PRODUCT + REPRODUCIBLE TEST** | `packages/chaos-lab/index.js`, `scripts/run_all_tests.mjs` | `node scripts/run_all_tests.mjs` | Scene 7 live Chaos Lab table (`15/15 scenarios passed`) |

---

## 4. Visual Bible & Attention Architecture

- **Aesthetic Direction:** Precision Enterprise Product Film (Linear / Stripe / Apple Keynote restraint).
- **Color System (sRGB Hex — Verified WCAG Contrast):**
  - Canvas Deep Slate: `#080B12` | Elevated Surface: `#0E1422` | Subtle Panel: `#141C2F` | Crisp Border: `#23304A`
  - Primary Signal Blue: `#3B82F6` / `#60A5FA` | Verified Emerald: `#10B981` / `#065F46` | Ripple Amber: `#F59E0B` | Primary Ink: `#F8FAFC` | Secondary Ink: `#CBD5E1`
- **Typography:** `Inter` (`400`, `600`, `700`, `800`) for display & UI; `JetBrains Mono` (`500`, `700`) for hashes, booking refs, URNs, and metrics.
- **One Attention System Rules:**
  - **Virtual Pointer:** Clean white precision arrow with `#0F172A` stroke and subtle drop shadow; smooth `power3.inOut` travel; brief click pulse **only** on genuine recorded UI clicks (`Inject Ripple Failure`, `1. Analyze Impact`, `2. Review & Approve`, `Approve & commit`, `Chaos Lab` tab).
  - **Selective Dimming & Blur:** When inspecting dense UI regions (KPI bar, MoveCo Ripple Alert, Hold IDs, Ed25519 Proof badges), a feathered surrounding vignette dims non-target panels while keeping the exact target 100% crisp (`blur(0px)`) inside a pixel-verified rounded focus frame (`border: 2px solid #60A5FA` or `#10B981`).
  - **Zero Central Bar Defect:** No split-screen center divider bars, progress lines, or stray borders crossing `x = 960` or `y = 540`. Verified by frame-by-frame inspection.

---

## 5. Demo Runbook (Clean Reproducibility)

1. **Build & Compliance Precheck:** `node scripts/run_all_tests.mjs` (`0` errors, `27/27` pass).
2. **Start Live 5-Origin Servers:** `node scripts/serve_ecosystem.mjs` (`127.0.0.1:8080`, `127.0.0.1:8081`, `localhost:8082`, `127.0.0.1:8083`, `localhost:8084`).
3. **Deterministic Reset:** `POST /api/reset` on all 4 peer origins (`MC-8841`, `PF-2049`, `HC-5510`, `PFW-9921` restored to Tuesday `2026-11-17`).
4. **3D Blender Render:** `blender.exe -b -P Z:\continuity-titan-omega\blender\render_agentic_mesh_3d.py` -> `agentic_mesh_3d.mp4` (`1920×1080`, 30 fps).
5. **Live Browser Footage Capture:** `node Z:\continuity-titan-omega\capture_live_demo.mjs` records deterministic `1920×1080` 30 fps footage with exact bounding-box coordinates saved to `ui_bounds.json` so every virtual cursor move and focus outline is 100% pixel-locked!
6. **Kokoro Narration:** `hyperframes tts` (`am_michael`, 24 kHz -> mastered 48 kHz stereo `-16 LUFS` / `-1 dBTP` ceiling).
7. **Brag Full + Jury Master Renders:** `hyperframes check` (`0` errors) -> `hyperframes render --quality delivery`.
