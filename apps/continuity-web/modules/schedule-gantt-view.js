/**
 * Before -> After Multi-Day Schedule Alignment & Critical-Path Method (CPM) Slack View.
 */

import { analyzeCriticalPathSlack } from "../vendor/merkle-passport/index.js";
import { formatDateWithWeekday } from "../vendor/mission-core/index.js";

export function renderScheduleGanttView(page) {
  const container = document.querySelector("#schedule-gantt-strip");
  if (!container || !page?.mission || !page?.graph) return;

  const targetDate =
    page.compiledProposal?.requested_change?.new_value || page.mission.anchor_date;
  const cpm = analyzeCriticalPathSlack(
    page.graph,
    targetDate,
    page.mission.anchor_commitment_id,
  );
  if (!cpm.nodes.length) {
    container.innerHTML = "";
    return;
  }
  const plan = page.getSelectedPlan();
  const planOpById = new Map((plan?.operations || []).map((o) => [o.commitment_id, o]));
  const prepOpById = new Map((page.preparedOps || []).map((o) => [o.commitment_id, o]));
  const baseById = new Map((page.mission.commitments || []).map((c) => [c.id, c]));

  // Shared day axis for the glide track.
  const dayMs = 86400000;
  const toDay = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / dayMs);
  const allDays = [];
  for (const item of cpm.nodes) {
    const base = baseById.get(item.nodeId)?.scheduled_date || item.baselineDate;
    const after = prepOpById.get(item.nodeId)?.proposed_date || planOpById.get(item.nodeId)?.offer?.proposed_date || item.projectedEarliestDate;
    for (const d of [base, after]) if (d && !Number.isNaN(toDay(d))) allDays.push(toDay(d));
  }
  const minDay = Math.min(...allDays);
  const maxDay = Math.max(minDay + 1, ...allDays);
  const span = maxDay - minDay;
  const pct = (iso) => (((toDay(iso) - minDay) / span) * 92 + 4).toFixed(2);
  // Each marker keeps its motion across re-renders: { from, to, t0 } in % and ms.
  const GLIDE_MS = 1200;
  const anims = page._ganttAnim || (page._ganttAnim = {});
  const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const at = (a) => {
    const k = Math.min(1, Math.max(0, (nowMs - a.t0) / GLIDE_MS));
    const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
    return a.from + (a.to - a.from) * e;
  };
  const axisLabels = span <= 14
    ? Array.from({ length: span + 1 }, (_, i) => {
        const d = new Date((minDay + i) * dayMs);
        const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
        return `<span style="left:${(((i) / span) * 92 + 4).toFixed(2)}%">${label}</span>`;
      }).join("")
    : "";

  const rowsHtml = cpm.nodes
    .map((item) => {
      const baseCmt = baseById.get(item.nodeId);
      const beforeIso = baseCmt?.scheduled_date || item.baselineDate;
      const prepOp = prepOpById.get(item.nodeId);
      const planOp = planOpById.get(item.nodeId);
      const afterIso =
        prepOp?.proposed_date
        || planOp?.offer?.proposed_date
        || (page.compiledProposal ? item.projectedEarliestDate : beforeIso);
      const moved = afterIso !== beforeIso;

      let slackBadge = "";
      if (item.unaffected) {
        slackBadge = '<span class="slack-pill slack-safe">🛡 Untouched</span>';
      } else if (item.isCriticalPath) {
        slackBadge = '<span class="slack-pill slack-crit" title="Critical path: no slack">⚡ Tied to the move date</span>';
      } else {
        slackBadge = `<span class="slack-pill slack-float" title="${item.slackDays} days of float">${item.slackDays} day${item.slackDays === 1 ? "" : "s"} of leeway</span>`;
      }

      const isSel = page.selectedNodeId === item.nodeId;
      const fromPct = pct(beforeIso);
      const toPct = pct(afterIso);
      let anim = anims[item.nodeId];
      if (!anim) anim = anims[item.nodeId] = { from: +fromPct, to: +toPct, t0: nowMs };
      else if (anim.to !== +toPct) anim = anims[item.nodeId] = { from: at(anim), to: +toPct, t0: nowMs };
      const startPct = at(anim).toFixed(2);
      const remainMs = Math.max(0, Math.round(GLIDE_MS - (nowMs - anim.t0)));
      return `
        <button type="button" class="gantt-row ${isSel ? "is-selected" : ""}" data-gantt-node="${page.escapeXml(item.nodeId)}" aria-pressed="${isSel}">
          <span class="gantt-title">
            <strong>${page.escapeXml(item.title)}</strong>
            <code>${page.escapeXml(item.bookingRef)}</code>
          </span>
          <span class="gantt-dates">
            <span>${page.escapeXml(formatDateWithWeekday(beforeIso))}</span>
            <span aria-hidden="true">${moved ? "→" : "="}</span>
            <strong>${moved ? page.escapeXml(formatDateWithWeekday(afterIso)) : "Preserved"}</strong>
          </span>
          ${slackBadge}
          <span class="gantt-track" aria-hidden="true">
            ${moved ? `<i class="gantt-ghost" style="left:${fromPct}%"></i><i class="gantt-trail" style="left:${Math.min(+fromPct, +toPct)}%;width:${Math.abs(toPct - fromPct).toFixed(2)}%"></i>` : ""}
            <i class="gantt-dot ${moved ? "is-moved" : item.unaffected ? "is-safe" : ""}" data-to="${toPct}" style="left:${startPct}%;transition-duration:${remainMs}ms"></i>
          </span>
        </button>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="gantt-head">
      <strong>Timeline · before → after</strong>
      <span class="mono-ref">${cpm.criticalPathNodeIds.length} tied to the move date</span>
    </div>
    ${axisLabels ? `<div class="gantt-axis" aria-hidden="true">${axisLabels}</div>` : ""}
    <div class="gantt-list">${rowsHtml}</div>
  `;
  // Glide each marker from where it was to its new date.
  const dots = container.querySelectorAll(".gantt-dot[data-to]");
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) dots.forEach((dot) => { dot.style.transitionDuration = "0ms"; });
  // Force a style flush so the browser registers the start position, then set the target.
  void container.offsetWidth;
  dots.forEach((dot) => { void dot.getBoundingClientRect(); dot.style.left = `${dot.dataset.to}%`; });

  container.querySelectorAll("[data-gantt-node]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nid = btn.getAttribute("data-gantt-node");
      if (nid) {
        page.selectedNodeId = nid;
        page.renderGraphSvg();
        page.renderNodeInspector(nid);
        renderScheduleGanttView(page);
      }
    });
  });
}
