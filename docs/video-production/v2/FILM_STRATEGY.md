# CONTINUITY — v2 jury film: strategy, evidence and storyboard

Production: TITAN CINEMA OMEGA brief · Brag Full (creative direction) · HyperFrames 0.9.19 (composition/render) · Kokoro-82M `af_heart` (narration) · original synthesized music & SFX.
All product footage is the **public deployment** (`toskaman.github.io/continuity-agentic-web` + four peers on `gpaschercher-sudo.github.io`), driven by real mouse clicks over CDP (`scripts/capture_video_v2.mjs`). Nothing is mocked.

## 1. Rules that shape the film (Official Rules, re-checked 2026-11-14)

| Rule | Consequence for the film |
|---|---|
| Video < 2:00 | Master runtime target 110.7 s (≈9 s margin). Measured on the final MP4. |
| Must show the project working in a browser | 70 % of runtime is real UI footage of the public site. |
| **Entrant explains the project — not AI-generated** | The Kokoro-narrated master is a **reference/preview cut**. The submission cut is the **voice-ready version** (same picture, no TTS) that the entrant narrates with the teleprompter script. |
| No third-party trademarks / copyrighted music | Music and every SFX are synthesized from scratch for this film (`v2/audio/synth_audio.py`). No logos except CONTINUITY's own mark and the demo providers' own demo marks. |
| Public YouTube | Delivery spec 1920×1080, 30 fps, H.264 High, AAC 48 kHz stereo, −16 LUFS / ≤ −1 dBTP. |

## 2. Jury Coverage Matrix (four equally weighted criteria)

| Criterion | What a judge must believe | Where it is proven (time) | Proof type |
|---|---|---|---|
| Technological implementation | Real multi-origin agentic web; signatures verified by each provider; safety mechanics are real code | 3D origins (0:17), provider wall flip (1:15–1:30), approval binding (1:05), trust center (1:30) | Live footage + code-backed claims |
| Design | Product is clear, beautiful, humane: one request, one approval | Hero (0:31), request + rules (0:33), plans (0:55), dialog (1:05) | Live footage, focus system |
| Potential impact | Everyday pain (moving house) that every person knows; generalises to any multi-provider change | Hook (0:00–0:11), before/after (0:11–0:17) | 2D explainer + site's own proof row |
| Quality of the idea | A coordinator *of other companies' agentic websites*, not a closed marketplace | 0:17–0:31 + wall | 3D scene + live cross-origin frames |

## 3. Evidence Ledger (every spoken/visual claim → source)

