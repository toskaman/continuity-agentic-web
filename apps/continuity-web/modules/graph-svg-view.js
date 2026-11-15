/**
 * Accessible SVG Mission Dependency Graph & Node Inspector Renderer.
 * Supports keyboard navigation (`Enter`/`Space` select, `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` cycle nodes, `p` pin toggle)
 * and non-color state encoding (icon + badge + label).
 */

import { formatDateWithWeekday } from "../vendor/mission-core/index.js";
import { GRAPH_VISUAL_STATES, MissionGraph } from "../vendor/mission-graph/index.js";

export const RELOCATION_PRESET_COORDS = Object.freeze({
  cmt_moveco_van: { x: 40, y: 155 },
  cmt_permitflow_bay: { x: 355, y: 24 },
  cmt_homeconnect_fiber: { x: 665, y: 95 },
  cmt_powerflow_grid: { x: 355, y: 155 },
  cmt_storage_pod: { x: 355, y: 285 },
  cmt_furniture_drop: { x: 665, y: 285 },
});

export const STATE_PALETTE = Object.freeze({
  UNCHANGED: { fill: "#1e293b", stroke: "#94a3b8", badgeBg: "#334155", text: "#f8fafc" },
  AFFECTED: { fill: "#3b2306", stroke: "#fbbf24", badgeBg: "#92400e", text: "#fef3c7" },
  EVALUATING: { fill: "#172554", stroke: "#38bdf8", badgeBg: "#075985", text: "#e0f2fe" },
  PROPOSED: { fill: "#172554", stroke: "#38bdf8", badgeBg: "#075985", text: "#e0f2fe" },
  PREPARED: { fill: "#1e1b4b", stroke: "#818cf8", badgeBg: "#3730a3", text: "#e0e7ff" },
  AWAITING_APPROVAL: { fill: "#3b2306", stroke: "#fbbf24", badgeBg: "#92400e", text: "#fffbeb" },
  COMMITTED: { fill: "#052e16", stroke: "#10b981", badgeBg: "#065f46", text: "#ecfdf5" },
  FAILED: { fill: "#450a0a", stroke: "#ef4444", badgeBg: "#991b1b", text: "#fef2f2" },
  UNKNOWN: { fill: "#3b0764", stroke: "#c084fc", badgeBg: "#6b21a8", text: "#faf5ff" },
  NEEDS_USER: { fill: "#450a0a", stroke: "#f87171", badgeBg: "#991b1b", text: "#fef2f2" },
});

export function renderMissionGraphSvg(page) {
  const svg = document.querySelector("#mission-graph-svg");
  if (!svg) return;
  svg.style.transform = `scale(${page.zoomScale})`;
  const zoomReadout = document.querySelector("#zoom-readout");
  if (zoomReadout) zoomReadout.textContent = `${Math.round(page.zoomScale * 100)}%`;

  const coordsMap = MissionGraph.computeTopologicalLayout(page.graph, RELOCATION_PRESET_COORDS);
  const snap = page.graph.toJSON();
  const parts = [
    `<defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
      </marker>
    </defs>`,
  ];

  for (const edge of snap.edges) {
    const src = coordsMap[edge.from];
    const dst = coordsMap[edge.to];
    if (!src || !dst) continue;
    const x1 = src.x + 225;
    const y1 = src.y + 44;
    const x2 = dst.x;
    const y2 = dst.y + 44;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 - 6;
    const shortEdgeLabel = edge.type.replace(/_/g, " ");
    parts.push(
      `<g class="graph-edge">
        <path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="#64748b" stroke-width="1.8" marker-end="url(#arrow)" />
        <text x="${midX}" y="${midY}" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="system-ui, sans-serif">${page.escapeXml(shortEdgeLabel)}</text>
      </g>`,
    );
  }

  for (const node of snap.nodes) {
    const pos = coordsMap[node.id] || { x: 40, y: 40 };
    const pal = STATE_PALETTE[node.visual_state] || STATE_PALETTE.UNCHANGED;
    const meta = GRAPH_VISUAL_STATES[node.visual_state] || GRAPH_VISUAL_STATES.UNCHANGED;
    const isSelected = node.id === page.selectedNodeId;
    const strokeW = isSelected ? 2.8 : 1.6;
    const isPinned = page.pinnedNodeIds.has(node.id);
    const priceLabel = `${isPinned ? "📌 " : ""}€${Number(node.price_eur).toFixed(0)}`;
    const ariaLabel = `${node.title}, ${meta.label}, scheduled ${node.scheduled_date}, €${node.price_eur}${isPinned ? ", date pinned untouched" : ""}`;

    parts.push(
      `<g class="graph-node-group" role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${page.escapeXml(ariaLabel)}" data-node-id="${page.escapeXml(node.id)}">
        <title>${page.escapeXml(`${node.title}: ${meta.label}, scheduled ${node.scheduled_date}, €${node.price_eur}`)}</title>
        <rect x="${pos.x}" y="${pos.y}" width="225" height="90" rx="10" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${strokeW}" />
        <rect x="${pos.x + 10}" y="${pos.y + 9}" width="114" height="18" rx="5" fill="${pal.badgeBg}" />
        <text x="${pos.x + 16}" y="${pos.y + 22}" fill="#ffffff" font-size="10" font-weight="700" font-family="system-ui, sans-serif">${page.escapeXml(`${meta.icon} ${meta.badge}`)}</text>
        <text x="${pos.x + 214}" y="${pos.y + 22}" text-anchor="end" fill="${pal.text}" font-size="10.5" font-weight="700" font-family="system-ui, sans-serif">${page.escapeXml(priceLabel)}</text>
        <text x="${pos.x + 12}" y="${pos.y + 44}" fill="${pal.text}" font-size="12" font-weight="700" font-family="system-ui, sans-serif">${page.escapeXml(node.title.length > 28 ? `${node.title.slice(0, 26).trimEnd()}…` : node.title)}</text>
        <text x="${pos.x + 12}" y="${pos.y + 62}" fill="#cbd5e1" font-size="10.5" font-family="system-ui, sans-serif">${page.escapeXml(node.provider_name.length > 30 ? `${node.provider_name.slice(0, 28).trimEnd()}…` : node.provider_name)}</text>
        <text x="${pos.x + 12}" y="${pos.y + 79}" fill="#93c5fd" font-size="10.5" font-weight="600" font-family="system-ui, sans-serif">${page.escapeXml(`${node.booking_ref} · ${formatDateWithWeekday(node.scheduled_date)}`)}</text>
      </g>`,
    );
  }

  svg.innerHTML = parts.join("\n");
  const groups = Array.from(svg.querySelectorAll(".graph-node-group"));
  groups.forEach((el, idx) => {
    const nid = el.getAttribute("data-node-id");
    el.addEventListener("click", () => {
      page.selectedNodeId = nid;
      page.renderGraphSvg();
      page.renderNodeInspector(nid);
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        page.selectedNodeId = nid;
        page.renderGraphSvg();
        page.renderNodeInspector(nid);
        svg.querySelector(`[data-node-id="${nid}"]`)?.focus({ preventScroll: true });
      } else if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        ev.preventDefault();
        const nextEl = groups[(idx + 1) % groups.length];
        const nextId = nextEl?.getAttribute("data-node-id");
        if (nextId) {
          page.selectedNodeId = nextId;
          page.renderGraphSvg();
          page.renderNodeInspector(nextId);
          svg.querySelector(`[data-node-id="${nextId}"]`)?.focus({ preventScroll: true });
        }
      } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
        ev.preventDefault();
        const prevEl = groups[(idx - 1 + groups.length) % groups.length];
        const prevId = prevEl?.getAttribute("data-node-id");
        if (prevId) {
          page.selectedNodeId = prevId;
          page.renderGraphSvg();
          page.renderNodeInspector(prevId);
          svg.querySelector(`[data-node-id="${prevId}"]`)?.focus({ preventScroll: true });
        }
      } else if ((ev.key === "p" || ev.key === "P") && nid) {
        ev.preventDefault();
        void page.togglePinCommitment(nid);
      }
    });
  });
}

