# Reproducible Benchmarks — Before vs. After CONTINUITY

**Date measured:** 2026-11-15T21:25:13.039Z
**Hardware / runtime:** Node.js `v26.13.1` on `win32 x64` (AMD Ryzen 7 5700X 8-Core Processor, 16 logical cores)
**Sample size:** `N = 120` measured end-to-end sagas (`30` Normal Relocation + `30` Ripple Failure Recovery over 5 live HTTP origins, plus `20` Outpatient Surgery + `20` International Expo Freight + `20` Hybrid Cold-Start `.ics` Agentic+Legacy runs, after `3` excluded JIT warm-up runs).
**Raw data:** [`docs/benchmarks/benchmark_results.json`](./benchmark_results.json) · **Reproduce:** `node scripts/run_benchmarks.mjs`

Every number in sections 1, 2, and 3 is computed by the script in this run, except the action-count row explicitly labeled **Estimate (task model)**.

---

## 1. Workflow & safety comparison (6-commitment relocation mission)

| Metric | BEFORE — uncoordinated manual rebooking | AFTER — CONTINUITY, normal shift | AFTER — CONTINUITY, ripple recovery | Evidence |
| --- | --- | --- | --- | --- |
| User actions | **~18** (3 per provider × 6 sites; **12** form controls verified across the 4 live peer HTML pages) | **2 decisions** (1 request + 1 approval; 3 clicks incl. confirmation dialog) | **2 decisions** | Before count: **Estimate** (task model) + measured DOM control count. After: structural count |
| Ripple failure outcome (MoveCo primary Friday van full) | **Split-brain schedule (2 providers mutated to Friday while MoveCo stays on Tuesday)** | — | **0 premature mutations** (holds placed on overflow fleet first; all 3 commit together) | Measured live against peer `/api/call` & `/api/state` |
| Providers contacted | up to 6 | **4** (2 out-of-scope bookings never contacted) | **4** (2 never contacted) | Measured |
| Commitments changed / kept | not optimized | **3 changed · 3 kept** | **3 changed · 3 kept** | Measured |
| Mission total (cap €700.00) | no global budget check | **€649.00** (+€25.00 vs €624.00 baseline) | **€659.00** (+€35.00 vs baseline) | Measured |
| Cancel calls sent to any provider | risk of cancelling before replacement exists | **0** in 30 runs | **0** in 30 runs | Measured (tool-call log) |
| Commits with a verified Ed25519 receipt | none | **3 / 3** per run (worst run) | **3 / 3** per run (worst run) | Measured |
| Deterministic reproducibility | — | **Yes (30/30 identical)** | **Yes (30/30 identical)** | Measured |
| Verified saga completion | — | **100%** | **100%** | Measured |

---

## 2. Live 5-origin engine timings (ms, loopback, `N = 30` per scenario)

| Phase | Normal median | Normal p95 | Normal max | Ripple median | Ripple p95 | Ripple max |
| --- | --- | --- | --- | --- | --- | --- |
| Mission compiler & hard-invariant check | 0.076 | 0.112 | 0.117 | 0.078 | 0.129 | 0.161 |
| Bounded impact analysis (6 nodes) | 0.067 | 0.113 | 0.116 | 0.073 | 0.121 | 0.127 |
| Quote collection from 4 provider origins | 1.637 | 2.452 | 2.47 | 1.752 | 2.205 | 2.266 |
| Minimal-change solver (Pareto + crowding) | 0.11 | 0.163 | 0.189 | 0.113 | 0.181 | 0.206 |
| **Full run: compile → quotes → hold → approve → commit → verify receipts** | 9.627 | 13.78 | 21.896 | 9.021 | 12.536 | 12.705 |

---

## 3. Multi-domain & Cold-Start Hybrid `.ics` generality (`N = 20` sagas per domain)

| Scenario | Commitments | Changed / Preserved | Baseline → Committed Total | Verified Ed25519 Receipts | Median Full Saga (ms) | Completion |
| --- | --- | --- | --- | --- | --- | --- |
| **Outpatient Surgery & Care** (`outpatient_surgery`) | 5 | **3 changed · 2 kept** | €480.00 → **€500.00** | **3 / 3** | 4.624 ms | **100%** |
| **International Expo Freight** (`product_launch_expo`) | 6 | **3 changed · 3 kept** | €1820.00 → **€1880.00** | **3 / 3** | 4.666 ms | **100%** |
| **Hybrid Cold-Start `.ics` (2 Agentic + 1 Legacy + 1 Storage)** | 4 | **3 changed · 1 kept** | €594.00 → **€619.00** | **3 / 3** (+ 1 Hold-First `mailto:` draft) | 4.959 ms | **100%** |

Means are kept in `benchmark_results.json` for completeness; medians and p95 are reported here because single garbage-collection pauses dominate means at sub-millisecond scale.

---

## 4. Limitations

1. **Demonstration providers.** MoveCo, PermitFlow, HomeConnect and PowerFlow are independent demonstration services on separate origins with real HTTP, CORS, MCP and Ed25519 boundaries — not commercial companies.
2. **Loopback latency.** Measured on local sockets. Over the public internet each provider hop adds WAN round-trip time (typically tens of milliseconds), plus model inference time when the optional chat assistant is used.
3. **No human timing study claimed.** The "~18 actions" figure is an explicit task-step model paired with a measured split-brain failure probe on the 4 live peer endpoints, not a timed human participant study.
