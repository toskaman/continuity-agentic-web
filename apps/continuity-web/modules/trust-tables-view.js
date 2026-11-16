/**
 * Trust Center Diagnostic Tables Renderer (Commitments, Privacy Minimization,
 * Hash-Chained Saga Timeline, Policy Mandate & Arbiter, Chaos Lab, Spec/NANDA Auditor).
 */

import { formatDateWithWeekday } from "../vendor/mission-core/index.js";
import { OperationLedger } from "../vendor/outcome-reconciliation/index.js";
import { ARBITER_MECHANISM_VERSION } from "../vendor/mandate-arbiter/index.js";

export function renderCommitmentsTableView(page) {
  const tbody = document.querySelector("#commitments-tbody");
  if (!tbody) return;
  const snap = page.graph.toJSON();
  tbody.innerHTML = snap.nodes
    .map(
      (n) => `
      <tr>
        <td><strong>${page.escapeXml(n.title)}</strong></td>
        <td>${page.escapeXml(n.provider_name)}<br><small>${page.escapeXml(n.provider_origin)}</small></td>
        <td><code>${page.escapeXml(n.booking_ref)}</code></td>
        <td>${page.escapeXml(formatDateWithWeekday(n.scheduled_date))}<br><small>${page.escapeXml(n.window)}</small></td>
        <td>€${Number(n.price_eur).toFixed(2)}</td>
        <td><span class="state-tag">${page.escapeXml(`${n.stateMeta.icon} ${n.stateMeta.badge}`)}</span></td>
        <td><code>${page.escapeXml(n.observed?.evidence_trust || "DEMO_FIXTURE")}</code></td>
      </tr>`,
    )
    .join("");
}

export function renderPrivacyTableView(page) {
  const tbody = document.querySelector("#privacy-tbody");
  if (!tbody) return;
  if (!page.privacyDisclosures.length) {
    tbody.innerHTML =
      '<tr><td colspan="4">No external peer requests dispatched yet. Unaffected commitments receive zero data.</td></tr>';
    return;
  }
  tbody.innerHTML = page.privacyDisclosures
    .map(
      (d) => `
      <tr>
        <td><strong>${page.escapeXml(d.providerName)}</strong><br><code>${page.escapeXml(d.origin)}</code></td>
        <td><code>${page.escapeXml(d.sentFields)}</code></td>
        <td>${page.escapeXml(d.withheldFields)}</td>
        <td><strong>${page.escapeXml(d.keyExposure)}</strong></td>
      </tr>`,
    )
    .join("");
}

export function renderAuditTimelineView(page) {
  const list = document.querySelector("#audit-timeline-list");
  const chainBanner = document.querySelector("#chain-integrity-banner");
  if (!list) return;
  const history = page.saga?.ledger?.getHistory() || [];
  if (!history.length) {
    if (chainBanner) {
      chainBanner.textContent = "SHA-256 Tamper-Evident Event Chain Ready (Genesis 00000000…).";
    }
    list.innerHTML = `<li>Mission initialized — ${page.mission.commitments.length} confirmed commitments active (€${page.baselineTotalEur().toFixed(2)} baseline).</li>`;
    return;
  }
  const chainCheck = OperationLedger.verifyChainIntegrity(history);
  if (chainBanner) {
    chainBanner.textContent = chainCheck.valid
      ? `✓ SHA-256 Hash Chain Verified (${chainCheck.verifiedEntries}/${history.length} events intact · Head ${chainCheck.headHash.slice(0, 16)}…)`
      : `✕ Hash Chain Tampering Detected at seq #${chainCheck.brokenAtSeq}: ${chainCheck.reason}`;
  }
  list.innerHTML = history
    .map((h) => {
      const latencyNote =
        typeof h.hold_elapsed_ms === "number" ? ` · ${h.hold_elapsed_ms.toFixed(1)} ms` : "";
      return `<li><code>#${h.seq}</code> <strong>${page.escapeXml(h.operation_id)}</strong>: ${page.escapeXml(h.from_state || "INIT")} → <strong>${page.escapeXml(h.to_state)}</strong> — ${page.escapeXml(h.reason)}${latencyNote} <small><code>[sha256:${page.escapeXml((h.entry_hash || "").slice(0, 12))}]</code></small></li>`;
    })
    .join("");
}

