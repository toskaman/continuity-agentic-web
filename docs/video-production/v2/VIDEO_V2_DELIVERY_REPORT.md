# CONTINUITY — v2 jury film: delivery, QC and review report

**Final render: r10 (2026-11-17, re-filmed after the plain-language UI pass)** — refreshed with the current numbers (42 chaos scenarios, 180 runs, 117 tests) and a new S9b scene showing the same engine on two other life changes. Master folder `Z:\continuity-titan-omega\v3\deliverables\` (r7 kept in `v2\deliverables` for history).

## 1. Deliverables

| File | What it is | Use |
|---|---|---|
| `CONTINUITY_v2_voice_ready.mp4` | Final picture + original music + SFX, **no voice, no subtitles** | **Submission base**: record your own voice over it (rules: entrant explains, not AI-generated) |
| `CONTINUITY_v2_kokoro_reference.mp4` | Same picture + Kokoro narration + burnt-in captions | Reference/timing cut — **do not submit** |
| `TELEPROMPTER_voice_ready.md` | Timed script to read over the voice-ready cut | Recording |
| `CONTINUITY_v2.en.srt` | Subtitles matching the script | YouTube captions if you read the script as written |
| `poster_wall.jpg`, `poster_lockup.jpg` | 1920×1080 thumbnails (no captions) | YouTube custom thumbnail / Devpost |
| `brag.mp4`, `brag.jpg`, `share-copy.txt` | 20 s Brag Full launch cut (Kokoro voice) + poster + share copy | Social teaser (not the submission video) |
| `narration_stem.m4a` | Kokoro narration alone (−16 LUFS) | Pace reference while rehearsing |

## 2. Technical validation (measured on the final files)

| Property | Kokoro reference | Voice-ready | Brag |
|---|---|---|---|
| Duration | **116.50 s** (limit 120 s, margin 3.5 s) | 116.50 s | 20.00 s |
| Video | H.264 High, 1920×1080, 30 fps CFR, yuv420p | same | same |
| Audio | AAC-LC 48 kHz stereo 320 kb/s | same | same |
| Loudness | −16.0 LUFS integrated, −1.5 dBTP, LRA 2.1 LU | −22.9 LUFS (bed, leaves room for your voice), −3.2 dBTP | −16.0 LUFS, −1.5 dBTP |
| Black / freeze detection | none (blackdetect 0.2 s, freezedetect 3 s) | none | none |
| HyperFrames `check` | pass — 0 errors, contrast 31/31 WCAG AA | pass | pass |

## 3. Production pipeline (reproducible)
1. `node scripts/capture_video_v2.mjs <out>` — real public deployment, real clicks over CDP, 13 screencast clips (2880×1620 CFR 30), 27 stills, `bounds.json`, `proofs.json`.
2. `node scripts/generate_film_v2_narration.mjs <dir> af_heart 1.0` + `node scripts/transcribe_film_v2_narration.mjs <dir>` — Kokoro-82M via HyperFrames 0.9.19, ASR-checked with Parakeet (every segment matches the script).
3. `python video/v2/audio/synth_audio.py` — original music bed + all SFX, synthesized with numpy (seeded); no samples, no third-party music → no licence question.
4. `python video/v2/prep_assets.py` — baked focus blur and per-column after-state crops (no heavy CSS filters at render time).
5. `node video/v2/build.mjs` (Kokoro reference) / `--voice-ready` / `--brag` — writes the HyperFrames composition from `timeline.json`, ASR word timings and measured UI bounds; `npx hyperframes check`; `npx hyperframes render --quality delivery --video-frame-format png`.
6. `python video/v2/mix.py master|voiceready|narration` — voice bus, side-chain-ducked music, SFX, two-pass loudnorm; muxed with `-c:v copy`.

## 4. Brag Full and Kokoro (requirements of the brief)
- Brag Full ran from the installed skill (`C:\Users\TheBox\.codex\skills\brag`): 9-question rubric, `brag-plan.md`, `composition-brief.md`, HyperFrames composition, `brag.mp4` with poster baked as frame 0, `share-copy.txt`. Its plan is the visual bible of the jury film (hook, palette, type, focus system, lockup); the jury film is the full-length extension in the same project and design system.
- Kokoro `af_heart` (Heart, en-US), speed 1.0, 10 segments + brag; settings and timings in `narration_manifest.json` / `words.json`.

## 5. Assets and licences
| Asset | Origin | Licence |
|---|---|---|
| UI footage and stills | Screen capture of our own public deployment | Ours (Apache-2.0 project) |
| Inter Variable font | Shipped with the site (`design-system/fonts`) | SIL OFL 1.1 |
| GSAP 3.12.7 | npm, bundled locally for the render | GreenSock standard licence (free for this use) |
| Music bed, all SFX | Synthesized for this film (`synth_audio.py`) | Ours |
| Narration (reference cut only) | Kokoro-82M (local) | Apache-2.0 model; reference only, replaced by the entrant's voice |
| 2D/3D graphics | Built in HTML/CSS 3D for this film | Ours |
No third-party logos or trademarks appear; the demo providers are the project's own demonstration sites.

## 6. Improvement cycles
20 logged cycles on r1–r7, plus the Nov 17 refresh (r8–r9: new numbers, S9b, S9b pacing fix after frame review) — see `Z:\continuity-titan-omega\v2\PRODUCTION_LOG.md` (outline-geometry verification, seam audit with push transitions, voice-led audit, craft/readability pass, audio levels, posters, cut-on-action, technical-truth correction of the "origin" wording, negation glyphs, final validation…).

## 7. Independent review (honest scores, 1–10)
| Criterion | Score | Why | Remaining risk |
|---|---|---|---|
| Technological implementation | 9 | Shows real cross-origin receipt verification, bound approval, hash chain, chaos lab — all live footage, claims traced to code | Viewers may not grasp "cross-origin" without the voice; the narration carries it |
| Design | 9 | One focus at a time, measured outlines, consistent type/palette, scroll-like transitions | Some UI text is small at phone size (the product UI itself) |
| Potential impact | 8.5 | Universal moving-day pain in the first 11 s, then S9b shows the same engine re-planning a surgery and a delayed freight shipment | The two extra scenarios are shown as stills, not walked through |
| Quality of the idea | 8.5 | "Coordinator of other companies' agentic websites" is stated and then proven on the provider wall | — |
| Rules compliance | pass* | < 2:00, public site running, no third-party music | *Submit only after recording your own voice over the voice-ready cut |

## 8. Known limitations (deliberate)
- The provider wall before→after is a cut between two real captured states, replayed slower — labelled on screen.
- The 3D sequence is CSS-3D with real screenshots (legible and truthful) rather than a Blender render.
- The binding card in the approval scene is an illustration of the approval-engine check (labelled on screen); its hash values are illustrative.
