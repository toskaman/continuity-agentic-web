import { App } from "./script.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_homeconnect_state",
      description: "Read the confirmed HomeConnect fiber appointment, technician windows, prerequisites, and version.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.getState(),
    });

    actions.register({
      name: "hold_fiber_window",
      description: "Place a temporary 10-minute technician window hold without altering the existing appointment.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["targetDate"],
        properties: {
          targetDate: {
            type: "string",
            enum: App.page.windowDates(),
            description: "Technician date from website_get_homeconnect_state.",
          },
        },
      },
      execute: (args) => App.page.holdWindow(args.targetDate),
    });

    actions.register({
      name: "confirm_fiber_reschedule",
      description: "Confirm an irreversible date change for the fiber installation appointment. Opens browser confirmation first.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["appointmentRef", "targetDate", "expectedVersion"],
        properties: {
          appointmentRef: {
            type: "string",
            minLength: 3,
            maxLength: 32,
            description: "Appointment reference from website_get_homeconnect_state.",
          },
          targetDate: {
            type: "string",
            enum: App.page.windowDates(),
            description: "Target date from website_get_homeconnect_state.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 1,
            description: "Latest version from website_get_homeconnect_state or website_hold_fiber_window in this turn.",
          },
        },
      },
      execute: (args) => App.page.confirmAppointmentChange(args),
    });
  }
}

export const registerActions = SiteActions.registerActions;
