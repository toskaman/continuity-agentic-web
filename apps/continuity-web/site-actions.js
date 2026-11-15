import { App } from "./script.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_mission_state",
      description: "Read the active mission graph, confirmed commitments, hard budget invariants, Pareto-optimal minimal-change plans, prepared operations, partner peer links, and current version.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => App.page.getState(),
    });

    actions.register({
      name: "switch_or_import_mission",
      description: "Switch between built-in multi-provider scenarios (home_relocation, outpatient_surgery, product_launch_expo) OR compile pasted confirmation emails / RFC 5545 .ics calendar text into a live MissionGraph.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["mode"],
        properties: {
          mode: {
            type: "string",
            enum: ["home_relocation", "outpatient_surgery", "product_launch_expo", "custom_intake"],
            description: "Built-in scenario ID or custom_intake when supplying rawScheduleText.",
          },
          rawScheduleText: {
            type: "string",
            maxLength: 32000,
            description: "Pasted booking confirmation emails (separated by ---) or RFC 5545 .ics text when mode is custom_intake.",
          },
        },
      },
      execute: (args) =>
        args.mode === "custom_intake"
          ? App.page.importCustomSchedule(args.rawScheduleText || "")
          : App.page.switchScenario(args.mode),
    });

    actions.register({
      name: "analyze_and_prepare_change",
      description: "Compile a natural-language schedule change request, run bounded dependency impact analysis, obtain alternative offers, compute Pareto-optimal minimal-change plans, and place reversible slot holds without cancelling or committing existing bookings.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["requestText"],
        properties: {
          requestText: {
            type: "string",
            minLength: 5,
            maxLength: 2000,
            description: "The visitor's natural-language change request including target date and any budget ceiling.",
          },
        },
      },
      execute: (args) => App.page.analyzeAndPrepareChange(args.requestText),
    });

    actions.register({
      name: "select_change_plan",
      description: "Switch the active prepared change plan among the solver's feasible candidates (e.g., PLAN_A_MINIMAL_CHANGE or PLAN_B_LOWEST_COST) without committing.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["planId"],
        properties: {
          planId: {
            type: "string",
            enum: App.page.planIdEnums(),
            description: "Plan ID from website_get_mission_state feasiblePlans.",
          },
        },
      },
      execute: (args) => App.page.prepareSelectedPlan(args.planId),
    });

    actions.register({
      name: "release_prepared_holds",
      description: "Safely release all temporary pre-commit slot holds at €0.00 fee and keep existing baseline reservations untouched.",
      effect: "write",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => App.page.releasePreparedHolds(),
    });

    actions.register({
      name: "commit_prepared_change_package",
      description: "Execute and verify the prepared change package across affected providers after explicit visitor confirmation. Refuses stale expectedVersion or expectedTotalEur drift.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["planId", "expectedVersion", "expectedTotalEur"],
        properties: {
          planId: {
            type: "string",
            enum: App.page.planIdEnums(),
            description: "Selected plan ID from website_get_mission_state.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 1,
            description: "Latest version from website_get_mission_state or website_analyze_and_prepare_change in this turn.",
          },
          expectedTotalEur: {
            type: "number",
            minimum: 0,
            maximum: 100000,
            description: "Exact totalMissionCostEur from website_get_mission_state selectedPlanSummary.metrics.",
          },
        },
      },
      execute: (args) => App.page.commitPreparedPackage(args),
    });

    actions.register({
      name: "export_transition_playbook",
      description: "Generate the dependency-ordered Hold-First change execution playbook separating Open Agentic Web autonomous operations from copy-ready reschedule drafts for legacy non-agentic vendors, plus avoided cancellation fees.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => App.page.getTransitionPlaybook(),
    });

    actions.register({
      name: "audit_open_agentic_site",
      description: "Run the live Open Agentic Web MVP Profile 0.2 and Project NANDA A2A v1.0 conformance verifier against all 5 ecosystem sites ('all') or any specified HTTPS Open Agentic Website URL.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["target"],
        properties: {
          target: {
            type: "string",
            minLength: 3,
            maxLength: 512,
            description: "Pass 'all' to audit all 5 ecosystem sites, or pass a full https:// Open Agentic Website base URL.",
          },
        },
      },
      execute: (args) => App.page.runConformanceAudit(args.target),
    });
  }
}

export const registerActions = SiteActions.registerActions;
