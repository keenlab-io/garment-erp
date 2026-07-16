// Enum string-unions for `$type<...>()` column typing. `@erp/db` must NOT import
// `@erp/contracts` (M0 design D1), so these duplicate the enums in
// `packages/contracts/src/enums/iam.ts`. A compile-time parity test (task 5.5)
// keeps the two in lockstep — any drift fails the build.

// Account lifecycle. New users default to PENDING; login requires ACTIVE.
export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED";

// Action recorded on each audit_log row.
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "PERMISSION_CHANGE"
  | "FORCE_LOGOUT"
  | "APPROVE"
  | "VOID";

// ── M3 Inventory & Costing (spec §3.3) ────────────────────────────────────────
// These duplicate the enums in `packages/contracts/src/enums/inventory.ts` (the same
// no-cross-import rule as the IAM enums above); the parity test keeps them in lockstep.

// Item classification. RAW consumes into production, FINISHED is produced, CONSUMABLE
// is indirect (never a BOM output).
export type ItemType = "RAW" | "FINISHED" | "CONSUMABLE";

// Costing method per item. MAV (moving average) is the default; FIFO consumes lots
// oldest-first; STANDARD posts at the item's standard cost with variance captured.
export type CostingMethod = "MAV" | "FIFO" | "STANDARD";

// Signed direction of a stock_movement row. IN adds, OUT removes, ADJUST is a
// count/correction delta.
export type MovementDirection = "IN" | "OUT" | "ADJUST";

// Source document a movement references (`ref_type`), tracing every ledger row back to
// the receipt/issue/adjustment/count/backflush that produced it.
export type MovementRefType =
  | "GOODS_RECEIPT"
  | "GOODS_ISSUE"
  | "BACKFLUSH"
  | "ADJUSTMENT"
  | "COUNT";

// Landed-cost allocation basis at receipt confirm. VALUE by extended price, WEIGHT by
// qty×unit weight, QTY by quantity.
export type AllocMethod = "VALUE" | "WEIGHT" | "QTY";

// Why stock is being issued (goods_issue `purpose`).
export type IssuePurpose = "PRODUCTION" | "SALE" | "OTHER";

// Goods-receipt lifecycle: DRAFT → CONFIRMED (landed-cost alloc) → POSTED (ledger IN).
export type GoodsReceiptStatus = "DRAFT" | "CONFIRMED" | "POSTED";

// Goods-issue lifecycle: DRAFT → POSTED (ledger OUT).
export type GoodsIssueStatus = "DRAFT" | "POSTED";

// Stock-count lifecycle: OPEN → COUNTING → RECONCILED → ADJUSTED → CLOSED.
export type StockCountStatus = "OPEN" | "COUNTING" | "RECONCILED" | "ADJUSTED" | "CLOSED";

// Stock-adjustment lifecycle: DRAFT → APPROVED → POSTED (ledger ADJUST).
export type StockAdjustmentStatus = "DRAFT" | "APPROVED" | "POSTED";

// ── M2 HR & Payroll (spec §2.3) ───────────────────────────────────────────────
// These duplicate the enums in `packages/contracts/src/enums/hr.ts` (the same
// no-cross-import rule as the IAM/inventory enums above); the parity test keeps them
// in lockstep.

// How an employee is paid. DAILY is wage-per-day; MONTHLY is a fixed salary.
export type EmploymentType = "DAILY" | "MONTHLY";

// Employee lifecycle. New hires default to PROBATION; ACTIVE after confirmation;
// RESIGNED/SUSPENDED remove them from active payroll.
export type EmployeeStatus = "PROBATION" | "ACTIVE" | "RESIGNED" | "SUSPENDED";

// OT-request state machine: DRAFT → SUBMITTED → {APPROVED → RECONCILED → PAID | REJECTED}.
// RECONCILED fixes approved_hours = min(requested, attended).
export type OtRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "RECONCILED"
  | "PAID";

// Cash-advance state machine: SUBMITTED → {APPROVED (super-admin) → DISBURSED → REPAYING →
// CLEARED | REJECTED}. Ceiling is checked at SUBMITTED.
export type CashAdvanceStatus =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "DISBURSED"
  | "REPAYING"
  | "CLEARED";

// Payroll-run state machine: DRAFT → CALCULATED → APPROVED → PAID → CLOSED (no backward
// transitions). Re-calculation is only allowed while DRAFT/CALCULATED.
export type PayrollRunStatus = "DRAFT" | "CALCULATED" | "APPROVED" | "PAID" | "CLOSED";

// Kind of employee document. Files live in object storage, reachable only via signed URLs.
export type EmployeeDocumentType = "ID_CARD" | "CONTRACT" | "CERTIFICATE" | "OTHER";

// Pay-component direction. ALLOWANCE adds to gross, DEDUCTION subtracts from net.
export type PayComponentType = "ALLOWANCE" | "DEDUCTION";

// Cash-advance repayment mode. LUMP repays in one pull; INSTALLMENT spreads it over
// `installments` payroll periods.
export type RepaymentMode = "LUMP" | "INSTALLMENT";
