// MoveCo Express page state & shared business operations.
export class MoveCoPage {
  constructor() {
    this.version = 1;
    this.booking = {
      bookingRef: "MC-8841",
      service: "20m3 Luton Van + 3 Movers",
      scheduledDate: "2027-11-16",
      scheduledLabel: "Tue, Nov 16, 2027",
      window: "08:00–13:00",
      basePriceEur: "€390.00",
      baseCents: 39000,
      rescheduleFeeEur: "€25.00",
      rescheduleFeeCents: 2500,
      status: "CONFIRMED",
    };
    this.hold = null;
    this.slots = [
      {
        date: "2027-11-19",
        label: "Fri, Nov 19, 2027",
        window: "08:00–13:00",
        basePriceEur: "€390.00",
        rescheduleFeeEur: "€25.00",
        totalEur: "€415.00",
        totalCents: 41500,
      },
      {
        date: "2027-11-20",
        label: "Sat, Nov 20, 2027",
        window: "09:00–14:00",
        basePriceEur: "€420.00",
        rescheduleFeeEur: "€25.00",
        totalEur: "€445.00",
        totalCents: 44500,
      },
    ];
    this.lastReceipt = null;
  }

  slotDates() {
    return this.slots.map((s) => s.date);
  }

  getState() {
    const todayIso = new Date().toISOString().slice(0, 10);
    const coordinatorHref =
      typeof document !== "undefined"
        ? document.querySelector("#coordinator-link")?.getAttribute("href") || "http://127.0.0.1:8080/"
        : "http://127.0.0.1:8080/";
    const policyText =
      typeof document !== "undefined"
        ? document.querySelector("#policy-note")?.textContent || ""
        : "Reschedule fee: €25.00.";
    return JSON.parse(
      JSON.stringify({
        simulationDisclosure: "Independent demonstration moving provider.",
        todayIso,
        version: this.version,
        booking: this.booking,
        activeHold: this.hold,
        availableSlots: this.slots,
        lastReceipt: this.lastReceipt,
        policyNote: policyText,
        coordinatorLink: coordinatorHref,
      }),
    );
  }

  holdSlot(targetDate) {
    const slot = this.slots.find((s) => s.date === targetDate);
    if (!slot) {
      return { ok: false, field: "targetDate", reason: `No crew slot available on ${targetDate}.` };
    }
    this.version += 1;
    this.hold = {
      holdId: `HOLD-MC-${this.version}`,
      targetDate: slot.date,
      targetLabel: slot.label,
      window: slot.window,
      totalEur: slot.totalEur,
      originalBookingPreserved: true,
    };
    this.render(`Temporary hold ${this.hold.holdId} placed for ${slot.label}; ${this.booking.bookingRef} remains active.`);
    return { ok: true, version: this.version, hold: JSON.parse(JSON.stringify(this.hold)) };
  }

  releaseHold() {
    if (!this.hold) return { ok: true, released: false, version: this.version };
    const prevHoldId = this.hold.holdId;
    this.version += 1;
    this.hold = null;
    this.render(`Released temporary hold ${prevHoldId} at €0.00 fee; ${this.booking.bookingRef} stays confirmed.`);
    return { ok: true, released: true, holdId: prevHoldId, feeChargedEur: 0, version: this.version };
  }

  resetToInitial() {
    this.version += 1;
    this.booking = {
      bookingRef: "MC-8841",
      service: "20m3 Luton Van + 3 Movers",
      scheduledDate: "2027-11-16",
      scheduledLabel: "Tue, Nov 16, 2027",
      window: "08:00–13:00",
      basePriceEur: "€390.00",
      baseCents: 39000,
      rescheduleFeeEur: "€25.00",
      rescheduleFeeCents: 2500,
      status: "CONFIRMED",
    };
    this.hold = null;
    this.lastReceipt = null;
    this.render("Reset MoveCo booking MC-8841 to baseline Tue, Nov 16, 2027.");
    return { ok: true, version: this.version };
  }

