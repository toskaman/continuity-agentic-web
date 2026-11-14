/**
 * CONTINUITY Coordinator Page Controller (`App.page`) — v2.0
 *
 * Unifies manual UI controls, Neuro SAN `website_*` agentic tools, and W3C WebMCP (`navigator.modelContext`)
 * on one authoritative, deterministic state machine powered by 15 `@continuity/*` open-source modules:
 * - `@continuity/mission-core` & `@continuity/intake-compiler` (NL + `.ics` + email compiler & hard-invariant guard)
 * - `@continuity/mission-graph` (typed dependency DAG + automatic topological layout)
 * - `@continuity/impact-engine` (bounded incremental blast-radius analysis)
 * - `@continuity/capability-adapter` (peer capability normalization)
 * - `@continuity/constraint-solver` (Pareto-optimal minimal-change optimizer & counterfactual budget sweep)
 * - `@continuity/cross-origin-bridge` (zero-server cross-origin `postMessage` RPC + WebCrypto Ed25519 signing)
 * - `@continuity/approval-engine` & `@continuity/saga-engine` (SHA-256 bound approvals + 14-state Saga)
 * - `@continuity/proof-verifier` (Ed25519 provider receipt verification)
 * - `@continuity/nanda-resolver` (Open Agentic Web MVP 0.2 & Project NANDA A2A v1.0 conformance auditor)
 * - `@continuity/chaos-lab` (15-scenario distributed fault-injection testbench)
 */

import {
  compileMissionChange,
  createSignatureMoveMission,
  formatDateWithWeekday,
} from "./vendor/mission-core/index.js";
import { GRAPH_VISUAL_STATES, MissionGraph } from "./vendor/mission-graph/index.js";
import { analyzeMissionImpact } from "./vendor/impact-engine/index.js";
import { normalizePeerOffer } from "./vendor/capability-adapter/index.js";
import { analyzeBudgetSensitivity, solveMinimalChangePlans } from "./vendor/constraint-solver/index.js";
import { ReceiptVerifier } from "./vendor/proof-verifier/index.js";
import { SagaCoordinator } from "./vendor/saga-engine/index.js";
import {
  createSimulatedProviderHarness,
  runAllChaosScenarios,
} from "./vendor/chaos-lab/index.js";
import { CrossOriginBridgeClient } from "./vendor/cross-origin-bridge/index.js";
import {
  buildScenarioPeerHarness,
  compileUnstructuredIntake,
  createScenarioMission,
  exportMissionToIcs,
  exportVerifiableAuditBundle,
  SAMPLE_RAW_CONFIRMATION_EMAILS,
  SCENARIO_CATALOG,
} from "./vendor/intake-compiler/index.js";
import { auditOpenAgenticSite } from "./vendor/nanda-resolver/index.js";
import { OperationLedger } from "./vendor/outcome-reconciliation/index.js";
import {
  ARBITER_MECHANISM_VERSION,
  issuePolicyBoundMandate,
  runAdversarialBypassAudit,
  SealedBidArbiter,
} from "./vendor/mandate-arbiter/index.js";

const RELOCATION_PRESET_COORDS = {
  cmt_moveco_van: { x: 40, y: 155 },
  cmt_permitflow_bay: { x: 355, y: 24 },
  cmt_homeconnect_fiber: { x: 665, y: 95 },
  cmt_powerflow_grid: { x: 355, y: 155 },
  cmt_storage_pod: { x: 355, y: 285 },
  cmt_furniture_drop: { x: 665, y: 285 },
};

const STATE_PALETTE = {
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
};

export class ContinuityCoordinatorPage {
  constructor() {
    this.version = 1;
    const isHttpsHosted =
      typeof location !== "undefined" && location.protocol === "https:";
    this.peerOrigins = isHttpsHosted
      ? {
          moveco: "https://gpaschercher-sudo.github.io/moveco-agentic-peer",
          permitflow: "https://gpaschercher-sudo.github.io/permitflow-agentic-peer",
          homeconnect: "https://gpaschercher-sudo.github.io/homeconnect-agentic-peer",
          powerflow: "https://gpaschercher-sudo.github.io/powerflow-agentic-peer",
        }
      : {
          moveco: "http://127.0.0.1:8081",
          permitflow: "http://localhost:8082",
          homeconnect: "http://127.0.0.1:8083",
          powerflow: "http://localhost:8084",
        };

    this.livePeersDetected = false;
    this.crossOriginBridgeConnected = false;
    this.crossOriginBridge = null;
    this.latestPeerHandoffTokens = {};

    this.activeScenarioId = "home_relocation";
    this.rippleFailureInjected = false;
    this.zoomScale = 1;
    this.selectedNodeId = "cmt_moveco_van";

    this.mission = createSignatureMoveMission({ origins: this.peerOrigins });
    this.graph = MissionGraph.fromMission(this.mission);

    this.compiledProposal = null;
    this.impactReport = null;
    this.cachedNormalizedOffers = [];
    this.budgetSensitivity = null;
    this.solverResult = null;
    this.selectedPlanId = null;
    this.saga = null;
    this.preparedOps = [];
    this.lastSagaExecution = null;
    this.privacyDisclosures = [];
    this.providerAlerts = [];
    this.chaosReport = null;
    this.auditorResults = [];
    this.activeMandate = null;
    this.arbiterReport = null;
    this.bypassAuditReport = null;
    this.holdsPlacedAtMs = null;
    this._holdTimerHandle = null;
    this.providerHarnessPromise = null;
  }

  baselineTotalEur() {
    return (this.mission?.commitments || []).reduce((s, c) => s + Number(c.price_eur || 0), 0);
  }

  isRelocationScenario() {
    return this.activeScenarioId === "home_relocation" && this.mission.mission_id === "move_paris_lyon_001";
  }

  async ensureProviderClients() {
    if (!this.isRelocationScenario()) {
      if (!this.providerHarnessPromise) {
        this.providerHarnessPromise = buildScenarioPeerHarness(this.mission, {
          rippleFailureInjected: this.rippleFailureInjected,
        });
      }
      return this.providerHarnessPromise;
    }

    if (this.livePeersDetected) {
      return this.buildLiveHttpProviderClients();
    }
    if (this.crossOriginBridgeConnected && this.crossOriginBridge) {
      return this.crossOriginBridge.buildSagaHarness();
    }
    if (!this.providerHarnessPromise) {
      this.providerHarnessPromise = createSimulatedProviderHarness();
    }
    return this.providerHarnessPromise;
  }

