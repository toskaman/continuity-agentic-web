# Timed user test — "by hand" vs CONTINUITY (5 people, ~25 min each)

**Goal:** replace the *estimate* "~18 actions on 6 websites" with **measured** time, steps, mistakes and confidence from real people. Five participants are enough to show the size of the effect (we report medians and ranges, not statistics we cannot claim).

## Participants
5 adults who have moved house or rescheduled several appointments at least once. Not developers of this project. No personal data is collected: participant = P1…P5.

## Setup (10 min, once)
- Laptop, Chrome, 1440 px window, a stopwatch (phone) and `RESULTS_TEMPLATE.csv` open.
- **Condition A – by hand:** four tabs open on the providers' own sites (MoveCo, PermitFlow, HomeConnect, PowerFlow — public URLs in the README) + the printed card *"Your move moved from Tue 17 Nov to Fri 20 Nov. Budget €700. Don't lose any booking. Storage and sofa delivery are not affected."*
- **Condition B – CONTINUITY:** one tab on `https://toskaman.github.io/continuity-agentic-web/` (Reset demo before each participant). Same card.
- **Counterbalance:** P1, P3, P5 do A then B; P2, P4 do B then A.

## Task (same in both conditions)
"Make every affected booking fit Friday without losing any, under €700. Tell me when you think you're done."
In condition B the participant also switches on *Simulate a provider failure* first (the Friday crew is full) — the same failure is told to them verbally in condition A when they reach MoveCo ("the 08:00 crew is full on Friday").

## What to record (per condition)
| Field | How |
|---|---|
| `time_s` | Stopwatch from "go" to "done" |
| `actions` | Count clicks that change something + page/tab switches (observer tally) |
| `sites_touched` | Distinct sites the participant interacted with |
| `premature_cancel` | 1 if they cancelled/released a booking before its replacement existed, else 0 |
| `unnecessary_contact` | Number of providers contacted that did not need to change (Storage/Sofa/PowerFlow) |
| `correct_outcome` | 1 if all affected bookings end on a valid Friday/Saturday slot under budget |
| `seq` | Single Ease Question 1–7: "Overall, how easy was this task?" |
| `confidence` | 1–7: "How sure are you nothing is broken?" |
| `quote` | One sentence, verbatim (optional) |

## Script for the facilitator
1. "We're testing the tool, not you. Think aloud if you like." 2. Run condition 1. 3. SEQ + confidence. 4. Run condition 2. 5. SEQ + confidence + "Which would you use next time, and why?" 6. Thank them.

## After the sessions
`node docs/impact/analyze_user_test.mjs docs/impact/RESULTS.csv` prints the medians, ranges and the ready-to-paste sentence for Devpost/README, e.g. *"Measured with 5 people: median 9 min 40 s by hand vs 1 min 50 s with CONTINUITY (−81 %), 2 of 5 cancelled a booking too early by hand, 0 with CONTINUITY."*

**Honesty rules:** report every participant (no dropping), say "n = 5, not a statistical study", keep the raw CSV in the repo.
