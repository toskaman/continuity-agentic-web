// CONTINUITY ecosystem — shared presentation helpers for peer sites.
// GENERATED copy (source: design-system/peer-ui-kit.js). Presentation only:
// it never changes business state; it reads page.getState() after each render.

export const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function dateParts(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return { wd: "", day: iso, mon: "" };
  return {
    wd: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" }),
    mon: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    long: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
  };
}

/** Wrap page.render so `onRender(state, feedback)` runs after every real render. */
export function afterEachRender(page, onRender) {
  const original = page.render.bind(page);
  page.render = (feedback = "") => {
    original(feedback);
    try {
      onRender(page.getState(), feedback);
    } catch (err) {
      console.warn("[ui] enhancement skipped:", err);
    }
  };
  // Re-render once, keeping any message the page already showed (e.g. a
  // signed receipt verified by peer-sync.js before this module loaded).
  page.render(document.querySelector("#action-feedback")?.textContent || "");
}

/** Turn a native <select> into accessible radio cards. The select stays the source of truth. */
export function choiceCards({ select, container, legend, describe, name }) {
  if (!select || !container) return { refresh() {} };
  const build = () => {
    const opts = Array.from(select.options);
    container.innerHTML = `
      <fieldset class="choice-set">
        <legend class="sr-only">${escapeHtml(legend)}</legend>
        ${opts
          .map((o, i) => {
            const d = describe(o.value) || {};
            const p = dateParts(o.value);
            const id = `${name}-${i}`;
            return `
            <label class="choice-card" for="${id}">
              <input type="radio" id="${id}" name="${name}" value="${escapeHtml(o.value)}" ${o.value === select.value ? "checked" : ""}>
              <span class="date-tile" aria-hidden="true"><span>${escapeHtml(p.wd)}</span><strong>${escapeHtml(p.day)}</strong><span>${escapeHtml(p.mon)}</span></span>
              <span class="choice-body">
                <span class="choice-title">${escapeHtml(p.long)}</span>
                <span class="choice-meta">${escapeHtml(d.meta || "")}</span>
                ${d.note ? `<span class="choice-note">${escapeHtml(d.note)}</span>` : ""}
              </span>
              <span class="choice-side">
                ${d.price ? `<span class="choice-price">${escapeHtml(d.price)}</span>` : ""}
                ${d.badge ? `<span class="badge ${d.badgeClass || "badge-accent"}">${escapeHtml(d.badge)}</span>` : ""}
              </span>
            </label>`;
          })
          .join("")}
      </fieldset>`;
    container.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
      r.addEventListener("change", () => {
        select.value = r.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  };
  build();
  select.closest(".controls-stack")?.classList.add("is-enhanced");
  return { refresh: build };
}

/** Set data-state on <li data-step="..."> items. */
export function setTimeline(listEl, states) {
  if (!listEl) return;
  listEl.querySelectorAll("li[data-step]").forEach((li) => {
    const next = states[li.dataset.step] || "todo";
    if (li.dataset.state !== next) {
      li.dataset.state = next;
      const sr = li.querySelector(".sr-state");
      if (sr) sr.textContent = next === "done" ? "Completed." : next === "current" ? "In progress." : next === "blocked" ? "Needs attention." : "Not started.";
    }
  });
}

/** Append real page events to a visible activity list. */
export function activityLog(listEl) {
  return (message) => {
    if (!listEl || !message) return;
    listEl.querySelector(".log-empty")?.remove();
    const li = document.createElement("li");
    const verified = /^✓/.test(message);
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.className = verified ? "log-item verified" : "log-item";
    li.innerHTML = `<time>${time}</time><span>${escapeHtml(message.replace(/^✓\s*/, ""))}</span>${verified ? '<span class="badge badge-ok">Signed receipt</span>' : ""}`;
    listEl.prepend(li);
    while (listEl.children.length > 8) listEl.lastElementChild.remove();
  };
}

export function flash(el) {
  if (!el) return;
  el.classList.remove("is-updated");
  void el.offsetWidth;
  el.classList.add("is-updated");
}

/**
 * Mozilla Otari issues region-bound keys: an EU key (otk_v1_eu_…) is rejected by
 * api.otari.ai with HTTP 421. When such a key is typed or pasted, point the
 * provider URL at the EU endpoint so the visitor does not hit that error.
 * Only the URL field is touched; the key itself is never read elsewhere or stored here.
 */
function otariRegionHelper() {
  document.addEventListener("input", (ev) => {
    const key = ev.target;
    if (!key || key.id !== "ns-key") return;
    const router = document.querySelector("#ns-router");
    if (!router || !/^otk_v1_eu_/.test(key.value.trim())) return;
    if (router.value && !/^https:\/\/api\.otari\.ai\//.test(router.value.trim())) return;
    router.value = "https://eu.api.otari.ai/api/v1";
    router.dispatchEvent(new Event("input", { bubbles: true }));
    router.dispatchEvent(new Event("change", { bubbles: true }));
    const adv = router.closest("details");
    if (adv) adv.open = true;
    const status = document.querySelector("#assistant-status");
    if (status) status.textContent = "EU Otari key detected — provider URL set to https://eu.api.otari.ai/api/v1. Click Save and start.";
  });
}

/** Header shadow + reveal-on-scroll. */
export function chrome() {
  otariRegionHelper();
  const header = document.querySelector(".site-header");
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  // Only animate what starts below the fold; without JS everything stays visible.
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = Array.from(document.querySelectorAll(".reveal")).filter((el) => el.getBoundingClientRect().top > window.innerHeight);
  els.forEach((el) => el.classList.add("reveal-armed"));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }),
    { rootMargin: "0px 0px -8% 0px" },
  );
  els.forEach((e) => io.observe(e));
}

