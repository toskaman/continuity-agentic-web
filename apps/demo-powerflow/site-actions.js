import { App } from "./script.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_powerflow_state",
      description: "Read the scheduled PowerFlow smart-meter activation, available energization dates, rules, and version.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.getState(),
    });

    actions.register({
      name: "stage_energization_date",
      description: "Stage an energization date selection on the page without changing the confirmed schedule.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["targetDate"],
        properties: {
          targetDate: {
            type: "string",
            enum: App.page.dateEnums(),
            description: "Available date from website_get_powerflow_state.",
          },
        },
      },
      execute: (args) => App.page.stageDate(args.targetDate),
    });

    actions.register({
      name: "confirm_energization_shift",
      description: "Confirm an irreversible modification to the smart-meter energization date. Opens browser confirmation first.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["activationRef", "targetDate", "expectedVersion"],
        properties: {
          activationRef: {
            type: "string",
            minLength: 3,
            maxLength: 32,
            description: "Activation reference from website_get_powerflow_state.",
          },
          targetDate: {
            type: "string",
            enum: App.page.dateEnums(),
            description: "Target date from website_get_powerflow_state.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 1,
            description: "Latest version from website_get_powerflow_state in this turn.",
          },
        },
      },
      execute: (args) => App.page.confirmDateShift(args),
    });
  }
}

export const registerActions = SiteActions.registerActions;
