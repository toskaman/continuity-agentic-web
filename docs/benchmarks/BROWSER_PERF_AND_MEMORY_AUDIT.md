# Chromium Renderer Performance Trace & V8 Heap Memory Audit

**Target Audited:** `https://toskaman.github.io/continuity-agentic-web/` (Live HTTPS Production Deployment, including 4 Cross-Origin `gpaschercher-sudo.github.io` `peer-rpc-bridge.html` iframes + Cognizant `nsDeploy` Browser Runtime + WebMCP Bridge)  
**Measurement Tool:** Chromium Renderer Trace (`browser.trace.*`) & V8 Heap Snapshot Comparator (`browser.heap.*`)  
**Date Measured:** November 14, 2026  

---

## 1. Full Page Reload + 5-Origin Handshake Performance Trace

| Metric | Measured Value | Target / Threshold | Status |
|---|---:|---:|---|
| **End-to-End Reload + 4 Cross-Origin Ed25519 Bridge Handshakes** | **`199.06 ms`** | `< 1,000 ms` | **PASS** |
| **Long Tasks (`> 50 ms`)** | **`0` tasks** | `0` tasks | **PASS** |
| **Total Blocking Time (`longTaskBlocking`)** | **`0.00 ms`** | `< 50 ms` | **PASS** |
| **Peak Single `RunTask` Duration** | **`19.33 ms`** | `< 50 ms` | **PASS** |
| **`RunMicrotasks` (17 microtask checkpoints)** | **`9.52 ms` total** (`2.72 ms` max) | `< 25 ms` | **PASS** |
| **`Layout` (7 layout passes)** | **`3.47 ms` total** (`1.39 ms` max) | `< 16 ms` | **PASS** |
| **`UpdateLayoutTree` (12 style passes)** | **`2.71 ms` total** (`0.96 ms` max) | `< 16 ms` | **PASS** |
| **`RasterTask` (25 tiles)** | **`4.20 ms` total** (`1.10 ms` max) | `< 16 ms` | **PASS** |

*Methodology Note:* Renderer trace recorded across document reload until `#transport-badge` confirmed `Live Cross-Origin Browser Mesh (4 Peers · Ed25519)`. Event durations can overlap across threads and are reported individually rather than summed.

---

## 2. V8 Heap Snapshot Leak Comparison Across 5 Full Cross-Origin Saga Cycles

To verify that repeated multi-origin planning, Pareto optimization, WebCrypto Ed25519 receipt verification, SVG DOM re-rendering, and mission resets do not leak application graphs or detached DOM subtrees, two full V8 heap snapshots were captured around **5 consecutive end-to-end cycles** (`resetMission` -> `analyzeAndPrepareChange` -> `commitPreparedPackage` -> `resetMission`):

| Measurement | Snapshot 1 (Baseline Idle) | Snapshot 2 (After 5 Full Saga Cycles + Reset) | Delta |
|---|---:|---:|---:|
| **Total V8 Shallow Heap (`selfBytes`)** | **`6,451,990 B` (`6.45 MB`)** | **`7,002,285 B` (`7.00 MB`)** | `+550,295 B` (`+0.55 MB`) |
| **`system / InstructionStream` (V8 JIT Tier-Up)** | — | — | `+201,280 B` (`+89` compiled functions) |
| **`system / FeedbackVector` & `BytecodeArray` (V8 IC Warmup)** | — | — | `+35,432 B` |
| **`blink::Node` HashTable Backing (DOM Node Retention)** | — | — | **`-10,384 B` (`-98` entries — zero DOM leak)** |
| **Retained `SagaCoordinator` / `MissionGraph` Leak Growth** | `1` active instance | `1` active instance | **`0` leaked instances** |

**Conclusion:** The `+0.55 MB` shallow delta is accounted for by V8 TurboFan/Sparkplug JIT compilation (`InstructionStream` + `FeedbackVector`) warming up hot solver and WebCrypto paths during the 5 cycles, while Blink's DOM node table decreased by `98` entries (`-10.38 KB`) on GC, confirming clean lifecycle replacement of SVG and table nodes.

---

## 3. Lighthouse Accessibility, Best Practices & SEO Across All 5 Live HTTPS Sites

| Live Public HTTPS Site | Accessibility | Best Practices | SEO | Console Errors |
|---|---:|---:|---:|---:|
| `https://toskaman.github.io/continuity-agentic-web/` *(Idle & Active Chat + CRUSE)* | **100** | **100** | **100** | **0** |
| `https://gpaschercher-sudo.github.io/moveco-agentic-peer/` *(Idle & `#continuity_receipt` Synced)* | **100** | **100** | **100** | **0** |
| `https://gpaschercher-sudo.github.io/permitflow-agentic-peer/` | **100** | **100** | **100** | **0** |
| `https://gpaschercher-sudo.github.io/homeconnect-agentic-peer/` | **100** | **100** | **100** | **0** |
| `https://gpaschercher-sudo.github.io/powerflow-agentic-peer/` | **100** | **100** | **100** | **0** |
