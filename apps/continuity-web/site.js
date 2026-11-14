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

export class ContinuityScriptedReplayLlm {
  constructor(trace) {
    this.trace = trace;
    this.mock = true;
    this.baseUrl = "browser://mock";
  }

  async chat({ model, messages = [], tools = [], origin, parentSpan, onContentDelta }) {
    const span = this.trace?.start("model_call", {
      parent: parentSpan,
      origin,
      model: "continuity-deterministic-replay",
      mock: true,
      routerHost: "browser-scripted-replay",
      toolNames: (tools || []).map((t) => t.function?.name),
    });

    const avail = new Set((tools || []).map((t) => t.function?.name).filter(Boolean));
    const toolMsgs = messages.filter((m) => m?.role === "tool");
    const calledNames = new Set(toolMsgs.map((m) => m.name));
    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    const userText = String(lastUser?.content || "");

    const emitTool = (name, argsObj) => {
      const out = {
        content: "",
        toolCalls: [
          {
            id: `replay_${name}_${toolMsgs.length + 1}`,
            type: "function",
            function: { name, arguments: JSON.stringify(argsObj) },
          },
        ],
        finishReason: "tool_calls",
        usage: null,
        model: "continuity-deterministic-replay",
      };
      this.trace?.end(span, { finishReason: "tool_calls", toolCalls: [name], mock: true });
      return out;
    };

    const emitText = (txt) => {
      onContentDelta?.(txt);
      this.trace?.end(span, { finishReason: "stop", contentChars: txt.length, mock: true });
      return {
        content: txt,
        toolCalls: [],
        finishReason: "stop",
        usage: null,
        model: "continuity-deterministic-replay",
      };
    };

    const parseToolPayload = (toolName) => {
      const found = [...toolMsgs].reverse().find((m) => m.name === toolName);
      if (!found) return null;
      try {
        const outer = JSON.parse(found.content);
        return outer?.result ?? outer;
      } catch {
        return null;
      }
    };

    // 1. Inside `peer_network_specialist`: call each allowed partner network in sequence (triggers real Consent Cards!)
    if (avail.has("moveco_dispatch")) {
      for (const peerTool of ["moveco_dispatch", "permitflow_advisor", "homeconnect_scheduler", "powerflow_grid"]) {
        if (avail.has(peerTool) && !calledNames.has(peerTool)) {
          return emitTool(peerTool, {
            inquiry: "What relocation services and temporary slot hold policies do you offer?",
          });
        }
      }
      const summaries = ["moveco_dispatch", "permitflow_advisor", "homeconnect_scheduler", "powerflow_grid"]
        .filter((p) => calledNames.has(p))
        .map((p) => {
          const m = [...toolMsgs].reverse().find((x) => x.name === p);
          return `- **${p}**: ${String(m?.content || "").slice(0, 220)}`;
        });
      return emitText(`Partner network consultation complete:\n${summaries.join("\n")}`);
    }

    // 2. Partner consultation intent on front orchestrator
    if (/\b(moveco|permitflow|homeconnect|powerflow|partner|peer|each offers)\b/i.test(userText) && avail.has("peer_network_specialist")) {
      if (!calledNames.has("website_get_mission_state")) {
        return emitTool("website_get_mission_state", {});
      }
      if (!calledNames.has("peer_network_specialist")) {
        return emitTool("peer_network_specialist", {
          request: "Ask MoveCo, PermitFlow, HomeConnect, and PowerFlow what relocation services and hold policies each offers.",
        });
      }
      const st = parseToolPayload("website_get_mission_state") || {};
      const peerReply = [...toolMsgs].reverse().find((m) => m.name === "peer_network_specialist")?.content || "";
      const links = st.partnerLinks || {};
      return emitText(
        `### Independent Open Agentic Peer Capabilities *(Scripted Replay)*\n\n${peerReply}\n\n**Direct Peer Portals:**\n- [MoveCo Express](${links.moveco || "#"})\n- [PermitFlow Civic Prep](${links.permitflow || "#"})\n- [HomeConnect Fiber](${links.homeconnect || "#"})\n- [PowerFlow Energy](${links.powerflow || "#"})`,
      );
    }

    // 3. Conformance & NANDA Audit intent
    if (/\b(audit|conformance|nanda|mvp)\b/i.test(userText) && avail.has("website_audit_open_agentic_site")) {
      if (!calledNames.has("website_audit_open_agentic_site")) {
        return emitTool("website_audit_open_agentic_site", { target: "all" });
      }
      const auditRes = parseToolPayload("website_audit_open_agentic_site") || {};
      if (avail.has("render_cruse") && !calledNames.has("render_cruse") && Array.isArray(auditRes.results)) {
        return emitTool("render_cruse", {
          version: 1,
          components: [
            {
              id: "nanda_audit_table",
              kind: "table",
              title: "Open Agentic Web MVP 0.2 & NANDA Conformance",
              columns: ["Site", "Network", "Score", "Manifest Digest"],
              rows: auditRes.results.map((r) => [
                r.siteBaseUrl,
                r.networkName || "n/a",
                r.score,
                r.manifestDigest || "n/a",
              ]),
            },
          ],
        });
      }
      return emitText(
        ` **[Scripted Replay]** Audited **${auditRes.sitesAudited || 5}** Open Agentic Websites: **${auditRes.ok ? "ALL PASSED (7/7 checks each)" : "Issues detected"}**.`,
      );
    }

    // 4. Commit prepared change package intent
    if (/\bcommit\b/i.test(userText) && avail.has("website_commit_prepared_change_package")) {
      if (!calledNames.has("website_get_mission_state")) {
        return emitTool("website_get_mission_state", {});
      }
      const st = parseToolPayload("website_get_mission_state") || {};
      if (!st.selectedPlanId || !st.selectedPlanSummary) {
        return emitText(
          "**[Scripted Replay]** No prepared change package is awaiting approval yet. Ask me to prepare a Tuesday-to-Friday plan first.",
        );
      }
      if (!calledNames.has("website_commit_prepared_change_package")) {
        return emitTool("website_commit_prepared_change_package", {
          planId: st.selectedPlanId,
          expectedVersion: st.version,
          expectedTotalEur: st.selectedPlanSummary.metrics.totalMissionCostEur,
        });
      }
      const cRes = parseToolPayload("website_commit_prepared_change_package") || {};
      if (cRes.ok) {
        return emitText(
          `### Mission Re-Aligned & Verified *(Scripted Replay)*\n- **Saga Status:** \`${cRes.sagaStatus}\`\n- **Committed with Ed25519 Receipts:** **${cRes.committedCount}** operations\n- **Preserved Untouched:** **${cRes.preservedCount}** commitments`,
        );
      }
      return emitText(`**[Scripted Replay]** Commit did not run: ${cRes.reason || "Cancelled by visitor."}`);
    }

    // 5. Analyze & prepare schedule change intent
    if (/\b(prepare|friday|monday|saturday|move|shift|reschedule|2026-)\b/i.test(userText) && avail.has("website_analyze_and_prepare_change")) {
      if (!calledNames.has("website_analyze_and_prepare_change")) {
        return emitTool("website_analyze_and_prepare_change", { requestText: userText });
      }
      const prep = parseToolPayload("website_analyze_and_prepare_change") || {};
      if (prep.ok && avail.has("render_cruse") && !calledNames.has("render_cruse")) {
        const best = prep.plans?.[0]?.metrics || {};
        return emitTool("render_cruse", {
          version: 1,
          components: [
            {
              id: "cost_cap_chart",
              kind: "chart",
              chartType: "bar",
              title: "Mission Cost vs Hard Budget Cap (EUR)",
              unit: "EUR",
              labels: (prep.plans || []).map((p) => p.plan_id.replace(/_/g, " ")),
              series: [
                {
                  name: "Projected Total (EUR)",
                  values: (prep.plans || []).map((p) => p.metrics.totalMissionCostEur),
                },
              ],
              summary: `Recommended ${prep.recommendedPlanId}: €${best.totalMissionCostEur} (<= €${best.maxBudgetEur} cap).`,
            },
          ],
        });
      }
      if (!prep.ok) {
        return emitText(`**[Scripted Replay]** Could not prepare plan: ${prep.reason}`);
      }
      const topPlan = prep.plans?.[0];
      return emitText(
        `### Minimal-Change Plan Prepared *(Scripted Replay)*\n- **Target Date:** \`${prep.targetDate}\`\n- **Recommended:** **${topPlan?.label}** (€${topPlan?.metrics?.totalMissionCostEur?.toFixed(2)} <= €${topPlan?.metrics?.maxBudgetEur?.toFixed(2)})\n- **Prepared Holds:** **${prep.preparedOperationsCount}** · **Preserved Untouched:** **${prep.unaffectedCommitmentsCount}**\n\nExisting reservations remain untouched until you confirm commit.`,
      );
    }

    // 6. Default: Read & report current mission state
    if (avail.has("website_get_mission_state") && !calledNames.has("website_get_mission_state")) {
      return emitTool("website_get_mission_state", {});
    }
    const st = parseToolPayload("website_get_mission_state") || {};
    const nodes = st.graph?.nodes || [];
    return emitText(
      `### Active Mission State *(Scripted Replay)*\n- **Mission:** ${st.mission?.title || "n/a"} (\`${st.mission?.mission_id}\`)\n- **Anchor Date:** \`${st.mission?.anchor_date}\` · **Hard Budget Cap:** €${st.mission?.invariants?.maximum_budget_eur}\n- **Commitments (${nodes.length}):** ${nodes.map((n) => `${n.title} (${n.scheduled_date}, €${n.price_eur})`).join("; ")}`,
    );
  }
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
      AssistantMount.bindRuntimeHelpers(booted.engine, status);
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