/**
 * Deterministic Zero-Key Replay LLM for the 4 independent peer websites
 * (`moveco`, `permitflow`, `homeconnect`, `powerflow`) so judges can test each peer's
 * Neuro SAN `.network.json`, `website_*` read/hold/confirm actions, confirmation dialogs,
 * AND bidirectional cross-origin consultation of `continuity_coordinator` without an API key.
 */
export class PeerScriptedReplayLlm {
  constructor(trace, remoteNetwork = null) {
    this.trace = trace;
    this.remoteNetwork = remoteNetwork;
    this.mock = true;
    this.baseUrl = "browser://mock";
  }

  async chat({ messages = [], tools = [], origin, parentSpan, onContentDelta }) {
    const span = this.trace?.start("model_call", {
      parent: parentSpan,
      origin,
      model: "peer-deterministic-replay",
      mock: true,
      routerHost: "browser-peer-scripted-replay",
      toolNames: (tools || []).map((t) => t.function?.name),
    });

    const emitTool = (name, argsObj, seq) => {
      this.trace?.end(span, { finishReason: "tool_calls", toolCalls: [name], mock: true });
      return {
        content: "",
        toolCalls: [
          {
            id: `peer_replay_${name}_${seq}`,
            type: "function",
            function: { name, arguments: JSON.stringify(argsObj) },
          },
        ],
        finishReason: "tool_calls",
        usage: null,
        model: "peer-deterministic-replay",
      };
    };

    const emitText = (txt) => {
      onContentDelta?.(txt);
      this.trace?.end(span, { finishReason: "stop", contentChars: txt.length, mock: true });
      return {
        content: txt,
        toolCalls: [],
        finishReason: "stop",
        usage: null,
        model: "peer-deterministic-replay",
      };
    };

    // Remote partner network loaded in this peer's browser (e.g., CONTINUITY coordinator)
    if (this.remoteNetwork) {
      const frontName = this.remoteNetwork.findFrontMan?.() || "continuity_orchestrator";
      const spec = this.remoteNetwork.getAgentSpec?.(frontName);
      const desc = spec?.function?.description || this.remoteNetwork.config?.metadata?.description || "";
      return emitText(
        `${desc} CONTINUITY holds replacements before releasing existing commitments, enforces your hard budget ceiling, and verifies Ed25519 receipts across providers.`,
      );
    }

    const avail = (tools || []).map((t) => t.function?.name).filter(Boolean);
    const availSet = new Set(avail);
    const toolMsgs = messages.filter((m) => m?.role === "tool");
    const calledSet = new Set(toolMsgs.map((m) => m.name));
    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    const userText = String(lastUser?.content || "");

    const readTool = avail.find((n) => /^website_get_.*_state$/.test(n));
    const holdOrStageTool = avail.find((n) => /^website_(hold_|stage_)/.test(n));
    const confirmTool = avail.find((n) => /^website_(confirm_|amend_)/.test(n));
    const continuityPartnerTool = avail.find((n) => /continuity_coordinator$/.test(n));

    const parseTool = (name) => {
      const found = [...toolMsgs].reverse().find((m) => m.name === name);
      if (!found) return null;
      try {
        const j = JSON.parse(found.content);
        return j?.result ?? j;
      } catch {
        return null;
      }
    };

    // Always read grounded site state first
    if (readTool && !calledSet.has(readTool)) {
      return emitTool(readTool, {}, toolMsgs.length + 1);
    }

    const st = (readTool ? parseTool(readTool) : null) || {};
    const targetDate = /\b(sat|2026-11-21)\b/i.test(userText) ? "2026-11-21" : "2026-11-20";

    // 1. Bidirectional consultation of CONTINUITY Change Coordinator
    if (/\b(continuity|coordinate|other bookings|parking|fiber|electricity|align)\b/i.test(userText) && continuityPartnerTool) {
      if (!calledSet.has(continuityPartnerTool)) {
        return emitTool(
          continuityPartnerTool,
          { request: "How does CONTINUITY coordinate moving, parking dossier, fiber, and electricity date changes?" },
          toolMsgs.length + 1,
        );
      }
      const partnerMsg = [...toolMsgs].reverse().find((m) => m.name === continuityPartnerTool)?.content || "";
      let cleanReply = partnerMsg;
      try {
        const j = JSON.parse(partnerMsg);
        if (j?.text) cleanReply = j.text;
      } catch {}
      const coordLink = st.coordinatorUrl || document.querySelector("#coordinator-link")?.getAttribute("href") || "#";
      return emitText(
        `### Cross-Origin CONTINUITY Response *(Scripted Replay)*\n\n${cleanReply}\n\nOpen the coordinator: [CONTINUITY Change Coordinator](${coordLink})`,
      );
    }

    // 2. Reversible hold / preview / stage
    if (/\b(hold|stage|preview|check eligibility)\b/i.test(userText) && holdOrStageTool && availSet.has(holdOrStageTool)) {
      if (!calledSet.has(holdOrStageTool)) {
        return emitTool(holdOrStageTool, { targetDate }, toolMsgs.length + 1);
      }
      const holdRes = parseTool(holdOrStageTool);
      return emitText(
        holdRes?.ok === false
          ? `Refused: ${holdRes.reason}`
          : `✓ Prepared reversible action for **${targetDate}** *(Scripted Replay)*. Your existing booking remains untouched until you confirm.`,
      );
    }

    // 3. Irreversible reschedule / amendment (triggers browser confirmation dialog!)
    if (/\b(confirm|reschedule|amend|update dossier|shift activation)\b/i.test(userText) && confirmTool && availSet.has(confirmTool)) {
      if (!calledSet.has(confirmTool)) {
        const confirmSchema = tools.find((t) => t.function?.name === confirmTool)?.function?.parameters;
        const reqKeys = confirmSchema?.required || [];
        const refKey = reqKeys.find((k) => /Ref$/.test(k)) || "bookingRef";
        const refVal =
          st.booking?.bookingRef
          || st.dossier?.dossierRef
          || st.appointment?.appointmentRef
          || st.activation?.activationRef
          || "MC-8841";
        return emitTool(
          confirmTool,
          {
            [refKey]: refVal,
            targetDate,
            expectedVersion: Number(st.version || 1),
          },
          toolMsgs.length + 1,
        );
      }
      const confMsg = [...toolMsgs].reverse().find((m) => m.name === confirmTool)?.content || "";
      if (/cancelled|declined/i.test(confMsg)) {
        return emitText("Confirmation declined — your current Tuesday date remains unchanged.");
      }
      return emitText(`✓ Confirmed update to **${targetDate}** *(Scripted Replay)*.`);
    }

    // 4. Default state & pricing summary
    const record = st.booking || st.dossier || st.appointment || st.activation || {};
    const ref = record.bookingRef || record.dossierRef || record.appointmentRef || record.activationRef || "active";
    const curDate = record.scheduledLabel || record.scheduledDate || "Tuesday";
    return emitText(
      `**Grounded Page State *(Scripted Replay)*:** Reference \`${ref}\` is currently scheduled for **${curDate}** (${record.window || "standard window"} · version \`v${st.version ?? 1}\`). Ask to **hold/stage Friday 2026-11-20**, **confirm** a date change, or **ask CONTINUITY** about multi-provider coordination.`,
    );
  }
}

