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

exposeActionsToWebMcp(registerActions, { namespace: "homeconnect" });

const seenReceipts = new Set();

function applyVerifiedHomeConnectReceipt(check, sourceLabel) {
  const rb = check.receiptBody;
  if (rb.receipt_id && seenReceipts.has(rb.receipt_id)) return;
  if (rb.receipt_id) seenReceipts.add(rb.receipt_id);
  const keyShort = check.proof?.key_id || "ed25519";
  const shaShort = String(check.proof?.payload_sha256 || "").slice(0, 12);
  App.page.version += 1;
  App.page.appointment.scheduledDate = rb.scheduled_date;
  App.page.appointment.scheduledLabel = fmtWeekday(rb.scheduled_date);
  if (rb.window) App.page.appointment.window = rb.window;
  if (typeof rb.total_price_eur === "number") {
    App.page.appointment.installFeeEur = `€${rb.total_price_eur.toFixed(2)}`;
  }
  App.page.hold = null;
  App.page.lastReceipt = {
    receiptId: rb.receipt_id,
    keyId: keyShort,
    payloadSha256: check.proof?.payload_sha256 || null,
    trustSource: check.trustSource || sourceLabel,
  };
  App.page.render(
    `✓ ${sourceLabel} Verified (${rb.receipt_id} · ${keyShort} · sha256:${shaShort}…): Technician visit synced to ${App.page.appointment.scheduledLabel}.`,
  );
}

async function syncFromReceiptHash() {
  const m = (location.hash || "").match(/continuity_receipt=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const check = await verifySignedReceiptHandoff("homeconnect", m[1]);
  if (!check.valid) return;
  applyVerifiedHomeConnectReceipt(check, "Cross-Origin Ed25519 Receipt");
}

syncFromReceiptHash();
window.addEventListener("hashchange", syncFromReceiptHash);
if (typeof BroadcastChannel === "function") {
  const bc = new BroadcastChannel("continuity-peer-homeconnect");
  bc.addEventListener("message", async (ev) => {
    if (ev.data?.type === "PEER_RESET") {
      seenReceipts.clear();
      App.page.resetToInitial?.();
      return;
    }
    const token = ev.data?.result?.handoff_token;
    if (ev.data?.type !== "PEER_COMMITTED" || typeof token !== "string") return;
    const pinnedKey = await getOrCreateOriginKeyPair("homeconnect");
    const check = await verifySignedReceiptHandoff("homeconnect", token, { pinnedKey });
    if (!check.valid) return;
    applyVerifiedHomeConnectReceipt(check, "Live Bridge Ed25519 Appointment");
  });
}
