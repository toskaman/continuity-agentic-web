# Reproducible Benchmarks — Before vs. After CONTINUITY

**Date Measured:** 2026-11-14T02:29:40.975Z
**Hardware / Runtime:** Node.js `v26.13.1` on `win32 x64` (AMD Ryzen 7 5700X 8-Core Processor             , 16 logical cores)
**Sample Size:** `N = 30` live cross-origin runs for Normal Relocation Shift + `N = 30` live cross-origin runs for Ripple Failure Recovery (`60` total full Saga executions).
**Raw Machine-Readable Data:** [`docs/benchmarks/benchmark_results.json`](./benchmark_results.json)

---

## 1. Structural Workflow Comparison (Same 6-Commitment Mission)

| Metric | BEFORE (Manual Human Coordination) | AFTER — CONTINUITY (Normal Shift) | AFTER — CONTINUITY (Ripple Failure Recovery) | Evidence Classification |
| --- | --- | --- | --- | --- |
| **User Natural-Language Prompts + Bound Approvals** | **18 manual actions** across 6 separate sites (lookup + check + rebook per site) | **2 user interactions** (1 request + 1 bound package approval) | **2 user interactions** (1 request + 1 bound package approval) | Deterministic Structural Count |
| **Providers Contacted** | Up to **6** (humans routinely re-check unaffected storage/delivery) | **4** (2 unaffected commitments excluded by Impact Engine) | **4** (2 unaffected commitments excluded by Impact Engine) | **Measured** |
| **Commitments Modified** | Varies (often 4–6) | **3** (PowerFlow Tuesday also preserved by Minimal-Change Solver) | **3** (MoveCo recovered via overflow crew; 3 preserved) | **Measured** |
| **Commitments Preserved Untouched** | Risk of premature cancellation | **3 / 6 (50%)** | **3 / 6 (50%)** | **Measured** |
| **Final Verified Mission Cost (Cap €700.00)** | Uncoordinated fee risk | **€649.00** (+€25.00 net vs €624 baseline) | **€659.00** (+€35.00 net vs €624 baseline) | **Measured** |
| **Premature Cancellations Before Replacement Hold** | Common human failure mode | **0** | **0** | **Measured & Verified** |
| **Ed25519 Verified Provider Receipts** | None | **3 / 3 (100%)** | **3 / 3 (100%)** | **Measured & Verified** |

---

## 2. Measured Engine & Cross-Origin Execution Timings (`N = 30` per scenario)

*Note: Timings below measure deterministic Mission Compiler, Impact Graph Traversal, Live Cross-Origin Peer HTTP/MCP Quote Retrieval, Minimal-Change Optimization, Slot Hold Preparation, Approval Hashing, Commit, and Ed25519 Signature Verification across 5 independent local HTTP servers. Optional BYOK LLM chat streaming latency depends on the user's selected external provider (e.g., Mozilla Otari `alibaba/qwen-3.5-35b-a3b`) and is intentionally separated from deterministic engine latency.*

| Phase | Normal Shift Mean (ms) | Normal Shift P95 (ms) | Ripple Recovery Mean (ms) | Ripple Recovery P95 (ms) |
| --- | --- | --- | --- | --- |
| **Mission Compiler & Hard-Invariant Validation** | 0.087 ms | 0.078 ms | 0.05 ms | 0.085 ms |
| **Bounded Incremental Impact Analysis (6 nodes, 6 edges)** | 0.075 ms | 0.107 ms | 0.063 ms | 0.09 ms |
| **Cross-Origin Peer Quote Collection (4 origins)** | 1.645 ms | 2.601 ms | 2 ms | 3.546 ms |
| **Minimal-Change Constraint Solver** | 0.305 ms | 0.15 ms | 0.084 ms | 0.115 ms |
| **Full Prepare -> Bound Approval -> Commit -> Ed25519 Reconcile** | **8.46 ms** | **13.527 ms** | **7.99 ms** | **11.57 ms** |
| **Verified Saga Completion Rate** | **100%** | — | **100%** | — |

---

## 3. Limitations & Honesty Disclosure

1. **Simulated Demonstration Providers:** MoveCo Express, PermitFlow Civic Prep, HomeConnect Fiber, and PowerFlow Energy are independent demonstration services running on separate origins with real HTTP/CORS/MCP/Ed25519 protocol boundaries, not commercial moving or utility companies.
2. **Loopback vs. WAN Latency:** Cross-origin round trips above were measured across loopback sockets; public internet HTTPS hops add typical WAN RTT (~20–120 ms per origin) plus user-selected LLM inference time when invoked via natural-language chat.
3. **Reproduce Command:** Run `node scripts/run_benchmarks.mjs` to regenerate `benchmark_results.json` and this report on any machine with Node.js >= 22.
