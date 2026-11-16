# Chromium Renderer Performance Trace, V8 Heap Memory & Lighthouse Audit

**Targets Audited:** All **6 pages across 5 independent Open Agentic Websites** (`continuity-web/index.html`, `continuity-web/community-kit.html`, `demo-moveco`, `demo-permitflow`, `demo-homeconnect`, `demo-powerflow`)  
**Measurement Tools:** Headless Chromium CDP (`scripts/audit_browser_perf.mjs`), Chromium Renderer Trace (`browser.trace.*`), V8 Heap Snapshot Comparator (`browser.heap.*`), and Lighthouse 13.6 (`browser.lighthouse`)  
**Date Measured:** November 16, 2026  

---

## 1. Automated 5-Origin Boot & 5-Cycle Saga Retention Audit (`scripts/audit_browser_perf.mjs`)

Reproduce locally anytime with:

```bash
node scripts/audit_browser_perf.mjs
```

| Metric | Measured Value | Target / Threshold | Status |
|---|---:|---:|---|
| **5-Origin Boot + Cross-Origin Handshake** | **`360.5 ms`** | `< 1,000 ms` | **PASS** |
| **DOM Nodes (Before 5 Sagas → After 5 Sagas + Reset)** | **`2,779` → `2,788` (`+9` nodes)** | `< +50` nodes | **PASS** |
| **JS Event Listeners (`JSEventListeners` Delta Across 5 Sagas)** | **`110` → `110` (`0` delta)** | `0` leaked listeners | **PASS** |
| **Post-GC V8 Used Heap (`JSHeapUsedSize`)** | **`2.53 MB` → `2.89 MB`** | `< 10 MB` | **PASS** |
| **Cumulative Layout Shift (`CLS`) on Initial Load** | **`0.000`** | `< 0.05` | **PASS** |

*Synchronous boot guarantee:* `ContinuityCoordinatorPage.bindDom()` attaches all DOM listeners synchronously at `t = 0 ms` while `probeLivePeerOrigins()` runs asynchronously behind `_peerProbePromise` + `_probeGen` abort guards, and `CrossOriginBridgeClient.destroy()` explicitly rejects unsettled RPC promises so rapid re-probes never leak iframes or listeners.

---

## 2. Chromium Renderer Trace (`browser.trace.*`) & V8 Heap Snapshot Comparison (`browser.heap.*`)

### Renderer Trace (Full Reload + 5-Origin Peer Probe)

| Event / Metric | Count | Total Duration | Max Single Event |
|---|---:|---:|---:|
| **`RunTask`** | `1,522` | `182.30 ms` | `84.43 ms` |
| **`v8.evaluateModule` (24 ES modules + runtime)** | `4` | `87.46 ms` | `80.80 ms` |
| **`v8.parseOnBackground`** | `57` | `28.68 ms` | `6.11 ms` |
| **`Layout`** | `3` | `74.22 ms` | `70.37 ms` |
| **`UpdateLayoutTree`** | `3` | `11.34 ms` | `9.05 ms` |
| **`ParseHTML`** | `36` | `4.94 ms` | `2.77 ms` |
| **Long Task Blocking (`> 50 ms`)** | `1` (initial ES module graph boot) | **`34.43 ms`** | `< 50 ms` TBT budget |

*Note:* Event durations overlap across main and background parser threads and are reported individually rather than summed.

### V8 Heap Snapshot Comparison (5 Consecutive Full Ripple-Recovery Sagas + Ed25519 + ZK Hash-Ladder)

| Measurement | Snapshot 1 (Warmed Baseline) | Snapshot 2 (After 5 Full Sagas + Reset) | Explanation |
|---|---:|---:|---|
| **Heap Graph Nodes / Edges** | `118,910` / `502,005` | `140,754` / `468,223` (`-33,782` edges) | Outgoing retainer edges decreased after reset |
| **Shallow V8 Heap (`selfBytes`)** | `9.83 MB` | `11.89 MB` | Dominated by transient Blink CSS animation keyframes (`blink::InterpolableColor`, `CSSTransition`) & V8 JIT `InstructionStream` (`+221 KB`), while `ExternalStringData` dropped `-507 KB` |

---

## 3. Lighthouse Accessibility, Best Practices & SEO Audit (All 6 Pages — Zero Diagnostic Failures)

Re-verified **November 16, 2026** after adding the 6-day horizon sweep, semantic `⚡ RIPPLE` / `🛡 PROTECTED` SVG graph, 1-click OpenRouter PKCE (`#ns-openrouter-pkce`), `#peer-local-ai-btn` across all 4 peer sites, and the 6-tool / 24-module `community-kit.html`:

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
