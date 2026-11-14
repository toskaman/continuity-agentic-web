import { App } from "./script.js";
import { registerActions } from "./site-actions.js";
import { verifySignedReceiptHandoff } from "./vendor/cross-origin-bridge/index.js";
import { exposeActionsToWebMcp } from "./vendor/webmcp-adapter/index.js";

function fmtWeekday(iso) {
  const dt = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(dt.getTime())
    ? dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : iso;
}

exposeActionsToWebMcp(registerActions, { namespace: "permitflow" });

async function syncFromReceiptHash() {
  const m = (location.hash || "").match(/continuity_receipt=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const check = await verifySignedReceiptHandoff("permitflow", m[1]);
  if (!check.valid) return;
  const rb = check.receiptBody;
  App.page.version += 1;
  App.page.dossier.scheduledDate = rb.scheduled_date;
  App.page.dossier.scheduledLabel = fmtWeekday(rb.scheduled_date);
  if (rb.window) App.page.dossier.window = rb.window;
  if (typeof rb.total_price_eur === "number") {
    App.page.dossier.prepFeeEur = `€${rb.total_price_eur.toFixed(2)}`;
  }
  App.page.dossier.status = "PREPARED_DOSSIER_UPDATED";
  App.page.render(
    `✓ Cross-Origin Ed25519 Receipt Verified (${rb.receipt_id}): Dossier synced to ${App.page.dossier.scheduledLabel}.`,
  );
}

syncFromReceiptHash();
window.addEventListener("hashchange", syncFromReceiptHash);
if (typeof BroadcastChannel === "function") {
  const bc = new BroadcastChannel("continuity-peer-permitflow");
  bc.addEventListener("message", (ev) => {
    const rb = ev.data?.result?.receipt_envelope?.receipt_body;
    if (ev.data?.type === "PEER_COMMITTED" && rb) {
      App.page.dossier.scheduledDate = rb.scheduled_date;
      App.page.dossier.scheduledLabel = fmtWeekday(rb.scheduled_date);
      App.page.render(`✓ Live Bridge Dossier Update (${rb.receipt_id}): ${App.page.dossier.scheduledLabel}`);
    }
  });
}
