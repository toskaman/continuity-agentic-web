// HomeConnect Fiber — presentation layer. Reads real page state; never mutates it.
import { App } from "./script.js";
import { afterEachRender, choiceCards, setTimeline, activityLog, dateParts, escapeHtml as e, flash, chrome } from "./ui-kit.js";

const ORIGINAL_DATE = App.page.appointment.scheduledDate;
const log = activityLog(document.querySelector("#activity-log"));

const cards = choiceCards({
  select: document.querySelector("#win-select"),
  container: document.querySelector("#win-choices"),
  legend: "Technician arrival window",
  name: "hc-window",
  describe: (date) => {
    const w = App.page.windows.find((x) => x.date === date);
    if (!w) return {};
    const offPeak = w.feeEur === "€39.00";
    return { meta: `${w.window} · arrival window · €0 reschedule fee`, note: offPeak ? "Off-peak: €10 less" : "", price: w.feeEur, badge: offPeak ? "Off-peak" : "Available", badgeClass: offPeak ? "badge-accent" : "badge-ok" };
  },
});

function renderAppointment(state) {
  const a = state.appointment;
  const p = dateParts(a.scheduledDate);
  const hold = state.activeHold;
  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-kicker">Technician visit</div>
          <div class="record-title">${e(a.plan)}</div>
          <div class="record-ref">${e(a.appointmentRef)}</div>
        </div>
        <span class="badge badge-ok">${e(a.status === "CONFIRMED" ? "Confirmed" : a.status)}</span>
      </div>
      <div class="record-body">
        <div class="record-when">
          <span class="date-tile" aria-hidden="true"><span>${e(p.wd)}</span><strong>${e(p.day)}</strong><span>${e(p.mon)}</span></span>
          <div><strong>${e(p.long)}</strong><span>${e(a.window)} · arrival window</span></div>
        </div>
        <div class="signal">
          <span class="signal-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <div><strong>Line ready for installation</strong><span>Optical splice and ONT activation on site</span></div>
        </div>
        <dl class="record-facts">
          <div class="record-fact"><dt>Installation fee</dt><dd>${e(a.installFeeEur)}</dd></div>
          <div class="record-fact"><dt>Reschedule fee</dt><dd>€0.00</dd></div>
        </dl>
        ${hold ? `<div class="record-hold">Hold ${e(hold.holdId)} on ${e(hold.label)} (${e(hold.window)}) · current visit stays active</div>` : ""}
      </div>
      <div class="record-foot"><span>Bring keys · keep mains power on</span><span>Demonstration data</span></div>
    </article>`;
}

afterEachRender(App.page, (state, feedback) => {
  const panel = document.querySelector("#appt-panel");
  if (panel) {
    panel.innerHTML = renderAppointment(state);
    if (feedback) flash(panel.firstElementChild);
  }
  const moved = state.appointment.scheduledDate !== ORIGINAL_DATE;
  const held = Boolean(state.activeHold);
  setTimeline(document.querySelector("#status-timeline"), {
    received: "done",
    found: "done",
    held: held ? "current" : moved ? "done" : "todo",
    confirmed: moved && !held ? "done" : "todo",
    planned: held ? "todo" : moved ? "done" : "current",
  });
  setTimeline(document.querySelector("#journey-steps"), {
    verify: "done",
    browse: held || moved ? "done" : "current",
    hold: held || moved ? "done" : "todo",
    prepare: held ? "current" : moved ? "done" : "todo",
    confirm: moved && !held ? "done" : "todo",
  });
  const desc = document.querySelector("#planned-desc");
  if (desc) desc.textContent = `${state.appointment.scheduledLabel}, ${state.appointment.window}.`;
  const badge = document.querySelector("#status-badge");
  if (badge) {
    badge.textContent = held ? "Window held" : moved ? "Rescheduled" : "Scheduled";
    badge.className = `badge ${held ? "badge-warn" : "badge-ok"}`;
  }
  cards.refresh();
  if (feedback) log(feedback);
});

chrome();
