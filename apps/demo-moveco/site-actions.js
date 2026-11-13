import { App } from "./script.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_moveco_state",
      description: "Read the active MoveCo reservation, available crew dates, fees, active hold, and current state version.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => App.page.getState(),
    });

    actions.register({
      name: "hold_crew_slot",
      description: "Place a reversible 15-minute crew slot hold for a target date without cancelling or changing the current reservation.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["targetDate"],
        properties: {
          targetDate: {
            type: "string",
            enum: App.page.slotDates(),
            description: "Available date from website_get_moveco_state.",
          },
        },
      },
      execute: (args) => App.page.holdSlot(args.targetDate),
    });

    actions.register({
      name: "confirm_van_reschedule",
      description: "Confirm an irreversible date change for the MoveCo reservation. Opens browser confirmation first and refuses stale expectedVersion.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["bookingRef", "targetDate", "expectedVersion"],
        properties: {
          bookingRef: {
            type: "string",
            minLength: 3,
            maxLength: 32,
            description: "Booking reference from website_get_moveco_state.",
          },
          targetDate: {
            type: "string",
            enum: App.page.slotDates(),
            description: "Replacement crew date from website_get_moveco_state.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 1,
            description: "Latest version from website_get_moveco_state or website_hold_crew_slot in this turn.",
          },
        },
      },
      execute: (args) => App.page.confirmReschedule(args),
    });
  }
}

export const registerActions = SiteActions.registerActions;
