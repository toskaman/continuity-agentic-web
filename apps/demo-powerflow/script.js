export class PowerFlowPage {
  constructor() {
    this.version = 1;
    this.activation = {
      activationRef: "PFW-9921",
      meterPoint: "PRM-7510299481",
      scheduledDate: "2027-11-16",
      scheduledLabel: "Tue, Nov 16, 2027",
      window: "08:00–12:00",
      feeEur: "€30.00",
      status: "CONFIRMED",
    };
    this.stagedDate = null;
    this.dates = [
      { date: "2027-11-18", label: "Thu, Nov 18, 2027", window: "08:00–12:00", feeEur: "€30.00" },
      { date: "2027-11-19", label: "Fri, Nov 19, 2027", window: "08:00–12:00", feeEur: "€30.00" },
    ];
    this.lastReceipt = null;
  }

  dateEnums() {
    return this.dates.map((d) => d.date);
  }

  getState() {
    const policyText =
      typeof document !== "undefined"
        ? document.querySelector("#policy-note")?.textContent || ""
        : "Zero date-modification fee.";
    const coordinatorHref =
      typeof document !== "undefined"
        ? document.querySelector("#coordinator-link")?.getAttribute("href") || "http://127.0.0.1:8080/"
        : "http://127.0.0.1:8080/";
    return JSON.parse(
      JSON.stringify({
        simulationDisclosure: "Independent demonstration electricity utility provider.",
        version: this.version,
        activation: this.activation,
        stagedDate: this.stagedDate,
        lastReceipt: this.lastReceipt,
        availableDates: this.dates,
        policyNote: policyText,
        coordinatorLink: coordinatorHref,
      }),
    );
  }

  stageDate(targetDate) {
    const found = this.dates.find((d) => d.date === targetDate);
    if (!found) return { ok: false, field: "targetDate", reason: `Date ${targetDate} unavailable.` };
    this.version += 1;
    this.stagedDate = found;
    this.render(`Staged energization date ${found.label} (${this.activation.activationRef} unchanged).`);
    return { ok: true, version: this.version, staged: JSON.parse(JSON.stringify(found)) };
  }

  clearStaged() {
    this.version += 1;
    this.stagedDate = null;
    this.render(`Cleared staged date; ${this.activation.activationRef} stays on ${this.activation.scheduledLabel}.`);
    return { ok: true, version: this.version };
  }

  resetToInitial() {
    this.version += 1;
    this.activation = {
      activationRef: "PFW-9921",
      meterPoint: "PRM-7510299481",
      scheduledDate: "2027-11-16",
      scheduledLabel: "Tue, Nov 16, 2027",
      window: "08:00–12:00",
      feeEur: "€30.00",
      status: "CONFIRMED",
    };
    this.stagedDate = null;
    this.lastReceipt = null;
    this.render("Reset PowerFlow activation PFW-9921 to baseline Tue, Nov 16, 2027.");
    return { ok: true, version: this.version };
  }

  exportIcs() {
    const ymd = this.activation.scheduledDate.replace(/-/g, "");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PowerFlow Energy//Open Agentic Web Peer//EN",
      "BEGIN:VEVENT",
      `UID:${this.activation.activationRef}@powerflow.agentic.peer`,
      `DTSTART:${ymd}T080000Z`,
      `DTEND:${ymd}T120000Z`,
      `SUMMARY:PowerFlow Energy — Meter ${this.activation.meterPoint} (${this.activation.activationRef})`,
      `DESCRIPTION:Activation Fee ${this.activation.feeEur} | Remote switch-on`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  checkShift(args) {
    if (args.activationRef !== this.activation.activationRef) {
      return { ok: false, field: "activationRef", reason: `Activation ${args.activationRef} not found.` };
    }
    if (args.expectedVersion !== this.version) {
      return { ok: false, field: "expectedVersion", reason: "Version mismatch; read state again first." };
    }
    const found = this.dates.find((d) => d.date === args.targetDate);
    if (!found) return { ok: false, field: "targetDate", reason: `Date ${args.targetDate} unavailable.` };
    return { ok: true, found };
  }

  confirmDateShift(args) {
    const check = this.checkShift(args);
    if (!check.ok) return { ok: false, field: check.field, reason: check.reason };
    this.version += 1;
    this.activation.scheduledDate = check.found.date;
    this.activation.scheduledLabel = check.found.label;
    this.activation.window = check.found.window;
    this.stagedDate = null;
    this.render(`Confirmed smart-meter activation ${this.activation.activationRef} for ${check.found.label}.`);
    return { ok: true, version: this.version, activation: JSON.parse(JSON.stringify(this.activation)) };
  }

  render(feedback = "") {
    if (typeof document === "undefined") return;
    const panel = document.querySelector("#grid-panel");
    if (panel) {
      panel.textContent = `${this.activation.activationRef} · Meter ${this.activation.meterPoint} · Date: ${this.activation.scheduledLabel} (${this.activation.window}) · Fee: ${this.activation.feeEur}`;
    }
    const fb = document.querySelector("#action-feedback");
    if (fb) fb.textContent = feedback;
  }

  bindDom() {
    if (typeof document === "undefined") return;
    this.render();
    document.querySelector("#stage-btn")?.addEventListener("click", () => {
      this.stageDate(document.querySelector("#grid-select")?.value || "2027-11-19");
    });
    document.querySelector("#shift-btn")?.addEventListener("click", () => {
      this.confirmDateShift({
        activationRef: this.activation.activationRef,
        targetDate: document.querySelector("#grid-select")?.value || "2027-11-19",
        expectedVersion: this.version,
      });
    });
  }
}

export class App {
  static page = new PowerFlowPage();
}

if (typeof document !== "undefined") {
  App.page.bindDom();
}
