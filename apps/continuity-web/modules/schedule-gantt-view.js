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
        </button>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="gantt-head">
      <strong>Timeline · before → after</strong>
      <span class="mono-ref">${cpm.criticalPathNodeIds.length} tied to the move date</span>
    </div>
    <div class="gantt-list">${rowsHtml}</div>
  `;

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
