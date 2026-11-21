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
import {
  analyzeBudgetSensitivity,
  solveMinimalChangePlans,
  sweepAnchorHorizon,
} from "./vendor/constraint-solver/index.js";
import { ReceiptVerifier } from "./vendor/proof-verifier/index.js";
import { SagaCoordinator } from "./vendor/saga-engine/index.js";
import { CrossOriginBridgeClient } from "./vendor/cross-origin-bridge/index.js";
import {
  buildScenarioPeerHarness,
  compileUnstructuredIntake,
  createScenarioMission,
  exportMissionToIcs,
  exportVerifiableAuditBundle,
  SAMPLE_HYBRID_ICS_CALENDAR,
  SAMPLE_RAW_CONFIRMATION_EMAILS,
  SCENARIO_CATALOG,
  verifyExportedAuditBundle,
} from "./vendor/intake-compiler/index.js";
import { auditOpenAgenticSite } from "./vendor/nanda-resolver/index.js";
import { OperationLedger } from "./vendor/outcome-reconciliation/index.js";
import {
  ARBITER_MECHANISM_VERSION,
  issuePolicyBoundMandate,
  runAdversarialBypassAudit,
  SealedBidArbiter,
} from "./vendor/mandate-arbiter/index.js";
import { buildHybridTransitionPlaybook } from "./vendor/transition-playbook/index.js";
import {
  createBlindedBudgetCommitment,
  proveSpendWithinBlindedCeiling,
  verifyBlindedBudgetAttestation,
} from "./vendor/zk-budget-attestation/index.js";
import { buildFallbackOffersForRelocationNode } from "./modules/fallback-offers.js";
import { clearDemoCheckpoint, readDemoCheckpoint, recoverDemoOperations, saveDemoCheckpoint } from "./modules/demo-recovery.js";
import {
  renderChangePackageView,
  renderHoldCountdownView,
  renderKpisView,
  renderWhatIfSliderView,
} from "./modules/change-package-view.js";
import { renderMissionGraphSvg, renderMissionNodeInspector } from "./modules/graph-svg-view.js";
import { renderParetoFrontierPlot } from "./modules/pareto-svg-view.js";
import { renderScheduleGanttView } from "./modules/schedule-gantt-view.js";
import { analyzeCriticalPathSlack } from "./vendor/merkle-passport/index.js";
import {
  renderAuditorTableView,
  renderAuditTimelineView,
  renderChaosTableView,
  renderCommitmentsTableView,
  renderMandateTableView,
  renderPrivacyTableView,
} from "./modules/trust-tables-view.js";

export const SIMULATION_NOTICE = "Simulation mode — changes apply only in this browser.";

export class ContinuityCoordinatorPage {
  #missionOperationActive = false;

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
    this.pinnedNodeIds = new Set();

    this.mission = createSignatureMoveMission({ origins: this.peerOrigins });
    this.graph = MissionGraph.fromMission(this.mission);

    this.compiledProposal = null;
    this.impactReport = null;
    this.cachedNormalizedOffers = [];
    this.budgetSensitivity = null;
    this.horizonSweep = null;
    this.solverResult = null;
    this.selectedPlanId = null;
    this.saga = null;
    this.preparedOps = [];
    this.preparedProviderClients = null;
    this.preparedInSimulation = false;
    this.manualCommitmentIds = [];
    this.lastSagaExecution = null;
    this.privacyDisclosures = [];
    this.providerAlerts = [];
    this.chaosReport = null;
    this.auditorResults = [];
    this.activeMandate = null;
    this.arbiterReport = null;
    this.bypassAuditReport = null;
    this.lastConvertedBundle = null;
    this.lastPassport = null;
    this.lastSelectiveProof = null;
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

  hasLivePeerCommitments() {
    const liveIds = new Set(["moveco", "permitflow", "homeconnect", "powerflow"]);
    return (this.mission?.commitments || []).some((c) => liveIds.has(c.provider_id));
  }

  async ensureProviderClients() {
    if (this._peerProbePromise) {
      await this._peerProbePromise;
    }
    if (!this.isRelocationScenario()) {
      const baseHarness = await (this.providerHarnessPromise ||= buildScenarioPeerHarness(this.mission, {
        rippleFailureInjected: this.rippleFailureInjected,
      }));
      if (this.hasLivePeerCommitments() && (this.livePeersDetected || this.crossOriginBridgeConnected)) {
        try {
          const liveHarness = this.livePeersDetected
            ? await this.buildLiveHttpProviderClients()
            : this.crossOriginBridge.buildSagaHarness();
          const mergedClients = { ...baseHarness.clients, ...liveHarness.clients };
          const mergedVerifier = new ReceiptVerifier();
          for (const [pid, keyDesc] of baseHarness.verifier.trustedByProvider?.entries?.() || []) {
            mergedVerifier.registerTrustedProviderKey(pid, keyDesc.keyId, keyDesc.publicJwk);
          }
          for (const [pid, keyDesc] of liveHarness.verifier.trustedByProvider?.entries?.() || []) {
            mergedVerifier.registerTrustedProviderKey(pid, keyDesc.keyId, keyDesc.publicJwk);
          }
          return {
            clients: mergedClients,
            verifier: mergedVerifier,
            buildOffersForNode: baseHarness.buildOffersForNode,
            liveClientIds: new Set(Object.keys(liveHarness.clients)),
          };
        } catch {
          // Fall back cleanly to baseHarness if live peer read fails
        }
      }
      return { ...baseHarness, simulation: true };
    }

    if (this.livePeersDetected) {
      try {
        return await this.buildLiveHttpProviderClients();
      } catch {
        this.livePeersDetected = false;
      }
    }
    if (this.crossOriginBridgeConnected && this.crossOriginBridge) {
      return this.crossOriginBridge.buildSagaHarness();
    }
    if (!this.providerHarnessPromise) {
      this.providerHarnessPromise = import("./vendor/chaos-lab/index.js").then((m) =>
        m.createSimulatedProviderHarness(),
      );
    }
    return { ...await this.providerHarnessPromise, simulation: true };
  }

