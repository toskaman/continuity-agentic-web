import { App } from "./script.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_mission_state",
      description: "Read the active relocation mission graph, confirmed commitments, hard budget invariants, feasible minimal-change plans, prepared operations, partner peer links, and current version.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => App.page.getState(),
    });

    actions.register({
      name: "analyze_and_prepare_change",
      description: "Compile a natural-language schedule change request, run bounded dependency impact analysis, obtain alternative offers, compute minimal-change plans, and place reversible slot holds without cancelling or committing existing bookings.",
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
  }
}

export const registerActions = SiteActions.registerActions;