| ID | Claim (as said/shown) | Source of truth | Verified |
|---|---|---|---|
| C01 | One date change breaks six bookings | Mission baseline: 6 demonstration commitments (status line "6 confirmed demonstration commitments active (€624.00 baseline)") — `proofs.json` | ✓ live text |
| C02 | ≈18 steps on 6 websites by hand | Proof row "~18 actions on 6 websites · Estimate · task model, not a user study" | ✓ (labelled estimate on screen) |
| C03 | Two decisions: one request, one approval | Proof row "2 decisions — one request, one approval" | ✓ |
| C04 | Providers are separately deployed sites on a different origin from the coordinator ("loaded cross-origin") | Wall iframe URLs `gpaschercher-sudo.github.io/{moveco,permitflow,homeconnect,powerflow}-agentic-peer/embed.html` vs coordinator `toskaman.github.io`. Note: the four peers share the GitHub Pages host `gpaschercher-sudo.github.io` (different repos/paths), so the film never claims "five origins" | ✓ `proofs.wallUrls` (wording corrected in cycle 14) |
| C05 | Each runs its own agent network / manifest; no backend in the middle, no shared database | Agent grid cards (Manifest, Agent card links per peer); static GitHub Pages hosting, all agent logic in the browser | ✓ |
| C06 | Plain-English request becomes rules it can't break | Tags "Cap ≤ €700.00 · Hold before release · Never auto-cancel" next to the request | ✓ still 03 |
| C07 | Real-world failure: moving crew full on Friday | Button "Simulate a provider failure" → banner "Ripple Failure Armed: Primary anchor provider will refuse the requested Friday slot…" | ✓ |
| C08 | Only 3 of 6 bookings affected | KPI "Affected commitments 3 / 6" | ✓ |
| C09 | 4 providers asked, 2 never contacted | KPI "4 peers contacted · 2 skipped"; proof row "4 providers asked, 2 never contacted" | ✓ |
| C10 | Crew recovered via overflow partner; replacements held; originals active | "MoveCo Alert: Primary MoveCo 08:00 crew is at 100% capacity… partner overflow slot returned"; "2 Non-Destructive Replacement Hold(s) Active … Original bookings untouched" | ✓ |
| C11 | 3 plans; winner moves fewest bookings for €659 under the €700 cap | Plans: A €659.00 (3 changed), C €669.00, Alternative €659.00 (4 changed); "total €659.00 (<= €700.00)" | ✓ |
| C12 | Approval bound to exact operations, prices, providers; one fee change → no match | `packages/approval-engine/index.js` canonical JSON + SHA-256 over provider_origin, capability, args, price_eur, change_fee_eur; drift → hash mismatch | ✓ code |
| C13 | Providers' own pages from their own origins | Wall frames load each peer's `embed.html` cross-origin | ✓ |
| C14 | Each receives a signed receipt, verifies it itself, then moves the booking | Frames show "Cross-Origin Ed25519 Receipt Verified (rcpt_moveco_1): Reservation synced to Fri, Nov 20" and "Signed receipt delivered — verified by this page"; verification runs in the peer origin (`peer-sync.js`) | ✓ |
| C15 | PowerFlow consulted, left alone | Wall: "Consulted — kept as is, nothing to change"; agent card "Consulted" | ✓ |
| C16 | Hash-chained log | "✓ SHA-256 Hash Chain Verified (21/21 events intact …)" | ✓ |
| C17 | Exactly what each provider saw | Privacy tab: providers receive only booking_ref + target_date; budget ceiling and AI key never sent | ✓ |
| C18 | 15 failure scenarios replayable; 0 cancel calls in 60 benchmark runs | "Simulation Suite Complete: 15/15 scenarios passed (0 failed)"; proof row "0 cancel calls in 60 benchmark runs" (`docs/benchmarks/BEFORE_AFTER.md`) | ✓ |
| C19 | Outcome: every commitment re-aligned | Outcome panel "Mission re-aligned and verified — 3 bookings moved · 3 left untouched · total €659.00 · every commit has a signed receipt" | ✓ |

Honesty notes shown or respected in the cut: providers are labelled demonstration services on the site; "~18 actions" is shown with the site's own "Estimate" label; the provider-wall before→after is a cut between two real captured states of the same frames (no pixel is invented); illustrative overlays (fee drift, crossed server icons) are clearly graphic, never disguised as UI.

## 4. Central idea
**"One change. Every commitment re-aligned."** — the product's own tagline. The film's spine is a single moving date (Tue 17 → Fri 20) that travels from the hook calendar, through the request, to the four providers' own pages, where it lands as "Friday, November 20 — receipt verified".

