/**
 * Mission KPI Cards, Hold TTL Countdown, What-If Budget Slider & Approval Change Package View.
 */

import { formatDateWithWeekday } from "../vendor/mission-core/index.js";
import { buildHybridTransitionPlaybook } from "../vendor/transition-playbook/index.js";

export function renderHoldCountdownView(page) {
  const el = document.querySelector("#hold-countdown-strip");
  if (!el) return;
  const heldOps = page.preparedOps.filter((o) => o.hold_id && o.state === "AWAITING_APPROVAL");
  if (!heldOps.length || !page.holdsPlacedAtMs || page.lastSagaExecution) {
    el.hidden = true;
    return;
  }
  const elapsedSec = Math.max(0, Math.floor((Date.now() - page.holdsPlacedAtMs) / 1000));
  const remainingSec = Math.max(0, 600 - elapsedSec);
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const holdIds = heldOps.map((o) => o.hold_id).join(", ");
  el.hidden = false;
  el.textContent =
    remainingSec === 0
      ? `⚠ Hold TTL expired for (${holdIds}) — click Analyze & Prepare to refresh temporary holds before committing`
      : `🔒 ${heldOps.length} Non-Destructive Replacement Hold(s) Active (${holdIds}) · Lock TTL ${mm}:${ss} remaining · Original bookings untouched`;
}

export function renderWhatIfSliderView(page) {
  const box = document.querySelector("#whatif-budget-box");
  const slider = document.querySelector("#whatif-budget-slider");
  const valEl = document.querySelector("#whatif-budget-val");
  const minEl = document.querySelector("#whatif-min-badge");
  if (!box || !slider || !valEl || !minEl) return;

  if (!page.compiledProposal || page.lastSagaExecution) {
    box.hidden = true;
    const hs = document.querySelector("#horizon-sweep-strip");
    if (hs) hs.innerHTML = "";
    return;
  }

  box.hidden = false;
  const base = Math.round(page.baselineTotalEur());
  const minSlider = Math.max(20, base - 10);
  const maxSlider = base + 220;
  const curCap = Math.round(page.compiledProposal.invariants.maximum_budget_eur);
  slider.min = String(minSlider);
  slider.max = String(Math.max(maxSlider, curCap + 20));
  slider.value = String(curCap);
  valEl.textContent = `€${curCap}`;
  const minFeas = page.budgetSensitivity?.minimumFeasibleBudgetEur;
  minEl.textContent =
    minFeas !== null && minFeas !== undefined
      ? `Min feasible threshold: €${minFeas.toFixed(2)}`
      : "Exceeds available offers";

  page.renderParetoPlot(curCap);

  const hStrip = document.querySelector("#horizon-sweep-strip");
  if (hStrip) {
    const sweepDays = page.horizonSweep?.days || [];
    if (!sweepDays.length) {
      hStrip.innerHTML = "";
    } else {
      const curTarget = page.compiledProposal.requested_change.new_value;
      hStrip.innerHTML =
        `<span class="horizon-strip-label">6-Day Horizon:</span>`
        + sweepDays
          .map((d) => {
            const isSel = d.targetDate === curTarget;
            const cls = `horizon-pill${isSel ? " active" : ""}${d.isLowestCostDay ? " best-day" : ""}`;
            const costTxt = d.feasible ? `€${d.minTotalCostEur.toFixed(0)}` : "Infeasible";
            const star = d.isLowestCostDay && d.feasible ? " ★" : "";
            return `<button type="button" class="${cls}" data-horizon-date="${page.escapeXml(d.targetDate)}" title="${page.escapeXml(`${d.shortLabel}: ${d.feasible ? `€${d.minTotalCostEur.toFixed(2)} (${d.bestChangedCount} changed)` : "Violates budget or dependency rules"}`)}">${page.escapeXml(`${d.shortLabel} · ${costTxt}${star}`)}</button>`;
          })
          .join("");
      hStrip.querySelectorAll("[data-horizon-date]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dt = btn.getAttribute("data-horizon-date");
          if (dt && dt !== curTarget && !page.lastSagaExecution) {
            void page.switchTargetAnchorDate(dt);
          }
        });
      });
    }
  }
}