export function bindPeerZeroKeyControls(engine, statusEl, greetFn) {
  if (!engine?.top || typeof document === "undefined") return;
  let origTopLlm = null;
  let origResolveRemote = null;

  const activateReplay = () => {
    if (!origTopLlm) {
      origTopLlm = engine.top.llm;
      origResolveRemote = engine.resolveRemote.bind(engine);
    }
    engine.mockLLM = true;
    engine.userRouter = { baseUrl: "browser://mock", mock: true };
    engine.top.llm = new PeerScriptedReplayLlm(engine.trace);
    engine.resolveRemote = async (...args) => {
      const session = await origResolveRemote(...args);
      if (session && engine.mockLLM) {
        session.llm = new PeerScriptedReplayLlm(engine.trace, session.network);
      }
      return session;
    };
    const badge = document.querySelector("#agent-app .ns-llmbadge");
    if (badge) {
      badge.className = "ns-llmbadge mock";
      badge.textContent = "⚡ Scripted Replay Active (Zero-Key)";
    }
    const settings = document.querySelector("#agent-app .ns-settings");
    if (settings) settings.open = false;
    const btn = document.querySelector("#peer-zero-key-btn");
    if (btn) btn.textContent = "✓ Zero-Key Replay Active";
    if (statusEl) {
      statusEl.textContent =
        "Zero-Key Deterministic Replay active: runs this site's real Neuro SAN network, website_* tools, confirmation dialog, and cross-origin CONTINUITY consent card without an API key.";
    }
    greetFn?.();
  };

  document.querySelector("#peer-zero-key-btn")?.addEventListener("click", activateReplay);
  document.querySelectorAll(".peer-prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const promptText = chip.getAttribute("data-prompt") || "";
      const hasRealKey = Boolean(engine.byokKey && engine.byokKey !== "demo");
      if (!hasRealKey && !engine.mockLLM) {
        activateReplay();
      }
      const input = document.querySelector("#ns-input");
      const send = document.querySelector("#ns-send");
      if (input && send) {
        input.value = promptText;
        send.click();
      }
    });
  });
}