## 5. Visual Bible
- Stage: deep navy `#0A0F1E` with the site's hero glow (radial `#1B2A55` → `#0A0F1E`) and a faint 48 px grid (6 % white).
- Accents (from the design system): primary `#4F6BF6`, lavender `#C7D2FE`, teal `#5EEAD4`, success `#22C55E`/`#34D399`, warning `#F59E0B`, failure `#F87171` (only in the hook).
- Type: Inter (shipped locally, from the site's own `design-system/fonts`). Display 96–132 px / 700 / −0.03 em; labels 28–34 px / 600; captions 36 px / 500 on a 72 % navy pill.
- Product framing: footage sits in a borderless browser card (radius 22 px, shadow `0 40px 120px rgba(0,0,0,.55)`), with a minimal URL pill showing the real origin.
- Focus system (one at a time): sharp target + soft blur(6px) and 45 % dim on the rest; 3 px `#5EEAD4` outline, radius matched to the element, drawn from measured `getBoundingClientRect()` boxes.
- Cursor: white arrow, 1.5 px navy stroke, soft shadow; moves on eased arcs; click = 0.9 scale press + teal ripple + click SFX, synced to the real click frame.
- Motion: entrances 0.45–0.7 s `power3.out`; camera pushes 1.00 → 1.12 over a beat; no bounce, no shake; transitions are blur-dissolves or light sweeps carrying a soft whoosh.

## 6. Storyboard (voice-led; times are the final film times)

| # | Time | Narration (Kokoro `af_heart`) | Picture | Focus / pointer | Sound |
|---|---|---|---|---|---|
| S1 | 0.0–11.4 | Move one date… left with nothing. | 2D: calendar TUE 17 flips to FRI 20; six real booking cards fan out, turn amber "still Tuesday"; counter 0→18 with 6 tabs; one card cancelled → "nothing booked" | — | pad swell, flip tick, card ticks, low thud on cancel |
| S2 | 11.4–17.2 | Continuity makes it two decisions… | Split: ~18 actions (dim) → **2 decisions** (1 say what changed · 2 approve the exact plan) → the site's real proof row | outline on "2 decisions" card | resolve chime |
| S3 | 17.1–31.0 | It's an open agentic website… on a different origin. No backend in the middle. No shared database. | 3D: coordinator page in the centre, four providers' real home pages as glass panes with their real URLs; receipt pulses travel; "5 separately deployed websites"; slashed backend/database glyphs | URL labels | airy whoosh, pulse blips |
| S4 | 31.1–42.6 | This is the live site… crew is full on Friday. | Live hero → workspace; request text; the three rule tags; real click on "Simulate a provider failure"; banner | spotlight request → tags → banner; cursor click | UI click |
| S5 | 42.6–55.3 | Only three of six… originals stay active. | Real click "Analyze & prepare plans"; KPIs; mission map; MoveCo overflow alert; holds strip | KPI 3/6 → "4 peers · 2 skipped" → alert → holds | click, soft ticks |
| S6 | 55.3–65.1 | Three plans… under my cap. | Plans section; Plan A card €659.00; budget meter €659 / €700 | Plan A outline | tick |
| S7 | 65.1–75.2 | Nothing happens without me… no longer matches. | Real click "Approve & commit…" → bound dialog (hi-res); operations → total → providers; overlay: fee €39.00→€39.01 ⇒ hash ✕ | sequential outlines | click, error blip on mismatch |
| S8 | 75.2–90.0 | I approve. These are the providers' own pages, loaded cross-origin… correctly left alone. | Real click "Approve & commit change package"; hard cut to the provider wall: URL bars → three columns flip Tue→Fri with receipt verified (real before/after states, replayed slower — labelled on screen); PowerFlow stays | URL pills → each column → PowerFlow | click, three rising verify chimes |
| S9 | 90.2–103.4 | Every step is auditable… sixty benchmark runs. | Trust center: hash-chain banner, privacy table, Chaos Lab 15/15, proof row "0 cancel calls in 60 runs" | banner → table row → 15/15 → chip | ticks |
| S10 | 103.4–110.7 | Continuity. One change. Every commitment, realigned. | Hero after-state ("All commitments verified") → logo lockup + URL + "Try it — no API key needed" | — | final chime, music resolves |

## 7. Demo runbook (reproduce the footage)
1. `node scripts/capture_video_v2.mjs <outDir>` (Windows, Chrome stable). It loads the public site with cache disabled, waits for "Live Cross-Origin Browser Mesh (4 Peers · Ed25519)", performs real clicks, records screencasts with real timestamps, writes `bounds.json` (1920×1080 film pixels) and `proofs.json` (exact on-screen strings).
2. Reset: a fresh Chrome profile per run (no stored state). Fallback: if the badge never turns live, the script fails instead of filming a degraded state.
3. Narration: `node scripts/generate_film_v2_narration.mjs <dir> af_heart 1.0`, then `node scripts/transcribe_film_v2_narration.mjs <dir>` (Parakeet ASR check — all 11 segments matched the script; numbers were heard as digits only).
