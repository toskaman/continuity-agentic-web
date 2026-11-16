// PowerFlow Energy — presentation layer. Reads real page state; never mutates it.
import { App } from "./script.js";
import { afterEachRender, choiceCards, setTimeline, activityLog, dateParts, escapeHtml as e, flash, chrome } from "./ui-kit.js";

// Original date from a pristine instance: a signed receipt may already have synced App.page.
const ORIGINAL_DATE = new App.page.constructor().activation.scheduledDate;
const log = activityLog(document.querySelector("#activity-log"));

const cards = choiceCards({
  select: document.querySelector("#grid-select"),
  container: document.querySelector("#grid-choices"),
  legend: "Target grid energization date",
  name: "pf-date",
  describe: (date) => {
    const d = App.page.dates.find((x) => x.date === date);
    if (!d) return {};
    return { meta: `${d.window} · remote switch-on · €0 change fee`, price: d.feeEur, badge: "Available", badgeClass: "badge-ok" };
  },
});

function renderActivation(state) {
  const a = state.activation;
  const p = dateParts(a.scheduledDate);
  const staged = state.stagedDate;
  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-kicker">Smart-meter activation</div>
          <div class="record-title">Meter ${e(a.meterPoint)}</div>
          <div class="record-ref">${e(a.activationRef)}</div>
        </div>
        <span class="badge badge-ok">${e(a.status === "CONFIRMED" ? "Confirmed" : a.status)}</span>
      </div>
      <div class="record-body">
        <dl class="meter-grid">
          <div class="meter-tile"><dt>Meter point</dt><dd><span class="led on" aria-hidden="true"></span>On file</dd></div>
          <div class="meter-tile"><dt>Activation</dt><dd><span class="led wait" aria-hidden="true"></span>Scheduled</dd></div>
          <div class="meter-tile"><dt>Mode</dt><dd>Remote</dd></div>
        </dl>
        <div class="record-when">
          <span class="date-tile" aria-hidden="true"><span>${e(p.wd)}</span><strong>${e(p.day)}</strong><span>${e(p.mon)}</span></span>
          <div><strong>${e(p.long)}</strong><span>${e(a.window)} · scheduled switch-on</span></div>
        </div>
        <dl class="record-facts">
          <div class="record-fact"><dt>Activation fee</dt><dd>${e(a.feeEur)}</dd></div>
          <div class="record-fact"><dt>Contract</dt><dd>9 kVA single-phase</dd></div>
        </dl>
        ${staged ? `<div class="record-hold">Staged ${e(staged.label)} (${e(staged.window)}) — confirm to apply it <button type="button" class="mini-btn" data-peer-release="1">Clear staged</button></div>` : ""}
        ${state.lastReceipt?.payloadSha256 ? `<div class="record-hold">✓ Ed25519 Verified (${e(state.lastReceipt.keyId || "ed25519")} · sha256:${e(state.lastReceipt.payloadSha256.slice(0, 12))}…)</div>` : ""}
      </div>
      <div class="record-foot"><span>Switch-on happens on the scheduled date</span><button type="button" class="mini-btn" data-peer-ics="1">↓ .ics</button></div>
    </article>`;
}

afterEachRender(App.page, (state, feedback) => {
  const panel = document.querySelector("#grid-panel");
  if (panel) {
    panel.innerHTML = renderActivation(state);
    panel.querySelector("[data-peer-ics]")?.addEventListener("click", () => {
      const ics = App.page.exportIcs();
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.activation.activationRef}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    panel.querySelector("[data-peer-release]")?.addEventListener("click", () => {
      App.page.clearStaged();
    });
    if (feedback) flash(panel.firstElementChild);
  }
  const moved = state.activation.scheduledDate !== ORIGINAL_DATE;
  const staged = Boolean(state.stagedDate);
  setTimeline(document.querySelector("#journey-steps"), {
    verify: "done",
    prepare: staged || moved ? "done" : "current",
    review: staged ? "current" : moved ? "done" : "todo",
    validate: staged ? "current" : moved ? "done" : "todo",
    result: moved && !staged ? "done" : "todo",
  });
  const badge = document.querySelector("#status-badge");
  if (badge) {
    badge.textContent = staged ? "Date staged" : moved ? "Date changed" : "Scheduled";
    badge.className = `badge ${staged ? "badge-warn" : "badge-ok"}`;
  }
  cards.refresh();
  if (feedback) log(feedback);
});

chrome();
