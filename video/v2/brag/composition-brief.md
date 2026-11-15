# Hyperframes Composition Brief: CONTINUITY

## Objective
20-second launch-style brag video for CONTINUITY, plus the shared visual system for the full jury film (`../index.html`).

## Output
- Composition directory: `brag-output/composition/` · Rendered video: `brag-output/brag.mp4` · 1920x1080 · 20 s

## Source Material
- Project root: `Z:\Hackatons\OpenAgenticWebChallenge` (apps/continuity-web, design-system, packages/*)
- Primary files read: apps/continuity-web/index.html, ui.js, script.js, design-system/base.css, packages/approval-engine/index.js, docs/benchmarks/BEFORE_AFTER.md
- Real UI captured from the public deployment by `scripts/capture_video_v2.mjs` (stills 2880x1620, bounds.json)
- Copy verbatim: "One change. Every commitment re-aligned." · "Watch the providers react" · "Cross-Origin Ed25519 Receipt Verified" · "Consulted — kept as is, nothing to change"

## Creative Direction
- Tone: polished (cinematic reveals) — quiet premium product film
- Hook: TUE 17 → FRI 20, six bookings snap red
- Outro: lockup + URL
- Avoid: generic SaaS language, abstract filler, any third-party logo or music

## Visual Identity
Background `#0A0F1E` + brand glow · text `#F8FAFC` · accent `#4263EB` · teal `#5EEAD4` · Inter Variable (local @font-face)

## Storyboard
See brag-plan.md (5 scenes, 20 s).

## Audio
Original synthesized bed + SFX (`../audio/synth_audio.py`), Kokoro `af_heart` narration (`brag.wav`), final master mixed with ducking and loudness-normalised to −16 LUFS / −1.5 dBTP.

## Hyperframes Instructions
Native HyperFrames conventions: one paused GSAP timeline registered as `window.__timelines["brag"]`, timed clips via `data-start`/`data-duration`, local assets only, `hyperframes check` before render.
