import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFactsNetworkBundle,
  extractMarkedPageFacts,
  verifyFactsProvenance,
} from "../../packages/facts-publisher/index.js";
import { EDGE_TYPES, MissionGraph } from "../../packages/mission-graph/index.js";
import { analyzeMissionImpact, evaluateEdgeImpact } from "../../packages/impact-engine/index.js";
import { normalizePeerOffer } from "../../packages/capability-adapter/index.js";
import { buildHybridTransitionPlaybook } from "../../packages/transition-playbook/index.js";
import { compileMissionChange, createSignatureMoveMission } from "../../packages/mission-core/index.js";
import { solveMinimalChangePlans } from "../../packages/constraint-solver/index.js";

test("Wave 3 (#121-#132) — @continuity/facts-publisher blocks CSS font-size:0 / clip-path / transparent / hidden-ancestor / Unicode Tag smuggling, decodes numeric entities & verifies provenance", async () => {
  for (const evilHtml of [
    '<main><p data-agent-facts="t" style="font-size:0">Hidden injection text here</p></main>',
    '<main><p data-agent-facts="t" style="clip-path:inset(50%)">Hidden injection text here</p></main>',
    '<main><p data-agent-facts="t" style="color:transparent">Hidden injection text here</p></main>',
    '<div hidden><p data-agent-facts="t">Nested inside hidden div</p></div>',
    '<dialog><p data-agent-facts="t">Inside closed dialog</p></dialog>',
    '<main><p data-agent-facts="t">Visible text with \u{E0041} tag smuggling</p></main>',
    '<main><p data-agent-facts="dup">First valid fact line</p><p data-agent-facts="dup">Duplicate topic line</p></main>',
  ]) {
    await assert.rejects(() => extractMarkedPageFacts(evilHtml));
  }

  const cleanHtml = '<main><p data-agent-facts="pricing">Standard van slot costs &#8364;390 (&#x20AC;25 reschedule).</p></main>';
  const bundle = await buildFactsNetworkBundle({
    siteName: "MoveCo",
    siteUrl: "https://moveco.example/",
    networkName: "moveco",
    htmlText: cleanHtml,
  });
  assert.match(bundle.networkJson.tools[0].instructions, /€390 \(€25 reschedule\)/);
  assert.equal(Object.isFrozen(bundle.networkJson), true);
  assert.equal((await verifyFactsProvenance(cleanHtml, bundle.networkJson)).valid, true);
  assert.equal((await verifyFactsProvenance(cleanHtml + "<!-- drift -->", bundle.networkJson)).valid, false);
});

test("Wave 3 (#133-#146) — MissionGraph topologicalOrder/clone/incomingEdges & ImpactEngine diamond-DAG SOFT->HARD upgrade + ON_OR_BEFORE minOffsetDays", () => {
  const g = new MissionGraph({ missionId: "diamond_01" });
  g.addNode({ id: "A", title: "Anchor", provider_id: "p1", provider_name: "P1", provider_origin: "https://p1.example", scheduled_date: "2026-11-17", window: "09:00", price_eur: 100 });
  g.addNode({ id: "B", title: "SoftMid", provider_id: "p2", provider_name: "P2", provider_origin: "https://p2.example", scheduled_date: "2026-11-18", window: "09:00", price_eur: 50 });
  g.addNode({ id: "C", title: "HardMid", provider_id: "p3", provider_name: "P3", provider_origin: "https://p3.example", scheduled_date: "2026-11-17", window: "09:00", price_eur: 50 });
  g.addNode({ id: "D", title: "Sink", provider_id: "p4", provider_name: "P4", provider_origin: "https://p4.example", scheduled_date: "2026-11-17", window: "09:00", price_eur: 50 });

  g.addEdge({ from: "A", to: "B", type: EDGE_TYPES.ON_OR_AFTER, rationale: "soft", rule: { minOffsetDays: 0, maxOffsetDays: 1 } });
  g.addEdge({ from: "A", to: "C", type: EDGE_TYPES.SAME_DAY_REQUIRED, rationale: "hard same day" });
  g.addEdge({ from: "B", to: "D", type: EDGE_TYPES.ON_OR_AFTER, rationale: "B->D" });
  g.addEdge({ from: "C", to: "D", type: EDGE_TYPES.SAME_DAY_REQUIRED, rationale: "C->D hard" });
  // Duplicate edge insertion ignored cleanly
  g.addEdge({ from: "C", to: "D", type: EDGE_TYPES.SAME_DAY_REQUIRED, rationale: "C->D hard" });
  assert.equal(g.edges.length, 4);
  assert.equal(g.incomingEdges("D").length, 2);

  const topo = g.topologicalOrder();
  assert.equal(topo[0], "A");
  assert.equal(topo[topo.length - 1], "D");

  const cloned = g.clone();
  assert.throws(() => cloned.updateNode("A", { visual_state: "NOT_A_VALID_STATE" }));

  const impact = analyzeMissionImpact(g, {
    requested_change: { field: "move_date", target_commitment_id: "A", previous_value: "2026-11-17", new_value: "2026-11-20" },
  });
  assert.equal(impact.nodeDecisions.D.status, "AFFECTED_HARD");
  assert.ok(impact.metrics.blastRadiusRatio > 0);

  const preOpCheck = evaluateEdgeImpact(
    { from: "lab", to: "surg", type: EDGE_TYPES.ON_OR_BEFORE, rule: { minOffsetDays: 1, maxOffsetDays: 3 } },
    "2026-11-20",
    { title: "Surgery", scheduled_date: "2026-11-20" },
  );
  assert.equal(preOpCheck.hardViolation, true);
});

