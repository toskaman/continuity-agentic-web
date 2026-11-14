# Reproducible Benchmarks — Before vs. After CONTINUITY

**Date measured:** 2026-11-14T15:56:03.688Z
**Hardware / runtime:** Node.js `v26.13.1` on `win32 x64` (AMD Ryzen 7 5700X 8-Core Processor, 16 logical cores)
**Sample size:** `N = 30` live cross-origin runs per scenario (Normal shift and Ripple failure recovery), after `3` excluded warm-up runs each — `60` measured end-to-end sagas.
**Raw data:** [`docs/benchmarks/benchmark_results.json`](./benchmark_results.json) · **Reproduce:** `node scripts/run_benchmarks.mjs`

Every number in sections 1 and 2 is computed by the script in this run, except the row explicitly marked **Estimate**.

---

## 1. Workflow comparison (same 6-commitment mission)

| Metric | BEFORE — manual coordination | AFTER — CONTINUITY, normal shift | AFTER — CONTINUITY, ripple recovery | Evidence |
| --- | --- | --- | --- | --- |
| User actions | **~18** (3 per provider site × 6 sites: look up, check availability, rebook) | **2 decisions** (1 request + 1 approval; 3 clicks in the UI incl. the confirmation dialog) | **2 decisions** | Before: **Estimate** (task model, no human study). After: structural count |
| Providers contacted | up to 6 | **4** (2 out-of-scope bookings never contacted) | **4** (2 never contacted) | Measured |
| Commitments changed / kept | not optimized | **3 changed · 3 kept** | **3 changed · 3 kept** | Measured |
| Mission total (cap €700.00) | no global budget check | **€649.00** (+€25.00 vs €624.00 baseline) | **€659.00** (+€35.00 vs baseline) | Measured |
| Cancel calls sent to any provider | risk of cancelling before a replacement exists | **0** in 30 runs | **0** in 30 runs | Measured (tool-call log) |
| Commits with a verified Ed25519 receipt | none | **3 / 3** per run (worst run) | **3 / 3** per run (worst run) | Measured |
| Same result on every run | — | **Yes** | **Yes** | Measured |
| Verified saga completion | — | **100%** | **100%** | Measured |

---

## 2. Engine timings (ms, loopback, `N = 30` per scenario)

| Phase | Normal median | Normal p95 | Normal max | Ripple median | Ripple p95 | Ripple max |
| --- | --- | --- | --- | --- | --- | --- |
| Mission compiler & hard-invariant check | 0.083 | 0.105 | 0.191 | 0.078 | 0.107 | 0.133 |
| Bounded impact analysis (6 nodes) | 0.096 | 0.154 | 0.367 | 0.1 | 0.15 | 0.19 |
| Quote collection from 4 provider origins | 2.072 | 3.984 | 4.427 | 2.339 | 4.104 | 4.307 |
| Minimal-change solver (Pareto) | 0.141 | 0.208 | 0.224 | 0.15 | 0.226 | 0.239 |
| **Full run: compile → quotes → hold → approve → commit → verify receipts** | 11.238 | 18.462 | 20.31 | 11.399 | 15.666 | 17.113 |

Means are kept in the JSON for completeness; medians and p95 are reported here because single garbage-collection pauses dominate means at sub-millisecond scale.

---

## 3. Limitations

1. **Demonstration providers.** MoveCo, PermitFlow, HomeConnect and PowerFlow are independent demonstration services on separate origins with real HTTP, CORS, MCP and Ed25519 boundaries — not commercial companies.
2. **Loopback latency.** Measured on local sockets. Over the public internet each provider hop adds WAN round-trip time (typically tens of milliseconds), plus model inference time when the optional chat assistant is used.
3. **Manual baseline is an estimate.** The "~18 actions" figure is a task model, not a timed user study. Human completion time is deliberately not claimed.