export function renderMandateTableView(page) {
  const summary = document.querySelector("#mandate-summary-box");
  const tbody = document.querySelector("#mandate-tbody");
  if (!summary || !tbody) return;

  if (!page.activeMandate && !page.bypassAuditReport) {
    tbody.innerHTML =
      '<tr><td colspan="4">No mandate issued yet. Run Analyze &amp; Prepare above or click "Try 4 bypass attacks".</td></tr>';
    return;
  }

  if (page.activeMandate) {
    const zkBadge = page.zkBudgetVerification?.valid
      ? ` · <strong>Zero-Ceiling-Leak Ladder Proof:</strong> <code>VERIFIED (H^S == ${page.escapeXml(page.zkBudgetVerification.recomputedAnchorSha256.slice(0, 12))}…)</code>`
      : "";
    summary.innerHTML = `<strong>Issued Immutable Policy Mandate:</strong> <code>${page.escapeXml(page.activeMandate.mandate_id)}</code> · Ceiling: <strong>€${(page.activeMandate.ceiling_cents / 100).toFixed(2)}</strong> (withheld from all peer requests) · Digest: <code>sha256:${page.escapeXml(page.activeMandate.mandate_sha256.slice(0, 20))}…</code> · Mechanism: <code>${ARBITER_MECHANISM_VERSION}</code>${zkBadge}`;
  }

  const rows = [];
  for (const o of page.arbiterReport?.outcomes || []) {
    rows.push(`
      <tr>
        <td><strong>${page.escapeXml(o.provider_name)}</strong><br><small>Sealed Bid Resolution</small></td>
        <td><code>sha256:${page.escapeXml(o.commitment_hash.slice(0, 18))}…</code><br><small>Private floor hidden</small></td>
        <td>Catalogue Ask: €${o.catalogue_ask_eur.toFixed(2)}<br>${
          o.status === "AGREEMENT_REACHED"
            ? `<strong>Nash Compromise: €${o.compromise_eur.toFixed(2)}</strong> (−€${o.savings_vs_ask_eur.toFixed(2)})`
            : "Exceeds private slice allowance"
        }</td>
        <td><strong>${o.status === "AGREEMENT_REACHED" ? "✓ AGREEMENT_REACHED" : "⊘ NO_AGREEMENT (Zero Floor Leak)"}</strong></td>
      </tr>
    `);
  }

  for (const b of page.bypassAuditReport?.results || []) {
    rows.push(`
      <tr>
        <td><strong>[${page.escapeXml(b.id)}] ${page.escapeXml(b.attack)}</strong></td>
        <td><code>Policy &amp; Arbiter Guard</code></td>
        <td>${page.escapeXml(b.detail)}</td>
        <td><strong>✓ ${page.escapeXml(b.decision)}</strong></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("");
}

export function renderChaosTableView(page) {
  const summary = document.querySelector("#chaos-summary");
  const tbody = document.querySelector("#chaos-tbody");
  if (!summary || !tbody || !page.chaosReport) return;

  summary.textContent = `Simulation Suite Complete: ${page.chaosReport.passed}/${page.chaosReport.total} scenarios passed (${page.chaosReport.failed} failed). Zero live mission commitments modified.`;
  tbody.innerHTML = page.chaosReport.results
    .map(
      (r) => `
      <tr>
        <td>${r.number}</td>
        <td><strong>${page.escapeXml(r.title)}</strong></td>
        <td>${page.escapeXml(r.injectedFailure)}</td>
        <td><code>${page.escapeXml(r.observedState)}</code></td>
        <td>${r.humanInterventionRequired ? "Required" : "Auto-Reconciled"}</td>
        <td><strong>${r.passed ? "✓ PASS" : "✕ FAIL"}</strong><br><small>${page.escapeXml(r.evidence)}</small></td>
      </tr>`,
    )
    .join("");
}

export function renderAuditorTableView(page) {
  const summary = document.querySelector("#auditor-summary");
  const tbody = document.querySelector("#auditor-tbody");
  if (!summary || !tbody || !page.auditorResults.length) return;

  const allOk = page.auditorResults.every((r) => r.ok);
  summary.textContent = `Conformance Audit Complete: ${page.auditorResults.filter((r) => r.ok).length}/${page.auditorResults.length} Open Agentic Website(s) passed all required MVP 0.2 & Project NANDA checks (${allOk ? "ZERO FAILURES" : "ISSUES DETECTED"}).`;

  tbody.innerHTML = page.auditorResults
    .map(
      (r) => `
      <tr>
        <td><strong><code>${page.escapeXml(r.siteBaseUrl)}</code></strong></td>
        <td>Network: <code>${page.escapeXml(r.networkName || "n/a")}</code><br><small>${page.escapeXml(r.manifestDigest || "")}</small></td>
        <td>${r.checks
          .map(
            (c) =>
              `<div><strong>[${page.escapeXml(c.status)}]</strong> ${page.escapeXml(c.check)} — <small>${page.escapeXml(c.detail)}</small></div>`,
          )
          .join("")}</td>
        <td><strong>${r.ok ? "✓ PASS" : "✕ FAIL"}</strong><br><code>${page.escapeXml(r.score)}</code></td>
      </tr>`,
    )
    .join("");
}
