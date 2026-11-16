// CONTINUITY — presentation layer. Reads the coordinator's real state after
// every render. It never mutates mission state, never commits, never approves.
import { App } from "./script.js";
import { chrome, setTimeline, escapeHtml as e } from "./ui-kit.js";

const PEERS = ["moveco", "permitflow", "homeconnect", "powerflow"];
const PEER_KEYWORD = { moveco: /moveco/i, permitflow: /permitflow/i, homeconnect: /homeconnect/i, powerflow: /powerflow/i };
const STATE_LABEL = {
  idle: "Independent site",
  contacted: "Consulted",
  prepared: "Replacement held",
  committed: "Committed · verified",
  failed: "Needs attention",
};
const PLAN_META = {
  PLAN_A_: { letter: "A", name: "Minimum changes" },
  PLAN_B_: { letter: "B", name: "Lowest cost" },
  PLAN_C_: { letter: "C", name: "Fastest alignment" },
};

const sameOrigin = (a, b) => {
  try {
    return new URL(a).host === new URL(b).host && new URL(a).pathname.replace(/\/$/, "") === new URL(b).pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
};

function peerOfOp(page, op) {
  return PEERS.find((pid) => sameOrigin(op.provider_origin, page.peerOrigins[pid]) || PEER_KEYWORD[pid].test(op.provider_name || ""));
}

function peerStates(page) {
  const out = Object.fromEntries(PEERS.map((p) => [p, { state: "idle", last: "" }]));
  for (const d of page.privacyDisclosures || []) {
    const pid = PEERS.find((p) => sameOrigin(d.origin, page.peerOrigins[p]) || PEER_KEYWORD[p].test(d.providerName || ""));
    if (pid) {
      out[pid].state = "contacted";
      out[pid].last = `Received only ${d.sentFields}.`;
    }
  }
  for (const op of page.preparedOps || []) {
    const pid = peerOfOp(page, op);
    if (!pid) continue;
    const s = op.state === "COMMITTED" ? "committed" : /FAILED|NEEDS_USER|UNKNOWN/.test(op.state) ? "failed" : "prepared";
    const rank = { idle: 0, contacted: 1, prepared: 2, failed: 3, committed: 4 };
    if (rank[s] >= rank[out[pid].state]) out[pid].state = s;
    out[pid].last = `${op.commitment_title} → ${op.proposed_date} · ${op.state.replace(/_/g, " ").toLowerCase()}${op.hold_id ? ` · hold ${op.hold_id}` : ""}`;
  }
  return out;
}

function missionStage(page) {
  const verified = page.lastSagaExecution?.status === "ALL_COMMITTED_AND_VERIFIED";
  const executed = Boolean(page.lastSagaExecution);
  const ops = page.preparedOps || [];
  const held = ops.length > 0;
  const plans = (page.solverResult?.plans || []).length > 0;
  const impact = Boolean(page.compiledProposal);
  return {
    describe: impact ? "done" : "current",
    impact: impact ? "done" : "todo",
    plans: plans ? "done" : impact ? "blocked" : "todo",
    hold: held ? "done" : "todo",
    approve: executed ? "done" : held ? "current" : "todo",
    verify: verified ? "done" : executed ? "blocked" : "todo",
  };
}

/* ---------- Live provider wall: the providers' own pages, framed from their own origin ---------- */
const wall = { loaded: false, justCommitted: false };

function wallTarget(page, pid) {
  const base = String(page.peerOrigins?.[pid] || "").replace(/\/+$/, "");
  const href = document.querySelector(`#peer-link-${pid}`)?.getAttribute("href") || "";
  const token = href.match(/#continuity_receipt=([A-Za-z0-9_-]+)/)?.[1] || "";
  return { base, token, url: `${base}/embed.html${token ? `#continuity_receipt=${token}` : ""}` };
}

function makeFrame(pid, url) {
  const f = document.createElement("iframe");
  f.title = `${pid} — live page served from its own origin`;
  f.setAttribute("sandbox", "allow-scripts allow-same-origin");
  f.setAttribute("referrerpolicy", "no-referrer");
  f.dataset.want = url;
  f.src = url;
  return f;
}

function syncWall(page, states) {
  if (!document.querySelector("#live-wall")) return;
  const scenNote = document.querySelector("#live-wall-scenario-note");
  if (scenNote) {
    const hasLivePeers = page.hasLivePeerCommitments?.() ?? page.isRelocationScenario?.() ?? true;
    scenNote.hidden = hasLivePeers;
    if (!hasLivePeers) {
      scenNote.textContent =
        "These four live cross-origin websites (MoveCo, PermitFlow, HomeConnect, PowerFlow) power the Home relocation & Hybrid .ics ecosystems. Switch to 'Home relocation' or load 'Hybrid .ics (Agentic + Legacy)' in the Workspace above to watch live cross-origin signed receipt commits.";
    }
  }
  if (!wall.loaded && !page.compiledProposal) return;
  wall.loaded = true;
  const loadBtn = document.querySelector("#live-wall-load");
  if (loadBtn) loadBtn.hidden = true;
  const delay = wall.justCommitted ? 1300 : 0;
  wall.justCommitted = false;
  for (const pid of PEERS) {
    const slot = document.querySelector(`[data-live-frame="${pid}"]`);
    if (!slot) continue;
    const { base, token, url } = wallTarget(page, pid);
    const urlEl = document.querySelector(`[data-live-url="${pid}"]`);
    if (urlEl) urlEl.textContent = base.replace(/^https?:\/\//, "");
    let frame = slot.querySelector("iframe");
    if (!frame) {
      slot.replaceChildren(makeFrame(pid, url));
    } else if (frame.dataset.want !== url) {
      const hadToken = frame.dataset.want.includes("#");
      frame.dataset.want = url;
      if (hadToken && !token) slot.replaceChildren(makeFrame(pid, url)); // mission reset: fresh page
      else setTimeout(() => { if (frame.dataset.want === url) frame.src = url; }, delay); // hash only: no reload, the page verifies the receipt
    }
    const label = document.querySelector(`[data-live-state="${pid}"]`);
    if (label) {
      const st = states[pid].state;
      label.textContent = token ? "Signed receipt delivered — verified by this page"
        : st === "committed" ? "Committed in the coordinator — no receipt reached this page (offline mode)"
        : st === "prepared" ? "Replacement held — page unchanged until you approve"
        : st === "contacted" ? (page.lastSagaExecution ? "Consulted — kept as is, nothing to change" : "Consulted")
        : "Live — no change requested";
      label.dataset.state = token ? "committed" : st;
    }
  }
}

let lastOutcome = null;

/** Completion panel: shown once when a commit finishes (verified or halted), dismissible. */
function showOutcome(page) {
  const status = page.lastSagaExecution?.status;
  if (!status || status === lastOutcome) return;
  lastOutcome = status;
  document.querySelector("#outcome-panel")?.remove();
  const plan = page.getSelectedPlan?.();
  const ok = status === "ALL_COMMITTED_AND_VERIFIED";
  const committedPeer = PEERS.find((pid) => (page.preparedOps || []).some((op) => op.state === "COMMITTED" && peerOfOp(page, op) === pid));
  const peerLink = committedPeer ? document.querySelector(`#peer-link-${committedPeer}`) : null;
  const panel = document.createElement("aside");
  panel.id = "outcome-panel";
  panel.className = `outcome-panel ${ok ? "is-ok" : "is-warn"}`;
  panel.setAttribute("role", "status");
  panel.innerHTML = ok
    ? `<div class="outcome-icon" aria-hidden="true">✓</div>
       <div class="outcome-body">
         <strong>Mission re-aligned and verified</strong>
         <span>${e(plan?.metrics?.changedCount ?? "")} bookings moved · ${e(plan?.metrics?.unchangedCount ?? "")} left untouched · total €${e(Number(plan?.metrics?.totalMissionCostEur || 0).toFixed(2))} · every commit has a signed receipt.</span>
         <div class="outcome-actions">
           ${peerLink ? `<a class="btn btn-primary btn-sm" href="${e(peerLink.getAttribute("href"))}" target="_blank" rel="noopener">See it on ${e(peerLink.querySelector(".eco-name")?.textContent || "the provider")} ↗</a>` : ""}
           <button type="button" class="btn btn-sm" data-outcome="ics">Download updated calendar</button>
           <button type="button" class="btn btn-sm btn-ghost" data-outcome="reset">Run it again</button>
         </div>
       </div>
       <button type="button" class="outcome-close" aria-label="Close"><span aria-hidden="true">×</span></button>`
    : `<div class="outcome-icon" aria-hidden="true">!</div>
       <div class="outcome-body">
         <strong>Stopped safely</strong>
         <span>${e(page.lastSagaExecution?.partialFailureReason || "Some operations could not be confirmed.")} Nothing else was changed; details are in the Trust center.</span>
         <div class="outcome-actions"><a class="btn btn-sm" href="#trust" data-open-tab="tab-btn-timeline">Open the saga log</a></div>
       </div>
       <button type="button" class="outcome-close" aria-label="Close"><span aria-hidden="true">×</span></button>`;
  document.body.append(panel);
  if (ok) {
    wall.justCommitted = true;
    document.querySelector("#live-wall")?.scrollIntoView({ behavior: document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }
  panel.querySelector(".outcome-close")?.addEventListener("click", () => panel.remove());
  panel.querySelector('[data-outcome="ics"]')?.addEventListener("click", () => document.querySelector("#export-ics-btn")?.click());
  panel.querySelector('[data-outcome="reset"]')?.addEventListener("click", () => {
    panel.remove();
    document.querySelector("#reset-mission-btn")?.click();
    document.querySelector("#top")?.scrollIntoView({ behavior: "smooth" });
  });
}

function update() {
  const page = App.page;
  const stages = missionStage(page);
  setTimeline(document.querySelector("#mission-steps"), stages);
  if (page.lastSagaExecution) showOutcome(page);
  else {
    lastOutcome = null;
    document.querySelector("#outcome-panel")?.remove();
  }

  const core = document.querySelector("#eco-core-state");
  if (core) {
    core.textContent =
      stages.verify === "done" ? "All commitments verified"
      : stages.approve === "current" ? "Waiting for your approval"
      : stages.impact === "done" ? "Plans ready"
      : "Coordinator";
  }

  const states = peerStates(page);
  const live = page.livePeersDetected || page.crossOriginBridgeConnected;
  document.querySelector("#eco")?.classList.toggle("is-live", Boolean(live));
  for (const pid of PEERS) {
    const st = states[pid];
    document.querySelectorAll(`[data-peer="${pid}"]`).forEach((el) => {
      el.dataset.state = st.state;
    });
    const label = document.querySelector(`[data-peer-state="${pid}"]`);
    if (label) label.textContent = STATE_LABEL[st.state];
    const badge = document.querySelector(`[data-agent-status="${pid}"]`);
    if (badge) {
      badge.textContent = st.state === "idle" ? (live ? "Reachable" : "Not contacted") : STATE_LABEL[st.state];
      badge.className = `badge agent-status ${st.state === "committed" ? "badge-ok" : st.state === "failed" ? "badge-danger" : st.state === "prepared" ? "badge-warn" : st.state === "contacted" || live ? "badge-info" : ""}`;
    }
    const last = document.querySelector(`[data-agent-last="${pid}"]`);
    if (last) last.textContent = st.last || "No interaction yet in this session.";

    const base = String(page.peerOrigins?.[pid] || "").replace(/\/$/, "");
    const siteHref = document.querySelector(`#peer-link-${pid}`)?.getAttribute("href") || `${base}/`;
    document.querySelectorAll(`[data-peer-href="${pid}"]`).forEach((a) => {
      const path = a.getAttribute("data-path");
      a.setAttribute("href", path ? `${base}/${path}` : siteHref);
    });
  }

  const OBJECTIVE = { minimal_change: "Minimum changes", lowest_cost: "Lowest cost", fastest_resolution: "Fastest alignment", feasible_alternative: "Alternative" };
  const plans = page.solverResult?.plans || [];
  document.querySelectorAll("#plans-selector .plan-option").forEach((btn) => {
    if (btn.querySelector(".plan-letter")) return;
    const pid = btn.getAttribute("data-plan-id") || "";
    const plan = plans.find((p) => p.plan_id === pid);
    const meta = Object.entries(PLAN_META).find(([k]) => pid.startsWith(k))?.[1];
    const kinds = (plan?.co_optimizes || []).map((k) => OBJECTIVE[k]).filter(Boolean);
    const letter = meta?.letter || "+";
    btn.dataset.letter = letter;
    btn.insertAdjacentHTML("afterbegin", `<span class="plan-letter" aria-hidden="true">${e(letter)}</span><span class="plan-kind">${e(kinds.join(" · ") || meta?.name || "Alternative")}</span>`);
  });
  // Explain merged strategies instead of silently showing fewer than three named plans.
  const note = document.querySelector("#plans-merge-note");
  if (note) {
    const merged = plans.filter((p) => (p.co_optimizes || []).length > 1);
    note.hidden = merged.length === 0;
    note.textContent = merged
      .map((p) => `${p.label.split(" — ")[0]} is also the best plan for: ${p.co_optimizes.slice(1).map((k) => (OBJECTIVE[k] || k).toLowerCase()).join(", ")} — so those strategies are merged into one card.`)
      .join(" ");
  }
  syncWall(page, states);
}

// Hook into every real render.
const originalRender = App.page.render.bind(App.page);
App.page.render = (msg = "") => {
  originalRender(msg);
  try {
    update();
  } catch (err) {
    console.warn("[ui] enhancement skipped:", err);
  }
};
update();

// Trust tiles & links that open a Trust Center tab.
document.addEventListener("click", (ev) => {
  const trigger = ev.target.closest?.("[data-open-tab]");
  if (!trigger) return;
  const tab = document.getElementById(trigger.getAttribute("data-open-tab"));
  if (!tab) return;
  ev.preventDefault();
  tab.click();
  document.querySelector("#trust")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  tab.focus({ preventScroll: true });
});

// "Launch your workspace" lands the cursor in the change request.
document.querySelector("#launch-workspace-link")?.addEventListener("click", () => {
  setTimeout(() => document.querySelector("#mission-input")?.focus({ preventScroll: true }), 450);
});

// Keyboard arrows for the tablist (WAI-ARIA tabs pattern).
document.querySelector('[role="tablist"]')?.addEventListener("keydown", (ev) => {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(ev.key)) return;
  const tabs = Array.from(ev.currentTarget.querySelectorAll('[role="tab"]'));
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  ev.preventDefault();
  const next = ev.key === "Home" ? 0 : ev.key === "End" ? tabs.length - 1 : (i + (ev.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
});

// Current-section highlight in the header nav.
const navLinks = Array.from(document.querySelectorAll(".site-nav a[href^='#']"));
if ("IntersectionObserver" in window && navLinks.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((a) => a.setAttribute("aria-current", String(a.getAttribute("href") === `#${en.target.id}`)));
      });
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  navLinks.forEach((a) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target) io.observe(target);
  });
}

document.querySelector("#live-wall-load")?.addEventListener("click", () => {
  wall.loaded = true;
  update();
});

// Never show an empty wall: load the provider pages as soon as it scrolls into view.
const wallEl = document.querySelector("#live-wall");
if (wallEl && "IntersectionObserver" in window) {
  const wallIo = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      wallIo.disconnect();
      wall.loaded = true;
      update();
    }
  }, { rootMargin: "300px 0px" });
  wallIo.observe(wallEl);
}