  async probeLivePeerOrigins() {
    if (typeof fetch !== "function") return false;
    const isGithubPagesPeer = /\.github\.io$/i.test(new URL(this.peerOrigins.moveco).hostname);

    if (!isGithubPagesPeer) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 900);
        const resp = await fetch(`${this.peerOrigins.moveco}/api/public-key`, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
          this.livePeersDetected = true;
          this.crossOriginBridgeConnected = false;
          return true;
        }
      } catch {
        this.livePeersDetected = false;
      }
    }

    // Zero-server static HTTPS / browser mode: connect live Cross-Origin `postMessage` Bridge iframes!
    if (typeof document !== "undefined" && typeof window !== "undefined") {
      this.crossOriginBridge = new CrossOriginBridgeClient(this.peerOrigins);
      this.crossOriginBridgeConnected = await this.crossOriginBridge.connectAll();
      if (this.crossOriginBridgeConnected) {
        return true;
      }
    }
    return false;
  }

  async buildLiveHttpProviderClients() {
    const verifier = new ReceiptVerifier();
    const clients = {};
    const toolMapping = {
      moveco: {
        quote: "get_moving_quote",
        hold: "hold_moving_slot",
        commit: "reschedule_van_booking",
        status: "get_booking_status",
      },
      permitflow: {
        quote: "check_bay_eligibility",
        hold: null,
        commit: "prepare_permit_date_update",
        status: "get_dossier_status",
      },
      homeconnect: {
        quote: "list_technician_windows",
        hold: "hold_technician_slot",
        commit: "change_fiber_appointment",
        status: "get_appointment_status",
      },
      powerflow: {
        quote: "check_grid_windows",
        hold: null,
        commit: "shift_grid_activation",
        status: "get_activation_status",
      },
    };

    for (const [pid, origin] of Object.entries(this.peerOrigins)) {
      const pkResp = await fetch(`${origin}/api/public-key`);
      if (pkResp.ok) {
        const pk = await pkResp.json();
        verifier.registerTrustedProviderKey(pid, pk.keyId, pk.publicJwk);
      }
      const map = toolMapping[pid];
      const callPeer = async (tool, args) => {
        const res = await fetch(`${origin}/api/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, arguments: args }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${origin}`);
        const data = await res.json();
        if (data?.handoff_token) {
          this.latestPeerHandoffTokens[pid] = data.handoff_token;
        }
        return data;
      };

      clients[pid] = {
        quote: (bookingRef, targetDate) => callPeer(map.quote, { booking_ref: bookingRef, target_date: targetDate }),
        ...(map.hold
          ? {
              prepareHold: ({ bookingRef, offerId, proposedDate, idempotencyKey }) =>
                callPeer(map.hold, {
                  booking_ref: bookingRef,
                  offer_id: offerId,
                  proposed_date: proposedDate,
                  idempotency_key: idempotencyKey,
                }),
            }
          : {}),
        executeCommit: ({ idempotencyKey, arguments: a }) =>
          callPeer(map.commit, {
            booking_ref: a.booking_ref,
            new_date: a.new_date,
            window: a.window,
            offer_id: a.offer_id,
            ...(a.hold_id ? { hold_id: a.hold_id } : {}),
            idempotency_key: idempotencyKey,
          }),
        queryStatus: ({ bookingRef, idempotencyKey }) =>
          callPeer(map.status, {
            booking_ref: bookingRef,
            ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          }),
      };
    }

    return { clients, verifier };
  }

  getPeerLinks() {
    const out = {};
    for (const [pid, origin] of Object.entries(this.peerOrigins)) {
      const baseHref = `${String(origin).replace(/\/+$/, "")}/`;
      const token =
        this.latestPeerHandoffTokens[pid] || this.crossOriginBridge?.latestHandoffTokens?.[pid] || null;
      out[pid] = token ? `${baseHref}#continuity_receipt=${token}` : baseHref;
    }
    return out;
  }

  getState() {
    const policyNote =
      typeof document !== "undefined"
        ? document.querySelector("#policy-note")?.textContent || ""
        : "Demonstration provider services only.";
    const selectedPlan = this.getSelectedPlan();

    return JSON.parse(
      JSON.stringify({
        version: this.version,
        activeScenarioId: this.activeScenarioId,
        transportMode: this.livePeersDetected
          ? "LIVE_INDEPENDENT_PEER_ORIGINS"
          : this.crossOriginBridgeConnected
            ? "LIVE_CROSS_ORIGIN_BROWSER_BRIDGE"
            : "BROWSER_DETERMINISTIC_SIMULATION_FALLBACK",
        webMcpToolsExposed: 6,
        rippleFailureInjected: this.rippleFailureInjected,
        mission: {
          mission_id: this.mission.mission_id,
          title: this.mission.title,
          mission_type: this.mission.mission_type,
          anchor_date: this.mission.anchor_date,
          anchor_commitment_id: this.mission.anchor_commitment_id,
          invariants: this.mission.authoritative_invariants,
        },
        graph: this.graph.toJSON(),
        compiledProposal: this.compiledProposal,
        impactMetrics: this.impactReport?.metrics || null,
        unaffectedIds: this.impactReport?.unaffectedIds || [],
        budgetSensitivity: this.budgetSensitivity,
        feasiblePlans: (this.solverResult?.plans || []).map((p) => ({
          plan_id: p.plan_id,
          label: p.label,
          paretoOptimal: Boolean(p.paretoOptimal),
          metrics: p.metrics,
          operationsCount: p.operations.length,
        })),
        selectedPlanId: this.selectedPlanId,
        selectedPlanSummary: selectedPlan
          ? {
              plan_id: selectedPlan.plan_id,
              label: selectedPlan.label,
              paretoOptimal: Boolean(selectedPlan.paretoOptimal),
              metrics: selectedPlan.metrics,
              operations: selectedPlan.operations,
              preservedCommitments: selectedPlan.preservedCommitments,
            }
          : null,
        preparedOperations: this.preparedOps.map((op) => ({
          operation_id: op.operation_id,
          commitment_id: op.commitment_id,
          provider_name: op.provider_name,
          proposed_date: op.proposed_date,
          window: op.window,
          base_price_eur: op.base_price_eur,
          change_fee_eur: op.change_fee_eur,
          state: op.state,
          hold_id: op.hold_id || null,
        })),
        lastSagaExecution: this.lastSagaExecution
          ? {
              status: this.lastSagaExecution.status,
              committedOperationIds: this.lastSagaExecution.committedOperationIds,
              partialFailureReason: this.lastSagaExecution.partialFailureReason,
            }
          : null,
        providerAlerts: this.providerAlerts,
        partnerLinks: this.getPeerLinks(),
        policyNote,
      }),
    );
  }

  getSelectedPlan() {
    if (!this.solverResult?.plans?.length) return null;
    return (
      this.solverResult.plans.find((p) => p.plan_id === this.selectedPlanId)
      || this.solverResult.plans[0]
    );
  }

  planIdEnums() {
    return ["PLAN_A_MINIMAL_CHANGE", "PLAN_B_LOWEST_COST", "PLAN_C_FASTEST_RESOLUTION", "PLAN_ALT_1"];
  }

  scenarioIdEnums() {
    return ["home_relocation", "outpatient_surgery", "product_launch_expo", "custom_intake"];
  }

  async switchScenario(scenarioId) {
    this.activeScenarioId = scenarioId;
    this.mission = createScenarioMission(scenarioId, { origins: this.peerOrigins });
    this.selectedNodeId = this.mission.anchor_commitment_id || this.mission.commitments[0]?.id;
    await this._resetExecutionState();

    if (typeof document !== "undefined") {
      const cat = SCENARIO_CATALOG.find((s) => s.id === scenarioId);
      const inputEl = document.querySelector("#mission-input");
      if (cat && inputEl) inputEl.value = cat.defaultPrompt;
    }

    const count = this.mission.commitments.length;
    const base = this.baselineTotalEur().toFixed(2);
    this.render(`Loaded scenario "${this.mission.title}" — ${count} confirmed commitments (€${base} baseline).`);
    return {
      ok: true,
      version: this.version,
      scenarioId,
      missionId: this.mission.mission_id,
      commitmentsCount: count,
      baselineTotalEur: Number(base),
    };
  }

  async importCustomSchedule(rawText) {
    let compiled;
    try {
      compiled = compileUnstructuredIntake(rawText);
    } catch (err) {
      return { ok: false, field: "rawScheduleText", reason: err.message };
    }

    this.activeScenarioId = "custom_intake";
    this.mission = compiled.mission;
    this.selectedNodeId = this.mission.anchor_commitment_id;
    await this._resetExecutionState();

    if (typeof document !== "undefined") {
      const inputEl = document.querySelector("#mission-input");
      if (inputEl) inputEl.value = compiled.suggestedPrompt;
      const drawer = document.querySelector("#magic-intake-drawer");
      if (drawer) drawer.hidden = true;
      document.querySelector("#toggle-intake-btn")?.setAttribute("aria-expanded", "false");
    }

    this.render(
      `Imported ${compiled.mission.commitments.length} commitments & ${compiled.inferredEdgesCount} inferred dependency rules from ${compiled.format === "ics" ? "RFC 5545 .ics calendar" : "confirmation emails"} (€${compiled.baselineTotalEur.toFixed(2)} baseline).`,
    );

    return {
      ok: true,
      version: this.version,
      format: compiled.format,
      missionId: this.mission.mission_id,
      commitmentsCount: this.mission.commitments.length,
      inferredEdgesCount: compiled.inferredEdgesCount,
      suggestedPrompt: compiled.suggestedPrompt,
    };
  }

  async _resetExecutionState() {
    this.graph = MissionGraph.fromMission(this.mission);
    this.compiledProposal = null;
    this.impactReport = null;
    this.cachedNormalizedOffers = [];
    this.budgetSensitivity = null;
    this.solverResult = null;
    this.selectedPlanId = null;
    this.saga = null;
    this.preparedOps = [];
    this.lastSagaExecution = null;
    this.privacyDisclosures = [];
    this.providerAlerts = [];
    this.latestPeerHandoffTokens = {};
    this.activeMandate = null;
    this.arbiterReport = null;
    this.bypassAuditReport = null;
    this.holdsPlacedAtMs = null;
    this.providerHarnessPromise = null;
    this.version += 1;

    if (this.isRelocationScenario()) {
      if (this.livePeersDetected) {
        for (const [pid, origin] of Object.entries(this.peerOrigins)) {
          try {
            await fetch(`${origin}/api/reset`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                injectScenario:
                  pid === "moveco" && this.rippleFailureInjected ? "primary_fri_full" : "normal",
              }),
            });
          } catch {
            // Ignore offline peer during reset
          }
        }
      } else if (this.crossOriginBridgeConnected && this.crossOriginBridge) {
        await this.crossOriginBridge.resetAll({ rippleFailureInjected: this.rippleFailureInjected });
      }
    }
  }

  async resetMission(options = {}) {
    this.rippleFailureInjected = Boolean(options.rippleFailureInjected ?? false);
    if (options.resetToDefaultScenario || !this.mission) {
      this.activeScenarioId = "home_relocation";
    }
    if (this.activeScenarioId !== "custom_intake") {
      this.mission = createScenarioMission(this.activeScenarioId, { origins: this.peerOrigins });
    }
    this.selectedNodeId = this.mission.anchor_commitment_id || this.mission.commitments[0]?.id;
    await this._resetExecutionState();

    const base = this.baselineTotalEur().toFixed(2);
    this.render(
      this.rippleFailureInjected
        ? `Ripple Failure Armed: Primary anchor provider will refuse the requested Friday slot, triggering automatic overflow partner recovery.`
        : `Mission reset to baseline (${this.mission.commitments.length} confirmed commitments, €${base}).`,
    );
    return { ok: true, version: this.version, rippleFailureInjected: this.rippleFailureInjected };
  }

  async analyzeAndPrepareChange(requestText) {
    const cleanText = String(requestText || "").trim();
    if (!cleanText) {
      return { ok: false, field: "requestText", reason: "Enter a natural-language change request first." };
    }

    if (!this.lastSagaExecution) {
      this.graph = MissionGraph.fromMission(this.mission);
    }

    let compiled;
    try {
      compiled = compileMissionChange(cleanText, this.mission);
    } catch (err) {
      return { ok: false, field: "requestText", reason: err.message };
    }

    this.compiledProposal = compiled.proposal;
    this.activeMandate = await issuePolicyBoundMandate(this.mission, this.compiledProposal);
    await this._evaluateMandateArbiter();
    this.impactReport = analyzeMissionImpact(this.graph, this.compiledProposal);
    this.providerAlerts = [...compiled.securityWarnings];
    this.privacyDisclosures = [];

    const targetDate = this.compiledProposal.requested_change.new_value;
    const harness = await this.ensureProviderClients();
    const { clients, verifier } = harness;

    const normalizedOffers = [];
    for (const contact of this.impactReport.providersToContact) {
      const node = this.graph.nodes.get(contact.commitmentId);
      if (!node) continue;

      this.privacyDisclosures.push({
        origin: contact.origin,
        providerName: contact.providerName,
        sentFields: `booking_ref (${node.booking_ref}), target_date (${targetDate})`,
        withheldFields: "Full mission graph, maximum_budget_eur, customer email/phone, other bookings",
        keyExposure: "NONE (LLM BYOK key stays on caller router)",
      });

      if (this.isRelocationScenario() && (this.livePeersDetected || this.crossOriginBridgeConnected) && clients[contact.providerId]?.quote) {
        const quoteResp = await clients[contact.providerId].quote(node.booking_ref, targetDate);
        if (quoteResp.primary_refused && quoteResp.refusal_reason) {
          this.providerAlerts.push(`MoveCo Alert: ${quoteResp.refusal_reason}`);
        }
        for (const rawOffer of quoteResp.offers || []) {
          normalizedOffers.push(normalizePeerOffer(rawOffer));
        }
      } else if (!this.isRelocationScenario() && typeof harness.buildOffersForNode === "function") {
        const customOffers = harness.buildOffersForNode(node, targetDate, this.graph);
        if (this.rippleFailureInjected && node.id === this.mission.anchor_commitment_id) {
          this.providerAlerts.push(
            `Anchor Alert: Primary slot full on ${targetDate}; recovered with verified overflow partner while keeping ${node.booking_ref} held.`,
          );
        }
        normalizedOffers.push(...customOffers);
      } else {
        const simOffers = this.buildFallbackOffersForNode(node, targetDate);
        normalizedOffers.push(...simOffers);
      }
    }

    this.cachedNormalizedOffers = normalizedOffers;
    this.budgetSensitivity = analyzeBudgetSensitivity({
      graph: this.graph,
      proposal: this.compiledProposal,
      impact: this.impactReport,
      normalizedOffers,
    });

    return await this._solveAndPrepareFromCachedOffers({ clients, verifier });
  }

  async recalculateWithBudgetCeiling(newBudgetEur) {
    if (!this.compiledProposal || !this.impactReport) return null;
    const cap = Number(newBudgetEur);
    if (!Number.isFinite(cap) || cap <= 0) return null;
    this.compiledProposal = {
      ...this.compiledProposal,
      invariants: {
        ...this.compiledProposal.invariants,
        maximum_budget_eur: cap,
      },
    };
    const harness = await this.ensureProviderClients();
    return await this._solveAndPrepareFromCachedOffers(harness);
  }

  async _solveAndPrepareFromCachedOffers({ clients, verifier }) {
    this.solverResult = solveMinimalChangePlans({
      graph: this.graph,
      proposal: this.compiledProposal,
      impact: this.impactReport,
      normalizedOffers: this.cachedNormalizedOffers,
    });

    if (!this.solverResult.feasible) {
      this.selectedPlanId = null;
      this.preparedOps = [];
      this.version += 1;
      const reason = this.solverResult.rejectionReasonsSummary.join(" ");
      this.render(`No feasible plan satisfies all hard constraints: ${reason}`);
      return {
        ok: false,
        field: "requestText",
        reason: `No feasible plan satisfies hard constraints: ${reason}`,
      };
    }

    this.selectedPlanId = this.solverResult.recommendedPlanId;
    await this.prepareSelectedPlan(this.selectedPlanId, { clients, verifier });

    this.version += 1;
    const selected = this.getSelectedPlan();
    const targetDate = this.compiledProposal.requested_change.new_value;
    this.render(
      `Prepared ${selected.label}: ${selected.metrics.changedCount} modifications prepared, ${selected.metrics.unchangedCount} commitments preserved untouched, total €${selected.metrics.totalMissionCostEur.toFixed(2)} (<= €${selected.metrics.maxBudgetEur.toFixed(2)}).`,
    );

    return {
      ok: true,
      version: this.version,
      targetDate,
      recommendedPlanId: this.selectedPlanId,
      paretoFrontierCount: this.solverResult.paretoFrontierCount,
      minimumFeasibleBudgetEur: this.budgetSensitivity?.minimumFeasibleBudgetEur ?? null,
      plans: this.solverResult.plans.map((p) => ({
        plan_id: p.plan_id,
        label: p.label,
        paretoOptimal: Boolean(p.paretoOptimal),
        metrics: p.metrics,
      })),
      preparedOperationsCount: this.preparedOps.length,
      unaffectedCommitmentsCount: selected.metrics.unchangedCount,
      providerAlerts: this.providerAlerts,
    };
  }

  buildFallbackOffersForNode(node, targetDate) {
    if (node.provider_id === "moveco") {
      if (this.rippleFailureInjected) {
        this.providerAlerts.push(
          `MoveCo Alert: Primary 08:00 crew full on ${targetDate}; recovered with MoveCo Partner Overflow Fleet while keeping MC-8841 held.`,
        );
        return [
          normalizePeerOffer({
            offer_id: "off_moveco_partner_overflow_fri",
            commitment_id: node.id,
            provider_id: "moveco",
            provider_name: "MoveCo Partner Overflow Fleet (Demo)",
            provider_origin: this.peerOrigins.moveco,
            raw_capability: "reschedule_van_booking",
            semantic_kind: "REPLACE_WITH_BACKUP_PROVIDER",
            proposed_date: targetDate,
            window: "09:30–14:30",
            base_price_eur: 405,
            change_fee_eur: 0,
            cancellation_penalty_eur: 20,
            supports_hold: true,
            hold_ttl_seconds: 900,
            reversible: false,
            creates_final_booking: true,
            requires_user_approval: true,
            supports_idempotency: true,
            supports_status_reconciliation: true,
            is_replacement_provider: true,
            expires_at: "2027-01-20T23:59:59Z",
          }),
        ];
      }
      return [
        normalizePeerOffer({
          offer_id: "off_moveco_fri_am",
          commitment_id: node.id,
          provider_id: "moveco",
          provider_name: "MoveCo Express (Demo)",
          provider_origin: this.peerOrigins.moveco,
          raw_capability: "reschedule_van_booking",
          semantic_kind: "RESCHEDULE_IN_PLACE",
          proposed_date: targetDate,
          window: "08:00–13:00",
          base_price_eur: 390,
          change_fee_eur: 25,
          cancellation_penalty_eur: 0,
          supports_hold: true,
          hold_ttl_seconds: 900,
          reversible: false,
          creates_final_booking: true,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: false,
          expires_at: "2027-01-20T23:59:59Z",
        }),
      ];
    }

    if (node.provider_id === "permitflow") {
      return [
        normalizePeerOffer({
          offer_id: `off_permitflow_${targetDate}`,
          commitment_id: node.id,
          provider_id: "permitflow",
          provider_name: "PermitFlow Civic Prep (Demo)",
          provider_origin: this.peerOrigins.permitflow,
          raw_capability: "prepare_permit_date_update",
          semantic_kind: "PREPARE_PERMIT_DOSSIER",
          proposed_date: targetDate,
          window: "07:30–14:00",
          base_price_eur: 35,
          change_fee_eur: 10,
          cancellation_penalty_eur: 0,
          supports_hold: false,
          hold_ttl_seconds: 0,
          reversible: true,
          creates_final_booking: false,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: false,
          expires_at: "2027-01-20T23:59:59Z",
        }),
      ];
    }

    if (node.provider_id === "homeconnect") {
      const nextDayDate = new Date(Date.parse(`${targetDate}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      return [
        normalizePeerOffer({
          offer_id: "off_homeconnect_fri_pm",
          commitment_id: node.id,
          provider_id: "homeconnect",
          provider_name: "HomeConnect Fiber (Demo)",
          provider_origin: this.peerOrigins.homeconnect,
          raw_capability: "change_fiber_appointment",
          semantic_kind: "RESCHEDULE_IN_PLACE",
          proposed_date: targetDate,
          window: "14:00–17:00",
          base_price_eur: 49,
          change_fee_eur: 0,
          cancellation_penalty_eur: 0,
          supports_hold: true,
          hold_ttl_seconds: 600,
          reversible: false,
          creates_final_booking: true,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: false,
          expires_at: "2027-01-20T23:59:59Z",
        }),
        normalizePeerOffer({
          offer_id: "off_homeconnect_sat_am",
          commitment_id: node.id,
          provider_id: "homeconnect",
          provider_name: "HomeConnect Fiber (Demo)",
          provider_origin: this.peerOrigins.homeconnect,
          raw_capability: "change_fiber_appointment",
          semantic_kind: "RESCHEDULE_IN_PLACE",
          proposed_date: nextDayDate,
          window: "09:00–12:00",
          base_price_eur: 39,
          change_fee_eur: 0,
          cancellation_penalty_eur: 0,
          supports_hold: true,
          hold_ttl_seconds: 600,
          reversible: false,
          creates_final_booking: true,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: false,
          expires_at: "2027-01-20T23:59:59Z",
        }),
      ];
    }

    if (node.provider_id === "powerflow") {
      return [
        normalizePeerOffer({
          offer_id: `off_powerflow_${targetDate}`,
          commitment_id: node.id,
          provider_id: "powerflow",
          provider_name: "PowerFlow Energy (Demo)",
          provider_origin: this.peerOrigins.powerflow,
          raw_capability: "shift_grid_activation",
          semantic_kind: "RESCHEDULE_IN_PLACE",
          proposed_date: targetDate,
          window: "08:00–12:00",
          base_price_eur: 30,
          change_fee_eur: 0,
          cancellation_penalty_eur: 0,
          supports_hold: false,
          hold_ttl_seconds: 0,
          reversible: false,
          creates_final_booking: true,
          requires_user_approval: true,
          supports_idempotency: true,
          supports_status_reconciliation: true,
          is_replacement_provider: false,
          expires_at: "2027-01-20T23:59:59Z",
        }),
      ];
    }

    return [];
  }

  async prepareSelectedPlan(planId, existingHarness = null) {
    if (!this.solverResult?.feasible) {
      return { ok: false, field: "planId", reason: "Analyze a change request first so feasible plans exist." };
    }
    const chosen = this.solverResult.plans.find((p) => p.plan_id === planId);
    if (!chosen) {
      return { ok: false, field: "planId", reason: `Plan "${planId}" is not among current feasible plans.` };
    }

    this.graph = MissionGraph.fromMission(this.mission);
    for (const id of this.impactReport.unaffectedIds) {
      this.graph.updateNode(id, { visual_state: "UNCHANGED" });
    }
    for (const p of chosen.preservedCommitments) {
      this.graph.updateNode(p.commitment_id, { visual_state: "UNCHANGED" });
    }

    const { clients, verifier } = existingHarness || (await this.ensureProviderClients());
    this.saga = new SagaCoordinator({ graph: this.graph, receiptVerifier: verifier });

    const prep = await this.saga.preparePlan({
      missionId: this.mission.mission_id,
      plan: chosen,
      maximumBudgetEur: this.compiledProposal.invariants.maximum_budget_eur,
      providerClients: clients,
    });

    if (!prep.ok) {
      return { ok: false, field: "planId", reason: prep.reason };
    }

    this.selectedPlanId = chosen.plan_id;
    this.preparedOps = prep.operations;
    this.holdsPlacedAtMs = this.preparedOps.some((o) => o.hold_id) ? Date.now() : null;
    this.version += 1;
    this.render(`Selected ${chosen.label} (${this.preparedOps.length} prepared operations awaiting bound approval).`);
    return {
      ok: true,
      version: this.version,
      selectedPlanId: this.selectedPlanId,
      preparedOperationsCount: this.preparedOps.length,
    };
  }

  async _evaluateMandateArbiter() {
    if (!this.activeMandate) return;
    // Allowance available for the contested anchor slot after reserving remaining non-anchor baseline costs
    const anchorNode = this.graph.nodes.get(this.activeMandate.subject_commitment_id);
    const otherBaselineCents = Math.round(
      (this.baselineTotalEur() - Number(anchorNode?.price_eur || 0)) * 100,
    );
    const sliceAllowanceCents = Math.max(5000, this.activeMandate.ceiling_cents - otherBaselineCents);

    const arbiter = new SealedBidArbiter(this.activeMandate, sliceAllowanceCents);
    await arbiter.commitSealedBid({
      providerId: "moveco_overflow_partner",
      providerName: "MoveCo Partner Overflow Fleet (Sealed Adapter)",
      window: "09:30–14:30",
      askCents: 43000,   // €430.00 catalogue ask
      floorCents: 38000, // €380.00 private floor -> Nash midpoint floor((43000+38000)/2) = €405.00!
      nonce: "mc_ovf_20261120",
    });
    await arbiter.commitSealedBid({
      providerId: "alpine_heavy_freight",
      providerName: "AlpineExpress White-Glove Van (Sealed Adapter)",
      window: "10:00–15:00",
      askCents: 54000,   // €540.00 catalogue ask
      floorCents: 49500, // €495.00 private floor (> €466 slice allowance -> NO_AGREEMENT without leaking floor!)
      nonce: "alp_fr_20261120",
    });

    this._lastArbiterInstance = arbiter;
    this.arbiterReport = arbiter.resolveNashBargaining();
  }

  async executeBypassAudit() {
    if (!this.activeMandate || !this._lastArbiterInstance) {
      const fallbackCompiled = compileMissionChange(
        "Move my schedule from Tuesday to Friday under €700.",
        this.mission,
      );
      this.activeMandate = await issuePolicyBoundMandate(this.mission, fallbackCompiled.proposal);
      await this._evaluateMandateArbiter();
    }
    this.bypassAuditReport = runAdversarialBypassAudit(this.activeMandate, this._lastArbiterInstance);
    this.renderMandateTable();
    return this.bypassAuditReport;
  }

  checkCommitPackage(args) {
    if (!this.saga || !this.preparedOps.length) {
      return {
        ok: false,
        field: "planId",
        reason: "No prepared change plan is awaiting approval. Run Analyze & Prepare first.",
      };
    }
    if (args.planId !== this.selectedPlanId) {
      return {
        ok: false,
        field: "planId",
        reason: `Selected plan on page is "${this.selectedPlanId}", not "${args.planId}".`,
      };
    }
    if (args.expectedVersion !== this.version) {
      return {
        ok: false,
        field: "expectedVersion",
        reason: `Mission version changed (expected ${args.expectedVersion}, current ${this.version}). Read mission state again before committing.`,
      };
    }
    const plan = this.getSelectedPlan();
    if (Math.abs(Number(args.expectedTotalEur) - plan.metrics.totalMissionCostEur) > 0.01) {
      return {
        ok: false,
        field: "expectedTotalEur",
        reason: `Expected total €${Number(args.expectedTotalEur).toFixed(2)} does not match prepared plan total €${plan.metrics.totalMissionCostEur.toFixed(2)}.`,
      };
    }
    return {
      ok: true,
      plan,
      operations: this.preparedOps,
    };
  }

  async commitPreparedPackage(args) {
    const check = this.checkCommitPackage(args);
    if (!check.ok) {
      return { ok: false, field: check.field, reason: check.reason };
    }

    const { clients } = await this.ensureProviderClients();

    const approvals = await this.saga.approvePreparedOperations(
      this.preparedOps.map((o) => o.operation_id),
    );

    const execResult = await this.saga.executeApprovedSaga({
      approvedItems: approvals.map((a) => ({
        operationId: a.operation_id,
        approvalId: a.approval_id,
      })),
      providerClients: clients,
    });

    this.lastSagaExecution = execResult;
    this.preparedOps = execResult.operations;
    this.holdsPlacedAtMs = null;
    if (execResult.status === "ALL_COMMITTED_AND_VERIFIED") {
      this.mission.anchor_date = this.compiledProposal.requested_change.new_value;
    }
    this.version += 1;

    this.render(
      execResult.status === "ALL_COMMITTED_AND_VERIFIED"
        ? `Verified & Committed: ${execResult.committedOperationIds.length} operations reconciled with Ed25519 provider receipts; ${check.plan.metrics.unchangedCount} unaffected bookings preserved intact.`
        : `Saga halted safely (${execResult.status}): ${execResult.partialFailureReason}`,
    );

    return {
      ok: execResult.status === "ALL_COMMITTED_AND_VERIFIED",
      version: this.version,
      sagaStatus: execResult.status,
      committedCount: execResult.committedOperationIds.length,
      preservedCount: check.plan.metrics.unchangedCount,
      partnerLinks: this.getPeerLinks(),
      reason: execResult.partialFailureReason || undefined,
      receipts: execResult.operations
        .filter((o) => o.state === "COMMITTED")
        .map((o) => ({
          operation_id: o.operation_id,
          provider_name: o.provider_name,
          scheduled_date: o.proposed_date,
          proof_level: o.proof_verification?.level || "VERIFIED",
        })),
    };
  }

  async executeChaosSuite() {
    this.chaosReport = await runAllChaosScenarios();
    this.renderChaosTable();
    return this.chaosReport;
  }

  async runConformanceAudit(targetUrlOrAll = "all") {
    const selfBase =
      typeof location !== "undefined"
        ? new URL("./", location.href).href
        : "http://127.0.0.1:8080/";

    const urls =
      !targetUrlOrAll || targetUrlOrAll === "all"
        ? [
            selfBase,
            `${this.peerOrigins.moveco}/`,
            `${this.peerOrigins.permitflow}/`,
            `${this.peerOrigins.homeconnect}/`,
            `${this.peerOrigins.powerflow}/`,
          ]
        : [String(targetUrlOrAll).trim()];

    const results = [];
    for (const u of urls) {
      results.push(await auditOpenAgenticSite(u));
    }
    this.auditorResults = results;
    this.renderAuditorTable();
    return {
      ok: results.every((r) => r.ok),
      sitesAudited: results.length,
      results,
    };
  }

  triggerBrowserDownload(filename, mimeType, textContent) {
    if (typeof document === "undefined" || typeof Blob === "undefined") return;
    const blob = new Blob([textContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  downloadUpdatedIcsCalendar() {
    const ics = exportMissionToIcs(this.mission, this.graph, this.preparedOps);
    this.triggerBrowserDownload(`${this.mission.mission_id}.ics`, "text/calendar;charset=utf-8", ics);
    return { ok: true, bytes: ics.length };
  }

  async downloadSignedAuditBundle() {
    const bundle = await exportVerifiableAuditBundle({
      mission: this.mission,
      selectedPlan: this.getSelectedPlan(),
      operations: this.preparedOps,
      auditLog: this.saga?.ledger?.getHistory() || [],
    });
    const text = `${JSON.stringify(bundle, null, 2)}\n`;
    this.triggerBrowserDownload(`${this.mission.mission_id}-audit-bundle.json`, "application/json;charset=utf-8", text);
    return bundle;
  }

  /* ------------------------------ UI RENDERING ------------------------------ */

  render(bannerMessage = "") {
    if (typeof document === "undefined") return;

    const badge = document.querySelector("#transport-badge");
    if (badge) {
      badge.textContent = this.livePeersDetected
        ? "Live Independent Peer Origins (4 HTTP/MCP)"
        : this.crossOriginBridgeConnected
          ? "Live Cross-Origin Browser Mesh (4 Peers · Ed25519)"
          : "Browser Deterministic Saga Engine";
      badge.classList.toggle("live", this.livePeersDetected || this.crossOriginBridgeConnected);
    }

    const missionBadge = document.querySelector("#mission-id-badge");
    if (missionBadge) missionBadge.textContent = this.mission.mission_id;

    const activeCap =
      this.compiledProposal?.invariants?.maximum_budget_eur
      ?? this.mission.authoritative_invariants.maximum_budget_eur;
    const invCapTag = document.querySelector("#inv-cap-tag");
    if (invCapTag) invCapTag.textContent = `Cap ≤ €${Number(activeCap).toFixed(2)}`;

    document.querySelectorAll(".scenario-pill[data-scenario-id]").forEach((btn) => {
      const sid = btn.getAttribute("data-scenario-id");
      btn.classList.toggle("active", sid === this.activeScenarioId);
    });

    // Update peer links with signed #continuity_receipt handoff tokens when committed!
    const peerLinks = this.getPeerLinks();
    for (const [pid, href] of Object.entries(peerLinks)) {
      const linkEl = document.querySelector(`#peer-link-${pid}`);
      if (linkEl) linkEl.setAttribute("href", href);
      const syncEl = document.querySelector(`#peer-sync-${pid}`);
      if (syncEl) {
        syncEl.hidden = !href.includes("#continuity_receipt=");
      }
    }

    const rippleBtn = document.querySelector("#inject-ripple-btn");
    if (rippleBtn) {
      rippleBtn.textContent = this.rippleFailureInjected
        ? "Ripple Failure: ARMED (Primary Full)"
        : "Inject Ripple Failure";
      rippleBtn.classList.toggle("ripple-active", this.rippleFailureInjected);
    }

    if (bannerMessage) {
      const sb = document.querySelector("#status-banner");
      if (sb) sb.textContent = bannerMessage;
    }

    const plan = this.getSelectedPlan();
    const approveBtn = document.querySelector("#approve-commit-btn");
    if (approveBtn) {
      const readyToApprove =
        Boolean(plan)
        && this.preparedOps.length > 0
        && this.preparedOps.every((o) => o.state === "AWAITING_APPROVAL");
      approveBtn.disabled = !readyToApprove;
    }

    const exportBar = document.querySelector("#export-actions-bar");
    if (exportBar) {
      exportBar.hidden = !this.compiledProposal;
    }

    this.renderHoldCountdown();
    this.renderWhatIfSlider();
    this.renderKpis(plan);
    this.renderGraphSvg();
    this.renderNodeInspector(this.selectedNodeId);
    this.renderChangePackage(plan);
    this.renderCommitmentsTable();
    this.renderPrivacyTable();
    this.renderAuditTimeline();
    this.renderMandateTable();
  }

  renderHoldCountdown() {
    const el = document.querySelector("#hold-countdown-strip");
    if (!el) return;
    const heldOps = this.preparedOps.filter((o) => o.hold_id && o.state === "AWAITING_APPROVAL");
    if (!heldOps.length || !this.holdsPlacedAtMs || this.lastSagaExecution) {
      el.hidden = true;
      return;
    }
    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.holdsPlacedAtMs) / 1000));
    const remainingSec = Math.max(0, 600 - elapsedSec); // Strictest 10-min hold TTL across peers
    const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
    const ss = String(remainingSec % 60).padStart(2, "0");
    const holdIds = heldOps.map((o) => o.hold_id).join(", ");
    el.hidden = false;
    el.textContent = `🔒 ${heldOps.length} Non-Destructive Replacement Hold(s) Active (${holdIds}) · Lock TTL ${mm}:${ss} remaining · Original bookings untouched`;
  }

  renderWhatIfSlider() {
    const box = document.querySelector("#whatif-budget-box");
    const slider = document.querySelector("#whatif-budget-slider");
    const valEl = document.querySelector("#whatif-budget-val");
    const minEl = document.querySelector("#whatif-min-badge");
    if (!box || !slider || !valEl || !minEl) return;

    if (!this.compiledProposal || this.lastSagaExecution) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    const base = Math.round(this.baselineTotalEur());
    const minSlider = Math.max(20, base - 10);
    const maxSlider = base + 220;
    const curCap = Math.round(this.compiledProposal.invariants.maximum_budget_eur);
    slider.min = String(minSlider);
    slider.max = String(Math.max(maxSlider, curCap + 20));
    slider.value = String(curCap);
    valEl.textContent = `€${curCap}`;
    const minFeas = this.budgetSensitivity?.minimumFeasibleBudgetEur;
    minEl.textContent =
      minFeas !== null && minFeas !== undefined
        ? `Min feasible threshold: €${minFeas.toFixed(2)}`
        : "Exceeds available offers";

    this.renderParetoPlot(curCap);
  }

  renderParetoPlot(curCapEur) {
    const svg = document.querySelector("#pareto-plot-svg");
    if (!svg) return;
    const plans = this.solverResult?.plans || [];
    const baseEur = this.baselineTotalEur();
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
      .sort((a, b) => a.metrics.changedCount - b.metrics.changedCount || a.metrics.totalMissionCostEur - b.metrics.totalMissionCostEur);

    if (paretoPts.length >= 2) {
      const poly = paretoPts
        .map((p) => `${mapX(p.metrics.changedCount).toFixed(1)},${mapY(p.metrics.totalMissionCostEur).toFixed(1)}`)
        .join(" ");
      parts.push(`<polyline points="${poly}" fill="none" stroke="#10b981" stroke-width="2" />`);
    }

    const seenByChg = new Map();
    plans.forEach((p, idx) => {
      const chg = p.metrics.changedCount;
      const slotInBucket = seenByChg.get(chg) || 0;
      seenByChg.set(chg, slotInBucket + 1);

      const cx = mapX(chg);
      const cy = mapY(p.metrics.totalMissionCostEur);
      const labelDy = slotInBucket % 2 === 0 ? 15 : -9;
      const isSel = p.plan_id === this.selectedPlanId;
      const fill = p.paretoOptimal ? "#10b981" : "#60a5fa";
      const shortTag = p.plan_id.startsWith("PLAN_A_")
        ? "Plan A"
        : p.plan_id.startsWith("PLAN_B_")
          ? "Plan B"
          : p.plan_id.startsWith("PLAN_C_")
            ? "Plan C"
            : `Alt`;
      parts.push(
        `<g style="cursor:pointer" data-pareto-plan="${this.escapeXml(p.plan_id)}">
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isSel ? 6.5 : 5}" fill="${fill}" stroke="#ffffff" stroke-width="${isSel ? 2.2 : 1.2}" />
          <text x="${(cx + 8).toFixed(1)}" y="${(cy + labelDy).toFixed(1)}" fill="#f8fafc" font-size="9.5" font-weight="700" font-family="system-ui, sans-serif">${this.escapeXml(`${shortTag}: €${p.metrics.totalMissionCostEur.toFixed(0)} (${chg} chg)`)}</text>
        </g>`,
      );
    });

    svg.innerHTML = parts.join("\n");
    svg.querySelectorAll("[data-pareto-plan]").forEach((g) => {
      g.addEventListener("click", () => {
        const pid = g.getAttribute("data-pareto-plan");
        if (pid && pid !== this.selectedPlanId && !this.lastSagaExecution) {
          void this.prepareSelectedPlan(pid);
        }
      });
    });
  }

  renderKpis(plan) {
    const set = (sel, txt) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = txt;
    };
    const totalCount = this.mission.commitments.length;
    const baseEur = this.baselineTotalEur();
    const capEur = this.mission.authoritative_invariants.maximum_budget_eur;

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
    set("#kpi-affected-sub", `${this.impactReport.metrics.providersContactedCount} peers contacted · ${this.impactReport.metrics.unnecessaryOperationsAvoided} skipped`);
    set("#kpi-preserved", `${m.unchangedCount}`);
    set("#kpi-preserved-sub", "Original reservations untouched");
    set("#kpi-cost", `€${m.totalMissionCostEur.toFixed(2)}`);
    const sign = m.netDeltaEur >= 0 ? "+" : "";
    set("#kpi-cost-sub", `${sign}€${m.netDeltaEur.toFixed(2)} vs baseline · Cap €${m.maxBudgetEur.toFixed(2)}`);
    set("#kpi-approvals", `${m.approvalsRequiredCount}`);
    set("#kpi-approvals-sub", this.lastSagaExecution?.status === "ALL_COMMITTED_AND_VERIFIED" ? "All verified & committed" : "Awaiting user confirmation");
  }

  renderGraphSvg() {
    const svg = document.querySelector("#mission-graph-svg");
    if (!svg) return;
    svg.style.transform = `scale(${this.zoomScale})`;
    const zoomReadout = document.querySelector("#zoom-readout");
    if (zoomReadout) zoomReadout.textContent = `${Math.round(this.zoomScale * 100)}%`;

    const coordsMap = MissionGraph.computeTopologicalLayout(this.graph, RELOCATION_PRESET_COORDS);
    const snap = this.graph.toJSON();
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
          <text x="${midX}" y="${midY}" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="system-ui, sans-serif">${this.escapeXml(shortEdgeLabel)}</text>
        </g>`,
      );
    }

    for (const node of snap.nodes) {
      const pos = coordsMap[node.id] || { x: 40, y: 40 };
      const pal = STATE_PALETTE[node.visual_state] || STATE_PALETTE.UNCHANGED;
      const meta = GRAPH_VISUAL_STATES[node.visual_state] || GRAPH_VISUAL_STATES.UNCHANGED;
      const isSelected = node.id === this.selectedNodeId;
      const strokeW = isSelected ? 2.8 : 1.6;

      parts.push(
        `<g class="graph-node-group" tabindex="0" data-node-id="${this.escapeXml(node.id)}">
          <title>${this.escapeXml(`${node.title}: ${meta.label}, scheduled ${node.scheduled_date}, €${node.price_eur}`)}</title>
          <rect x="${pos.x}" y="${pos.y}" width="225" height="90" rx="10" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${strokeW}" />
          <rect x="${pos.x + 10}" y="${pos.y + 9}" width="114" height="18" rx="5" fill="${pal.badgeBg}" />
          <text x="${pos.x + 16}" y="${pos.y + 22}" fill="#ffffff" font-size="10" font-weight="700" font-family="system-ui, sans-serif">${this.escapeXml(`${meta.icon} ${meta.badge}`)}</text>
          <text x="${pos.x + 214}" y="${pos.y + 22}" text-anchor="end" fill="${pal.text}" font-size="10.5" font-weight="700" font-family="system-ui, sans-serif">€${Number(node.price_eur).toFixed(0)}</text>
          <text x="${pos.x + 12}" y="${pos.y + 44}" fill="${pal.text}" font-size="12" font-weight="700" font-family="system-ui, sans-serif">${this.escapeXml(node.title.slice(0, 28))}</text>
          <text x="${pos.x + 12}" y="${pos.y + 62}" fill="#cbd5e1" font-size="10.5" font-family="system-ui, sans-serif">${this.escapeXml(node.provider_name.slice(0, 30))}</text>
          <text x="${pos.x + 12}" y="${pos.y + 79}" fill="#93c5fd" font-size="10.5" font-weight="600" font-family="system-ui, sans-serif">${this.escapeXml(`${node.booking_ref} · ${formatDateWithWeekday(node.scheduled_date)}`)}</text>
        </g>`,
      );
    }

    svg.innerHTML = parts.join("\n");
    svg.querySelectorAll(".graph-node-group").forEach((el) => {
      const nid = el.getAttribute("data-node-id");
      el.addEventListener("click", () => {
        this.selectedNodeId = nid;
        this.renderGraphSvg();
        this.renderNodeInspector(nid);
      });
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this.selectedNodeId = nid;
          this.renderGraphSvg();
          this.renderNodeInspector(nid);
        }
      });
    });
  }

  renderNodeInspector(nodeId) {
    const box = document.querySelector("#node-inspector");
    if (!box) return;
    const node = this.graph.nodes.get(nodeId) || Array.from(this.graph.nodes.values())[0];
    if (!node) return;
    const meta = GRAPH_VISUAL_STATES[node.visual_state] || GRAPH_VISUAL_STATES.UNCHANGED;
    const impactInfo = this.impactReport?.nodeDecisions?.[node.id];
    box.innerHTML = `
      <div><strong>${this.escapeXml(node.title)}</strong> — <span>[${this.escapeXml(`${meta.icon} ${meta.label}`)}]</span></div>
      <div>Provider: <code>${this.escapeXml(node.provider_name)}</code> (${this.escapeXml(node.provider_origin)}) · Ref: <code>${this.escapeXml(node.booking_ref)}</code></div>
      <div>Scheduled: <strong>${this.escapeXml(formatDateWithWeekday(node.scheduled_date))}</strong> (${this.escapeXml(node.window)}) · Price: <strong>€${Number(node.price_eur).toFixed(2)}</strong> · Cancel Penalty: €${Number(node.cancellation_fee_eur).toFixed(2)}</div>
      <div>Evidence Trust: <code>${this.escapeXml(node.observed?.evidence_trust || "DEMO_FIXTURE_INITIAL")}</code>${impactInfo ? ` · Impact Rationale: ${this.escapeXml(impactInfo.reasons.join(" "))}` : ""}</div>
    `;
  }

  renderChangePackage(plan) {
    const summaryBox = document.querySelector("#change-summary-box");
    const plansContainer = document.querySelector("#plans-selector");
    const opsContainer = document.querySelector("#operations-list");
    if (!summaryBox || !plansContainer || !opsContainer) return;

    if (!this.compiledProposal) {
      summaryBox.innerHTML =
        "No active change proposal yet. Click <strong>1. Analyze Impact &amp; Prepare Minimal-Change Plan</strong> above.";
      plansContainer.innerHTML = "";
      opsContainer.innerHTML =
        '<p class="muted-empty">Existing reservations remain locked in CONFIRMED state until replacements are prepared and explicitly approved.</p>';
      return;
    }

    if (!this.solverResult?.feasible || !plan) {
      summaryBox.innerHTML = `<strong>Hard Constraint Guard Triggered:</strong> ${this.escapeXml((this.solverResult?.rejectionReasonsSummary || []).join(" "))} Slide the What-If budget ceiling below or adjust your request — your original bookings remain completely untouched.`;
      plansContainer.innerHTML = "";
      opsContainer.innerHTML = "";
      return;
    }

    const alertsHtml = this.providerAlerts.length
      ? `<div style="margin-top:8px;color:var(--warn);font-weight:600;">${this.providerAlerts.map((a) => `⚡ ${this.escapeXml(a)}`).join("<br>")}</div>`
      : "";

    const committedBanner =
      this.lastSagaExecution?.status === "ALL_COMMITTED_AND_VERIFIED"
        ? `<strong>Mission Re-Aligned &amp; Cryptographically Verified.</strong> ${plan.metrics.changedCount} service arrangements have been committed for ${formatDateWithWeekday(this.compiledProposal.requested_change.new_value)}. ${plan.metrics.unchangedCount} unaffected commitments remained untouched throughout. Download your updated <code>.ics</code> calendar or click any synced peer above.`
        : `<strong>Change Package Prepared:</strong> Primary anchor shifts from ${formatDateWithWeekday(this.compiledProposal.requested_change.previous_value)} to <strong>${formatDateWithWeekday(this.compiledProposal.requested_change.new_value)}</strong>. <strong>${plan.metrics.changedCount}</strong> service arrangements need modification; <strong>${plan.metrics.unchangedCount}</strong> existing arrangements remain unchanged. Replacements are prepared and held — your original bookings remain intact until you approve.`;

    summaryBox.innerHTML = `${committedBanner}${alertsHtml}`;

    plansContainer.innerHTML = this.solverResult.plans
      .map((p) => {
        const isSel = p.plan_id === this.selectedPlanId;
        const deltaSign = p.metrics.netDeltaEur >= 0 ? "+" : "";
        const paretoHtml = p.paretoOptimal ? `<span class="pareto-badge">PARETO OPTIMAL</span>` : "";
        return `
          <button type="button" class="plan-option ${isSel ? "selected" : ""}" data-plan-id="${this.escapeXml(p.plan_id)}" ${this.lastSagaExecution ? "disabled" : ""}>
            <div class="plan-option-top">
              <span>${isSel ? "✓ " : ""}${this.escapeXml(p.label)}${paretoHtml}</span>
              <span>€${p.metrics.totalMissionCostEur.toFixed(2)} (${deltaSign}€${p.metrics.netDeltaEur.toFixed(2)})</span>
            </div>
            <div class="plan-option-meta">
              ${p.metrics.changedCount} changed · ${p.metrics.unchangedCount} preserved untouched · Budget headroom: €${p.metrics.budgetHeadroomEur.toFixed(2)}
            </div>
          </button>
        `;
      })
      .join("");

    plansContainer.querySelectorAll(".plan-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.getAttribute("data-plan-id");
        if (pid && pid !== this.selectedPlanId) {
          void this.prepareSelectedPlan(pid);
        }
      });
    });

    opsContainer.innerHTML = this.preparedOps
      .map((op) => {
        const totalOp = Number(op.base_price_eur) + Number(op.change_fee_eur || 0) + Number(op.cancellation_penalty_eur || 0);
        const proofBadge = op.proof_verification?.level
          ? `<div>Proof: <code>${this.escapeXml(op.proof_verification.level)}</code></div>`
          : "";
        return `
          <div class="op-card">
            <div class="op-card-head">
              <span>${this.escapeXml(op.commitment_title)} → ${this.escapeXml(formatDateWithWeekday(op.proposed_date))}</span>
              <span class="state-tag">${this.escapeXml(op.state)}</span>
            </div>
            <div>Provider: <strong>${this.escapeXml(op.provider_name)}</strong> (${this.escapeXml(op.provider_origin)}) · Capability: <code>${this.escapeXml(op.capability)}</code></div>
            <div>Window: ${this.escapeXml(op.window)} · Total: <strong>€${totalOp.toFixed(2)}</strong> (Fee €${Number(op.change_fee_eur || 0).toFixed(2)}) · Reversible: ${op.reversible ? "Yes (Draft)" : "No (Irreversible Booking)"}</div>
            <div>Idempotency Key: <code>${this.escapeXml(op.idempotency_key)}</code>${op.hold_id ? ` · Hold: <code>${this.escapeXml(op.hold_id)}</code>` : ""}</div>
            ${proofBadge}
          </div>
        `;
      })
      .join("");
  }

  renderCommitmentsTable() {
    const tbody = document.querySelector("#commitments-tbody");
    if (!tbody) return;
    const snap = this.graph.toJSON();
    tbody.innerHTML = snap.nodes
      .map(
        (n) => `
        <tr>
          <td><strong>${this.escapeXml(n.title)}</strong></td>
          <td>${this.escapeXml(n.provider_name)}<br><small>${this.escapeXml(n.provider_origin)}</small></td>
          <td><code>${this.escapeXml(n.booking_ref)}</code></td>
          <td>${this.escapeXml(formatDateWithWeekday(n.scheduled_date))}<br><small>${this.escapeXml(n.window)}</small></td>
          <td>€${Number(n.price_eur).toFixed(2)}</td>
          <td><span class="state-tag">${this.escapeXml(`${n.stateMeta.icon} ${n.stateMeta.badge}`)}</span></td>
          <td><code>${this.escapeXml(n.observed?.evidence_trust || "DEMO_FIXTURE")}</code></td>
        </tr>`,
      )
      .join("");
  }

  renderPrivacyTable() {
    const tbody = document.querySelector("#privacy-tbody");
    if (!tbody) return;
    if (!this.privacyDisclosures.length) {
      tbody.innerHTML =
        '<tr><td colspan="4">No external peer requests dispatched yet. Unaffected commitments receive zero data.</td></tr>';
      return;
    }
    tbody.innerHTML = this.privacyDisclosures
      .map(
        (d) => `
        <tr>
          <td><strong>${this.escapeXml(d.providerName)}</strong><br><code>${this.escapeXml(d.origin)}</code></td>
          <td><code>${this.escapeXml(d.sentFields)}</code></td>
          <td>${this.escapeXml(d.withheldFields)}</td>
          <td><strong>${this.escapeXml(d.keyExposure)}</strong></td>
        </tr>`,
      )
      .join("");
  }

  renderAuditTimeline() {
    const list = document.querySelector("#audit-timeline-list");
    const chainBanner = document.querySelector("#chain-integrity-banner");
    if (!list) return;
    const history = this.saga?.ledger?.getHistory() || [];
    if (!history.length) {
      if (chainBanner) {
        chainBanner.textContent = "SHA-256 Tamper-Evident Event Chain Ready (Genesis 00000000…).";
      }
      list.innerHTML = `<li>Mission initialized — ${this.mission.commitments.length} confirmed commitments active (€${this.baselineTotalEur().toFixed(2)} baseline).</li>`;
      return;
    }
    const chainCheck = OperationLedger.verifyChainIntegrity(history);
    if (chainBanner) {
      chainBanner.textContent = chainCheck.valid
        ? `✓ SHA-256 Hash Chain Verified (${chainCheck.verifiedEntries}/${history.length} events intact · Head ${chainCheck.headHash.slice(0, 16)}…)`
        : `✕ Hash Chain Tampering Detected at seq #${chainCheck.brokenAtSeq}: ${chainCheck.reason}`;
    }
    list.innerHTML = history
      .map(
        (h) =>
          `<li><code>#${h.seq}</code> <strong>${this.escapeXml(h.operation_id)}</strong>: ${this.escapeXml(h.from_state || "INIT")} → <strong>${this.escapeXml(h.to_state)}</strong> — ${this.escapeXml(h.reason)} <small><code>[sha256:${this.escapeXml((h.entry_hash || "").slice(0, 12))}]</code></small></li>`,
      )
      .join("");
  }

  renderMandateTable() {
    const summary = document.querySelector("#mandate-summary-box");
    const tbody = document.querySelector("#mandate-tbody");
    if (!summary || !tbody) return;

    if (!this.activeMandate && !this.bypassAuditReport) {
      tbody.innerHTML =
        '<tr><td colspan="4">No mandate issued yet. Run Analyze &amp; Prepare above or click "Try 4 Adversarial Bypasses".</td></tr>';
      return;
    }

    if (this.activeMandate) {
      summary.innerHTML = `<strong>Issued Immutable Policy Mandate:</strong> <code>${this.escapeXml(this.activeMandate.mandate_id)}</code> · Ceiling: <strong>€${(this.activeMandate.ceiling_cents / 100).toFixed(2)}</strong> (withheld from all peer requests) · Digest: <code>sha256:${this.escapeXml(this.activeMandate.mandate_sha256.slice(0, 20))}…</code> · Mechanism: <code>${ARBITER_MECHANISM_VERSION}</code>`;
    }

    const rows = [];
    for (const o of this.arbiterReport?.outcomes || []) {
      rows.push(`
        <tr>
          <td><strong>${this.escapeXml(o.provider_name)}</strong><br><small>Sealed Bid Resolution</small></td>
          <td><code>sha256:${this.escapeXml(o.commitment_hash.slice(0, 18))}…</code><br><small>Private floor hidden</small></td>
          <td>Catalogue Ask: €${o.catalogue_ask_eur.toFixed(2)}<br>${
            o.status === "AGREEMENT_REACHED"
              ? `<strong>Nash Compromise: €${o.compromise_eur.toFixed(2)}</strong> (−€${o.savings_vs_ask_eur.toFixed(2)})`
              : "Exceeds private slice allowance"
          }</td>
          <td><strong>${o.status === "AGREEMENT_REACHED" ? "✓ AGREEMENT_REACHED" : "⊘ NO_AGREEMENT (Zero Floor Leak)"}</strong></td>
        </tr>
      `);
    }

    for (const b of this.bypassAuditReport?.results || []) {
      rows.push(`
        <tr>
          <td><strong>[${this.escapeXml(b.id)}] ${this.escapeXml(b.attack)}</strong></td>
          <td><code>Policy &amp; Arbiter Guard</code></td>
          <td>${this.escapeXml(b.detail)}</td>
          <td><strong>✓ ${this.escapeXml(b.decision)}</strong></td>
        </tr>
      `);
    }

    tbody.innerHTML = rows.join("");
  }

  renderChaosTable() {
    const summary = document.querySelector("#chaos-summary");
    const tbody = document.querySelector("#chaos-tbody");
    if (!summary || !tbody || !this.chaosReport) return;

    summary.textContent = `Simulation Suite Complete: ${this.chaosReport.passed}/${this.chaosReport.total} scenarios passed (${this.chaosReport.failed} failed). Zero live mission commitments modified.`;
    tbody.innerHTML = this.chaosReport.results
      .map(
        (r) => `
        <tr>
          <td>${r.number}</td>
          <td><strong>${this.escapeXml(r.title)}</strong></td>
          <td>${this.escapeXml(r.injectedFailure)}</td>
          <td><code>${this.escapeXml(r.observedState)}</code></td>
          <td>${r.humanInterventionRequired ? "Required" : "Auto-Reconciled"}</td>
          <td><strong>${r.passed ? "✓ PASS" : "✕ FAIL"}</strong><br><small>${this.escapeXml(r.evidence)}</small></td>
        </tr>`,
      )
      .join("");
  }

  renderAuditorTable() {
    const summary = document.querySelector("#auditor-summary");
    const tbody = document.querySelector("#auditor-tbody");
    if (!summary || !tbody || !this.auditorResults.length) return;

    const allOk = this.auditorResults.every((r) => r.ok);
    summary.textContent = `Conformance Audit Complete: ${this.auditorResults.filter((r) => r.ok).length}/${this.auditorResults.length} Open Agentic Website(s) passed all required MVP 0.2 & Project NANDA checks (${allOk ? "ZERO FAILURES" : "ISSUES DETECTED"}).`;

    tbody.innerHTML = this.auditorResults
      .map(
        (r) => `
        <tr>
          <td><strong><code>${this.escapeXml(r.siteBaseUrl)}</code></strong></td>
          <td>Network: <code>${this.escapeXml(r.networkName || "n/a")}</code><br><small>${this.escapeXml(r.manifestDigest || "")}</small></td>
          <td>${r.checks
            .map(
              (c) =>
                `<div><strong>[${this.escapeXml(c.status)}]</strong> ${this.escapeXml(c.check)} — <small>${this.escapeXml(c.detail)}</small></div>`,
            )
            .join("")}</td>
          <td><strong>${r.ok ? "✓ PASS" : "✕ FAIL"}</strong><br><code>${this.escapeXml(r.score)}</code></td>
        </tr>`,
      )
      .join("");
  }

  escapeXml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async bindDom() {
    if (typeof document === "undefined") return;
    await this.probeLivePeerOrigins();
    this.render();

    document.querySelector("#theme-toggle-btn")?.addEventListener("click", () => {
      const root = document.documentElement;
      root.setAttribute("data-theme", root.getAttribute("data-theme") === "light" ? "dark" : "light");
    });

    document.querySelector("#inject-ripple-btn")?.addEventListener("click", () => {
      void this.resetMission({ rippleFailureInjected: !this.rippleFailureInjected });
    });

    document.querySelector("#reset-mission-btn")?.addEventListener("click", () => {
      void this.resetMission({ rippleFailureInjected: false, resetToDefaultScenario: false });
    });

    // Scenario pills
    document.querySelectorAll(".scenario-pill[data-scenario-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-scenario-id");
        if (sid) void this.switchScenario(sid);
      });
    });

    // Magic Intake Drawer controls
    const toggleIntakeBtn = document.querySelector("#toggle-intake-btn");
    const intakeDrawer = document.querySelector("#magic-intake-drawer");
    toggleIntakeBtn?.addEventListener("click", () => {
      if (!intakeDrawer) return;
      const nextHidden = !intakeDrawer.hidden;
      intakeDrawer.hidden = nextHidden;
      toggleIntakeBtn.setAttribute("aria-expanded", String(!nextHidden));
    });

    document.querySelector("#load-sample-emails-btn")?.addEventListener("click", () => {
      const ta = document.querySelector("#raw-intake-textarea");
      if (ta) ta.value = SAMPLE_RAW_CONFIRMATION_EMAILS;
      const fb = document.querySelector("#intake-feedback");
      if (fb) fb.textContent = "Loaded 5 sample booking confirmation emails — click Compile Live Mission Graph.";
    });

    document.querySelector("#ics-file-input")?.addEventListener("change", async (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const ta = document.querySelector("#raw-intake-textarea");
      if (ta) ta.value = text;
      const res = await this.importCustomSchedule(text);
      const fb = document.querySelector("#intake-feedback");
      if (fb) fb.textContent = res.ok ? `Imported ${res.commitmentsCount} .ics events.` : res.reason;
    });

    document.querySelector("#compile-intake-btn")?.addEventListener("click", async () => {
      const raw = document.querySelector("#raw-intake-textarea")?.value || "";
      const res = await this.importCustomSchedule(raw);
      const fb = document.querySelector("#intake-feedback");
      if (fb) fb.textContent = res.ok ? "" : res.reason;
    });

    document.querySelector("#analyze-plan-btn")?.addEventListener("click", () => {
      const text = document.querySelector("#mission-input")?.value || "";
      void this.analyzeAndPrepareChange(text);
    });

    // Counterfactual What-If Budget Slider
    document.querySelector("#whatif-budget-slider")?.addEventListener("change", (ev) => {
      void this.recalculateWithBudgetCeiling(Number(ev.target.value));
    });
    document.querySelector("#whatif-budget-slider")?.addEventListener("input", (ev) => {
      const valEl = document.querySelector("#whatif-budget-val");
      if (valEl) valEl.textContent = `€${ev.target.value}`;
    });

    // Export .ics & Signed Audit Bundle
    document.querySelector("#export-ics-btn")?.addEventListener("click", () => {
      this.downloadUpdatedIcsCalendar();
    });
    document.querySelector("#export-audit-btn")?.addEventListener("click", () => {
      void this.downloadSignedAuditBundle();
    });

    document.querySelector("#approve-commit-btn")?.addEventListener("click", async () => {
      const plan = this.getSelectedPlan();
      if (!plan) return;
      const args = {
        planId: plan.plan_id,
        expectedVersion: this.version,
        expectedTotalEur: plan.metrics.totalMissionCostEur,
      };
      if (typeof window !== "undefined" && window.__continuityReviewHook) {
        const ok = await window.__continuityReviewHook([
          {
            action: "commit_prepared_change_package",
            origin: window.location.origin,
            effect: "irreversible",
            arguments: args,
          },
        ]);
        if (!ok) return;
      }
      await this.commitPreparedPackage(args);
    });

    // Zoom controls
    document.querySelector("#zoom-in-btn")?.addEventListener("click", () => {
      this.zoomScale = Math.min(1.4, Number((this.zoomScale + 0.1).toFixed(2)));
      this.renderGraphSvg();
    });
    document.querySelector("#zoom-out-btn")?.addEventListener("click", () => {
      this.zoomScale = Math.max(0.7, Number((this.zoomScale - 0.1).toFixed(2)));
      this.renderGraphSvg();
    });
    document.querySelector("#zoom-reset-btn")?.addEventListener("click", () => {
      this.zoomScale = 1;
      this.renderGraphSvg();
    });

    // Accessible Tabs
    const tabButtons = Array.from(document.querySelectorAll('[role="tab"]'));
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("aria-controls");
        tabButtons.forEach((b) => {
          const active = b === btn;
          b.setAttribute("aria-selected", String(active));
          b.classList.toggle("active", active);
          const panelId = b.getAttribute("aria-controls");
          const panel = panelId ? document.getElementById(panelId) : null;
          if (panel) panel.hidden = !active;
        });
        if (targetId === "tab-panel-chaos" && !this.chaosReport) {
          void this.executeChaosSuite();
        }
        if (targetId === "tab-panel-auditor" && !this.auditorResults.length) {
          void this.runConformanceAudit("all");
        }
        if (targetId === "tab-panel-mandate" && !this.bypassAuditReport) {
          void this.executeBypassAudit();
        }
      });
    });

    document.querySelector("#run-chaos-suite-btn")?.addEventListener("click", () => {
      void this.executeChaosSuite();
    });

    document.querySelector("#run-bypass-audit-btn")?.addEventListener("click", () => {
      void this.executeBypassAudit();
    });

    if (typeof window !== "undefined" && !this._holdTimerHandle) {
      this._holdTimerHandle = window.setInterval(() => {
        if (this.holdsPlacedAtMs && !this.lastSagaExecution) {
          this.renderHoldCountdown();
        }
      }, 1000);
    }

    document.querySelector("#audit-ecosystem-btn")?.addEventListener("click", () => {
      void this.runConformanceAudit("all");
    });

    document.querySelector("#audit-single-btn")?.addEventListener("click", () => {
      const custom = document.querySelector("#custom-audit-url")?.value?.trim();
      if (custom) void this.runConformanceAudit(custom);
    });
  }
}

export class App {
  static page = new ContinuityCoordinatorPage();
}

if (typeof document !== "undefined") {
  void App.page.bindDom();
}
