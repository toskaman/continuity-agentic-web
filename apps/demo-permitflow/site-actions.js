import { App } from "./script.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_permitflow_state",
      description: "Read the prepared curbside permit dossier, public notice rules, eligible dates, and state version.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.getState(),
    });

    actions.register({
      name: "stage_dossier_preview",
      description: "Preview eligibility for a new curbside bay date on the page without amending the prepared dossier.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["targetDate"],
        properties: {
          targetDate: {
            type: "string",
            enum: App.page.dateEnums(),
            description: "Eligible date from website_get_permitflow_state.",
          },
        },
      },
      execute: (args) => App.page.stageDraftDate(args.targetDate),
    });

    actions.register({
      name: "amend_prepared_dossier",
      description: "Update the prepared demonstration permit request dossier to a new date. Opens browser confirmation first; never files or modifies an official municipal government permit.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["dossierRef", "targetDate", "expectedVersion"],
        properties: {
          dossierRef: {
            type: "string",
            minLength: 3,
            maxLength: 32,
            description: "Dossier reference from website_get_permitflow_state.",
          },
          targetDate: {
            type: "string",
            enum: App.page.dateEnums(),
            description: "Target date from website_get_permitflow_state.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 1,
            description: "Current version from website_get_permitflow_state in this turn.",
          },
        },
      },
      execute: (args) => App.page.updatePreparedDossier(args),
    });
  }
}

export const registerActions = SiteActions.registerActions;
