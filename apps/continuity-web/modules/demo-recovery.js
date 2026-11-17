import { reconcileOperationOutcome } from "../vendor/outcome-reconciliation/index.js";
import { isValidIsoDate } from "../vendor/shared-schemas/index.js";

const STORAGE_KEY = "continuity-guided-demo/v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveDemoCheckpoint({ peerOrigins, operations, solverResult, selectedPlanId, compiledProposal }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(), peerOrigins, operations, solverResult, selectedPlanId, compiledProposal,
    }));
  } catch {
    // Private browsing can disable storage. Execution and downloads still work for the current page.
  }
}

export function clearDemoCheckpoint() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export function readDemoCheckpoint(peerOrigins) {
  try {
    const record = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (!record || !Number.isFinite(record.savedAt) || Date.now() - record.savedAt > MAX_AGE_MS) return null;
    if (Object.keys(peerOrigins).some((id) => record.peerOrigins?.[id] !== peerOrigins[id])) return null;
    if (!Array.isArray(record.operations) || record.operations.length < 1 || record.operations.length > 4) return null;
    if (!record.solverResult?.plans?.some((plan) => plan.plan_id === record.selectedPlanId)) return null;
    if (!isValidIsoDate(record.compiledProposal?.requested_change?.new_value)) return null;
    return record;
  } catch {
    return null;
  }
}

export async function recoverDemoOperations(record, graph, harness) {
  const recovered = await Promise.all(record.operations.map(async (op) => {
    const booking = graph.nodes.get(op.commitment_id);
    if (!booking || booking.provider_id !== op.provider_id || booking.booking_ref !== op.original_booking_ref
      || !isValidIsoDate(op.proposed_date) || typeof op.idempotency_key !== "string") return null;
    try {
      if (!harness) throw new Error("Provider connection unavailable.");
      const status = await harness.clients[op.provider_id].queryStatus({
        bookingRef: booking.booking_ref,
        idempotencyKey: op.idempotency_key,
      });
      const check = await reconcileOperationOutcome({ expectedOp: op, providerStatus: status, receiptVerifier: harness.verifier });
      if (check.outcomeState === "COMMITTED" && check.proofResult?.trusted) {
        return { ...op, state: "COMMITTED", proof_verification: check.proofResult, receipt_envelope: status.receipt_envelope, handoff_token: status.handoff_token };
      }
      if (status.execution_state === "NOT_FOUND_NEVER_EXECUTED") {
        return { ...op, state: "FAILED", evidence_summary: "The provider reports that this change was never executed." };
      }
    } catch {
      // Read-only recovery deliberately avoids guessing or resending a change.
    }
    return { ...op, state: "UNKNOWN", evidence_summary: "Check the provider before trying this change again." };
  }));
  if (recovered.some((op) => !op)) return null;

  for (const op of recovered) {
    const committed = op.state === "COMMITTED";
    graph.updateNode(op.commitment_id, {
      visual_state: op.state,
      ...(committed ? {
        scheduled_date: op.proposed_date,
        window: op.window,
        provider_name: op.provider_name,
        price_eur: op.expected_total_eur,
        observed: { verified: true, evidence_trust: op.proof_verification.level },
      } : {}),
    });
  }
  return recovered;
}
