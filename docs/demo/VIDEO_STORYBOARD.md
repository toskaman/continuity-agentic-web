# Two-Minute YouTube Demonstration Storyboard & Voiceover Script

> **Superseded (Nov 14, 2026).** This material documents the earlier, pre-redesign interface and a synthetic (Kokoro TTS) narration, which the Official Rules do not allow for the submitted video. Use [`docs/submission/VIDEO_RECORDING_SCRIPT.md`](../submission/VIDEO_RECORDING_SCRIPT.md) for the entrant-narrated video.


**Target Duration:** `01:48` (108 seconds — safely below the strict 2:00 maximum in Official Rules §4)
**Mandatory Rule Reminder:** Official Rules §4 require footage of the Project running in a web browser **and the Entrant explaining the Project in their own voice (not AI-generated)**, with no third-party copyrighted music or unauthorized trademarks.

---

## Pre-Recording Setup (30 Seconds)

1. Start all 5 independent origins locally (or open the deployed public HTTPS URLs):
   ```bash
   node scripts/serve_ecosystem.mjs
   ```
2. Open `http://127.0.0.1:8080/` in Chrome/Edge at `1920x1080` (100% zoom). Confirm top badge reads **`Live Independent Peer Origins (4 Active)`**.
3. Open `http://127.0.0.1:8081/` (MoveCo Express) and `http://localhost:8082/` (PermitFlow Civic Prep) in adjacent tabs to show they are standalone Open Agentic Websites.
4. Optional: In `#agent-app` → `⚙ AI model settings`, paste your Mozilla Otari API key (`https://api.otari.ai/api/v1`, `alibaba/qwen-3.5-35b-a3b`) and click **Save and start**.

---

## Shot-by-Shot Script (`00:00` – `01:48`)

### `00:00 – 00:10` · THE HOOK & EXISTING MISSION
- **On Screen:** CONTINUITY main screen showing the 6 confirmed relocation commitments on the SVG Mission Dependency Graph (`€624.00` baseline).
- **Voiceover (Entrant):** *"Changing one date in real life shouldn't force you to manually reorganize six separate companies or risk cancelling working reservations too early. This is CONTINUITY — a safe multi-provider change coordinator built for the Open Agentic Web."*

### `00:10 – 00:26` · INDEPENDENT OPEN AGENTIC WEBSITES
- **On Screen:** Briefly click the MoveCo Express (`127.0.0.1:8081`) and PermitFlow (`localhost:8082`) tabs, showing each has its own UI, `agent-manifest.json`, and browser runtime, then return to CONTINUITY and scroll briefly to `#agent-app` showing Mozilla Otari BYOK settings and partner consent cards.
- **Voiceover:** *"Instead of a closed marketplace, MoveCo, PermitFlow, HomeConnect, and PowerFlow are independent Open Agentic Websites on separate origins. CONTINUITY composes their published Neuro SAN agent networks directly in the browser on the user's chosen Mozilla Otari router — with explicit consent cards and zero API key leakage."*

### `00:26 – 00:46` · RIPPLE FAILURE INJECTION & IMPACT ANALYSIS
- **On Screen:** Click **`Inject Ripple Failure`** (top bar turns amber: *MoveCo Fri Full*), inspect the natural-language prompt (*"Move Tuesday to Friday… stay below €700… keep current reservations until replacements are secured"*), and click **`1. Analyze Impact & Prepare Minimal-Change Plan`**.
- **Voiceover:** *"Let's move our Tuesday relocation to Friday under a hard 700-euro budget — while injecting a real-world failure where MoveCo's primary Friday crew is full. CONTINUITY compiles hard constraints, traverses the dependency graph, and excludes unaffected commitments: buffer storage and Saturday furniture delivery aren't even contacted."*

### `00:46 – 01:10` · MINIMAL-CHANGE RECOVERY & HOLD-BEFORE-COMMIT
- **On Screen:** Highlight the updated SVG graph (`3 / 6` awaiting approval, `3` preserved untouched), the amber MoveCo overflow recovery alert, the ranked candidate plans (`Plan A — Minimum Changes €659.00` vs `Plan B`), and the prepared slot holds (`hold_mc_1`, `hold_hc_1`).
- **Voiceover:** *"When MoveCo refuses the primary Friday slot, CONTINUITY automatically recovers using MoveCo's overflow crew, keeps PowerFlow's valid Tuesday activation untouched to minimize changes, places temporary slot holds, and keeps every original Tuesday booking intact at €659 — safely below our €700 cap."*

### `01:10 – 01:32` · CRYPTOGRAPHIC APPROVAL BINDING & VERIFIED COMMIT
- **On Screen:** Click **`2. Review & Approve Bound Operations`** to open the confirmation modal showing exact costs, reversibility, and technical JSON; click **`Approve & commit change package`**. Show nodes turning green (`✓ COMMITTED`) with `VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE` badges, and switch to MoveCo's tab/state showing `MC-8841` updated to `2026-11-20`.
- **Voiceover:** *"Approvals are SHA-256 bound to exact prices and dates — if a fee drifts by one cent, execution halts. Once I confirm, CONTINUITY commits with idempotency keys and verifies Ed25519 provider receipts across origins."*

### `01:32 – 01:48` · CHAOS LAB & OPEN-SOURCE BUILDING BLOCKS
- **On Screen:** Click the **`Chaos Lab (15 Scenarios)`** tab showing **`15/15 scenarios passed`** (timeouts after commit, forged receipts, budget overflow, partial-failure guards).
- **Voiceover:** *"Our built-in Chaos Lab verifies 15 distributed failure modes, and all 11 core engines are open-sourced under Apache 2.0 for the community. CONTINUITY: One change. Every commitment re-aligned."*