export function renderKpisView(page, plan) {
  const set = (sel, txt) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = txt;
  };
  const totalCount = page.mission.commitments.length;
  const baseEur = page.baselineTotalEur();
  const capEur = page.mission.authoritative_invariants.maximum_budget_eur;

  if (!plan) {
    set("#kpi-affected", `0 / ${totalCount}`);
    set("#kpi-affected-sub", "Awaiting change request");
    set("#kpi-preserved", `${totalCount}`);
    set("#kpi-preserved-sub", "All original bookings intact");
    set("#kpi-cost", `€${baseEur.toFixed(2)}`);
    set("#kpi-cost-sub", `Hard ceiling: €${Number(capEur).toFixed(2)}`);
    set("#kpi-approvals", "0");
    set("#kpi-approvals-sub", "Bound by SHA-256 hash");
    return;
  }
  const m = plan.metrics;
  set("#kpi-affected", `${m.changedCount} / ${totalCount}`);
  set(
    "#kpi-affected-sub",
    `${page.impactReport.metrics.providersContactedCount} peers contacted · ${page.impactReport.metrics.unnecessaryOperationsAvoided} skipped`,
  );
  set("#kpi-preserved", `${m.unchangedCount}`);
  set("#kpi-preserved-sub", "Original reservations untouched");
  set("#kpi-cost", `€${m.totalMissionCostEur.toFixed(2)}`);
  const sign = m.netDeltaEur >= 0 ? "+" : "";
  set("#kpi-cost-sub", `${sign}€${m.netDeltaEur.toFixed(2)} vs baseline · Cap €${m.maxBudgetEur.toFixed(2)}`);
  set("#kpi-approvals", `${m.approvalsRequiredCount}`);
  set(
    "#kpi-approvals-sub",
    page.lastSagaExecution?.status === "ALL_COMMITTED_AND_VERIFIED"
      ? "All verified & committed"
      : "Awaiting user confirmation",
  );
}