// Demo button: show progress until the approval dialog (or an outcome) appears.
const demoBtn = document.querySelector("#guided-demo-btn");
demoBtn?.addEventListener("click", () => {
  demoBtn.setAttribute("aria-busy", "true");
  const started = Date.now();
  const timer = setInterval(() => {
    if (document.querySelector("dialog[open]") || App.page.lastSagaExecution || Date.now() - started > 15000) {
      demoBtn.removeAttribute("aria-busy");
      clearInterval(timer);
    }
  }, 200);
});

// Deep link for judges: ?demo=1 starts the guided demo. It stops at the approval
// dialog like a manual run — nothing is ever approved automatically.
if (new URLSearchParams(location.search).get("demo") === "1") {
  // Wait until the coordinator has finished starting (its first render replaces the
  // "Detecting…" badge and its click handlers are bound right after), then start once.
  const startedAt = Date.now();
  const ready = setInterval(() => {
    const badge = document.querySelector("#transport-badge")?.textContent || "";
    if (!/Detecting/i.test(badge) || Date.now() - startedAt > 15000) {
      clearInterval(ready);
      setTimeout(() => demoBtn?.click(), 600);
    }
  }, 150);
}

chrome();

// Global keyboard shortcuts: Escape dismisses completion toast; "/" focuses #mission-input when idle.
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !document.querySelector("dialog[open]")) {
    const toast = document.querySelector("#outcome-panel");
    if (toast) {
      toast.remove();
      ev.preventDefault();
    }
    return;
  }
  if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    const tag = document.activeElement?.tagName?.toLowerCase() || "";
    if (["input", "textarea", "select"].includes(tag) || document.activeElement?.isContentEditable) return;
    const input = document.querySelector("#mission-input");
    if (input) {
      ev.preventDefault();
      input.focus();
    }
  }
});
