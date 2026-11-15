# CONTINUITY — teleprompter for the voice-ready cut (read it in your own voice)

Play `CONTINUITY_v2_voice_ready.mp4` (final picture + original music + sound effects, **no voice, no subtitles**) and read each line when its time comes. Lines are timed for a calm pace (~150 words/min). If you speak slower, shorten a line — never rush.

| Start | Scene | Say |
|---|---|---|
| 0:00.60 | The problem | Move one date — Tuesday to Friday — and six bookings break at once. By hand, that's about 18 steps on 6 websites. Cancel one too early, and you're left with nothing. |
| 0:11.71 | Two decisions | CONTINUITY makes it two decisions: say what changed, then approve the exact plan. |
| 0:17.36 | The open agentic web | It's an open agentic website that coordinates other companies' agentic websites. Each provider runs its own site and agent network, on a different origin. No backend in the middle. No shared database. |
| 0:31.41 | Live site · request + failure | This is the live site. I describe the change in plain English, and it becomes rules it can't break. Then I switch on a real-world failure: the moving crew is full on Friday. |
| 0:42.76 | Impact · recovery · holds | Only 3 of 6 bookings are affected. 4 providers are asked; 2 are never contacted. The crew is recovered through an overflow partner, and replacements are held while my originals stay active. |
| 0:55.66 | Plans | Three plans, compared on changes, cost and speed. The winner moves the fewest bookings, for €659 — under my cap. |
| 1:05.49 | Your bound approval | Nothing happens without me. My approval is bound to the exact operations, prices and providers. Change one fee, and it no longer matches. |
| 1:15.61 | Providers verify receipts | I approve. These are the providers' own pages, loaded cross-origin. Each one receives a signed receipt, checks it itself, and only then moves my booking. PowerFlow was consulted — and correctly left alone. |
| 1:30.41 | Trust center | And every step is auditable: a hash-chained log, exactly what each provider saw, and 15 failure scenarios you can replay in the browser. Zero cancel calls in 60 benchmark runs. |
| 1:43.87 | Close | CONTINUITY. One change. Every commitment re-aligned. |

**Record:** quiet room, phone/headset mic ~15 cm away, one take while the video plays, then place the take at 0:00 over the voice-ready file (any editor, or `ffmpeg -i CONTINUITY_v2_voice_ready.mp4 -i myvoice.wav -filter_complex "[1:a]volume=1.0[v];[0:a][v]amix=inputs=2:normalize=0[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k CONTINUITY_final.mp4`).
The voice-ready mix sits at −23 LUFS so a normal speaking voice (≈ −16 LUFS) stays clearly on top.

**Why:** the Official Rules require the entrant explaining the project (not AI-generated). The Kokoro-narrated file is a timing/reference cut only — do not submit it.
