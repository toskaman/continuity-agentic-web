import assert from "node:assert/strict";
import test from "node:test";
import { compileUnstructuredIntake } from "../../packages/intake-compiler/index.js";
import { compileMissionChange, createSignatureMoveMission } from "../../packages/mission-core/index.js";

test("Cycle 26 — compileMissionChange parses Month+Day ('Nov 20', '20th November'), '+3 days', and 'push by 3 days' accurately", () => {
  const mission = createSignatureMoveMission();

  const p1 = compileMissionChange("Move my relocation to Nov 20 under 680 euros.", mission);
  assert.equal(p1.proposal.requested_change.new_value, "2026-11-20");
  assert.equal(p1.proposal.invariants.maximum_budget_eur, 680);

  const p2 = compileMissionChange("Shift move to 21st of November, prioritize lowest cost.", mission);
  assert.equal(p2.proposal.requested_change.new_value, "2026-11-21");
  assert.equal(p2.proposal.preferences.priority_mode, "lowest_cost");

  const p3 = compileMissionChange("Postpone everything by 3 days under €700.", mission);
  assert.equal(p3.proposal.requested_change.new_value, "2026-11-20");

  const p4 = compileMissionChange("Delay move +4 days, fastest alignment.", mission);
  assert.equal(p4.proposal.requested_change.new_value, "2026-11-21");
  assert.equal(p4.proposal.preferences.priority_mode, "fastest_resolution");
});

test("Cycle 27 — compileUnstructuredIntake parses structured JSON booking arrays and folded multi-line RFC 5545 .ics calendars", () => {
  const jsonIntake = compileUnstructuredIntake(
    JSON.stringify([
      {
        title: "Regional Van Charter",
        provider: "MetroVan Demo",
        ref: "MV-101",
        date: "2026-11-17",
        price: 310,
        rescheduleFee: 20,
        anchor: true,
      },
      {
        title: "Elevator Reservation",
        provider: "BuildingSyndic Demo",
        ref: "BS-202",
        date: "2026-11-17",
        price: 40,
        rescheduleFee: 0,
        notes: "Same-day building freight elevator slot",
      },
      {
        title: "30-Day Crate Rental",
        provider: "CrateBox Demo",
        ref: "CB-303",
        date: "2026-11-10",
        valid_until: "2026-12-10",
        price: 55,
      },
    ]),
  );

  assert.equal(jsonIntake.ok, true);
  assert.equal(jsonIntake.format, "json");
  assert.equal(jsonIntake.mission.commitments.length, 3);
  assert.equal(jsonIntake.inferredEdgesCount, 2);

  // Folded RFC 5545 .ics lines (`\r\n ` continuation per RFC 5545 §3.1)
  const foldedIcs = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "SUMMARY:[ANCHOR] Long Folded Moving Van",
    "  Charter Confirmation",
    "DTSTART:20261117T080000Z",
    "DTEND:20261117T120000Z",
    "DESCRIPTION:Ref: FLD-101 Price: €320",
    "  Reschedule fee: €20",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Same-Day Curbside Bay",
    "DTSTART:20261117T073000Z",
    "DTEND:20261117T130000Z",
    "DESCRIPTION:Ref: FLD-102 Price: €35",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const icsRes = compileUnstructuredIntake(foldedIcs);
  assert.equal(icsRes.ok, true);
  assert.equal(icsRes.format, "ics");
  assert.match(icsRes.mission.commitments[0].title, /Long Folded Moving Van Charter Confirmation/);
  assert.equal(icsRes.mission.commitments[0].reschedule_fee_eur, 20);
});
