# Chaos Test Catalog — 15 Deterministic Distributed Failure Scenarios

**Module:** [`packages/chaos-lab/index.js`](../packages/chaos-lab/index.js)
**Automated Test Runner:** `node --test tests/chaos/chaos_suite.test.mjs`
**Interactive Browser Runner:** CONTINUITY UI → **Chaos Lab (15 Scenarios)** tab (`simulation_mode: true`)

> **Simulation Disclosure:** All 15 scenarios execute against isolated in-memory demonstration state and Ed25519 test keypairs. They never mutate external production systems or the user's active mission state.

---

| # | Scenario ID | Initial State | Injected Failure | Expected State Transition | Expected Result & Evidence | Human Intervention Required? |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | `CHAOS_01_PROVIDER_UNAVAILABLE` | 6 confirmed commitments; Plan A approved | `HomeConnect` peer endpoint goes offline right before commit dispatch | `APPROVED -> FAILED` | Saga halts cleanly; unexecuted peers are not corrupted; failure reason surfaced | **Yes** |
| **2** | `CHAOS_02_PRICE_DRIFT_AFTER_APPROVAL` | Plan A prepared & cryptographically approved (`change_fee_eur = €25`) | MoveCo fee drifts from `€25` to `€55` before dispatch | `APPROVED -> AWAITING_APPROVAL` | Canonical SHA-256 `approvalHash` mismatch pinpoints `[change_fee_eur]` and blocks execution | **Yes** |
| **3** | `CHAOS_03_COMMITTED_BEFORE_TIMEOUT` | Plan A approved & dispatched with `idempotency_key` | MoveCo commits server-side, then drops socket (`ETIMEDOUT`) | `DISPATCHED -> UNKNOWN -> RECONCILING -> COMMITTED` | Zero blind retries; reconciler queries `get_booking_status(idempotency_key)`, verifies Ed25519 receipt, marks `COMMITTED` | **No** *(auto-reconciled)* |
| **4** | `CHAOS_04_DUPLICATE_OPERATION_REPLAY` | Saga already committed | Consumed `approval_id` replayed (or concurrent double-submit `S5`) | Replay blocked pre-dispatch | `ApprovalEngine` synchronously rejects consumed `operation_id` | **Yes** |
| **5** | `CHAOS_05_INVALID_PROVIDER_RECEIPT` | Plan A dispatched | Provider response alters `scheduled_date` after Ed25519 signing | `DISPATCHED -> NEEDS_USER` | `ReceiptVerifier` returns `INVALID_SIGNATURE_OR_TAMPERED`; Coordinator refuses to claim success | **Yes** |
| **6** | `CHAOS_06_EXPIRED_QUOTE_OR_HOLD` | Slot holds prepared & approved | Commit attempted after `expires_at` hold window | `APPROVED -> AWAITING_APPROVAL` | Expired approval blocked before network write (`HALTED_BEFORE_COMMIT`) | **Yes** |
| **7** | `CHAOS_07_UNSUPPORTED_MODIFICATION` | MoveCo Tuesday `MC-8841` | MoveCo primary Friday crew 100% full | Primary refused -> Backup overflow offer selected | Solver synthesizes feasible plan with `off_swiftvan_backup_fri` under `€700` ceiling while keeping `MC-8841` held | **Yes** *(approval)* |
| **8** | `CHAOS_08_BUDGET_EXCEEDED` | Hard invariant `maximum_budget_eur = €700` | Emergency surge pricing pushes mission total to `€745` | Solver returns `feasible: false`, `plans: []` | Zero invalid plans recommended; exact budget violation (`€745 > €700`) explained | **Yes** |
| **9** | `CHAOS_09_UNAUTHORIZED_CANCELLATION_BLOCKED` | Authoritative mission invariants active | Prompt-injected LLM candidate sets `unauthorized_cancellation: true`, `commit_changes: true` | Hostile flags stripped at compiler gate | `compileMissionChange()` enforces `unauthorized_cancellation = false`, `commit_changes = false` and logs 4 security warnings | **Yes** |
| **10** | `CHAOS_10_MALFORMED_PEER_RESPONSE` | Peer discovery active | Peer returns negative prices and calendar-invalid date `2026-02-30` | Schema validation fails closed | `normalizePeerOffer()` throws structured validation error before reaching solver | **No** *(fail-closed)* |
| **11** | `CHAOS_11_COMPETING_ALTERNATIVE_OFFERS` | Multiple valid windows (Friday `€49` vs Saturday `€39` fiber) | Competing cost vs. speed offers fed to solver | Deterministic multi-plan ranking | Distinct `PLAN_A_MINIMAL_CHANGE` and `PLAN_B_LOWEST_COST` generated reproducibly | **Yes** *(plan choice)* |
| **12** | `CHAOS_12_DEPENDENCY_CYCLE` | Acyclic 6-node `MissionGraph` | Cyclic edge `Fiber -> MoveCo` inserted | Cycle rejected on insertion (`DEPENDENCY_CYCLE`) | 3-color DFS rejects cycle immediately; graph stays DAG | **Yes** |
| **13** | `CHAOS_13_CONFLICTING_DATES` | `MoveCo -> Fiber` (`ON_OR_AFTER`) | Fiber only offers Thursday Nov 19 while MoveCo arrives Friday Nov 20 | `feasible: false` (`INFEASIBLE_SCHEDULE_CONFLICT`) | Solver rejects temporal prerequisite conflict and explains exact edge violation | **Yes** |
| **14** | `CHAOS_14_PARTIAL_FAILURE_CONTROLLED_COMPENSATION` | Multi-step Saga executing | Ops 1–2 commit, then PermitFlow rejects mid-saga | `PARTIAL_HALTED_SAFE` | Remaining operations halted; `automatic_compensation_executed: false` enforced so irreversible/paid bookings are never rolled back without consent | **Yes** |
| **15** | `CHAOS_15_MISSING_STATUS_ENDPOINT` | Provider lacks status reconciliation (`supports_status_reconciliation: false`) | Network gateway `504` timeout during commit | `DISPATCHED -> UNKNOWN -> NEEDS_USER` | Refuses blind retry and escalates to human verification because non-execution cannot be proven | **Yes** |
