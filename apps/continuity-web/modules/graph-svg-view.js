/**
 * Accessible SVG Mission Dependency Graph & Node Inspector Renderer.
 * Supports keyboard navigation (`Enter`/`Space` select, `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` cycle nodes, `p` pin toggle)
 * and non-color state encoding (icon + badge + label).
 */

import { addDaysIso, formatDateWithWeekday } from "../vendor/mission-core/index.js";
import { GRAPH_VISUAL_STATES, MissionGraph } from "../vendor/mission-graph/index.js";

export const RELOCATION_PRESET_COORDS = Object.freeze({
  cmt_moveco_van: { x: 20, y: 155 },
  cmt_permitflow_bay: { x: 368, y: 24 },
  cmt_homeconnect_fiber: { x: 715, y: 92 },
  cmt_powerflow_grid: { x: 368, y: 155 },
  cmt_storage_pod: { x: 368, y: 288 },
  cmt_furniture_drop: { x: 715, y: 288 },
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

const CARD_W = 250;
const CARD_H = 104;
const PROVIDER_ICONS = [
  [/moveco|moving|luton/i, "🚚"], [/permit|parking|bay|curb/i, "🅿️"], [/fiber|homeconnect|internet|\bONT\b/i, "🌐"],
  [/power|meter|grid|energy/i, "⚡"], [/storage|vault|\bpod\b/i, "📦"], [/sofa|furniture|nordic/i, "🛋️"],
  [/surgery|arthroscopy|hospital|clinic/i, "🏥"], [/blood|lab|panel/i, "🧪"], [/shuttle|wheelchair|transport/i, "🚐"],
  [/physio|therapy/i, "🩺"], [/brace|cryo/i, "🦵"], [/freight|air|cargo/i, "✈️"], [/dock|forklift/i, "🏗️"],
  [/led|stage|calibration/i, "💡"], [/caption|stream/i, "💬"], [/security|pass/i, "🪪"], [/dinner|press/i, "🍽️"],
];
const PLAIN_BADGES = {
  PRESERVED: "UNCHANGED", AFFECTED: "AFFECTED", EVALUATING: "CHECKING", PROPOSED: "PROPOSED",
  PREPARED: "SLOT HELD", "APPROVAL REQ": "NEEDS YOUR OK", COMMITTED: "DONE ✓", FAILED: "REFUSED",
  UNKNOWN: "CHECKING", "HUMAN REQ": "NEEDS YOU",
};
function plainWhy(reasons, fmt) {
  return reasons.map((r) => String(r).replace(
    /^User requested primary (\w+) shift from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\.$/,
    (_, field, a, b) => `You asked to change the ${String(field).replace(/_/g, " ")} from ${fmt(a)} to ${fmt(b)}.`,
  )).join(" ");
}
function iconFor(node) {
  const hay = `${node.title} ${node.provider_name} ${node.id}`;
  return (PROVIDER_ICONS.find(([re]) => re.test(hay)) || [null, "📌"])[1];
}
/** Wrap text into at most `maxLines` lines of roughly `perLine` characters, never cutting words when possible. */
export function wrapLabel(text, perLine = 27, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= perLine) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    if (last.length > perLine - 1) last = last.slice(0, perLine - 1).trimEnd();
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines.map((l) => (l.length > perLine + 3 ? `${l.slice(0, perLine).trimEnd()}…` : l));
}

export function renderMissionGraphSvg(page) {
  const svg = document.querySelector("#mission-graph-svg");
  if (!svg) return;
  svg.style.transform = `scale(${page.zoomScale})`;
  const zoomReadout = document.querySelector("#zoom-readout");
  if (zoomReadout) zoomReadout.textContent = `${Math.round(page.zoomScale * 100)}%`;

  const coordsMap = { ...MissionGraph.computeTopologicalLayout(page.graph, RELOCATION_PRESET_COORDS) };
  // Bigger, readable cards: keep the columns but make sure cards in one column never overlap.
  const byCol = new Map();
  for (const [id, c] of Object.entries(coordsMap)) {
    const key = Math.round(c.x);
    if (!byCol.has(key)) byCol.set(key, []);
    byCol.get(key).push(id);
  }
  let maxBottom = 0;
  for (const ids of byCol.values()) {
    ids.sort((m, n) => coordsMap[m].y - coordsMap[n].y);
    let prev = -Infinity;
    for (const id of ids) {
      const y = Math.max(coordsMap[id].y, prev + CARD_H + 14);
      coordsMap[id] = { x: coordsMap[id].x, y };
      prev = y;
      maxBottom = Math.max(maxBottom, y + CARD_H);
    }
  }
  svg.setAttribute("viewBox", `0 0 980 ${Math.max(430, Math.ceil(maxBottom + 22))}`);
  const snap = page.graph.toJSON();
  const parts = [
    `<defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
      </marker>
      <marker id="arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
      </marker>
      <marker id="arrow-emerald" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
      </marker>
    </defs>`,
  ];

  const nodesById = new Map(snap.nodes.map((n) => [n.id, n]));
  const SHORT_EDGE_NAMES = {
    SAME_DAY_REQUIRED: "same day",
    ON_OR_AFTER: "after",
    ON_OR_BEFORE: "before",
    WITHIN_COVERAGE_SPAN: "during",
    ALTERNATIVE_PROVIDER: "backup",
    COMPENSATION_LINK: "undo",
  };
  const edgeBadges = [];

  for (const edge of snap.edges) {
    const src = coordsMap[edge.from];
    const dst = coordsMap[edge.to];
    if (!src || !dst) continue;
    const dstNode = nodesById.get(edge.to);
    const dstState = dstNode?.visual_state || "UNCHANGED";
    const isCommittedEdge = dstState === "COMMITTED";
    const isRippleEdge = ["AFFECTED", "EVALUATING", "PROPOSED", "PREPARED", "AWAITING_APPROVAL"].includes(dstState);
    const isShieldedEdge = Boolean(page.compiledProposal) && dstState === "UNCHANGED";

    const strokeColor = isCommittedEdge ? "#10b981" : isRippleEdge ? "#f59e0b" : "#64748b";
    const markerRef = isCommittedEdge ? "url(#arrow-emerald)" : isRippleEdge ? "url(#arrow-amber)" : "url(#arrow)";
    const dashAttr = isRippleEdge ? ' stroke-dasharray="6 4" class="edge-ripple-path"' : "";
    const statusSuffix = isCommittedEdge
      ? " · ✓"
      : isRippleEdge
        ? " · ⚡"
        : isShieldedEdge
          ? " · 🛡"
          : "";
    const labelColor = isCommittedEdge ? "#6ee7b7" : isRippleEdge ? "#fde68a" : "#cbd5e1";
    const pillStroke = isCommittedEdge ? "#059669" : isRippleEdge ? "#d97706" : "#334155";

    const x1 = src.x + CARD_W;
    const y1 = src.y + CARD_H / 2;
    const x2 = dst.x;
    const y2 = dst.y + CARD_H / 2;
    const spansTwoCols = x2 - x1 > 300;
    const midX = (x1 + x2) / 2;
    const curveLift = spansTwoCols ? (y2 < y1 ? -52 : 52) : 0;
    const cy1 = y1 + curveLift * 0.45;
    const cy2 = y2 + curveLift * 0.45;
    const t = spansTwoCols ? 0.84 : 0.5;
    const mt = 1 - t;
    const bx = mt ** 3 * x1 + 3 * mt ** 2 * t * midX + 3 * mt * t ** 2 * midX + t ** 3 * x2;
    const by = mt ** 3 * y1 + 3 * mt ** 2 * t * cy1 + 3 * mt * t ** 2 * cy2 + t ** 3 * y2;
    const baseName = SHORT_EDGE_NAMES[edge.type] || edge.type.replace(/_/g, " ");
    const shortEdgeLabel = `${baseName}${statusSuffix}`;

    parts.push(
      `<g class="graph-edge">
        <path d="M ${x1} ${y1} C ${midX} ${cy1}, ${midX} ${cy2}, ${x2} ${y2}" fill="none" stroke="${strokeColor}" stroke-width="${isCommittedEdge || isRippleEdge ? "2.3" : "1.7"}"${dashAttr} marker-end="${markerRef}" />
      </g>`,
    );
    edgeBadges.push({
      x: bx,
      y: by,
      label: shortEdgeLabel,
      labelColor,
      pillStroke,
      bold: isCommittedEdge || isRippleEdge,
    });
  }

  for (let i = 0; i < edgeBadges.length; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(edgeBadges[i].x - edgeBadges[j].x) < 92 && Math.abs(edgeBadges[i].y - edgeBadges[j].y) < 24) {
        edgeBadges[j].y -= 13;
        edgeBadges[i].y += 13;
      }
    }
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
      `<g class="graph-node-group" role="button" tabindex="0" aria-pressed="${isSelected}" data-node-id="${page.escapeXml(node.id)}">
        <title>${page.escapeXml(`${node.title} — ${node.provider_name} · ${node.booking_ref} · ${formatDateWithWeekday(node.scheduled_date)}`)}</title>
        <rect x="${pos.x}" y="${pos.y}" width="${CARD_W}" height="${CARD_H}" rx="12" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${strokeW}" />
        <rect x="${pos.x + 10}" y="${pos.y + 9}" width="${Math.max(96, String(PLAIN_BADGES[meta.badge] || meta.badge).length * 7.6 + 30)}" height="20" rx="6" fill="${pal.badgeBg}" />
        <text x="${pos.x + 17}" y="${pos.y + 23}" fill="#ffffff" font-size="11" font-weight="700" font-family="system-ui, sans-serif">${page.escapeXml(`${meta.icon === "✓" ? "" : `${meta.icon} `}${PLAIN_BADGES[meta.badge] || meta.badge}`)}</text>
        <text x="${pos.x + CARD_W - 12}" y="${pos.y + 24}" text-anchor="end" fill="${pal.text}" font-size="13" font-weight="750" font-family="system-ui, sans-serif">${page.escapeXml(priceLabel)}</text>
        ${(() => {
          const lines = wrapLabel(node.title, 25, 2);
          const icon = iconFor(node);
          const y0 = pos.y + (lines.length > 1 ? 48 : 54);
          return `<text x="${pos.x + 12}" y="${y0}" fill="${pal.text}" font-size="14.5" font-weight="700" font-family="system-ui, sans-serif"><tspan font-size="15">${icon}</tspan> ${page.escapeXml(lines[0])}${lines[1] ? `<tspan x="${pos.x + 32}" dy="17">${page.escapeXml(lines[1])}</tspan>` : ""}</text>`;
        })()}
        <text x="${pos.x + 12}" y="${pos.y + CARD_H - 11}" fill="#cbd5e1" font-size="11.5" font-family="system-ui, sans-serif"><tspan fill="#93c5fd" font-weight="650">${page.escapeXml(formatDateWithWeekday(node.scheduled_date))}</tspan> · ${page.escapeXml(wrapLabel(node.provider_name.replace(/\s*\((Demo|Demo Fixture|Backup)\)/i, ""), 20, 1)[0])}</text>
      </g>`,
    );
  }

  for (const b of edgeBadges) {
    const pillW = Math.max(56, Math.round(b.label.length * 6.8 + 20));
    parts.push(
      `<g class="graph-edge-badge" pointer-events="none">
        <rect x="${(b.x - pillW / 2).toFixed(1)}" y="${(b.y - 10).toFixed(1)}" width="${pillW}" height="20" rx="7" fill="#0b1220" fill-opacity="0.92" stroke="${b.pillStroke}" stroke-width="1" />
        <text x="${b.x.toFixed(1)}" y="${(b.y + 4).toFixed(1)}" text-anchor="middle" fill="${b.labelColor}" font-size="11" font-weight="${b.bold ? "700" : "600"}" font-family="system-ui, sans-serif">${page.escapeXml(b.label)}</text>
      </g>`,
    );
  }

  const prevFocusedNodeId =
    document.activeElement?.closest?.("#mission-graph-svg .graph-node-group")?.getAttribute("data-node-id") || null;
  svg.innerHTML = parts.join("\n");
  if (prevFocusedNodeId) {
    svg.querySelector(`[data-node-id="${prevFocusedNodeId}"]`)?.focus({ preventScroll: true });
  }
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
    ? `<div class="draft-actions-row">
         <button type="button" class="mini-btn" data-verify-receipt="${page.escapeXml(node.id)}">✓ Check the provider's signature again</button>
         <span data-receipt-live-status="1" class="mono-ref" role="status"></span>
       </div>
       <details class="receipt-drawer"><summary>Show the signed receipt (JSON)</summary><pre class="receipt-pre">${page.escapeXml(JSON.stringify(matchingOp.receipt_envelope, null, 2))}</pre></details>`
    : "";

  const isAnchor = node.id === page.mission.anchor_commitment_id && !page.lastSagaExecution;
  const quickShiftHtml = isAnchor
    ? `<div class="draft-actions-row" role="group" aria-label="Try another date">
         <span class="strip-label" style="font-size:0.74rem">Try another date:</span>
         ${[1, 2, 3, 4]
           .map((d) => {
             const dt = addDaysIso(page.mission.anchor_date, d);
             const lbl = formatDateWithWeekday(dt).replace(/,\s*202\d$/, "");
             return `<button type="button" class="mini-btn" data-quick-shift="${page.escapeXml(dt)}">→ ${page.escapeXml(lbl)}</button>`;
           })
           .join("")}
       </div>`
    : "";

  box.innerHTML = `
    <div class="inspector-head-row">
      <div><strong>${page.escapeXml(node.title)}</strong> <span class="badge inspector-state">${page.escapeXml(`${meta.icon} ${meta.label}`)}</span></div>
      ${
        canPin
          ? `<button id="inspector-pin-btn" type="button" class="mini-btn">${isPinned ? "📌 Kept as is (click to release)" : "📌 Keep this booking as is"}</button>`
          : ""
      }
    </div>
    <div>With <strong>${page.escapeXml(node.provider_name)}</strong> · booking <code>${page.escapeXml(node.booking_ref)}</code></div>
    <div><strong>${page.escapeXml(formatDateWithWeekday(node.scheduled_date))}</strong>, ${page.escapeXml(node.window)} · €${Number(node.price_eur).toFixed(2)} · cancelling would cost €${Number(node.cancellation_fee_eur).toFixed(2)}</div>
    ${impactInfo ? `<div>Why: ${page.escapeXml(plainWhy(impactInfo.reasons, formatDateWithWeekday))}</div>` : ""}
    <details class="tech-details"><summary>Technical details</summary>
      <div>Website: ${page.escapeXml(node.provider_origin)} · Proof source: <code>${page.escapeXml(node.observed?.evidence_trust || "DEMO_FIXTURE_INITIAL")}</code></div>
    </details>
    ${quickShiftHtml}
    ${receiptDetails}
  `;

  box.onclick = (ev) => {
    const pinBtn = ev.target.closest?.("#inspector-pin-btn");
    if (pinBtn) {
      void page.togglePinCommitment(node.id);
      return;
    }
    const shiftBtn = ev.target.closest?.("[data-quick-shift]");
    if (shiftBtn) {
      const targetIso = shiftBtn.getAttribute("data-quick-shift");
      if (targetIso) void page.switchTargetAnchorDate(targetIso);
      return;
    }
    const verifyBtn = ev.target.closest?.("[data-verify-receipt]");
    if (verifyBtn) {
      const cid = verifyBtn.getAttribute("data-verify-receipt");
      const statusSpan = box.querySelector("[data-receipt-live-status]");
      if (cid) {
        void page.verifyCommittedNodeReceiptLive(cid).then((rep) => {
          if (statusSpan) {
            statusSpan.textContent = rep.ok
              ? `✓ Ed25519 verified in ${rep.elapsedMs} ms (${rep.keyId} · sha256:${String(rep.payloadSha256 || "").slice(0, 14)}…)`
              : `✕ Signature check failed: ${rep.reason || rep.detail}`;
          }
        });
      }
    }
  };
}
