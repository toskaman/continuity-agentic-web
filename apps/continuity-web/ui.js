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

function update() {
  const page = App.page;
  const stages = missionStage(page);
  setTimeline(document.querySelector("#mission-steps"), stages);

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

  document.querySelectorAll("#plans-selector .plan-option").forEach((btn) => {
    const pid = btn.getAttribute("data-plan-id") || "";
    const meta = Object.entries(PLAN_META).find(([k]) => pid.startsWith(k))?.[1];
    if (meta && !btn.querySelector(".plan-letter")) {
      btn.dataset.letter = meta.letter;
      btn.insertAdjacentHTML("afterbegin", `<span class="plan-letter" aria-hidden="true">${e(meta.letter)}</span><span class="plan-kind">${e(meta.name)}</span>`);
    }
  });
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

chrome();
