export class HomeConnectPage {
  constructor() {
    this.version = 1;
    this.appointment = {
      appointmentRef: "HC-5510",
      plan: "2 Gbps Symmetric Fiber + ONT Splice",
      scheduledDate: "2026-11-17",
      scheduledLabel: "Tue, Nov 17, 2026",
      window: "14:00–17:00",
      installFeeEur: "€49.00",
      status: "CONFIRMED",
    };
    this.hold = null;
    this.windows = [
      { date: "2026-11-20", label: "Fri, Nov 20, 2026", window: "14:00–17:00", feeEur: "€49.00" },
      { date: "2026-11-21", label: "Sat, Nov 21, 2026", window: "09:00–12:00", feeEur: "€39.00" },
    ];
  }

  windowDates() {
    return this.windows.map((w) => w.date);
  }

  getState() {
    const policyText =
      typeof document !== "undefined"
        ? document.querySelector("#policy-note")?.textContent || ""
        : "Zero reschedule fee.";
    const coordinatorHref =
      typeof document !== "undefined"
        ? document.querySelector("#coordinator-link")?.getAttribute("href") || "http://127.0.0.1:8080/"
        : "http://127.0.0.1:8080/";
    return JSON.parse(
      JSON.stringify({
        simulationDisclosure: "Independent demonstration fiber broadband provider.",
        version: this.version,
        appointment: this.appointment,
        activeHold: this.hold,
        availableWindows: this.windows,
        policyNote: policyText,
        coordinatorLink: coordinatorHref,
      }),
    );
  }

  holdWindow(targetDate) {
    const win = this.windows.find((w) => w.date === targetDate);
    if (!win) return { ok: false, field: "targetDate", reason: `No technician window on ${targetDate}.` };
    this.version += 1;
    this.hold = { holdId: `HOLD-HC-${this.version}`, ...win, originalAppointmentPreserved: true };
    this.render(`Held technician window ${this.hold.holdId} for ${win.label}; ${this.appointment.appointmentRef} stays active.`);
    return { ok: true, version: this.version, hold: JSON.parse(JSON.stringify(this.hold)) };
  }

  checkChange(args) {
    if (args.appointmentRef !== this.appointment.appointmentRef) {
      return { ok: false, field: "appointmentRef", reason: `Appointment ${args.appointmentRef} not found.` };
    }
    if (args.expectedVersion !== this.version) {
      return { ok: false, field: "expectedVersion", reason: "Version mismatch; read state again first." };
    }
    const win = this.windows.find((w) => w.date === args.targetDate);
    if (!win) return { ok: false, field: "targetDate", reason: `Window ${args.targetDate} unavailable.` };
    return { ok: true, win };
  }

  confirmAppointmentChange(args) {
    const check = this.checkChange(args);
    if (!check.ok) return { ok: false, field: check.field, reason: check.reason };
    this.version += 1;
    this.appointment.scheduledDate = check.win.date;
    this.appointment.scheduledLabel = check.win.label;
    this.appointment.window = check.win.window;
    this.appointment.installFeeEur = check.win.feeEur;
    this.hold = null;
    this.render(`Confirmed fiber appointment ${this.appointment.appointmentRef} for ${check.win.label} (${check.win.feeEur}).`);
    return { ok: true, version: this.version, appointment: JSON.parse(JSON.stringify(this.appointment)) };
  }

  render(feedback = "") {
    if (typeof document === "undefined") return;
    const panel = document.querySelector("#appt-panel");
    if (panel) {
      panel.textContent = `${this.appointment.appointmentRef} · ${this.appointment.plan} · Date: ${this.appointment.scheduledLabel} (${this.appointment.window}) · Fee: ${this.appointment.installFeeEur}${this.hold ? ` · Active Hold: ${this.hold.holdId}` : ""}`;
    }
    const fb = document.querySelector("#action-feedback");
    if (fb) fb.textContent = feedback;
  }

  bindDom() {
    if (typeof document === "undefined") return;
    this.render();
    document.querySelector("#hold-btn")?.addEventListener("click", () => {
      this.holdWindow(document.querySelector("#win-select")?.value || "2026-11-20");
    });
    document.querySelector("#change-btn")?.addEventListener("click", () => {
      this.confirmAppointmentChange({
        appointmentRef: this.appointment.appointmentRef,
        targetDate: document.querySelector("#win-select")?.value || "2026-11-20",
        expectedVersion: this.version,
      });
    });
  }
}

export class App {
  static page = new HomeConnectPage();
}

if (typeof document !== "undefined") {
  App.page.bindDom();
}