  exportIcs() {
    const ymd = this.booking.scheduledDate.replace(/-/g, "");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MoveCo Express//Open Agentic Web Peer//EN",
      "BEGIN:VEVENT",
      `UID:${this.booking.bookingRef}@moveco.agentic.peer`,
      `DTSTART:${ymd}T080000Z`,
      `DTEND:${ymd}T130000Z`,
      `SUMMARY:MoveCo Express — ${this.booking.service} (${this.booking.bookingRef})`,
      `DESCRIPTION:Total ${this.booking.basePriceEur} | Status ${this.booking.status}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  checkReschedule(args) {
    if (args.bookingRef !== this.booking.bookingRef) {
      return { ok: false, field: "bookingRef", reason: `Booking ${args.bookingRef} not found on this page.` };
    }
    if (args.expectedVersion !== this.version) {
      return {
        ok: false,
        field: "expectedVersion",
        reason: `Page state changed (expected version ${args.expectedVersion}, current ${this.version}). Read state again first.`,
      };
    }
    const slot = this.slots.find((s) => s.date === args.targetDate);
    if (!slot) {
      return { ok: false, field: "targetDate", reason: `Date ${args.targetDate} is unavailable.` };
    }
    return { ok: true, slot };
  }

  confirmReschedule(args) {
    const check = this.checkReschedule(args);
    if (!check.ok) return { ok: false, field: check.field, reason: check.reason };
    const slot = check.slot;
    this.version += 1;
    this.booking.scheduledDate = slot.date;
    this.booking.scheduledLabel = slot.label;
    this.booking.window = slot.window;
    this.booking.basePriceEur = slot.totalEur;
    this.booking.baseCents = slot.totalCents;
    this.hold = null;
    this.lastReceipt = {
      receiptId: `RCPT-MC-${this.version}`,
      bookingRef: this.booking.bookingRef,
      newDate: slot.date,
      window: slot.window,
      totalChargedEur: slot.totalEur,
    };
    this.render(`Confirmed reschedule ${this.lastReceipt.receiptId} to ${slot.label} (${slot.totalEur}).`);
    return { ok: true, version: this.version, receipt: JSON.parse(JSON.stringify(this.lastReceipt)) };
  }

  render(feedback = "") {
    if (typeof document === "undefined") return;
    const panel = document.querySelector("#booking-panel");
    if (panel) {
      panel.textContent = `${this.booking.bookingRef} · ${this.booking.service} · Scheduled: ${this.booking.scheduledLabel} (${this.booking.window}) · Current Total: ${this.booking.basePriceEur}${this.hold ? ` · Active Hold: ${this.hold.holdId} for ${this.hold.targetLabel}` : ""}`;
    }
    const slotsEl = document.querySelector("#slots-panel");
    if (slotsEl) {
      slotsEl.innerHTML = this.slots
        .map(
          (s) =>
            `<div class="slot-card"><strong>${s.label}</strong><div>${s.window}</div><div>Total with €25 fee: <strong>${s.totalEur}</strong></div></div>`,
        )
        .join("");
    }
    const fb = document.querySelector("#action-feedback");
    if (fb) fb.textContent = feedback;
  }

  bindDom() {
    if (typeof document === "undefined") return;
    this.render();
    document.querySelector("#hold-btn")?.addEventListener("click", () => {
      const date = document.querySelector("#slot-select")?.value || "2027-11-19";
      this.holdSlot(date);
    });
    document.querySelector("#reschedule-btn")?.addEventListener("click", () => {
      const date = document.querySelector("#slot-select")?.value || "2027-11-19";
      this.confirmReschedule({
        bookingRef: this.booking.bookingRef,
        targetDate: date,
        expectedVersion: this.version,
      });
    });
  }
}

export class App {
  static page = new MoveCoPage();
}

if (typeof document !== "undefined") {
  App.page.bindDom();
}
