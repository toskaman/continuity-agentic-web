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

exposeActionsToWebMcp(registerActions, { namespace: "powerflow" });

async function syncFromReceiptHash() {
  const m = (location.hash || "").match(/continuity_receipt=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const check = await verifySignedReceiptHandoff("powerflow", m[1]);
  if (!check.valid) return;
  const rb = check.receiptBody;
  App.page.version += 1;
  App.page.activation.scheduledDate = rb.scheduled_date;
  App.page.activation.scheduledLabel = fmtWeekday(rb.scheduled_date);
  if (rb.window) App.page.activation.window = rb.window;
  App.page.render(
    `✓ Cross-Origin Ed25519 Receipt Verified (${rb.receipt_id}): Smart-meter date synced to ${App.page.activation.scheduledLabel}.`,
  );
}

syncFromReceiptHash();
window.addEventListener("hashchange", syncFromReceiptHash);
if (typeof BroadcastChannel === "function") {
  const bc = new BroadcastChannel("continuity-peer-powerflow");
  bc.addEventListener("message", (ev) => {
    const rb = ev.data?.result?.receipt_envelope?.receipt_body;
    if (ev.data?.type === "PEER_COMMITTED" && rb) {
      App.page.activation.scheduledDate = rb.scheduled_date;
      App.page.activation.scheduledLabel = fmtWeekday(rb.scheduled_date);
      App.page.render(`✓ Live Bridge Activation (${rb.receipt_id}): ${App.page.activation.scheduledLabel}`);
    }
  });
}
