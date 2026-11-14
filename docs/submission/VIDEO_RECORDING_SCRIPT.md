# CONTINUITY — Human-Narrated Demo Video Script (< 2 minutes)

**Why this file exists.** The Official Rules require a video under two minutes that shows the project running in a browser **and includes the entrant explaining the project (not AI-generated)**. The older `docs/video-production/deliverables/CONTINUITY_JURY_MASTER_OMEGA.mp4` uses a synthetic Kokoro voice and the pre-redesign interface — do **not** submit it. Record a new take with your own voice using this script.

Target length: **1:50** (10 s safety margin). Judges need not watch past 2:00. Speak in English (or add English subtitles).

---

## Before you record (5 minutes)

1. Browser: Chrome, window 1920 × 1080, zoom 100 %, bookmarks bar hidden, no other tabs or notifications.
2. Open `https://toskaman.github.io/continuity-agentic-web/` and press **Ctrl + F5** (fresh files).
3. Wait until the green badge under the buttons reads **Live Cross-Origin Browser Mesh (4 Peers · Ed25519)**.
4. Recorder: OBS Studio (free) → *Display capture* or *Window capture*, 1920 × 1080, 30 fps, microphone only (no music — the rules forbid copyrighted music, and it is not needed).
5. Do one dry run, then click **Reset demo** (in the Workspace section) and reload the page before the real take.

---

## Script

| Time | On screen (what you do) | What you say (your own voice) |
|---|---|---|
| **0:00–0:12** | Landing page, cursor still. Slowly hover the four providers around CONTINUITY. | "When one date in your life changes, everything around it breaks. Moving from Tuesday to Friday means calling a moving company, a permit office, an internet installer, an electricity provider — one by one." |
| **0:12–0:22** | Hover the hero title. | "CONTINUITY is an open agentic website that does that for you — across other companies' agentic websites, not just its own." |
| **0:22–0:35** | Scroll to **What changed?** Show the plain-English request. Point at the three green rule tags. | "I describe the change in plain English. CONTINUITY turns it into rules it can't break: stay under seven hundred euros, hold replacements before releasing anything, never cancel without asking me." |
| **0:35–0:50** | Scroll back up and click **Run the 2-minute demo**. Let the page scroll to the Mission map by itself. | "To make it realistic, I inject a failure: MoveCo's Friday crew is full. Watch — CONTINUITY finds only the bookings that are actually affected, recovers through an overflow partner, and places temporary holds. My original bookings are still active." |
| **0:50–1:05** | The approval dialog opens. Move the cursor over *Operations to commit*, *Preserved untouched*, *Projected total cost*. | "Nothing happens without me. This dialog is bound to the exact operations, prices and providers with a SHA-256 hash — if one fee changes by a cent, this approval is invalid." |
| **1:05–1:15** | Click **Approve & commit change package**. Scroll up so the hero network map and the 6 steps are visible (all green, three providers show *Committed · verified*). | "Three providers commit, three bookings are left untouched, and every commit comes back with a signed Ed25519 receipt." |
| **1:15–1:30** | Click **MoveCo Express** in the network map → it opens MoveCo's own site in a new tab. Show the green *Receipt Verified* message and the new date. | "This is MoveCo's own website, on a different origin. It verifies CONTINUITY's signed receipt itself and shows my new Friday slot. No shared server, no shared database — just the open agentic web." |
| **1:30–1:42** | Back to CONTINUITY. Scroll to **Agent network**, then **Audit & trust center**, click the **Chaos Lab** tile. | "Each provider publishes its own agent network and manifest. Everything is auditable: what each provider received, a hash-chained log, and fifteen failure scenarios you can run in your browser." |
| **1:42–1:50** | Scroll back to the top. Cursor on **Run the 2-minute demo**. | "CONTINUITY: one change, every commitment re-aligned — safely. You can try it yourself, no API key needed." |

Stop recording at about **1:50**.

---

## After recording

1. Trim the start/end in OBS or any editor; check the length is **under 2:00**.
2. Upload to **YouTube as Public** (the rules say "uploaded publicly"). Title: *CONTINUITY — One change. Every commitment re-aligned. (Open Agentic Web Challenge)*.
3. Paste the YouTube link in the Devpost form.
4. Optional: upload `docs/video-production/CONTINUITY_JURY_MASTER_OMEGA.en.srt` only if you rewrite it to match your actual words; otherwise let YouTube auto-caption.

## Checks before you submit the video

- [ ] Your own voice explains the project (no TTS).
- [ ] The browser is visible running the public site.
- [ ] No third-party logos or copyrighted music.
- [ ] Length under 2:00.
- [ ] Everything you say happens on screen (the demo shows real behaviour; providers are labelled as demonstration services).
