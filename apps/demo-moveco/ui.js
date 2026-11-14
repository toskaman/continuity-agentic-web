// MoveCo Express — presentation layer. Reads real page state; never mutates it.
import { App } from "./script.js";
import { afterEachRender, choiceCards, setTimeline, activityLog, dateParts, escapeHtml as e, flash, chrome } from "./ui-kit.js";

// Original date from a pristine instance: a signed receipt may already have synced App.page.
const ORIGINAL_DATE = new App.page.constructor().booking.scheduledDate;
const log = activityLog(document.querySelector("#activity-log"));
const select = document.querySelector("#slot-select");

const cards = choiceCards({
  select,
  container: document.querySelector("#slot-choices"),
  legend: "Replacement crew window",
  name: "moveco-slot",
  describe: (date) => {
    const s = App.page.slots.find((x) => x.date === date);
    if (!s) return {};
    return { meta: `${s.window} · ${s.basePriceEur} + ${s.rescheduleFeeEur} fee`, price: s.totalEur, badge: "Available", badgeClass: "badge-ok" };
  },
});

function renderBooking(state) {
  const b = state.booking;
  const p = dateParts(b.scheduledDate);
  const hold = state.activeHold;
  const moved = b.scheduledDate !== ORIGINAL_DATE;
  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-kicker">Your current booking</div>
          <div class="record-title">${e(b.service.replace("m3", "m³"))}</div>
          <div class="record-ref">${e(b.bookingRef)}</div>
        </div>
        <span class="badge badge-ok">${e(b.status === "CONFIRMED" ? "Confirmed" : b.status)}</span>
      </div>
      <div class="record-body">
        <div class="record-when">
          <span class="date-tile" aria-hidden="true"><span>${e(p.wd)}</span><strong>${e(p.day)}</strong><span>${e(p.mon)}</span></span>
          <div><strong>${e(p.long)}</strong><span>${e(b.window)} · crew arrival window</span></div>
        </div>
        <div class="route" aria-label="Route: Rue de Rivoli, Paris to Place Bellecour, Lyon">
          <span class="route-stop">Rue de Rivoli<small class="muted">Paris</small></span>
          <span class="route-line" aria-hidden="true"></span>
          <span class="route-stop">Place Bellecour<small class="muted">Lyon</small></span>
        </div>
        <dl class="record-facts">
          <div class="record-fact"><dt>Current total</dt><dd>${e(b.basePriceEur)}</dd></div>
          <div class="record-fact"><dt>Page version</dt><dd>v${e(state.version)}</dd></div>
        </dl>
        ${hold ? `<div class="record-hold">Hold ${e(hold.holdId)} on ${e(hold.targetLabel)} (${e(hold.window)}) · your booking stays active</div>` : ""}
      </div>
      <div class="record-foot"><span>${moved ? "Rescheduled in this session" : "Original date"}</span><span>Demonstration data</span></div>
    </article>`;
}

afterEachRender(App.page, (state, feedback) => {
  const panel = document.querySelector("#booking-panel");
  if (panel) {
    panel.innerHTML = renderBooking(state);
    if (feedback) flash(panel.firstElementChild);
  }
  const moved = state.booking.scheduledDate !== ORIGINAL_DATE;
  const held = Boolean(state.activeHold);
  setTimeline(document.querySelector("#status-timeline"), {
    received: "done",
    checked: "done",
    held: held || moved ? "done" : "todo",
    awaiting: held ? "current" : moved ? "done" : "todo",
    confirmed: moved && !held ? "done" : "todo",
  });
  setTimeline(document.querySelector("#journey-steps"), {
    describe: "done",
    browse: held || moved ? "done" : "current",
    hold: held ? "done" : moved ? "done" : "todo",
    confirm: moved && !held ? "done" : held ? "current" : "todo",
  });
  const badge = document.querySelector("#status-badge");
  if (badge) {
    badge.textContent = held ? "Hold active" : moved ? "Rescheduled" : "Confirmed";
    badge.className = `badge ${held ? "badge-warn" : "badge-ok"}`;
  }
  cards.refresh();
  if (feedback) log(feedback);
});

chrome();