  probeLivePeerOrigins() {
    if (typeof fetch !== "function") return Promise.resolve(false);
    const probeGen = (this._probeGen = (this._probeGen || 0) + 1);
    this._probeAbortController?.abort?.();

    const runProbe = async () => {
      const isGithubPagesPeer = /\.github\.io$/i.test(new URL(this.peerOrigins.moveco).hostname);

      if (!isGithubPagesPeer) {
        try {
          const controller = new AbortController();
          this._probeAbortController = controller;
          const timer = setTimeout(() => controller.abort(), 900);
          const resp = await fetch(`${this.peerOrigins.moveco}/api/public-key`, { signal: controller.signal });
          clearTimeout(timer);
          if (probeGen !== this._probeGen) return this.livePeersDetected || this.crossOriginBridgeConnected;
          if (resp.ok) {
            this.livePeersDetected = true;
            this.crossOriginBridgeConnected = false;
            this.crossOriginBridge?.destroy?.();
            return true;
          }
        } catch {
          if (probeGen !== this._probeGen) return this.livePeersDetected || this.crossOriginBridgeConnected;
          this.livePeersDetected = false;
        }
      }

      if (probeGen !== this._probeGen) return this.livePeersDetected || this.crossOriginBridgeConnected;

      // Zero-server static HTTPS / browser mode: connect live Cross-Origin `postMessage` Bridge iframes!
      if (typeof document !== "undefined" && typeof window !== "undefined") {
        this.crossOriginBridge?.destroy?.();
        const bridge = new CrossOriginBridgeClient(this.peerOrigins);
        this.crossOriginBridge = bridge;
        const connected = await bridge.connectAll();
        if (probeGen !== this._probeGen) {
          bridge.destroy?.();
          return this.livePeersDetected || this.crossOriginBridgeConnected;
        }
        this.crossOriginBridgeConnected = connected;
        if (this.crossOriginBridgeConnected) {
          return true;
        }
      }
      return false;
    };

    const p = runProbe().finally(() => {
      if (this._peerProbePromise === p) {
        this._peerProbePromise = null;
      }
    });
    this._peerProbePromise = p;
    return p;
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
              releaseHold: ({ holdId, bookingRef }) =>
                callPeer("release_hold", { hold_id: holdId, booking_ref: bookingRef }),
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
      const token = this.preparedOps.find((op) =>
        op.provider_id === pid && op.state === "COMMITTED" && op.proof_verification?.trusted)?.handoff_token;
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
        webMcpToolsExposed: 8,
        simulation: this.preparedInSimulation,
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
        criticalPathSummary: analyzeCriticalPathSlack(
          this.graph,
          this.compiledProposal?.requested_change?.new_value || this.mission.anchor_date,
          this.mission.anchor_commitment_id,
        ),
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

  async #runMissionOperation(operation) {
    if (this.#missionOperationActive) {
      const reason = "Wait for the current booking operation to finish, then try again.";
      if (typeof document !== "undefined") {
        const banner = document.querySelector("#status-banner");
        if (banner) banner.textContent = reason;
      }
      return { ok: false, reason };
    }
    this.#missionOperationActive = true;
    try {
      return await operation();
    } finally {
      this.#missionOperationActive = false;
    }
  }

  switchScenario(scenarioId) {
    return this.#runMissionOperation(() => this.#switchScenario(scenarioId));
  }

  async #switchScenario(scenarioId) {
    const discard = await this.#discardPreparedPlan();
    if (!discard.ok) return discard;
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

  importCustomSchedule(rawText) {
    return this.#runMissionOperation(() => this.#importCustomSchedule(rawText));
  }

  async #importCustomSchedule(rawText) {
    let compiled;
    try {
      compiled = compileUnstructuredIntake(rawText);
    } catch (err) {
      return { ok: false, field: "rawScheduleText", reason: err.message };
    }

    const discard = await this.#discardPreparedPlan();
    if (!discard.ok) return discard;
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
    clearDemoCheckpoint();
    this.guidedDemoActive = false;
    this.lastHoldRelease = null;
    this.graph = MissionGraph.fromMission(this.mission);
    this.compiledProposal = null;
    this.impactReport = null;
    this.cachedNormalizedOffers = [];
    this.budgetSensitivity = null;
    this.horizonSweep = null;
    this.solverResult = null;
    this.selectedPlanId = null;
    this.saga = null;
    this.preparedOps = [];
    this.preparedProviderClients = null;
    this.preparedInSimulation = false;
    this.manualCommitmentIds = [];
    this.lastSagaExecution = null;
    this.privacyDisclosures = [];
    this.providerAlerts = [];
    this.latestPeerHandoffTokens = {};
    this.activeMandate = null;
    this.arbiterReport = null;
    this.bypassAuditReport = null;
    this.lastConvertedBundle = null;
    this.lastPassport = null;
    this.lastSelectiveProof = null;
    this.holdsPlacedAtMs = null;
    this.pinnedNodeIds = new Set();
    this.providerHarnessPromise = null;
    this.version += 1;

    if (this.isRelocationScenario() || this.hasLivePeerCommitments()) {
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

  resetMission(options = {}) {
    return this.#runMissionOperation(() => this.#resetMission(options));
  }

  async #resetMission(options) {
    const discard = await this.#discardPreparedPlan();
    if (!discard.ok) return discard;
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

  analyzeAndPrepareChange(requestText) {
    return this.#runMissionOperation(() => this.#analyzeAndPrepareChange(requestText));
  }

  async #analyzeAndPrepareChange(requestText) {
    const cleanText = String(requestText || "").trim();
    if (!cleanText) {
      return { ok: false, field: "requestText", reason: "Enter a natural-language change request first." };
    }

    let compiled;
    try {
      compiled = compileMissionChange(cleanText, this.mission);
    } catch (err) {
      return { ok: false, field: "requestText", reason: err.message };
    }

    const discard = await this.#discardPreparedPlan();
    if (!discard.ok) return discard;
    this.lastSagaExecution = null;
    this.lastHoldRelease = null;
    this.graph = MissionGraph.fromMission(this.mission);
    this.compiledProposal = compiled.proposal;
    this.activeMandate = await issuePolicyBoundMandate(this.mission, this.compiledProposal);
    await this._evaluateMandateArbiter();
    this.impactReport = analyzeMissionImpact(this.graph, this.compiledProposal);
    this.providerAlerts = [...compiled.securityWarnings];
    this.privacyDisclosures = [];

    const targetDate = this.compiledProposal.requested_change.new_value;
    const harness = await this.ensureProviderClients();
    const { clients } = harness;

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

      const useLivePeerClient =
        (this.livePeersDetected || this.crossOriginBridgeConnected)
        && typeof clients[contact.providerId]?.quote === "function"
        && (this.isRelocationScenario() || harness.liveClientIds?.has(contact.providerId));

      if (useLivePeerClient) {
        const quoteResp = await clients[contact.providerId].quote(node.booking_ref, targetDate);
        if (quoteResp.primary_refused && quoteResp.refusal_reason) {
          this.providerAlerts.push(`MoveCo: ${quoteResp.refusal_reason}`);
        }
        const liveRawOffers = Array.isArray(quoteResp.offers) ? quoteResp.offers : [];
        if (liveRawOffers.length > 0) {
          for (const rawOffer of liveRawOffers) {
            normalizedOffers.push(
              normalizePeerOffer({
                ...rawOffer,
                commitment_id: node.id,
                provider_id: node.provider_id,
              }),
            );
          }
        } else if (typeof harness.buildOffersForNode === "function") {
          normalizedOffers.push(...harness.buildOffersForNode(node, targetDate, this.graph));
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
    this.horizonSweep = sweepAnchorHorizon({
      graph: this.graph,
      proposal: this.compiledProposal,
      pinnedCommitmentIds: Array.from(this.pinnedNodeIds),
      buildOffersForDate: (candDate, candImpact) => {
        if (candDate === targetDate) return normalizedOffers;
        const outOffers = [];
        for (const c of candImpact.providersToContact) {
          const n = this.graph.nodes.get(c.commitmentId);
          if (!n) continue;
          if (!this.isRelocationScenario() && harness.liveClientIds?.has(n.provider_id)) {
            outOffers.push(
              ...buildFallbackOffersForRelocationNode({
                node: n,
                targetDate: candDate,
                peerOrigins: this.peerOrigins,
                rippleFailureInjected: this.rippleFailureInjected,
                providerAlerts: [],
              }).map((o) => ({ ...o, commitment_id: n.id, provider_id: n.provider_id })),
            );
          } else if (!this.isRelocationScenario() && typeof harness.buildOffersForNode === "function") {
            outOffers.push(...harness.buildOffersForNode(n, candDate, this.graph));
          } else {
            outOffers.push(
              ...buildFallbackOffersForRelocationNode({
                node: n,
                targetDate: candDate,
                peerOrigins: this.peerOrigins,
                rippleFailureInjected: this.rippleFailureInjected,
                providerAlerts: [],
              }),
            );
          }
        }
        return outOffers;
      },
    });

    return await this._solveAndPrepareFromCachedOffers(harness);
  }

  switchTargetAnchorDate(newTargetIso) {
    return this.#runMissionOperation(() => this.#switchTargetAnchorDate(newTargetIso));
  }

  #switchTargetAnchorDate(newTargetIso) {
    const cap =
      this.compiledProposal?.invariants?.maximum_budget_eur
      ?? this.mission.authoritative_invariants.maximum_budget_eur;
    const promptText = `Move ${this.mission.title} from ${this.mission.anchor_date} to ${newTargetIso}. Keep current reservations held first and stay below €${cap}.`;
    if (typeof document !== "undefined") {
      const inp = document.querySelector("#mission-input");
      if (inp) inp.value = promptText;
    }
    return this.#analyzeAndPrepareChange(promptText);
  }

  recalculateWithBudgetCeiling(newBudgetEur) {
    return this.#runMissionOperation(() => this.#recalculateWithBudgetCeiling(newBudgetEur));
  }

  async #recalculateWithBudgetCeiling(newBudgetEur) {
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

  togglePinCommitment(nodeId) {
    return this.#runMissionOperation(() => this.#togglePinCommitment(nodeId));
  }

  async #togglePinCommitment(nodeId) {
    if (!nodeId || nodeId === this.mission.anchor_commitment_id || this.lastSagaExecution) {
      return { ok: false, reason: "Cannot pin primary change anchor or post-commit node." };
    }
    if (this.pinnedNodeIds.has(nodeId)) {
      this.pinnedNodeIds.delete(nodeId);
    } else {
      this.pinnedNodeIds.add(nodeId);
    }
    if (this.compiledProposal && this.impactReport) {
      const harness = await this.ensureProviderClients();
      return await this._solveAndPrepareFromCachedOffers(harness);
    }
    this.render(`Updated date lock on ${nodeId} (${this.pinnedNodeIds.size} pinned).`);
    return { ok: true, pinned: this.pinnedNodeIds.has(nodeId) };
  }

