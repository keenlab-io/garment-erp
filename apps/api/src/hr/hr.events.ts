/**
 * M2 HR & Payroll domain-event names and payload shapes (design D1/D4/D5/D6). The module
 * emits these after commit; downstream consumers (notifications, statutory reporting) land
 * later and must be idempotent on the natural key in each payload.
 */

export const HR_EVENTS = {
  employeeCreated: "hr.employee.created",
  otApproved: "hr.ot_request.approved",
  cashAdvanceApproved: "hr.cash_advance.approved",
  cashAdvanceRejected: "hr.cash_advance.rejected",
  cashAdvanceDisbursed: "hr.cash_advance.disbursed",
  payrollApproved: "hr.payroll_run.approved",
  payslipGenerated: "hr.payslip.generated",
  probationEnding: "hr.employee.probation_ending",
} as const;

export interface EmployeeCreatedPayload {
  employee_id: string;
  emp_code: string;
}

export interface OtApprovedPayload {
  ot_request_id: string;
  employee_id: string;
}

export interface CashAdvancePayload {
  cash_advance_id: string;
  employee_id: string;
  amount: string;
}

export interface PayrollApprovedPayload {
  run_id: string;
  period: string;
  payslip_count: number;
}

export interface PayslipGeneratedPayload {
  payslip_id: string;
  employee_id: string;
  pdf_key: string;
}

export interface ProbationEndingPayload {
  employee_id: string;
  emp_code: string;
  probation_end_date: string;
}