test("Wave 3 (#147-#180) — CapabilityAdapter strips Bidi, TransitionPlaybook orders topologically with SMS drafts, MissionCore parses ES/DE/earlier shifts & Solver prunes via branch-and-bound", () => {
  const offer = normalizePeerOffer({
    offer_id: "off_clean_1",
    commitment_id: "cmt_moveco_van",
    provider_id: "moveco",
    provider_name: "MoveCo\u202E Express",
    provider_origin: "https://moveco.example",
    raw_capability: "reschedule_van_booking",
    proposed_date: "2026-11-20",
    window: "08:00–12:00",
    base_price_eur: 390.004,
    change_fee_eur: 25,
    supports_hold: false,
    hold_ttl_seconds: 900,
  });
  assert.equal(offer.provider_name.includes("\u202E"), false);
  assert.equal(offer.hold_ttl_seconds, 0);
  assert.equal(offer.base_price_eur, 390);
  assert.throws(() =>
    normalizePeerOffer({
      ...offer,
      provider_origin: "http://insecure-remote.example",
    }),
  );

  // Multilingual ES/DE + earlier shift compilation
  const mission = createSignatureMoveMission();
  const es = compileMissionChange("Mueve todo al viernes bajo 680€", mission);
  assert.equal(es.proposal.requested_change.new_value, "2026-11-20");
  assert.equal(es.proposal.invariants.maximum_budget_eur, 680);

  const de = compileMissionChange("Verschiebe den Umzug auf Samstag unter 695 EUR", mission);
  assert.equal(de.proposal.requested_change.new_value, "2026-11-21");
  assert.equal(de.proposal.invariants.maximum_budget_eur, 695);

  const earlier = compileMissionChange("Bring forward by 1 day under €700", mission);
  assert.equal(earlier.proposal.requested_change.new_value, "2026-11-16");

  // Solver branch-and-bound + avoidedCancellationFeesEur + playbook shortSmsDraft
  const g = MissionGraph.fromMission(mission);
  const { proposal } = compileMissionChange("Move relocation from Tuesday to Friday under €700.", mission);
  const impact = analyzeMissionImpact(g, proposal);
  const offers = [
    normalizePeerOffer({
      offer_id: "off_mc_1",
      commitment_id: "cmt_moveco_van",
      provider_id: "moveco",
      provider_name: "MoveCo",
      provider_origin: "https://mc.example",
      raw_capability: "reschedule_van_booking",
      proposed_date: "2026-11-20",
      window: "08:00–13:00",
      base_price_eur: 390,
      change_fee_eur: 25,
      supports_hold: true,
      hold_ttl_seconds: 900,
    }),
    // Duplicate offer_id deduplicated cleanly
    normalizePeerOffer({
      offer_id: "off_mc_1",
      commitment_id: "cmt_moveco_van",
      provider_id: "moveco",
      provider_name: "MoveCo",
      provider_origin: "https://mc.example",
      raw_capability: "reschedule_van_booking",
      proposed_date: "2026-11-20",
      window: "08:00–13:00",
      base_price_eur: 390,
      change_fee_eur: 25,
      supports_hold: true,
      hold_ttl_seconds: 900,
    }),
    normalizePeerOffer({
      offer_id: "off_pf_1",
      commitment_id: "cmt_permitflow_bay",
      provider_id: "permitflow",
      provider_name: "PermitFlow",
      provider_origin: "https://pf.example",
      raw_capability: "prepare_permit_date_update",
      proposed_date: "2026-11-20",
      window: "07:30–14:00",
      base_price_eur: 45,
      change_fee_eur: 0,
      supports_hold: false,
    }),
    normalizePeerOffer({
      offer_id: "off_hc_1",
      commitment_id: "cmt_homeconnect_fiber",
      provider_id: "homeconnect",
      provider_name: "HomeConnect",
      provider_origin: "https://hc.example",
      raw_capability: "change_fiber_appointment",
      proposed_date: "2026-11-20",
      window: "14:00–18:00",
      base_price_eur: 49,
      change_fee_eur: 0,
      supports_hold: true,
      hold_ttl_seconds: 600,
    }),
  ];
  const solved = solveMinimalChangePlans({ graph: g, proposal, impact, normalizedOffers: offers });
  assert.equal(solved.feasible, true);
  assert.equal(solved.plans[0].metrics.avoidedCancellationFeesEur, 90);

  const pb = buildHybridTransitionPlaybook({ mission, plan: solved.plans[0] });
  assert.match(pb.steps[0].shortSmsDraft, /BEFORE releasing/);
});
