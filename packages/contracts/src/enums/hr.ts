// M2 — HR & Payroll enums (spec §2.3). Employment/employee classifications, the
// OT-request / cash-advance / payroll-run state machines, plus the employee-document,
// pay-component, and cash-advance repayment descriptors. Keep in sync with
// @erp/db/schema/enums.ts (parity is asserted by test).

// How an employee is paid (spec §2.3). DAILY is wage-per-day; MONTHLY is a fixed salary.
export const EmploymentType = {
  DAILY: "DAILY",
  MONTHLY: "MONTHLY",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

// Employee lifecycle (spec §2.3). New hires default to PROBATION; ACTIVE after confirmation;
// RESIGNED/SUSPENDED remove them from active payroll.
export const EmployeeStatus = {
  PROBATION: "PROBATION",
  ACTIVE: "ACTIVE",
  RESIGNED: "RESIGNED",
  SUSPENDED: "SUSPENDED",
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

// OT-request state machine (spec §2.4): DRAFT → SUBMITTED → {APPROVED → RECONCILED → PAID |
// REJECTED}. RECONCILED fixes approved_hours = min(requested, attended).
export const OtRequestStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RECONCILED: "RECONCILED",
  PAID: "PAID",
} as const;
export type OtRequestStatus = (typeof OtRequestStatus)[keyof typeof OtRequestStatus];

// Cash-advance state machine (spec §2.4): SUBMITTED → {APPROVED (super-admin) → DISBURSED →
// REPAYING → CLEARED | REJECTED}. Ceiling is checked at SUBMITTED.
export const CashAdvanceStatus = {
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  DISBURSED: "DISBURSED",
  REPAYING: "REPAYING",
  CLEARED: "CLEARED",
} as const;
export type CashAdvanceStatus = (typeof CashAdvanceStatus)[keyof typeof CashAdvanceStatus];

// Payroll-run state machine (spec §2.4): DRAFT → CALCULATED → APPROVED → PAID → CLOSED
// (no backward transitions). Re-calculation is only allowed while DRAFT/CALCULATED.
export const PayrollRunStatus = {
  DRAFT: "DRAFT",
  CALCULATED: "CALCULATED",
  APPROVED: "APPROVED",
  PAID: "PAID",
  CLOSED: "CLOSED",
} as const;
export type PayrollRunStatus = (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus];

// Kind of employee document (spec §2.2 `employee_document.type`). Files are stored in object
// storage and reachable only via signed URLs.
export const EmployeeDocumentType = {
  ID_CARD: "ID_CARD",
  CONTRACT: "CONTRACT",
  CERTIFICATE: "CERTIFICATE",
  OTHER: "OTHER",
} as const;
export type EmployeeDocumentType =
  (typeof EmployeeDocumentType)[keyof typeof EmployeeDocumentType];

// Pay-component direction (spec §2.2 `pay_component.type`). ALLOWANCE adds to gross,
// DEDUCTION subtracts from net.
export const PayComponentType = {
  ALLOWANCE: "ALLOWANCE",
  DEDUCTION: "DEDUCTION",
} as const;
export type PayComponentType = (typeof PayComponentType)[keyof typeof PayComponentType];

// Cash-advance repayment mode (spec §2.2 `repayment_plan.mode`). LUMP repays in one pull;
// INSTALLMENT spreads it over `installments` payroll periods.
export const RepaymentMode = {
  LUMP: "LUMP",
  INSTALLMENT: "INSTALLMENT",
} as const;
export type RepaymentMode = (typeof RepaymentMode)[keyof typeof RepaymentMode];
