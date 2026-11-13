export class PowerFlowPage {
  constructor() {
    this.version = 1;
    this.activation = {
      activationRef: "PFW-9921",
      meterPoint: "PRM-7510299481",
      scheduledDate: "2026-11-17",
      scheduledLabel: "Tue, Nov 17, 2026",
      window: "08:00–12:00",
      feeEur: "€30.00",
      status: "CONFIRMED",
    };
    this.stagedDate = null;
    this.dates = [
      { date: "2026-11-19", label: "Thu, Nov 19, 2026", window: "08:00–12:00", feeEur: "€30.00" },
      { date: "2026-11-20", label: "Fri, Nov 20, 2026", window: "08:00–12:00", feeEur: "€30.00" },
    ];
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
      this.stageDate(document.querySelector("#grid-select")?.value || "2026-11-20");
    });
    document.querySelector("#shift-btn")?.addEventListener("click", () => {
      this.confirmDateShift({
        activationRef: this.activation.activationRef,
        targetDate: document.querySelector("#grid-select")?.value || "2026-11-20",
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