export function renderMissionNodeInspector(page, nodeId) {
  const box = document.querySelector("#node-inspector");
  if (!box) return;
  const node = page.graph.nodes.get(nodeId) || Array.from(page.graph.nodes.values())[0];
  if (!node) return;
  const meta = GRAPH_VISUAL_STATES[node.visual_state] || GRAPH_VISUAL_STATES.UNCHANGED;
  const impactInfo = page.impactReport?.nodeDecisions?.[node.id];
  const canPin = node.id !== page.mission.anchor_commitment_id && !page.lastSagaExecution;
  const isPinned = page.pinnedNodeIds.has(node.id);
  const matchingOp = page.preparedOps.find((o) => o.commitment_id === node.id);
  const receiptDetails = matchingOp?.receipt_envelope
    ? `<details class="receipt-drawer"><summary>Inspect Signed Ed25519 Receipt JSON</summary><pre class="receipt-pre">${page.escapeXml(JSON.stringify(matchingOp.receipt_envelope, null, 2))}</pre></details>`
    : "";

  box.innerHTML = `
    <div class="inspector-head-row">
      <div><strong>${page.escapeXml(node.title)}</strong> — <span>[${page.escapeXml(`${meta.icon} ${meta.label}`)}]</span></div>
      ${
        canPin
          ? `<button id="inspector-pin-btn" type="button" class="mini-btn">${isPinned ? "📌 Pinned Untouched (Click to Unlock)" : "📌 Pin Date Untouched"}</button>`
          : ""
      }
    </div>
    <div>Provider: <code>${page.escapeXml(node.provider_name)}</code> (${page.escapeXml(node.provider_origin)}) · Ref: <code>${page.escapeXml(node.booking_ref)}</code></div>
    <div>Scheduled: <strong>${page.escapeXml(formatDateWithWeekday(node.scheduled_date))}</strong> (${page.escapeXml(node.window)}) · Price: <strong>€${Number(node.price_eur).toFixed(2)}</strong> · Cancel Penalty: €${Number(node.cancellation_fee_eur).toFixed(2)}</div>
    <div>Evidence Trust: <code>${page.escapeXml(node.observed?.evidence_trust || "DEMO_FIXTURE_INITIAL")}</code>${impactInfo ? ` · Impact Rationale: ${page.escapeXml(impactInfo.reasons.join(" "))}` : ""}</div>
    ${receiptDetails}
  `;

  box.querySelector("#inspector-pin-btn")?.addEventListener("click", () => {
    void page.togglePinCommitment(node.id);
  });
}
