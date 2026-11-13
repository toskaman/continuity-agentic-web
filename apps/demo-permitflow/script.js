export class PermitFlowPage {
  constructor() {
    this.version = 1;
    this.dossier = {
      dossierRef: "PF-2049",
      zone: "Zone B Curbside Loading Bay (15m)",
      scheduledDate: "2026-11-17",
      scheduledLabel: "Tue, Nov 17, 2026",
      window: "07:30–14:00",
      prepFeeEur: "€35.00",
      amendmentFeeEur: "€10.00",
      status: "PREPARED_DOSSIER",
    };
    this.eligibleDates = [
      { date: "2026-11-20", label: "Fri, Nov 20, 2026", window: "07:30–14:00", totalEur: "€45.00" },
      { date: "2026-11-21", label: "Sat, Nov 21, 2026", window: "08:00–14:00", totalEur: "€45.00" },
    ];
    this.previewDate = null;
  }

  dateEnums() {
    return this.eligibleDates.map((d) => d.date);
  }

  getState() {
    const policyText =
      typeof document !== "undefined"
        ? document.querySelector("#policy-note")?.textContent || ""
        : "Demonstration dossier prep only; no access to municipal government databases.";
    const coordinatorHref =
      typeof document !== "undefined"
        ? document.querySelector("#coordinator-link")?.getAttribute("href") || "http://127.0.0.1:8080/"
        : "http://127.0.0.1:8080/";
    return JSON.parse(
      JSON.stringify({
        simulationDisclosure: "Demonstration permit dossier preparation — never modifies official municipal permits.",
        version: this.version,
        dossier: this.dossier,
        previewDate: this.previewDate,
        eligibleDates: this.eligibleDates,
        policyNote: policyText,
        coordinatorLink: coordinatorHref,
      }),
    );
  }

  stageDraftDate(targetDate) {
    const found = this.eligibleDates.find((d) => d.date === targetDate);
    if (!found) return { ok: false, field: "targetDate", reason: `Date ${targetDate} fails 48h notice check.` };
    this.version += 1;
    this.previewDate = found;
    this.render(`Staged draft preview for ${found.label} (dossier ${this.dossier.dossierRef} unchanged).`);
    return { ok: true, version: this.version, preview: JSON.parse(JSON.stringify(found)) };
  }

  checkAmendment(args) {
    if (args.dossierRef !== this.dossier.dossierRef) {
      return { ok: false, field: "dossierRef", reason: `Dossier ${args.dossierRef} not found.` };
    }
    if (args.expectedVersion !== this.version) {
      return { ok: false, field: "expectedVersion", reason: "Version mismatch; read state again first." };
    }
    const found = this.eligibleDates.find((d) => d.date === args.targetDate);
    if (!found) return { ok: false, field: "targetDate", reason: `Date ${args.targetDate} not eligible.` };
    return { ok: true, found };
  }

  updatePreparedDossier(args) {
    const check = this.checkAmendment(args);
    if (!check.ok) return { ok: false, field: check.field, reason: check.reason };
    this.version += 1;
    this.dossier.scheduledDate = check.found.date;
    this.dossier.scheduledLabel = check.found.label;
    this.dossier.window = check.found.window;
    this.dossier.prepFeeEur = check.found.totalEur;
    this.previewDate = null;
    this.render(`Updated prepared demonstration dossier ${this.dossier.dossierRef} to ${check.found.label} (${check.found.totalEur}).`);
    return { ok: true, version: this.version, dossier: JSON.parse(JSON.stringify(this.dossier)) };
  }

  render(feedback = "") {
    if (typeof document === "undefined") return;
    const panel = document.querySelector("#dossier-panel");
    if (panel) {
      panel.textContent = `${this.dossier.dossierRef} · ${this.dossier.zone} · Prepared Date: ${this.dossier.scheduledLabel} (${this.dossier.window}) · Fee: ${this.dossier.prepFeeEur} · Status: ${this.dossier.status}`;
    }
    const fb = document.querySelector("#action-feedback");
    if (fb) fb.textContent = feedback;
  }

  bindDom() {
    if (typeof document === "undefined") return;
    this.render();
    document.querySelector("#draft-btn")?.addEventListener("click", () => {
      const date = document.querySelector("#date-select")?.value || "2026-11-20";
      this.stageDraftDate(date);
    });
    document.querySelector("#amend-btn")?.addEventListener("click", () => {
      const date = document.querySelector("#date-select")?.value || "2026-11-20";
      this.updatePreparedDossier({
        dossierRef: this.dossier.dossierRef,
        targetDate: date,
        expectedVersion: this.version,
      });
    });
  }
}

export class App {
  static page = new PermitFlowPage();
}

if (typeof document !== "undefined") {
  App.page.bindDom();
}
