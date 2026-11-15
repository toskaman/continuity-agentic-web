/**
 * Interactive Multi-Objective Pareto Trade-Off Frontier SVG Renderer.
 */

export function renderParetoFrontierPlot(page, curCapEur) {
  const svg = document.querySelector("#pareto-plot-svg");
  if (!svg) return;
  const plans = page.solverResult?.plans || [];
  const baseEur = page.baselineTotalEur();
  const minYVal = Math.min(baseEur, ...plans.map((p) => p.metrics.totalMissionCostEur)) - 18;
  const maxYVal = Math.max(curCapEur + 18, ...plans.map((p) => p.metrics.totalMissionCostEur)) + 18;
  const spanY = Math.max(45, maxYVal - minYVal);

  const chgValues = plans.map((p) => p.metrics.changedCount);
  const minChg = chgValues.length ? Math.min(...chgValues) : 1;
  const maxChg = chgValues.length ? Math.max(...chgValues, minChg + 1) : 4;
  const mapX = (changedCount) =>
    88 + ((changedCount - minChg) / Math.max(1, maxChg - minChg)) * 195;
  const mapY = (costEur) => 106 - ((costEur - minYVal) / spanY) * 78;

  const capY = Math.max(18, Math.min(108, mapY(curCapEur)));
  const parts = [
    `<line x1="52" y1="108" x2="444" y2="108" stroke="#334669" stroke-width="1" />`,
    `<line x1="52" y1="14" x2="52" y2="108" stroke="#334669" stroke-width="1" />`,
    `<text x="248" y="126" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="system-ui, sans-serif">Disrupted Commitments (Left = Fewer Changes · Lower = Cheaper)</text>`,
    `<line x1="52" y1="${capY.toFixed(1)}" x2="444" y2="${capY.toFixed(1)}" stroke="#f87171" stroke-width="1.4" stroke-dasharray="4 3" />`,
    `<text x="440" y="${Math.max(13, capY - 4).toFixed(1)}" text-anchor="end" fill="#fca5a5" font-size="9.5" font-weight="700" font-family="system-ui, sans-serif">Hard Cap €${curCapEur}</text>`,
  ];

  const paretoPts = plans
    .filter((p) => p.paretoOptimal)
    .slice()
    .sort(
      (a, b) =>
        a.metrics.changedCount - b.metrics.changedCount
        || a.metrics.totalMissionCostEur - b.metrics.totalMissionCostEur,
    );

  if (paretoPts.length >= 2) {
    const poly = paretoPts
      .map((p) => `${mapX(p.metrics.changedCount).toFixed(1)},${mapY(p.metrics.totalMissionCostEur).toFixed(1)}`)
      .join(" ");
    parts.push(`<polyline points="${poly}" fill="none" stroke="#10b981" stroke-width="2" />`);
  }

  const seenByChg = new Map();
  plans.forEach((p) => {
    const chg = p.metrics.changedCount;
    const slotInBucket = seenByChg.get(chg) || 0;
    seenByChg.set(chg, slotInBucket + 1);

    const cx = mapX(chg);
    const cy = mapY(p.metrics.totalMissionCostEur);
    const labelDy = slotInBucket % 2 === 0 ? 15 : -9;
    const isSel = p.plan_id === page.selectedPlanId;
    const fill = p.paretoOptimal ? "#10b981" : "#60a5fa";
    const shortTag = p.plan_id.startsWith("PLAN_A_")
      ? "Plan A"
      : p.plan_id.startsWith("PLAN_B_")
        ? "Plan B"
        : p.plan_id.startsWith("PLAN_C_")
          ? "Plan C"
          : "Alt";
    parts.push(
      `<g role="button" tabindex="0" style="cursor:pointer" data-pareto-plan="${page.escapeXml(p.plan_id)}">
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isSel ? 6.5 : 5}" fill="${fill}" stroke="#ffffff" stroke-width="${isSel ? 2.2 : 1.2}" />
        <text x="${(cx + 8).toFixed(1)}" y="${(cy + labelDy).toFixed(1)}" fill="#f8fafc" font-size="9.5" font-weight="700" font-family="system-ui, sans-serif">${page.escapeXml(`${shortTag}: €${p.metrics.totalMissionCostEur.toFixed(0)} (${chg} chg)`)}</text>
      </g>`,
    );
  });

  svg.innerHTML = parts.join("\n");
  svg.querySelectorAll("[data-pareto-plan]").forEach((g) => {
    const selectPoint = () => {
      const pid = g.getAttribute("data-pareto-plan");
      if (pid && pid !== page.selectedPlanId && !page.lastSagaExecution) {
        void page.prepareSelectedPlan(pid);
      }
    };
    g.addEventListener("click", selectPoint);
    g.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectPoint();
      }
    });
  });
}
