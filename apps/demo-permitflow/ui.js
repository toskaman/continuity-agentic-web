// PermitFlow Civic Prep — presentation layer. Reads real page state; never mutates it.
import { App } from "./script.js";
import { afterEachRender, choiceCards, dateParts, escapeHtml as e, flash, chrome } from "./ui-kit.js";

const ORIGINAL_DATE = App.page.dossier.scheduledDate;
const select = document.querySelector("#date-select");

const cards = choiceCards({
  select,
  container: document.querySelector("#date-choices"),
  legend: "Curbside bay occupation window",
  name: "permit-date",
  describe: (date) => {
    const d = App.page.eligibleDates.find((x) => x.date === date);
    if (!d) return {};
    return { meta: `${d.window} · Zone B, 15 m bay`, note: "Meets the 48-hour notice rule", price: `${d.totalEur} total`, badge: "Eligible", badgeClass: "badge-ok" };
  },
});

const STATUS_LABEL = { ready: "Ready", progress: "In progress", review: "To review", todo: "To complete" };
const STATUS_BADGE = { ready: "badge-ok", progress: "badge-info", review: "badge-warn", todo: "" };

function checklist(state) {
  const d = state.dossier;
  const preview = state.previewDate;
  const amended = d.scheduledDate !== ORIGINAL_DATE;
  return [
    { title: "Curbside zone & bay length", desc: d.zone, status: "ready" },
    { title: "Applicant details", desc: `Dossier ${d.dossierRef} prepared with the move details on file.`, status: "ready" },
    {
      title: "Occupation date",
      desc: preview ? `Previewing ${preview.label}, ${preview.window}. Your draft is unchanged.` : amended ? `Updated to ${d.scheduledLabel}, ${d.window}.` : `Currently ${d.scheduledLabel}. Choose a new date if your move changed.`,
      status: preview ? "progress" : amended ? "ready" : "todo",
    },
    {
      title: "48-hour notice period",
      desc: preview ? `${preview.label} passes the notice check.` : "Checked automatically for every listed date.",
      status: "ready",
    },
    {
      title: "Amendment fee (€10.00)",
      desc: amended ? `Included in the draft total: ${d.prepFeeEur}.` : preview ? `Applies if you update the draft to ${preview.label}.` : "Only charged if you change the date.",
      status: amended ? "ready" : preview ? "review" : "todo",
    },
    { title: "Submission to the city", desc: "You submit the final application yourself. PermitFlow does not file or approve permits.", status: "todo", mine: true },
  ];
}

function renderDossier(state) {
  const d = state.dossier;
  const p = dateParts(d.scheduledDate);
  const updated = /UPDATED/.test(d.status) || d.scheduledDate !== ORIGINAL_DATE;
  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-kicker">Prepared application draft</div>
          <div class="record-title">Loading-bay occupation · Zone B</div>
          <div class="record-ref">${e(d.dossierRef)}</div>
        </div>
        <span class="badge ${updated ? "badge-info" : "badge-accent"}">${updated ? "Draft updated" : "Draft prepared"}</span>
      </div>
      <div class="record-body">
        <div class="record-when">
          <span class="date-tile" aria-hidden="true"><span>${e(p.wd)}</span><strong>${e(p.day)}</strong><span>${e(p.mon)}</span></span>
          <div><strong>${e(p.long)}</strong><span>${e(d.window)} · curbside occupation</span></div>
        </div>
        <dl class="record-facts">
          <div class="record-fact"><dt>Draft total</dt><dd>${e(d.prepFeeEur)}</dd></div>
          <div class="record-fact"><dt>Official status</dt><dd>Not submitted</dd></div>
        </dl>
        ${state.previewDate ? `<div class="record-hold">Previewing ${e(state.previewDate.label)} — draft unchanged until you update it</div>` : ""}
      </div>
      <div class="record-foot"><span>Preparation only — not an official permit</span><span>Demonstration data</span></div>
    </article>`;
}

afterEachRender(App.page, (state, feedback) => {
  const panel = document.querySelector("#dossier-panel");
  if (panel) {
    panel.innerHTML = renderDossier(state);
    if (feedback) flash(panel.firstElementChild);
  }
  const items = checklist(state);
  const list = document.querySelector("#checklist");
  if (list) {
    list.innerHTML = items
      .map(
        (i) => `<li class="check-item" data-status="${i.status}">
          <span class="check-icon" aria-hidden="true"></span>
          <div><div class="check-title">${e(i.title)}</div><div class="check-desc">${e(i.desc)}</div></div>
          <span class="badge ${i.mine ? "badge-demo no-dot" : STATUS_BADGE[i.status]}">${i.mine ? "Your step" : STATUS_LABEL[i.status]}</span>
        </li>`,
      )
      .join("");
  }
  const ready = items.filter((i) => i.status === "ready").length;
  const count = document.querySelector("#checklist-count");
  if (count) count.textContent = `${ready} of ${items.length} ready`;

  const missing = items.filter((i) => i.status !== "ready");
  const summary = document.querySelector("#dossier-summary");
  if (summary) {
    summary.innerHTML = `
      <div><h4>Information provided</h4><ul><li>Dossier ${e(state.dossier.dossierRef)}</li><li>${e(state.dossier.zone)}</li><li>${e(state.dossier.scheduledLabel)}, ${e(state.dossier.window)}</li></ul></div>
      <div><h4>Documents available</h4><ul><li>Prepared application draft</li><li>Notice-period check</li></ul></div>
      <div><h4>Still open</h4><ul>${missing.map((m) => `<li>${e(m.title)}</li>`).join("") || "<li>Nothing</li>"}</ul></div>
      <div><h4>Next steps</h4><ul>${state.previewDate ? "<li>Update the draft to the previewed date</li>" : ""}<li>Review the draft, then submit it to the city yourself</li></ul></div>`;
  }
  cards.refresh();
});

chrome();