  static enableZeroKeyReplay(engine, statusEl) {
    if (!engine?.top) return;
    if (!AssistantMount.originalTopLlm) {
      AssistantMount.originalTopLlm = engine.top.llm;
      AssistantMount.originalUserRouter = { ...engine.userRouter };
    }
    engine.mockLLM = true;
    engine.userRouter = { baseUrl: "browser://mock", mock: true };
    engine.top.llm = new ContinuityScriptedReplayLlm(engine.trace);

    const badge = document.querySelector("#agent-app .ns-llmbadge");
    if (badge) {
      badge.className = "ns-llmbadge mock";
      badge.textContent = "⚡ Scripted Replay Active (Zero-Key)";
    }
    const settings = document.querySelector("#agent-app .ns-settings");
    if (settings) settings.open = false;
    const replayBtn = document.querySelector("#zero-key-replay-btn");
    if (replayBtn) replayBtn.textContent = "✓ Zero-Key Replay Active";
    if (statusEl) {
      statusEl.textContent =
        "Zero-Key Deterministic Scripted Replay active: real Neuro SAN graphs, website_* tools, CRUSE charts, and cross-origin peer Consent Cards execute locally without an API key.";
    }
    AssistantMount.greet();
  }

  static selectOtariByok(engine, statusEl) {
    if (!engine?.top) return;
    if (AssistantMount.originalTopLlm) {
      engine.top.llm = AssistantMount.originalTopLlm;
      engine.userRouter = { ...AssistantMount.originalUserRouter };
      engine.mockLLM = false;
    }
    const routerInput = document.querySelector("#ns-router");
    const modelInput = document.querySelector("#ns-model");
    const nameInput = document.querySelector("#ns-profile-name");
    const keyInput = document.querySelector("#ns-key");
    const settings = document.querySelector("#agent-app .ns-settings");
    if (routerInput) routerInput.value = "https://api.otari.ai/api/v1";
    if (modelInput) modelInput.value = "alibaba/qwen-3.5-35b-a3b";
    if (nameInput) nameInput.value = "Mozilla Otari";
    if (settings) settings.open = true;
    const replayBtn = document.querySelector("#zero-key-replay-btn");
    if (replayBtn) replayBtn.textContent = "⚡ Enable Zero-Key Scripted Replay";
    if (statusEl) {
      statusEl.textContent =
        "Filled Hosted Mozilla Otari (https://api.otari.ai/api/v1 · alibaba/qwen-3.5-35b-a3b). Paste your Otari API key below and click Save and start.";
    }
    keyInput?.focus();
  }

  static bindRuntimeHelpers(engine, statusEl) {
    document.querySelector("#zero-key-replay-btn")?.addEventListener("click", () => {
      AssistantMount.enableZeroKeyReplay(engine, statusEl);
    });
    document.querySelector("#otari-preset-btn")?.addEventListener("click", () => {
      AssistantMount.selectOtariByok(engine, statusEl);
    });
    document.querySelectorAll(".runtime-prompt-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const promptText = chip.getAttribute("data-prompt") || "";
        const hasRealKey = Boolean(engine.byokKey && engine.byokKey !== "demo");
        if (!hasRealKey && !engine.mockLLM) {
          AssistantMount.enableZeroKeyReplay(engine, statusEl);
        }
        const input = document.querySelector("#ns-input");
        const send = document.querySelector("#ns-send");
        if (input && send) {
          input.value = promptText;
          send.click();
        }
      });
    });
  }
}

if (typeof window !== "undefined") {
  await AssistantMount.start();
}
