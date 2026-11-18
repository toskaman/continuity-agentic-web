# Chromium Renderer Performance Trace, V8 Heap Memory & Lighthouse Audit

**Targets Audited:** All **6 pages across 5 independent Open Agentic Websites** (`continuity-web/index.html`, `continuity-web/community-kit.html`, `demo-moveco`, `demo-permitflow`, `demo-homeconnect`, `demo-powerflow`)  
**Measurement Tools:** Headless Chromium CDP (`scripts/audit_browser_perf.mjs`), Chromium Renderer Trace (`browser.trace.*`), V8 Heap Snapshot Comparator (`browser.heap.*`), and Lighthouse (`browser.lighthouse`)  
**Date Measured:** November 18, 2026 (live 6-page Lighthouse & 5-cycle retention re-verified on deployed `3ca08147` build)  

---

## 1. Automated 5-Origin Boot & 5-Cycle Saga Retention Audit (`scripts/audit_browser_perf.mjs`)

Reproduce locally anytime with:

```bash
node scripts/audit_browser_perf.mjs
```

| Metric | Measured Value | Target / Threshold | Status |
|---|---:|---:|---|
| **5-Origin Boot + Cross-Origin Handshake** | **`471.2 ms`** | `< 1,000 ms` | **PASS** |
| **Coordinator DOM Elements (`document.querySelectorAll('*')`, Before → After 5 Sagas + Reset)** | **`1,078` → `1,078` (`0` delta)** | `<= +50` nodes | **PASS** |
| **Post-GC V8 Used Heap (`JSHeapUsedSize`)** | **`2.61 MB` → `3.34 MB` (`+0.73 MB`)** | `< +5 MB` | **PASS** |
| **Long Tasks Observed During Loop** | **`0`** | `0` | **PASS** |

*Synchronous boot guarantee:* `ContinuityCoordinatorPage.bindDom()` attaches all DOM listeners synchronously at `t = 0 ms` while `probeLivePeerOrigins()` runs asynchronously behind `_peerProbePromise` + `_probeGen` abort guards, and `CrossOriginBridgeClient.destroy()` explicitly rejects unsettled RPC promises so rapid re-probes never leak iframes or listeners.

---

## 2. Chromium Renderer Trace (`browser.trace.*`) & V8 Heap Snapshot Comparison (`browser.heap.*`)

### Renderer Trace (Full Reload + Parallel 5-Origin Peer Handshake + Dynamic Code-Splitting)

| Event / Metric | Count | Total Duration | Max Single Event |
|---|---:|---:|---:|
| **`RunTask`** | `1,172` | `155.63 ms` | **`36.67 ms`** (`< 50 ms`) |
| **`v8.evaluateModule` (critical boot graph; `chaos-lab` & `adk-hocon-converter` lazy-loaded)** | `5` | `45.32 ms` | **`35.00 ms`** (down from `80.80 ms`) |
| **`Layout`** | `2` | `20.47 ms` | **`17.06 ms`** (down from `70.37 ms`) |
| **`TimerFire`** | `1` | `20.13 ms` | `20.13 ms` |
| **`FunctionCall`** | `10` | `19.16 ms` | `18.66 ms` |
| **Long Task Count (`> 50 ms`)** | **`0`** | **`0.00 ms`** | **`0.00 ms` TBT (`longTasks: 0`)** |

*Note:* Event durations overlap across main and background parser threads and are reported individually rather than summed.

### V8 Heap Snapshot Comparison (5 Consecutive Full Ripple-Recovery Sagas + Ed25519 + ZK Hash-Ladder)

| Measurement | Snapshot 1 (Warmed Baseline) | Snapshot 2 (After 5 Full Sagas + Reset) | Explanation |
|---|---:|---:|---|
| **Heap Graph Nodes / Edges** | `118,910` / `502,005` | `140,754` / `468,223` (`-33,782` edges) | Outgoing retainer edges decreased after reset |
| **Shallow V8 Heap (`selfBytes`)** | `9.83 MB` | `11.89 MB` | Dominated by transient Blink CSS animation keyframes (`blink::InterpolableColor`, `CSSTransition`) & V8 JIT `InstructionStream` (`+221 KB`), while `ExternalStringData` dropped `-507 KB` |

---

## 3. Lighthouse Accessibility, Best Practices & SEO Audit (All 6 Pages — Zero Diagnostic Failures)

Re-verified **November 18, 2026** live across all **6 deployed public GitHub Pages URLs** (`toskaman.github.io/continuity-agentic-web/`, `/community-kit.html`, and all 4 `gpaschercher-sudo.github.io/*-agentic-peer/` sites) after the final plain-language UI, session recovery, and simulation-mode updates (`0` failures, `0` console errors):

| Page Audited | Accessibility | Best Practices | SEO | Diagnostic Audit Failures (`lh.failures`) | Console Errors |
|---|---:|---:|---:|---:|---:|
| **CONTINUITY Coordinator (`/` — Idle State, Light & Dark Themes)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |
| **CONTINUITY Coordinator (`/` — Ripple-Prepared + Open Settings)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |
| **Community Builder Kit (`/community-kit.html` — Light & Dark Themes, 6 WebMCP Tools)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |
| **MoveCo Express Peer (`demo-moveco`)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |
| **PermitFlow Civic Prep Peer (`demo-permitflow`)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |
| **HomeConnect Fiber Peer (`demo-homeconnect`)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |
| **PowerFlow Energy Peer (`demo-powerflow`)** | **100** | **100** | **100** | **`0` (`[]`)** | **0** |

### Specific Accessibility & Rendering Fixes Verified in This Pass
1. **WCAG 2.5.3 Label-in-Name (`label-content-name-mismatch`) eliminated across all 6 pages:** Removed redundant `aria-label` overrides on `.brand-lockup` links and interactive SVG `<g role="button">` nodes so screen-reader and voice-control accessible names match visible text 1:1, and marked decorative glyph prefixes (`◐`, `−`, `+`, `×`) `aria-hidden="true"`.
2. **WCAG AA Color Contrast (`> 4.5:1`) inside open `⚙ AI model settings`:** Styled `#ns-openrouter-pkce` (`background: var(--ns-panelbg, #fff); color: var(--ns-fg, #111827); font-weight: 600`) and `.ns-key-help .ns-hint` (`color: var(--ns-fg, #334155)`) in `skills/agentify-website/runtime/ui.js` across all 5 sites.
3. **Offscreen button transition contrast fix (`design-system/base.css`):** Removed `color .15s` / `background .15s` transitions from `.btn` so buttons transitioning from `[disabled]` to enabled while offscreen snap immediately to full-contrast `--btn-ink` / `--btn-bg` without stalling at frame-0 under Blink's offscreen animation throttling.
