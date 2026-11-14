import { App } from "./script.js";
import { registerActions } from "./site-actions.js";
import { exposeActionsToWebMcp } from "./vendor/webmcp-adapter/index.js";

if (typeof navigator !== "undefined") {
  exposeActionsToWebMcp(registerActions, {
    namespace: "continuity",
    confirmIrreversible: async (toolDef, args) => {
      if (typeof window !== "undefined" && window.__continuityReviewHook) {
        return window.__continuityReviewHook([
          {
            action: toolDef.name,
            origin: window.location.origin,
            effect: "irreversible",
            arguments: args,
          },
        ]);
      }
      return false;
    },
  });
}

export class AssistantMount {
  static GREETING = "I coordinate multi-provider schedule changes across your relocation commitments while keeping unaffected bookings untouched. I can also consult MoveCo Express, PermitFlow Civic Prep, HomeConnect Fiber, and PowerFlow Energy about what each site offers.";

  static DIALOGS = {
    commit_prepared_change_package: {
      title: "Approve and commit this multi-provider change package?",
      sentence: "Each prepared modification below will be cryptographically bound to your approval, dispatched with idempotency keys, and verified before finalizing.",
      confirm: "Approve & commit change package",
      decline: "Keep original reservations unchanged",
    },
  };

  static async start() {
    const status = document.querySelector("#assistant-status");
    const siteBase = new URL("./", import.meta.url).href;
    try {
      const { boot } = await import("./runtime/index.js");
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
      });
      AssistantMount.engine = booted.engine;
      AssistantMount.defaultReview = booted.engine.onActionConfirm;
      booted.engine.onActionConfirm = AssistantMount.review;
      AssistantMount.defaultConsent = booted.engine.onConsent;
      booted.engine.onConsent = AssistantMount.consent;
      if (typeof window !== "undefined") {
        window.__continuityReviewHook = AssistantMount.review;
      }
      const needsKey =
        !booted.engine.mockLLM && (!booted.engine.byokKey || booted.engine.byokKey === "demo");
      status.textContent = needsKey
        ? "Open Agentic Web Runtime ready. Add your Otari or OpenAI-compatible API key in ⚙ AI model settings below to run live LLM turns, or use the deterministic coordinator above immediately."
        : "Open Agentic Web Runtime connected to this page.";
      if (!needsKey) AssistantMount.greet();
      return booted.engine;
    } catch (error) {
      status.textContent = "The assistant could not load. You can still use the full coordinator above directly.";
      console.error("Assistant startup failed", error);
      return null;
    }
  }

  static greet() {
    const first = document.querySelector("#ns-msgs .ns-msg.bot");
    if (first) first.textContent = AssistantMount.GREETING;
  }

  static async review(items) {
    let confirmed = false;
    const pageOrigin = new URL(document.URL).origin;
    if (items.length > 1) {
      for (const item of items) {
        if (item.origin === pageOrigin && Object.hasOwn(AssistantMount.DIALOGS, item.action)) {
          throw new Error(
            `Nothing ran. "${AssistantMount.DIALOGS[item.action].confirm}" needs its own confirmation, so ask the assistant to do that on its own.`,
          );
        }
      }
    }
    const own = items.length === 1 && items[0].origin === pageOrigin;
    if (own && Object.hasOwn(AssistantMount.DIALOGS, items[0].action)) {
      const content = AssistantMount.dialogContent(items[0]);
      if (content.refusal) throw new Error(content.refusal);
      confirmed = await new Promise(AssistantMount.openDialog.bind(null, content));
    } else {
      confirmed = await AssistantMount.defaultReview(items);
    }
    AssistantMount.keepFocusInChat();
    return confirmed;
  }

  static async consent(info) {
    const answer = AssistantMount.defaultConsent(info);
    AssistantMount.focusConsentCard();
    const decision = await answer;
    AssistantMount.keepFocusInChat();
    return decision;
  }

  static focusConsentCard() {
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    const title = card ? card.querySelector(".ns-consent-title") : null;
    if (!title) return;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", title.textContent);
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest("#agent-app")) return;
    title.tabIndex = -1;
    title.focus();
  }

  static dialogContent(item) {
    let details = {};
    try {
      details = AssistantMount.reviewDetails(item.action, item.arguments) || {};
    } catch (error) {
      console.error("Could not add details to the confirmation dialog", error);
    }
    return {
      ...AssistantMount.DIALOGS[item.action],
      details,
      refusal: details.refusal,
      exact: `${item.action} on ${item.origin} (${item.effect})\n${JSON.stringify(item.arguments, null, 2)}`,
    };
  }

  static reviewDetails(action, args) {
    if (action === "commit_prepared_change_package") {
      const check = App.page.checkCommitPackage(args);
      if (!check.ok) return { refusal: check.reason };
      const p = check.plan;
      return {
        "Selected Plan": p.label,
        "Operations to Commit": check.operations
          .map((o) => `${o.provider_name} (${o.proposed_date} ${o.window})`)
          .join("; "),
        "Preserved Untouched": p.preservedCommitments.map((c) => c.title).join(", "),
        "Projected Total Cost": `€${p.metrics.totalMissionCostEur.toFixed(2)} (Cap €${p.metrics.maxBudgetEur.toFixed(2)})`,
        "Net Cost Difference": `${p.metrics.netDeltaEur >= 0 ? "+" : ""}€${p.metrics.netDeltaEur.toFixed(2)}`,
        "Reversibility": "Moving & Fiber bookings are irreversible once committed; PermitFlow draft is reversible.",
      };
    }
    return {};
  }

  static openDialog(content, resolve) {
    const dialog = document.createElement("dialog");
    dialog.className = "assistant-review";
    dialog.setAttribute("aria-labelledby", "assistant-review-title");
    const heading = document.createElement("h2");
    heading.id = "assistant-review-title";
    heading.textContent = content.title;
    heading.tabIndex = -1;
    heading.autofocus = true;
    const sentence = document.createElement("p");
    sentence.textContent = content.sentence;
    dialog.append(heading, sentence);
    const exact = document.createElement("details");
    const exactLabel = document.createElement("summary");
    exactLabel.textContent = "Technical details";
    const exactText = document.createElement("pre");
    exactText.textContent = content.exact;
    exact.append(exactLabel, exactText);
    const entries = Object.entries(content.details);
    if (entries.length) {
      const list = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = String(value);
        list.append(term, description);
      }
      dialog.append(list);
    } else {
      exact.open = true;
    }
    const confirmButton = document.createElement("button");
    confirmButton.textContent = content.confirm;
    confirmButton.addEventListener("click", dialog.close.bind(dialog, "confirm"));
    const declineButton = document.createElement("button");
    declineButton.className = "assistant-decline";
    declineButton.textContent = content.decline;
    declineButton.addEventListener("click", dialog.close.bind(dialog, "decline"));
    dialog.addEventListener("close", AssistantMount.finishDialog.bind(null, dialog, resolve));
    dialog.append(exact, confirmButton, declineButton);
    document.body.append(dialog);
    dialog.showModal();
  }

  static finishDialog(dialog, resolve) {
    dialog.remove();
    resolve(dialog.returnValue === "confirm");
  }

  static keepFocusInChat() {
    if (document.activeElement === document.body || document.activeElement === null) {
      document.querySelector("#ns-input")?.focus({ preventScroll: true });
    }
  }
}

if (typeof window !== "undefined") {
  await AssistantMount.start();
}