  applyCounterfactualRelaxation() {
    return this.#runMissionOperation(() => this.#applyCounterfactualRelaxation());
  }

  async #applyCounterfactualRelaxation() {
    const rx = this.solverResult?.counterfactualPrescription;
    if (!rx?.relaxationFound || !this.compiledProposal || !this.impactReport) {
      return { ok: false, reason: "No minimal counterfactual relaxation available." };
    }
    for (const id of rx.unpinCommitmentIds || []) {
      this.pinnedNodeIds.delete(id);
    }
    if (typeof rx.relaxedBudgetEur === "number" && rx.relaxedBudgetEur > 0) {
      this.compiledProposal = {
        ...this.compiledProposal,
        invariants: {
          ...this.compiledProposal.invariants,
          maximum_budget_eur: rx.relaxedBudgetEur,
        },
      };
      if (typeof document !== "undefined") {
        const slider = document.querySelector("#whatif-budget-slider");
        const valEl = document.querySelector("#whatif-budget-val");
        if (slider) slider.value = String(Math.ceil(rx.relaxedBudgetEur));
        if (valEl) valEl.textContent = `€${rx.relaxedBudgetEur.toFixed(2)}`;
      }
    }
    const harness = await this.ensureProviderClients();
    return await this._solveAndPrepareFromCachedOffers(harness);
  }

  async _solveAndPrepareFromCachedOffers(harness) {
    const discard = await this.#discardPreparedPlan();
    if (!discard.ok) return discard;
    this.solverResult = solveMinimalChangePlans({
      graph: this.graph,
      proposal: this.compiledProposal,
      impact: this.impactReport,
      normalizedOffers: this.cachedNormalizedOffers,
      pinnedCommitmentIds: Array.from(this.pinnedNodeIds),
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

    const preparation = await this.#preparePlan(this.solverResult.recommendedPlanId, harness);
    if (!preparation.ok) return preparation;

    const selected = this.getSelectedPlan();
    try {
      const capEur = Math.max(1, Math.floor(Number(this.compiledProposal.invariants.maximum_budget_eur)));
      const zkCom = await createBlindedBudgetCommitment({
        ceilingEur: capEur,
        missionId: this.mission.mission_id,
      });
      const zkPrf = await proveSpendWithinBlindedCeiling({
        publicCommitment: zkCom.publicCommitment,
        privateOpening: zkCom.privateOpening,
        spentEur: selected.metrics.totalMissionCostEur,
      });
      this.zkBudgetAttestation = zkPrf.ok ? zkPrf.attestation : null;
      this.zkBudgetVerification = this.zkBudgetAttestation
        ? await verifyBlindedBudgetAttestation(this.zkBudgetAttestation)
        : null;
    } catch {
      this.zkBudgetAttestation = null;
      this.zkBudgetVerification = null;
    }

    this.version += 1;
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
      simulation: this.preparedInSimulation,
      unaffectedCommitmentsCount: selected.metrics.unchangedCount,
      providerAlerts: this.providerAlerts,
    };
  }

  buildFallbackOffersForNode(node, targetDate) {
    return buildFallbackOffersForRelocationNode({
      node,
      targetDate,
      peerOrigins: this.peerOrigins,
      rippleFailureInjected: this.rippleFailureInjected,
      providerAlerts: this.providerAlerts,
    });
  }

  prepareSelectedPlan(planId, existingHarness = null) {
    return this.#runMissionOperation(() => this.#preparePlan(planId, existingHarness));
  }

  async #preparePlan(planId, existingHarness) {
    if (!this.solverResult?.feasible) {
      return { ok: false, field: "planId", reason: "Analyze a change request first so feasible plans exist." };
    }
    const chosen = this.solverResult.plans.find((p) => p.plan_id === planId);
    if (!chosen) {
      return { ok: false, field: "planId", reason: `Plan "${planId}" is not among current feasible plans.` };
    }

    const discard = await this.#discardPreparedPlan();
    if (!discard.ok) return discard;

    this.lastHoldRelease = null;
    this.graph = MissionGraph.fromMission(this.mission);
    for (const id of this.impactReport.unaffectedIds) {
      this.graph.updateNode(id, { visual_state: "UNCHANGED" });
    }
    for (const p of chosen.preservedCommitments) {
      this.graph.updateNode(p.commitment_id, { visual_state: "UNCHANGED" });
    }

    const { clients, verifier, liveClientIds, simulation } = existingHarness || (await this.ensureProviderClients());
    const requiresHuman = new Set();
    if (this.activeScenarioId === "custom_intake") {
      for (const item of chosen.operations) {
        if (!liveClientIds?.has(item.offer.provider_id)) requiresHuman.add(item.commitment_id);
      }
      // A dependent operation cannot use an estimated date for a manually confirmed prerequisite.
      for (const id of requiresHuman) {
        for (const edge of this.graph.edges) {
          if (edge.from === id && chosen.operations.some((op) => op.commitment_id === edge.to)) requiresHuman.add(edge.to);
        }
      }
    }
    this.manualCommitmentIds = [...requiresHuman];
    this.selectedPlanId = chosen.plan_id;
    this.preparedProviderClients = clients;
    this.preparedInSimulation = Boolean(simulation);
    this.saga = new SagaCoordinator({ graph: this.graph, receiptVerifier: verifier });

    const prep = await this.saga.preparePlan({
      missionId: this.mission.mission_id,
      plan: { ...chosen, operations: chosen.operations.filter((op) => !requiresHuman.has(op.commitment_id)) },
      maximumBudgetEur: this.compiledProposal.invariants.maximum_budget_eur,
      mandateSha256: this.activeMandate?.mandate_sha256 || undefined,
      providerClients: clients,
    });

    if (!prep.ok) {
      this.preparedOps = prep.operations;
      this.version += 1;
      this.render(prep.reason);
      return { ok: false, field: "planId", reason: prep.reason };
    }

    this.preparedOps = prep.operations;
    for (const id of requiresHuman) this.graph.updateNode(id, { visual_state: "NEEDS_USER" });
    this.holdsPlacedAtMs = this.preparedOps.some((o) => o.hold_id) ? Date.now() : null;
    this.version += 1;
    this.render(requiresHuman.size
      ? `${this.preparedOps.length} changes ready for approval. ${requiresHuman.size} require provider confirmation using the checklist.`
      : `Selected ${chosen.label} (${this.preparedOps.length} changes ready for approval).`);
    return {
      ok: true,
      version: this.version,
      selectedPlanId: this.selectedPlanId,
      preparedOperationsCount: this.preparedOps.length,
      simulation: this.preparedInSimulation,
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
      nonce: "mc_ovf_20271119",
    });
    await arbiter.commitSealedBid({
      providerId: "alpine_heavy_freight",
      providerName: "AlpineExpress White-Glove Van (Sealed Adapter)",
      window: "10:00–15:00",
      askCents: 54000,   // €540.00 catalogue ask
      floorCents: 49500, // €495.00 private floor (> €466 slice allowance -> NO_AGREEMENT without leaking floor!)
      nonce: "alp_fr_20271119",
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

  async runGuidedInteractiveDemo() {
    const prep = await this.#runMissionOperation(() => this.#prepareGuidedDemo());
    if (prep.ok && typeof document !== "undefined") {
      document.querySelector("#approve-commit-btn")?.scrollIntoView({ block: "center" });
      document.querySelector("#approve-commit-btn")?.click();
    }
    return prep;
  }

  async #prepareGuidedDemo() {
    if (this._peerProbePromise) {
      await this._peerProbePromise;
    }
    const switched = await this.#switchScenario("home_relocation");
    if (!switched.ok) return switched;
    const reset = await this.#resetMission({ rippleFailureInjected: true });
    if (!reset.ok) return reset;
    this.guidedDemoActive = true;
    const text =
      (typeof document !== "undefined" && document.querySelector("#mission-input")?.value)
      || "Move my relocation from Tuesday to Friday under €700 without cancelling anything.";
    return await this.#analyzeAndPrepareChange(text);
  }

  async loadSampleAdkConfig() {
    const { SAMPLE_GOOGLE_ADK_CONFIG } = await import("./vendor/adk-hocon-converter/index.js");
    return SAMPLE_GOOGLE_ADK_CONFIG;
  }

  async runAdkConversion(rawJsonText) {
    const sumEl = typeof document !== "undefined" ? document.querySelector("#adk-equivalence-summary") : null;
    const outEl = typeof document !== "undefined" ? document.querySelector("#adk-output-textarea") : null;
    try {
      const { convertAgentFrameworkToHoconBundle } = await import("./vendor/adk-hocon-converter/index.js");
      const res = await convertAgentFrameworkToHoconBundle(rawJsonText);
      this.lastConvertedBundle = res;
      if (sumEl) {
        const eq = res.equivalenceReport;
        sumEl.textContent = `✓ Semantic Equivalence Verified (${eq.sourceFramework} → Neuro SAN HOCON): ${eq.emittedAgentsCount}/${eq.sourceAgentsCount} agents preserved · front_man="${eq.frontAgentPreserved}" · ${eq.allowedPeerOriginsCount} allowed peer origin(s) · ${eq.networkDigest}`;
      }
      if (outEl) {
        outEl.value = JSON.stringify(
          {
            "agent-manifest.json": res.manifestJson,
            [`${res.networkName}.network.json`]: res.networkJson,
          },
          null,
          2,
        );
      }
      if (typeof document !== "undefined") {
        const b1 = document.querySelector("#adk-dl-network-btn");
        const b2 = document.querySelector("#adk-dl-manifest-btn");
        if (b1) b1.hidden = false;
        if (b2) b2.hidden = false;
      }
      return res;
    } catch (err) {
      if (sumEl) sumEl.textContent = `✕ Conversion Rejected: ${err.message}`;
      return { ok: false, error: err.message };
    }
  }

  checkCommitPackage(args) {
    if (this.#missionOperationActive || !this.saga || !this.preparedOps.length
      || !this.preparedOps.every((op) => op.state === "AWAITING_APPROVAL")) {
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
    const expectedTotal = Number(args.expectedTotalEur);
    if (!Number.isFinite(expectedTotal) || Math.round(expectedTotal * 100) !== Math.round(plan.metrics.totalMissionCostEur * 100)) {
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

  get canReleasePreparedHolds() {
    return this.preparedOps.some((op) => ["AWAITING_APPROVAL", "PREPARED"].includes(op.state) || op.hold_release_unconfirmed);
  }

  async #discardPreparedPlan() {
    if (!this.canReleasePreparedHolds || !this.saga) return { ok: true, releasedHoldIds: [], releasedOperationIds: [] };
    const result = await this.saga.releasePreparedHolds({ providerClients: this.preparedProviderClients });
    this.version += 1;
    this.preparedOps = result.ok ? [] : result.operations || this.preparedOps;
    this.holdsPlacedAtMs = null;
    if (!result.ok) this.render(result.reason);
    return result;
  }

  releasePreparedHolds() {
    return this.#runMissionOperation(() => this.#releasePreparedHolds());
  }

  async #releasePreparedHolds() {
    if (!this.canReleasePreparedHolds) return { ok: false, reason: "No active holds or prepared changes to release." };
    const res = await this.#discardPreparedPlan();
    this.lastHoldRelease = res;
    if (!res.ok) {
      this.render(res.reason);
      return res;
    }

    this.selectedPlanId = null;
    this.solverResult = null;
    this.compiledProposal = null;
    this.impactReport = null;
    this.manualCommitmentIds = [];
    this.render(`Released ${res.releasedHoldIds.length} temporary holds at no cost. Your original bookings remain in place.`);
    return {
      ok: true,
      feeChargedEur: 0,
      releasedCount: res.releasedHoldIds.length,
      simulation: this.preparedInSimulation,
      releasedOperationIds: res.releasedOperationIds,
      version: this.version,
    };
  }

  async commitPreparedPackage(args) {
    const check = this.checkCommitPackage(args);
    if (!check.ok) {
      return { ok: false, field: check.field, reason: check.reason };
    }
    return this.#runMissionOperation(() => this.#commitPreparedPackage(check.plan));
  }

  async #commitPreparedPackage(plan) {
    if (this.guidedDemoActive && !this.preparedInSimulation) {
      saveDemoCheckpoint({
        peerOrigins: this.peerOrigins,
        operations: this.preparedOps,
        solverResult: this.solverResult,
        selectedPlanId: this.selectedPlanId,
        compiledProposal: this.compiledProposal,
      });
    }
    const approvals = await this.saga.approvePreparedOperations(this.preparedOps.map((o) => o.operation_id));
    let execResult = await this.saga.executeApprovedSaga({
      approvedItems: approvals.map((a) => ({ operationId: a.operation_id, approvalId: a.approval_id })),
      providerClients: this.preparedProviderClients,
    });
    const verified = execResult.status === "ALL_COMMITTED_AND_VERIFIED";
    if (verified && this.manualCommitmentIds.length) {
      execResult = { ...execResult, status: "MANUAL_FOLLOWUP_REQUIRED" };
    }
    this.lastSagaExecution = execResult;
    this.preparedOps = execResult.operations;
    this.holdsPlacedAtMs = null;
    this.applyConfirmedSchedule(execResult.operations);
    this.version += 1;

    this.render(
      execResult.status === "ALL_COMMITTED_AND_VERIFIED"
        ? this.preparedInSimulation
          ? `${execResult.committedOperationIds.length} demo bookings changed. ${plan.metrics.unchangedCount} kept their dates.`
          : `Verified & Committed: ${execResult.committedOperationIds.length} operations reconciled with Ed25519 provider receipts; ${plan.metrics.unchangedCount} unaffected bookings preserved intact.`
        : verified
          ? `${execResult.committedOperationIds.length} changes verified. ${this.manualCommitmentIds.length} still need provider confirmation.`
          : `Confirmation stopped: ${execResult.partialFailureReason}`,
    );

    return {
      ok: verified,
      manualFollowupCount: this.manualCommitmentIds.length,
      version: this.version,
      sagaStatus: execResult.status,
      simulation: this.preparedInSimulation,
      committedCount: execResult.committedOperationIds.length,
      preservedCount: plan.metrics.unchangedCount,
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

  applyConfirmedSchedule(operations) {
    const anchor = this.graph.nodes.get(this.mission.anchor_commitment_id);
    this.mission.anchor_date = anchor.scheduled_date;
    for (const op of operations) {
      if (op.state !== "COMMITTED") continue;
      const cmt = this.mission.commitments.find((c) => c.id === op.commitment_id);
      if (cmt) cmt.scheduled_date = op.proposed_date;
      if (cmt && op.window) cmt.window = op.window;
    }
  }

  async recoverGuidedDemo() {
    if (this.#missionOperationActive || !this.isRelocationScenario()) return;
    const record = readDemoCheckpoint(this.peerOrigins);
    if (!record) return;
    return this.#runMissionOperation(() => this.#recoverGuidedDemo(record));
  }

  async #recoverGuidedDemo(record) {
    this._recovering = true;
    try {
      const candidate = this.livePeersDetected || this.crossOriginBridgeConnected ? await this.ensureProviderClients() : null;
      const harness = this.livePeersDetected || this.crossOriginBridgeConnected ? candidate : null;
      const mission = createScenarioMission("home_relocation", { origins: this.peerOrigins });
      const graph = MissionGraph.fromMission(mission);
      const impact = analyzeMissionImpact(graph, record.compiledProposal);
      const operations = await recoverDemoOperations(record, graph, harness);
      if (!operations) return;
      this.mission = mission;
      this.graph = graph;
      this.compiledProposal = record.compiledProposal;
      this.impactReport = impact;
      this.solverResult = record.solverResult;
      this.selectedPlanId = record.selectedPlanId;
      this.saga = new SagaCoordinator({ graph, receiptVerifier: harness?.verifier });
      this.preparedInSimulation = false;
      this.preparedOps = operations;
      const committedOperationIds = operations.filter((op) => op.state === "COMMITTED").map((op) => op.operation_id);
      const allVerified = committedOperationIds.length === operations.length;
      this.lastSagaExecution = {
        operations,
        committedOperationIds,
        status: allVerified ? "ALL_COMMITTED_AND_VERIFIED" : "RECOVERY_UNCONFIRMED",
        partialFailureReason: allVerified ? null : `${committedOperationIds.length} of ${operations.length} changes verified. Check any unconfirmed provider before starting a new change.`,
        recovered: true,
      };
      this.applyConfirmedSchedule(operations);
      this.version += 1;
      this.render(allVerified ? "Booking changes recovered and checked with the providers." : this.lastSagaExecution.partialFailureReason);
    } finally {
      this._recovering = false;
    }
  }

  async executeChaosSuite() {
    const { runAllChaosScenarios } = await import("./vendor/chaos-lab/index.js");
    this.chaosReport = await runAllChaosScenarios();
    this.renderChaosTable();
    return this.chaosReport;
  }

  async runConformanceAudit(targetUrlOrAll = "all") {
    const selfBase =
      typeof location !== "undefined"
        ? new URL("./", location.href).href
        : "http://127.0.0.1:8080/";

    const urls = Array.isArray(targetUrlOrAll)
      ? targetUrlOrAll
      : !targetUrlOrAll || targetUrlOrAll === "all"
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

  get canDownloadUpdatedCalendar() {
    return this.lastSagaExecution?.status === "ALL_COMMITTED_AND_VERIFIED";
  }

  downloadUpdatedIcsCalendar() {
    if (!this.canDownloadUpdatedCalendar) {
      return { ok: false, reason: "The updated calendar is available after all changes are verified." };
    }
    const ics = exportMissionToIcs(this.mission, this.graph, this.lastSagaExecution.operations);
    this.triggerBrowserDownload(`${this.mission.mission_id}.ics`, "text/calendar;charset=utf-8", ics);
    return { ok: true, bytes: ics.length };
  }

  getTransitionPlaybook() {
    const plan = this.getSelectedPlan();
    if (!plan) {
      return { ok: false, reason: "Analyze and prepare a change plan first so the execution playbook can be built." };
    }
    const playbook = buildHybridTransitionPlaybook({
      mission: this.mission,
      plan,
      preparedOps: this.preparedOps,
      manualCommitmentIds: this.activeScenarioId === "custom_intake" ? this.manualCommitmentIds : null,
    });
    return { ok: true, ...playbook };
  }

  downloadTransitionPlaybook() {
    const res = this.getTransitionPlaybook();
    if (!res.ok) return res;
    this.triggerBrowserDownload(
      `${this.mission.mission_id}-hold-first-playbook.md`,
      "text/markdown;charset=utf-8",
      res.markdown,
    );
    return {
      ok: true,
      bytes: res.markdown.length,
      agenticStepsCount: res.agenticStepsCount,
      legacyStepsCount: res.legacyStepsCount,
      avoidedPenaltiesTotalEur: res.avoidedPenaltiesTotalEur,
    };
  }

  async verifyCommittedNodeReceiptLive(nodeId) {
    const matchingOp = this.preparedOps.find((o) => o.commitment_id === nodeId);
    if (!matchingOp?.receipt_envelope) {
      return { ok: false, reason: "No signed receipt envelope attached to this node." };
    }
    const pid = matchingOp.provider_id || matchingOp.receipt_envelope?.receipt_body?.provider_id;
    const verifier = this.saga?.receiptVerifier;
    if (!pid || !verifier) {
      return { ok: false, reason: "No pinned ReceiptVerifier active for this session." };
    }
    const t0 = performance.now();
    const res = await verifier.verifyReceipt(pid, matchingOp.receipt_envelope);
    const elapsedMs = Number((performance.now() - t0).toFixed(2));
    return {
      ok: res.valid,
      elapsedMs,
      providerId: pid,
      keyId: matchingOp.receipt_envelope?.proof?.key_id || null,
      payloadSha256: matchingOp.receipt_envelope?.proof?.payload_sha256 || null,
      level: res.level,
      detail: res.detail || res.summary,
    };
  }

  async generateSelectivePassportProof(commitmentId = null) {
    const { issueVerifiableMissionPassport, createSelectiveDisclosureProof, verifySelectiveDisclosureProof } =
      await import("./vendor/merkle-passport/index.js");
    const targetId =
      commitmentId
      || (typeof document !== "undefined" ? document.querySelector("#passport-commitment-select")?.value : null)
      || this.mission.anchor_commitment_id
      || this.mission.commitments[0]?.id;
    const trustedProviderKeys = {};
    const verifier = this.saga?.receiptVerifier;
    if (verifier?.trustedByProvider) {
      for (const [pid, meta] of verifier.trustedByProvider.entries()) {
        trustedProviderKeys[pid] = { keyId: meta.keyId, publicJwk: meta.publicJwk };
      }
    }
    this.lastPassport = await issueVerifiableMissionPassport({
      mission: this.mission,
      graph: this.graph,
      operations: this.lastSagaExecution?.operations || this.preparedOps || [],
      trustedProviderKeys,
      zkBudgetAttestation: this.lastZkBudgetAttestation,
    });
    this.lastSelectiveProof = await createSelectiveDisclosureProof(this.lastPassport, targetId);
    const check = await verifySelectiveDisclosureProof(this.lastSelectiveProof);

    if (typeof document !== "undefined") {
      const outEl = document.querySelector("#passport-proof-output");
      const statusEl = document.querySelector("#passport-status-banner");
      const dlBtn = document.querySelector("#passport-download-btn");
      if (outEl) outEl.value = JSON.stringify(this.lastSelectiveProof, null, 2);
      if (dlBtn) dlBtn.hidden = false;
      if (statusEl) {
        statusEl.textContent = `✓ RFC 6962 Selective-Disclosure Proof Issued & Verified: Disclosed "${targetId}" (${this.lastSelectiveProof.audit_path.length} Merkle hop(s) → root ${this.lastSelectiveProof.merkle_root_sha256.slice(0, 16)}…) · ${this.lastSelectiveProof.blinded_siblings_count} sibling commitment(s) 100% salted & blinded.`;
      }
    }
    return { ok: check.valid, proof: this.lastSelectiveProof, verification: check };
  }

  async verifyCurrentSelectiveProof() {
    const { verifySelectiveDisclosureProof } = await import("./vendor/merkle-passport/index.js");
    if (!this.lastSelectiveProof) {
      await this.generateSelectivePassportProof();
    }
    const check = await verifySelectiveDisclosureProof(this.lastSelectiveProof);
    if (typeof document !== "undefined") {
      const statusEl = document.querySelector("#passport-status-banner");
      if (statusEl) {
        statusEl.textContent = check.valid
          ? `✓ Selective-Disclosure Proof Verified: RFC 6962 Merkle root ${check.recomputedRootHex?.slice(0, 16)}… intact · ${check.blindedSiblingsCount} sibling(s) remain hidden${check.receiptValid ? " · Ed25519 provider receipt verified" : ""}${check.zkBudgetValid ? " · ZK budget ladder verified" : ""}.`
          : `✕ Selective-Disclosure Tamper Caught: ${check.errors.join(" | ")}`;
      }
    }
    return check;
  }

  async simulateSelectiveProofTamper() {
    const { verifySelectiveDisclosureProof } = await import("./vendor/merkle-passport/index.js");
    if (!this.lastSelectiveProof) {
      await this.generateSelectivePassportProof();
    }
    const tampered = JSON.parse(JSON.stringify(this.lastSelectiveProof));
    tampered.disclosed_commitment.final_date = "2027-12-30";
    const check = await verifySelectiveDisclosureProof(tampered);
    if (typeof document !== "undefined") {
      const statusEl = document.querySelector("#passport-status-banner");
      if (statusEl) {
        statusEl.textContent = !check.valid
          ? `✓ Tamper Attack Caught by RFC 6962 Verifier: Forged date "2027-12-30" broke leaf 0x00 digest & presentation JCS SHA-256 (${check.errors[0]}).`
          : "Unexpected: tamper not caught.";
      }
    }
    return check;
  }

  populatePassportCommitmentSelect() {
    if (typeof document === "undefined") return;
    const sel = document.querySelector("#passport-commitment-select");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = (this.mission.commitments || [])
      .map(
        (c) =>
          `<option value="${this.escapeXml(c.id)}">${this.escapeXml(`${c.title} (${c.booking_ref})`)}</option>`,
      )
      .join("");
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) {
      sel.value = prev;
    }
  }

  async buildCurrentAuditBundle() {
    return await exportVerifiableAuditBundle({
      mission: this.mission,
      selectedPlan: this.getSelectedPlan(),
      operations: this.preparedOps,
      auditLog: this.saga?.ledger?.getHistory() || [],
      trustedProviderKeys: this.saga?.receiptVerifier?.trustedByProvider || null,
      zkBudgetAttestation: this.zkBudgetAttestation || null,
    });
  }

  async downloadSignedAuditBundle() {
    const bundle = await this.buildCurrentAuditBundle();
    const text = `${JSON.stringify(bundle, null, 2)}\n`;
    this.triggerBrowserDownload(`${this.mission.mission_id}-audit-bundle.json`, "application/json;charset=utf-8", text);
    return bundle;
  }

  async verifyCurrentAuditBundle() {
    const bundle = await this.buildCurrentAuditBundle();
    const report = await verifyExportedAuditBundle(bundle, {
      externalPinnedKeys: this.saga?.receiptVerifier?.trustedByProvider || undefined,
    });
    const el = typeof document !== "undefined" ? document.querySelector("#bundle-verify-status") : null;
    if (el) {
      el.hidden = false;
      const zkNote = report.zkBudgetValid
        ? " · ZK Hash-Ladder: VERIFIED (ceiling hidden)"
        : "";
      el.textContent = report.valid
        ? `✓ Zero-Trust Audit Bundle Verified: JCS SHA-256 ${report.computedBundleSha256.slice(0, 16)}… · ${report.sagaEventsChecked} hash-chained Saga event(s) · ${report.receiptsVerifiedCount}/${report.receiptsTotalCommitted} Ed25519 provider receipt(s) verified (${report.keyTrustMode})${zkNote}.`
        : `✕ Bundle Verification Failed: ${report.errors.join(" | ")}`;
    }
    return report;
  }

  async simulateBundleTamperAttack() {
    const bundle = await this.buildCurrentAuditBundle();
    const tampered = JSON.parse(JSON.stringify(bundle));
    if (tampered.operations?.[0]?.receipt_envelope?.receipt_body) {
      const prev = Number(tampered.operations[0].receipt_envelope.receipt_body.total_charged_eur || 0);
      tampered.operations[0].receipt_envelope.receipt_body.total_charged_eur = Number((prev + 0.01).toFixed(2));
    } else if (tampered.selected_plan?.metrics) {
      tampered.selected_plan.metrics.totalMissionCostEur = Number(
        (Number(tampered.selected_plan.metrics.totalMissionCostEur || 0) + 0.01).toFixed(2),
      );
    }
    if (Array.isArray(tampered.immutable_saga_log) && tampered.immutable_saga_log.length > 0) {
      tampered.immutable_saga_log[0].reason += " [forged]";
    }
    if (tampered.zk_budget_attestation) {
      tampered.zk_budget_attestation.publicSpentUnitsEur =
        Number(tampered.zk_budget_attestation.publicSpentUnitsEur || 0) + 500;
    }
    const report = await verifyExportedAuditBundle(tampered, {
      externalPinnedKeys: this.saga?.receiptVerifier?.trustedByProvider || undefined,
    });
    const el = typeof document !== "undefined" ? document.querySelector("#bundle-verify-status") : null;
    if (el) {
      el.hidden = false;
      el.textContent = !report.valid
        ? `🛡 In-Memory €0.01 Tamper Attack Caught Instantly (${report.errors.length} cryptographic alarms): ${report.errors.join(" · ")} — Live mission untouched.`
        : "Unexpected: tamper attack was not detected.";
    }
    return report;
  }

  /* ------------------------------ UI RENDERING ------------------------------ */

  render(bannerMessage = "") {
    if (typeof document === "undefined") return;

    const badge = document.querySelector("#transport-badge");
    if (badge) {
      badge.textContent = this.preparedInSimulation
        ? "Simulation mode"
        : this._peerProbePromise
          ? "Connecting to the provider sites…"
          : this.livePeersDetected
            ? "Live · 4 provider sites connected"
            : this.crossOriginBridgeConnected
              ? "Live · 4 provider sites connected · signed receipts"
              : "Simulation mode";
      badge.classList.toggle("live", !this.preparedInSimulation && (this.livePeersDetected || this.crossOriginBridgeConnected));
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
    }

    const rippleBtn = document.querySelector("#inject-ripple-btn");
    if (rippleBtn) {
      rippleBtn.textContent = this.rippleFailureInjected
        ? "Provider failure on — click to turn off"
        : "Simulate a provider failure";
      rippleBtn.classList.toggle("ripple-active", this.rippleFailureInjected);
    }

    if (bannerMessage) {
      const sb = document.querySelector("#status-banner");
      if (sb) sb.textContent = this.preparedInSimulation ? `${SIMULATION_NOTICE} ${bannerMessage}` : bannerMessage;
    }

    const plan = this.getSelectedPlan();
    const readyToApprove =
      Boolean(plan)
      && this.preparedOps.length > 0
      && this.preparedOps.every((o) => o.state === "AWAITING_APPROVAL");
    const approveBtn = document.querySelector("#approve-commit-btn");
    if (approveBtn) {
      approveBtn.disabled = !readyToApprove;
    }
    const releaseBtn = document.querySelector("#release-holds-btn");
    if (releaseBtn) {
      releaseBtn.disabled = !this.canReleasePreparedHolds;
    }

    const exportBar = document.querySelector("#export-actions-bar");
    if (exportBar) {
      exportBar.hidden = !this.compiledProposal;
    }
    const calendarButton = document.querySelector("#export-ics-btn");
    if (calendarButton) {
      calendarButton.hidden = !this.canDownloadUpdatedCalendar;
    }

    this.renderHoldCountdown();
    this.renderWhatIfSlider();
    this.renderKpis(plan);
    this.renderGraphSvg();
    this.renderNodeInspector(this.selectedNodeId);
    if (!this._bootGanttPainted && typeof requestAnimationFrame === "function") {
      this._bootGanttPainted = true;
      requestAnimationFrame(() => {
        renderScheduleGanttView(this);
        this.populatePassportCommitmentSelect();
      });
    } else {
      renderScheduleGanttView(this);
      this.populatePassportCommitmentSelect();
    }
    this.renderChangePackage(plan);
    this.renderCommitmentsTable();
    this.renderPrivacyTable();
    this.renderAuditTimeline();
    this.renderMandateTable();
  }

  renderHoldCountdown() {
    renderHoldCountdownView(this);
  }

  renderWhatIfSlider() {
    renderWhatIfSliderView(this);
  }

  renderParetoPlot(curCapEur) {
    renderParetoFrontierPlot(this, curCapEur);
  }

  renderKpis(plan) {
    renderKpisView(this, plan);
  }

  renderGraphSvg() {
    renderMissionGraphSvg(this);
  }

  renderNodeInspector(nodeId) {
    renderMissionNodeInspector(this, nodeId);
  }

  renderChangePackage(plan) {
    renderChangePackageView(this, plan);
  }

  renderCommitmentsTable() {
    renderCommitmentsTableView(this);
  }

  renderPrivacyTable() {
    renderPrivacyTableView(this);
  }

  renderAuditTimeline() {
    renderAuditTimelineView(this);
  }

  renderMandateTable() {
    renderMandateTableView(this);
  }

  renderChaosTable() {
    renderChaosTableView(this);
  }

  renderAuditorTable() {
    renderAuditorTableView(this);
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
    // Start probing cross-origin peers immediately WITHOUT blocking synchronous DOM listener registration!
    const initialProbe = this.probeLivePeerOrigins();
    this.render();

    const themeToggleBtn = document.querySelector("#theme-toggle-btn");
    try {
      const savedTheme = typeof window !== "undefined" ? window.sessionStorage?.getItem("nsweb-continuity-theme") : null;
      const initialTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
      document.documentElement.setAttribute("data-theme", initialTheme);
      themeToggleBtn?.setAttribute("aria-pressed", String(initialTheme === "dark"));
    } catch {}
    themeToggleBtn?.addEventListener("click", () => {
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      themeToggleBtn.setAttribute("aria-pressed", String(next === "dark"));
      try {
        window.sessionStorage?.setItem("nsweb-continuity-theme", next);
      } catch {}
    });

    document.querySelector("#inject-ripple-btn")?.addEventListener("click", () => {
      void this.resetMission({ rippleFailureInjected: !this.rippleFailureInjected });
    });

    document.querySelector("#reset-mission-btn")?.addEventListener("click", () => {
      void this.resetMission({ rippleFailureInjected: false, resetToDefaultScenario: false });
    });

    document.querySelector("#copy-permalink-btn")?.addEventListener("click", async () => {
      const u = new URL(window.location.href);
      u.search = "";
      u.hash = "workspace";
      if (this.activeScenarioId && this.activeScenarioId !== "custom_intake") {
        u.searchParams.set("scenario", this.activeScenarioId);
      }
      if (this.rippleFailureInjected) {
        u.searchParams.set("ripple", "1");
      }
      const btn = document.querySelector("#copy-permalink-btn");
      try {
        await navigator.clipboard.writeText(u.href);
        if (btn) btn.textContent = "✓ Link copied";
        setTimeout(() => {
          if (btn) btn.textContent = "Copy scenario link";
        }, 1800);
      } catch {
        this.render(`Shareable scenario URL: ${u.href}`);
      }
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
      if (fb) fb.textContent = "Loaded 5 sample booking confirmation emails — click Build my mission.";
    });

    document.querySelector("#load-hybrid-ics-btn")?.addEventListener("click", () => {
      const ta = document.querySelector("#raw-intake-textarea");
      if (ta) ta.value = SAMPLE_HYBRID_ICS_CALENDAR;
      const fb = document.querySelector("#intake-feedback");
      if (fb) {
        fb.textContent =
          "Loaded 4-event Hybrid RFC 5545 .ics (2 Open Agentic Web peers + 1 legacy email vendor + 1 multi-day storage) — click Build my mission.";
      }
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

    // Export .ics, Hold-First Playbook & Signed Audit Bundle
    document.querySelector("#export-ics-btn")?.addEventListener("click", () => {
      this.downloadUpdatedIcsCalendar();
    });
    document.querySelector("#export-playbook-btn")?.addEventListener("click", () => {
      this.downloadTransitionPlaybook();
    });
    document.querySelector("#export-audit-btn")?.addEventListener("click", () => {
      void this.downloadSignedAuditBundle();
    });

    // Direct Drag-and-Drop .ics / .json / .txt schedule intake on the Workspace composer card
    const dropzone = document.querySelector("#composer-dropzone");
    if (dropzone) {
      dropzone.addEventListener("dragover", (ev) => {
        if (!ev.dataTransfer?.types?.includes?.("Files")) return;
        ev.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", (ev) => {
        if (!dropzone.contains(ev.relatedTarget)) {
          dropzone.classList.remove("is-dragover");
        }
      });
      dropzone.addEventListener("drop", async (ev) => {
        const file = ev.dataTransfer?.files?.[0];
        dropzone.classList.remove("is-dragover");
        if (!file) return;
        ev.preventDefault();
        const text = await file.text();
        const ta = document.querySelector("#raw-intake-textarea");
        if (ta) ta.value = text;
        await this.importCustomSchedule(text);
      });
    }

    document.querySelector("#release-holds-btn")?.addEventListener("click", () => {
      void this.releasePreparedHolds();
    });

    document.querySelector("#verify-bundle-btn")?.addEventListener("click", () => {
      void this.verifyCurrentAuditBundle();
    });

    document.querySelector("#tamper-bundle-btn")?.addEventListener("click", () => {
      void this.simulateBundleTamperAttack();
    });

    document.querySelector("#passport-generate-btn")?.addEventListener("click", () => {
      void this.generateSelectivePassportProof();
    });
    document.querySelector("#passport-verify-btn")?.addEventListener("click", () => {
      void this.verifyCurrentSelectiveProof();
    });
    document.querySelector("#passport-tamper-btn")?.addEventListener("click", () => {
      void this.simulateSelectiveProofTamper();
    });
    document.querySelector("#passport-download-btn")?.addEventListener("click", () => {
      if (!this.lastSelectiveProof) return;
      const cid = this.lastSelectiveProof.disclosed_commitment?.commitment_id || "booking";
      this.triggerBrowserDownload(
        `${this.mission.mission_id}-${cid}-selective-proof.json`,
        "application/json;charset=utf-8",
        JSON.stringify(this.lastSelectiveProof, null, 2),
      );
    });

    // Progressive-enhancement Web Speech voice dictation (shown only when supported by browser)
    const SpeechRec =
      typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    const voiceBtn = document.querySelector("#voice-dictate-btn");
    if (SpeechRec && voiceBtn) {
      voiceBtn.hidden = false;
      let activeRec = null;
      voiceBtn.addEventListener("click", () => {
        if (activeRec) {
          activeRec.stop();
          activeRec = null;
          voiceBtn.textContent = "Dictate change";
          return;
        }
        const rec = new SpeechRec();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        activeRec = rec;
        voiceBtn.textContent = "Listening…";
        rec.onresult = (ev) => {
          const spoken = ev.results?.[0]?.[0]?.transcript || "";
          const ta = document.querySelector("#mission-input");
          if (ta && spoken.trim()) {
            ta.value = spoken.trim();
            void this.analyzeAndPrepareChange(ta.value);
          }
        };
        rec.onend = () => {
          activeRec = null;
          voiceBtn.textContent = "Dictate change";
        };
        rec.onerror = () => {
          activeRec = null;
          voiceBtn.textContent = "Dictate change";
        };
        rec.start();
      });
    }

    document.querySelector("#approve-commit-btn")?.addEventListener("click", async () => {
      const plan = this.getSelectedPlan();
      if (!plan) return;
      const args = {
        planId: plan.plan_id,
        expectedVersion: this.version,
        expectedTotalEur: plan.metrics.totalMissionCostEur,
      };
      if (!window.__continuityReviewHook) {
        this.render("Approval is still loading. Try again in a moment.");
        return;
      }
      try {
        const ok = await window.__continuityReviewHook([
          {
            action: "commit_prepared_change_package",
            origin: window.location.origin,
            effect: "irreversible",
            arguments: args,
          },
        ]);
        if (!ok) return;
        const result = await this.commitPreparedPackage(args);
        if (!result.ok && !result.sagaStatus) this.render(result.reason);
      } catch {
        this.render("The change could not be confirmed. Check the provider status before trying again.");
      }
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
        if (targetId === "tab-panel-passport" && !this.lastSelectiveProof) {
          void this.generateSelectivePassportProof();
        }
        if (targetId === "tab-panel-converter" && !this.lastConvertedBundle) {
          void (async () => {
            const srcTa = document.querySelector("#adk-source-textarea");
            if (srcTa && !srcTa.value.trim()) srcTa.value = await this.loadSampleAdkConfig();
            if (srcTa) await this.runAdkConversion(srcTa.value);
          })();
        }
      });
    });

    const demoButtons = document.querySelectorAll("#guided-demo-btn, #hero-demo-btn");
    for (const button of demoButtons) {
      button.addEventListener("click", async () => {
        for (const trigger of demoButtons) {
          trigger.disabled = true;
          trigger.setAttribute("aria-busy", "true");
        }
        try {
          const result = await this.runGuidedInteractiveDemo();
          if (!result.ok) this.render(result.reason);
        } catch {
          this.render("A demo provider did not respond. Try the demo again.");
        } finally {
          for (const trigger of demoButtons) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        }
      });
    }

    document.querySelector("#adk-load-sample-btn")?.addEventListener("click", async () => {
      const srcTa = document.querySelector("#adk-source-textarea");
      if (srcTa) {
        srcTa.value = await this.loadSampleAdkConfig();
        await this.runAdkConversion(srcTa.value);
      }
    });

    document.querySelector("#adk-convert-btn")?.addEventListener("click", () => {
      const srcTa = document.querySelector("#adk-source-textarea");
      if (srcTa) void this.runAdkConversion(srcTa.value);
    });

    document.querySelector("#adk-dl-network-btn")?.addEventListener("click", () => {
      if (!this.lastConvertedBundle) return;
      this.triggerBrowserDownload(
        `${this.lastConvertedBundle.networkName}.network.json`,
        "application/json;charset=utf-8",
        `${JSON.stringify(this.lastConvertedBundle.networkJson, null, 2)}\n`,
      );
    });

    document.querySelector("#adk-dl-manifest-btn")?.addEventListener("click", () => {
      if (!this.lastConvertedBundle) return;
      this.triggerBrowserDownload(
        "agent-manifest.json",
        "application/json;charset=utf-8",
        `${JSON.stringify(this.lastConvertedBundle.manifestJson, null, 2)}\n`,
      );
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

    document.querySelector("#audit-external-btn")?.addEventListener("click", () => {
      const selfBase =
        typeof location !== "undefined" ? new URL("./", location.href).href : "http://127.0.0.1:8080/";
      void this.runConformanceAudit([
        selfBase,
        "https://sainath998.github.io/plainly-agent/",
        "https://shutdown-clerk.pages.dev/",
        "https://montbaga.github.io/agent-customs/",
      ]);
    });

    document.querySelector("#audit-single-btn")?.addEventListener("click", () => {
      const custom = document.querySelector("#custom-audit-url")?.value?.trim();
      if (custom) void this.runConformanceAudit(custom);
    });

    await this._peerProbePromise;

    // Safe deep-link scenario/ripple presets (never reads key, router, or model)
    if (typeof location !== "undefined" && location.search) {
      const sp = new URLSearchParams(location.search);
      const reqScenario = sp.get("scenario");
      if (reqScenario && ["home_relocation", "outpatient_surgery", "product_launch_expo"].includes(reqScenario)) {
        await this.switchScenario(reqScenario);
      }
      if (sp.get("ripple") === "1" || sp.get("ripple") === "true") {
        await this.resetMission({ rippleFailureInjected: true });
      }
    }

    await this.recoverGuidedDemo();

    this.render();
  }
}

export class App {
  static page = new ContinuityCoordinatorPage();
}

if (typeof document !== "undefined") {
  void App.page.bindDom();
}