export function renderChangePackageView(page, plan) {
  const summaryBox = document.querySelector("#change-summary-box");
  const plansContainer = document.querySelector("#plans-selector");
  const opsContainer = document.querySelector("#operations-list");
  const pbDrawer = document.querySelector("#playbook-preview-drawer");
  const pbSummary = document.querySelector("#playbook-preview-summary");
  const pbBody = document.querySelector("#playbook-preview-body");
  if (!summaryBox || !plansContainer || !opsContainer) return;

  if (!page.compiledProposal) {
    if (pbDrawer) pbDrawer.hidden = true;
    summaryBox.innerHTML =
      "No active change proposal yet. Write your request above and choose <strong>Analyze &amp; prepare plans</strong>.";
    plansContainer.innerHTML = "";
    opsContainer.innerHTML =
      '<p class="muted-empty">Existing reservations remain locked in CONFIRMED state until replacements are prepared and explicitly approved.</p>';
    return;
  }

  if (!page.solverResult?.feasible || !plan) {
    if (pbDrawer) pbDrawer.hidden = true;
    const rx = page.solverResult?.counterfactualPrescription;
    const rxHtml = rx?.relaxationFound
      ? `<div class="rx-prescription">
           <div><strong>Exact Minimum Counterfactual Relaxation:</strong> ${page.escapeXml(rx.summary)}</div>
           <button type="button" class="cta-btn btn-sm" data-apply-relaxation="1">Apply minimum relaxation →</button>
         </div>`
      : "";
    summaryBox.innerHTML = `<strong>Hard Constraint Guard Triggered:</strong> ${page.escapeXml((page.solverResult?.rejectionReasonsSummary || []).join(" "))} Your original bookings remain completely untouched.${rxHtml}`;
    summaryBox.querySelector('[data-apply-relaxation="1"]')?.addEventListener("click", () => {
      void page.applyCounterfactualRelaxation();
    });
    plansContainer.innerHTML = "";
    opsContainer.innerHTML = "";
    return;
  }

  const alertsHtml = page.providerAlerts.length
    ? `<div class="provider-alerts-banner">${page.providerAlerts.map((a) => `⚡ ${page.escapeXml(a)}`).join("<br>")}</div>`
    : "";

  const committedBanner =
    page.lastSagaExecution?.status === "ALL_COMMITTED_AND_VERIFIED"
      ? `<strong>Mission Re-Aligned &amp; Cryptographically Verified.</strong> ${plan.metrics.changedCount} service arrangements have been committed for ${formatDateWithWeekday(page.compiledProposal.requested_change.new_value)}. ${plan.metrics.unchangedCount} unaffected commitments remained untouched throughout. Download your updated <code>.ics</code> calendar or click any synced peer above.`
      : `<strong>Change Package Prepared:</strong> Primary anchor shifts from ${formatDateWithWeekday(page.compiledProposal.requested_change.previous_value)} to <strong>${formatDateWithWeekday(page.compiledProposal.requested_change.new_value)}</strong>. <strong>${plan.metrics.changedCount}</strong> service arrangements need modification; <strong>${plan.metrics.unchangedCount}</strong> existing arrangements remain unchanged. Replacements are prepared and held — your original bookings remain intact until you approve.`;

  summaryBox.innerHTML = `${committedBanner}${alertsHtml}`;

  const cmtMap = new Map((page.mission.commitments || []).map((c) => [c.id, c]));
  plansContainer.innerHTML = page.solverResult.plans
    .map((p) => {
      const isSel = p.plan_id === page.selectedPlanId;
      const deltaSign = p.metrics.netDeltaEur >= 0 ? "+" : "";
      const paretoHtml = p.paretoOptimal ? `<span class="pareto-badge">PARETO OPTIMAL</span>` : "";
      const avoidedCancelEur =
        typeof p.metrics.avoidedCancellationFeesEur === "number"
          ? p.metrics.avoidedCancellationFeesEur
          : (p.preservedCommitments || []).reduce(
              (sum, c) => sum + Number(cmtMap.get(c.commitment_id)?.cancellation_fee_eur || 0),
              0,
            );
      const savedTxt = avoidedCancelEur > 0 ? ` · €${avoidedCancelEur.toFixed(0)} cancel fees saved` : "";
      const crowdTxt = typeof p.crowdingDistance === "number" && Number.isFinite(p.crowdingDistance)
        ? p.crowdingDistance.toFixed(2)
        : "∞";
      return `
        <button type="button" class="plan-option ${isSel ? "selected" : ""}" aria-pressed="${isSel}" data-plan-id="${page.escapeXml(p.plan_id)}" ${page.lastSagaExecution ? "disabled" : ""}>
          <div class="plan-option-top">
            <span>${isSel ? "✓ " : ""}${page.escapeXml(p.label)}${paretoHtml}</span>
            <span class="plan-price-row"><span class="plan-price-main">€${p.metrics.totalMissionCostEur.toFixed(2)}</span><span class="plan-price-delta">(${deltaSign}€${p.metrics.netDeltaEur.toFixed(2)})</span></span>
          </div>
          <div class="plan-option-meta">
            ${p.metrics.changedCount} changed · ${p.metrics.unchangedCount} preserved${savedTxt} · Headroom: €${p.metrics.budgetHeadroomEur.toFixed(2)} · Front #${p.paretoRank ?? 1} (Crowding ${crowdTxt})
          </div>
        </button>
      `;
    })
    .join("");

  plansContainer.querySelectorAll(".plan-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-plan-id");
      if (pid && pid !== page.selectedPlanId) {
        void page.prepareSelectedPlan(pid);
      }
    });
  });

  const playbook = buildHybridTransitionPlaybook({
    mission: page.mission,
    plan,
    preparedOps: page.preparedOps,
  });
  if (pbDrawer && pbSummary && pbBody) {
    pbDrawer.hidden = false;
    pbSummary.textContent = `Ordered Hold-First Playbook (${playbook.agenticStepsCount} autonomous Agentic Web · ${playbook.legacyStepsCount} legacy mailto: draft(s) · €${playbook.avoidedPenaltiesTotalEur.toFixed(2)} cancel fees avoided)`;
    pbBody.textContent = playbook.markdown;
  }
  const playbookStepByCommitment = new Map(playbook.steps.map((s) => [s.commitmentId, s]));

  opsContainer.innerHTML = page.preparedOps
    .map((op) => {
      const totalOp =
        Number(op.base_price_eur) + Number(op.change_fee_eur || 0) + Number(op.cancellation_penalty_eur || 0);
      const stepInfo = playbookStepByCommitment.get(op.commitment_id);
      const proofBadge = op.proof_verification?.level
        ? `<div>Proof: <code>${page.escapeXml(op.proof_verification.level)}</code></div>`
        : "";
      const receiptDrawer = op.receipt_envelope?.proof
        ? `<details class="receipt-drawer"><summary>Inspect Ed25519 signature (${page.escapeXml(op.receipt_envelope.proof.key_id)})</summary><pre class="receipt-pre">${page.escapeXml(JSON.stringify(op.receipt_envelope, null, 2))}</pre></details>`
        : "";
      const legacyDraftDrawer =
        stepInfo && stepInfo.executionChannel === "LEGACY_VENDOR_HOLD_FIRST_DRAFT"
          ? `<details class="receipt-drawer">
               <summary>Step #${stepInfo.stepNumber} Hold-First Reschedule Draft (for real-world / legacy vendor)</summary>
               <pre class="receipt-pre">${page.escapeXml(`Subject: ${stepInfo.subject}\n\n${stepInfo.messageDraft}`)}</pre>
               <div class="draft-actions-row">
                 <a class="mini-btn" href="${page.escapeXml(stepInfo.mailtoHref)}">✉ Open in Mail</a>
                 <button type="button" class="mini-btn" data-copy-draft="${page.escapeXml(op.commitment_id)}">Copy Hold-First Request</button>
               </div>
             </details>`
          : "";
      const channelLine = stepInfo
        ? `<div>Channel: <code>${page.escapeXml(stepInfo.channelBadge)}</code></div>`
        : "";
      return `
        <div class="op-card">
          <div class="op-card-head">
            <span>${page.escapeXml(op.commitment_title)} → ${page.escapeXml(formatDateWithWeekday(op.proposed_date))}</span>
            <span class="state-tag">${page.escapeXml(op.state)}</span>
          </div>
          <div>Provider: <strong>${page.escapeXml(op.provider_name)}</strong> (${page.escapeXml(op.provider_origin)}) · Capability: <code>${page.escapeXml(op.capability)}</code></div>
          ${channelLine}
          <div>Window: ${page.escapeXml(op.window)} · Total: <strong>€${totalOp.toFixed(2)}</strong> (Fee €${Number(op.change_fee_eur || 0).toFixed(2)}) · Reversible: ${op.reversible ? "Yes (Draft)" : "No (Irreversible Booking)"}</div>
          <div>Idempotency Key: <code>${page.escapeXml(op.idempotency_key)}</code>${op.hold_id ? ` · Hold: <code>${page.escapeXml(op.hold_id)}</code>` : ""}</div>
          ${proofBadge}
          ${receiptDrawer}
          ${legacyDraftDrawer}
        </div>
      `;
    })
    .join("");

  opsContainer.querySelectorAll("[data-copy-draft]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cid = btn.getAttribute("data-copy-draft");
      const s = cid ? playbookStepByCommitment.get(cid) : null;
      if (!s) return;
      try {
        await navigator.clipboard.writeText(`Subject: ${s.subject}\n\n${s.messageDraft}`);
        btn.textContent = "✓ Copied";
        setTimeout(() => {
          btn.textContent = "Copy Hold-First Request";
        }, 1600);
      } catch {}
    });
  });
}
