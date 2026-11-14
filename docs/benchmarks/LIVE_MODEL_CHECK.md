# Live-model check — real Mozilla Otari model, nothing mocked

**Measured:** November 14, 2026 · **Script:** `node scripts/verify_live_llm.mjs` (needs your own Otari key in `OTARI_API_KEY` or the git-ignored `.env.local`; without a key it exits without contacting anything) · **Raw result:** [`live_llm_check.json`](./live_llm_check.json)

The automated test suite stubs the model router. This check does not: it runs the real Cognizant `Engine` for CONTINUITY against the hosted Otari router with the sites' default model, composing the four provider networks from their own origins.

Prompt: *"Ask MoveCo, PermitFlow, HomeConnect, and PowerFlow what services each offers."*

| Check | Result (`alibaba/qwen-3.5-35b-a3b`, default) |
| --- | --- |
| Run completed without router errors | Yes — 13 model calls, 0 errors |
| Consent cards shown | 4 (one per provider origin) |
| Any provider contacted before its consent | No |
| API key sent anywhere except the router | No |
| Reply names and describes all 4 providers | Yes |
| Requests sent without an explicit `max_tokens` | 13 of 13 — the default model accepts this |
| Wall time | 66.6 s (single run; varies with router load) |

## Why the default model stays

Two other catalogue models were tried with the same script on the same day (one run each):

| Model | Outcome |
| --- | --- |
| `alibaba/qwen-3.5-35b-a3b` (default) | **Pass** · 66.6 s |
| `alibaba/qwen3.6-35b-a3b` | Fail — asked for consent 5 times instead of 4 · 55 s |
| `alibaba/qwen3.8-flash` | Fail — final reply did not name the providers · 88 s |

## Limits

- One run per model; this is a smoke check, not a reliability study.
- Runs in Node, where page actions (`website_*` tools that need the DOM) are not available — the same limitation as the upstream linking test. Page actions are covered by the site tests and the in-browser scripted replay.
- EU Otari keys (`otk_v1_eu_…`) must use `eu.api.otari.ai`; the script and the sites select it automatically.
