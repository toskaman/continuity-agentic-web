# Reproducible Benchmarks — Before vs. After CONTINUITY

**Date measured:** 2026-11-16T13:07:54.531Z
**Hardware / runtime:** Node.js `v26.13.1` on `win32 x64` (AMD Ryzen 7 5700X 8-Core Processor, 16 logical cores)
**Sample size:** `N = 180` measured end-to-end sagas (`40` Normal Relocation + `40` Ripple Failure Recovery over 5 live HTTP origins, plus `30` Outpatient Surgery + `30` International Expo Freight + `40` Hybrid Cold-Start `.ics` Agentic+Legacy runs, after `3` excluded JIT warm-up runs).
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
| Cancel calls sent to any provider | risk of cancelling before replacement exists | **0** in 40 runs | **0** in 40 runs | Measured (tool-call log) |
| Commits with a verified Ed25519 receipt | none | **3 / 3** per run (worst run) | **3 / 3** per run (worst run) | Measured |
| Deterministic reproducibility | — | **Yes (30/30 identical)** | **Yes (30/30 identical)** | Measured |
| Verified saga completion | — | **100%** | **100%** | Measured |

---

## 2. Live 5-origin engine timings (ms, loopback, `N = 40` per scenario)

| Phase | Normal median | Normal p95 | Normal max | Ripple median | Ripple p95 | Ripple max |
| --- | --- | --- | --- | --- | --- | --- |
| Mission compiler & hard-invariant check | 0.115 | 0.174 | 0.363 | 0.113 | 0.174 | 0.303 |
| Bounded impact analysis (6 nodes) | 0.115 | 0.288 | 0.686 | 0.104 | 0.171 | 0.73 |
| Quote collection from 4 provider origins | 2.194 | 5.412 | 7.819 | 2.067 | 4.482 | 4.78 |
| Minimal-change solver (Pareto + crowding) | 0.203 | 0.506 | 1.13 | 0.201 | 0.318 | 0.463 |
| **Full run: compile → quotes → hold → approve → commit → verify receipts** | 10.776 | 25.238 | 101.589 | 10.588 | 21.013 | 28.309 |

---

## 3. Multi-domain & Cold-Start Hybrid `.ics` generality (`N = 30..40` sagas per domain)

| Scenario | Commitments | Changed / Preserved | Baseline → Committed Total | Verified Ed25519 Receipts | Median Full Saga (ms) | Completion |
| --- | --- | --- | --- | --- | --- | --- |
| **Outpatient Surgery & Care** (`outpatient_surgery`) | 5 | **3 changed · 2 kept** | €480.00 → **€500.00** | **3 / 3** | 5.916 ms | **100%** |
| **International Expo Freight** (`product_launch_expo`) | 6 | **3 changed · 3 kept** | €1820.00 → **€1880.00** | **3 / 3** | 5.547 ms | **100%** |
| **Hybrid Cold-Start `.ics` (2 Agentic + 1 Legacy + 1 Storage)** | 4 | **3 changed · 1 kept** | €574.00 → **€599.00** | **3 / 3** (+ 1 Hold-First `mailto:` draft) | 5.116 ms | **100%** |

---

## 4. Cryptographic & Runtime Safety Micro-Benchmarks (`N = 100` iterations)

| Primitive | Median Latency | p95 Latency |
| --- | ---: | ---: |
| **RFC 6962 6-Leaf Merkle Passport + 1-of-6 Selective Proof + Verify** | **1.413 ms** | 5.631 ms |
| **`@continuity/safety-hooks` Outbound Luhn PAN + Mod-97 IBAN + Secret DLP** | **0.033 ms** | 0.125 ms |
| **Critical-Path Method (CPM) Forward/Backward Slack Analysis** | **0.099 ms** | 0.486 ms |

Means are kept in `benchmark_results.json` for completeness; medians and p95 are reported here because single garbage-collection pauses dominate means at sub-millisecond scale.

---

## 5. Limitations

1. **Demonstration providers.** MoveCo, PermitFlow, HomeConnect and PowerFlow are independent demonstration services on separate origins with real HTTP, CORS, MCP and Ed25519 boundaries — not commercial companies.
2. **Loopback latency.** Measured on local sockets. Over the public internet each provider hop adds WAN round-trip time (typically tens of milliseconds), plus model inference time when the optional chat assistant is used.
3. **No human timing study claimed.** The "~18 actions" figure is an explicit task-step model paired with a measured split-brain failure probe on the 4 live peer endpoints, not a timed human participant study.
