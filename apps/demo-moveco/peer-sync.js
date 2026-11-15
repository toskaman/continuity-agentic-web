import { App } from "./script.js";
import { registerActions } from "./site-actions.js";
import { getOrCreateOriginKeyPair, verifySignedReceiptHandoff } from "./vendor/cross-origin-bridge/index.js";
import { exposeActionsToWebMcp } from "./vendor/webmcp-adapter/index.js";

function fmtWeekday(iso) {
  const dt = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(dt.getTime())
    ? dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : iso;
}

exposeActionsToWebMcp(registerActions, { namespace: "moveco" });

async function syncFromReceiptHash() {
  const m = (location.hash || "").match(/continuity_receipt=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const check = await verifySignedReceiptHandoff("moveco", m[1]);
  if (!check.valid) return;
  const rb = check.receiptBody;
  App.page.version += 1;
  App.page.booking.scheduledDate = rb.scheduled_date;
  App.page.booking.scheduledLabel = fmtWeekday(rb.scheduled_date);
  if (rb.window) App.page.booking.window = rb.window;
  if (typeof rb.total_price_eur === "number") {
    App.page.booking.basePriceEur = `€${rb.total_price_eur.toFixed(2)}`;
  }
  App.page.hold = null;
  App.page.render(
    `✓ Cross-Origin Ed25519 Receipt Verified (${rb.receipt_id}): Reservation synced to ${App.page.booking.scheduledLabel} (${App.page.booking.window}).`,
  );
}

syncFromReceiptHash();
window.addEventListener("hashchange", syncFromReceiptHash);
if (typeof BroadcastChannel === "function") {
  const bc = new BroadcastChannel("continuity-peer-moveco");
  bc.addEventListener("message", async (ev) => {
    const token = ev.data?.result?.handoff_token;
    if (ev.data?.type !== "PEER_COMMITTED" || typeof token !== "string") return;
    const pinnedKey = await getOrCreateOriginKeyPair("moveco");
    const check = await verifySignedReceiptHandoff("moveco", token, { pinnedKey });
    if (!check.valid) return;
    const rb = check.receiptBody;
    App.page.version += 1;
    App.page.booking.scheduledDate = rb.scheduled_date;
    App.page.booking.scheduledLabel = fmtWeekday(rb.scheduled_date);
    if (rb.window) App.page.booking.window = rb.window;
    App.page.hold = null;
    App.page.render(`✓ Live Bridge Commit Verified (${rb.receipt_id}): ${App.page.booking.scheduledLabel}`);
  });
}
