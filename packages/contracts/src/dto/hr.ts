import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { moneyString, qtyString } from "../money/index.js";
import {
  CashAdvanceStatus,
  EmployeeDocumentType,
  EmployeeStatus,
  EmploymentType,
  OtRequestStatus,
  PayrollRunStatus,
  RepaymentMode,
} from "../enums/index.js";
import {
  API_PREFIX,
  ifMatchHeader,
  jobAccepted,
  paginated,
  paginationQuery,
  uuid,
  withErrors,
} from "./_shared.js";

/**
 * M2 — HR & Payroll contract (spec §2, plan `docs/plans/M2-hr-payroll.md` §1). Router
 * `hrContract` covers the employee master & documents, org structure (departments ·
 * positions), salary history, OT request→approval→reconciliation, cash advances with
 * auto-deduction, attendance import, the payroll run engine, encrypted e-payslips, and the
 * PND.1 / SSO exports. Money and quantity cross the wire as decimal **strings**
 * (`moneyString`/`qtyString`), never floats. **Monetary fields are modelled `optional`**: a
 * caller without `hr.salary.view` gets them omitted entirely (never nulled — spec §2.8). Every
 * endpoint authorizes in-handler via `assertPermissions(user, "hr...")` (see M0 ts-rest note).
 */

const c = initContract();

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const employmentType = z.nativeEnum(EmploymentType);
export const employeeStatus = z.nativeEnum(EmployeeStatus);
export const employeeDocumentType = z.nativeEnum(EmployeeDocumentType);
export const otRequestStatus = z.nativeEnum(OtRequestStatus);
export const cashAdvanceStatus = z.nativeEnum(CashAdvanceStatus);
export const payrollRunStatus = z.nativeEnum(PayrollRunStatus);
export const repaymentMode = z.nativeEnum(RepaymentMode);

// ── Org structure ───────────────────────────────────────────────────────────────

/** A department node — `parent_id` self-references to form the org tree. */
export const Department = z.object({
  id: uuid,
  name: z.string(),
  parent_id: uuid.nullable(),
});
export type Department = z.infer<typeof Department>;

export const CreateDepartmentRequest = z.object({
  name: z.string().min(1),
  parent_id: uuid.optional(),
});
export type CreateDepartmentRequest = z.infer<typeof CreateDepartmentRequest>;

/** A position (job) within a department. */
export const Position = z.object({
  id: uuid,
  title: z.string(),
  job_description: z.string().nullable(),
  department_id: uuid,
});
export type Position = z.infer<typeof Position>;

export const CreatePositionRequest = z.object({
  title: z.string().min(1),
  job_description: z.string().optional(),
  department_id: uuid,
});
export type CreatePositionRequest = z.infer<typeof CreatePositionRequest>;

// ── Employees ─────────────────────────────────────────────────────────────────

/**
 * An employee master row — `emp_code` is auto-issued (`EXT0001`) on create. `national_id`
 * is encrypted PII (omitted without access) and `base_salary` (the current salary-record
 * amount) is a monetary field gated by `hr.salary.view`.
 */
export const Employee = z.object({
  id: uuid,
  emp_code: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  national_id: z.string().optional(), // PII — omitted without access
  employment_type: employmentType,
  status: employeeStatus,
  position_id: uuid.nullable(),
  hire_date: z.string(), // ISO date (YYYY-MM-DD)
  probation_end_date: z.string().nullable(),
  profile: z.record(z.unknown()),
  base_salary: moneyString.optional(), // gated by hr.salary.view — omitted, never nulled
  version: z.number().int().nonnegative(),
});
export type Employee = z.infer<typeof Employee>;

export const CreateEmployeeRequest = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  national_id: z.string().min(1).optional(),
  employment_type: employmentType,
  position_id: uuid.optional(),
  hire_date: z.string(), // ISO date (YYYY-MM-DD)
  probation_end_date: z.string().optional(),
  profile: z.record(z.unknown()).default({}),
});
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequest>;

/** A partial update (`If-Match` guarded); provided fields replace the stored values. */
export const UpdateEmployeeRequest = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  national_id: z.string().min(1).nullable().optional(),
  employment_type: employmentType.optional(),
  position_id: uuid.nullable().optional(),
  status: employeeStatus.optional(),
  probation_end_date: z.string().nullable().optional(),
  profile: z.record(z.unknown()).optional(),
});
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequest>;

/** Employees list query — cursor pagination plus the optional `filter[status]` facet. */
export const EmployeesQuery = paginationQuery.extend({
  "filter[status]": employeeStatus.optional(),
});
export type EmployeesQuery = z.infer<typeof EmployeesQuery>;

/** A stored employee document — the file lives in object storage under `file_key`. */
export const EmployeeDocument = z.object({
  id: uuid,
  employee_id: uuid,
  type: employeeDocumentType,
  file_key: z.string(),
  uploaded_at: z.string().datetime(),
});
export type EmployeeDocument = z.infer<typeof EmployeeDocument>;

// ── Salary ──────────────────────────────────────────────────────────────────────

/** A salary-history record — the current salary is the latest `effective_date <= today`. */
export const SalaryRecord = z.object({
  id: uuid,
  employee_id: uuid,
  base_salary: moneyString,
  effective_date: z.string(), // ISO date (YYYY-MM-DD)
});
export type SalaryRecord = z.infer<typeof SalaryRecord>;

export const CreateSalaryRequest = z.object({
  base_salary: moneyString,
  effective_date: z.string(), // ISO date (YYYY-MM-DD)
});
export type CreateSalaryRequest = z.infer<typeof CreateSalaryRequest>;

// ── Overtime ──────────────────────────────────────────────────────────────────

/**
 * An OT request — `rate_type` is a configurable rate key (e.g. `WEEKDAY_1_5`); `approved_hours`
 * is set at reconcile to `min(requested, attended)`.
 */
export const OtRequest = z.object({
  id: uuid,
  employee_id: uuid,
  work_date: z.string(), // ISO date (YYYY-MM-DD)
  start_time: z.string(), // HH:mm[:ss]
  end_time: z.string(), // HH:mm[:ss]
  reason: z.string().nullable(),
  rate_type: z.string(),
  approved_hours: qtyString.nullable(),
  status: otRequestStatus,
  approver_id: uuid.nullable(),
  version: z.number().int().nonnegative(),
});
export type OtRequest = z.infer<typeof OtRequest>;

export const CreateOtRequest = z.object({
  employee_id: uuid,
  work_date: z.string(), // ISO date (YYYY-MM-DD)
  start_time: z.string(), // HH:mm[:ss]
  end_time: z.string(), // HH:mm[:ss]
  reason: z.string().optional(),
  rate_type: z.string().min(1),
});
export type CreateOtRequest = z.infer<typeof CreateOtRequest>;

/** Reconcile an approved OT request — omitting `approved_hours` defaults to min(req, attended). */
export const ReconcileOtRequest = z.object({
  approved_hours: qtyString.optional(),
});
export type ReconcileOtRequest = z.infer<typeof ReconcileOtRequest>;

// ── Cash advances ─────────────────────────────────────────────────────────────

/** How a cash advance is repaid — `installments` applies only to INSTALLMENT plans. */
export const RepaymentPlan = z.object({
  mode: repaymentMode,
  installments: z.number().int().positive().optional(),
});
export type RepaymentPlan = z.infer<typeof RepaymentPlan>;

/** A cash advance — `outstanding` is the remaining balance (→ CLEARED at zero). */
export const CashAdvance = z.object({
  id: uuid,
  employee_id: uuid,
  amount: moneyString,
  reason: z.string().nullable(),
  status: cashAdvanceStatus,
  approver_id: uuid.nullable(),
  repayment_plan: RepaymentPlan.nullable(),
  outstanding: moneyString,
  /** `ceiling_pct × current base salary` at read time — "0" if the employee has no salary on file. */
  ceiling: moneyString,
  version: z.number().int().nonnegative(),
});
export type CashAdvance = z.infer<typeof CashAdvance>;

export const CreateCashAdvanceRequest = z.object({
  employee_id: uuid,
  amount: moneyString,
  reason: z.string().optional(),
  repayment_plan: RepaymentPlan.optional(),
});
export type CreateCashAdvanceRequest = z.infer<typeof CreateCashAdvanceRequest>;

// ── Attendance ────────────────────────────────────────────────────────────────

/** Result of an attendance import — the number of rows accepted into the ledger. */
export const AttendanceImportResult = z.object({
  rows_imported: z.number().int().nonnegative(),
});
export type AttendanceImportResult = z.infer<typeof AttendanceImportResult>;

// ── Payroll ───────────────────────────────────────────────────────────────────

/** A payroll run for one `period` (`YYYY-MM`) — periods are unique. */
export const PayrollRun = z.object({
  id: uuid,
  period: z.string(),
  status: payrollRunStatus,
  approved_by: uuid.nullable(),
  version: z.number().int().nonnegative(),
});
export type PayrollRun = z.infer<typeof PayrollRun>;

export const CreatePayrollRunRequest = z.object({
  period: z.string().min(1), // YYYY-MM
});
export type CreatePayrollRunRequest = z.infer<typeof CreatePayrollRunRequest>;

/** A payslip summary row — `gross`/`net` are monetary and gated by `hr.salary.view`. */
export const PayslipSummary = z.object({
  id: uuid,
  employee_id: uuid,
  gross: moneyString.optional(),
  net: moneyString.optional(),
});
export type PayslipSummary = z.infer<typeof PayslipSummary>;

/** Query for the statutory exports — the payroll period to export. */
export const PayrollExportQuery = z.object({
  period: z.string().min(1), // YYYY-MM
});
export type PayrollExportQuery = z.infer<typeof PayrollExportQuery>;

/** List query for payroll runs — optional status facet, newest period first. */
export const PayrollRunsQuery = z.object({
  "filter[status]": payrollRunStatus.optional(),
});
export type PayrollRunsQuery = z.infer<typeof PayrollRunsQuery>;

/** List query for OT requests — the approval queue filters to `filter[status]=SUBMITTED`. */
export const OtRequestsQuery = z.object({
  "filter[status]": otRequestStatus.optional(),
  "filter[employee_id]": uuid.optional(),
});
export type OtRequestsQuery = z.infer<typeof OtRequestsQuery>;

/** List query for cash advances — the approval queue filters to `filter[status]=SUBMITTED`. */
export const CashAdvancesQuery = z.object({
  "filter[status]": cashAdvanceStatus.optional(),
  "filter[employee_id]": uuid.optional(),
});
export type CashAdvancesQuery = z.infer<typeof CashAdvancesQuery>;

// ── Attendance records ───────────────────────────────────────────────────────

/** One employee's clock-in/out for one day — the monthly grid's underlying row. */
export const AttendanceRecord = z.object({
  employee_id: uuid,
  work_date: z.string(), // ISO date (YYYY-MM-DD)
  clock_in: z.string().datetime().nullable(),
  clock_out: z.string().datetime().nullable(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecord>;

/** List query for attendance — `filter[period]` (YYYY-MM) scopes the monthly grid. */
export const AttendanceQuery = z.object({
  "filter[period]": z.string().min(1), // YYYY-MM
  "filter[employee_id]": uuid.optional(),
});
export type AttendanceQuery = z.infer<typeof AttendanceQuery>;

// ── Router ────────────────────────────────────────────────────────────────────

export const hrContract = c.router(
  {
    // Org structure (hr.employee.manage)
    listDepartments: {
      method: "GET",
      path: "/departments",
      responses: withErrors({ 200: z.object({ departments: z.array(Department) }) }),
      summary: "List departments (the org tree)",
    },
    createDepartment: {
      method: "POST",
      path: "/departments",
      body: CreateDepartmentRequest,
      responses: withErrors({ 201: z.object({ department: Department }) }),
      summary: "Create a department",
    },
    listPositions: {
      method: "GET",
      path: "/positions",
      responses: withErrors({ 200: z.object({ positions: z.array(Position) }) }),
      summary: "List positions",
    },
    createPosition: {
      method: "POST",
      path: "/positions",
      body: CreatePositionRequest,
      responses: withErrors({ 201: z.object({ position: Position }) }),
      summary: "Create a position within a department",
    },

    // Employees (hr.employee.view / hr.employee.manage; salary fields gated by hr.salary.view)
    listEmployees: {
      method: "GET",
      path: "/employees",
      query: EmployeesQuery,
      responses: withErrors({ 200: paginated(Employee) }),
      summary: "List employees (paginated, optional status filter)",
    },
    createEmployee: {
      method: "POST",
      path: "/employees",
      body: CreateEmployeeRequest,
      responses: withErrors({ 201: z.object({ employee: Employee }) }),
      summary: "Create an employee (auto-issues emp_code)",
    },
    getEmployee: {
      method: "GET",
      path: "/employees/:id",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: z.object({ employee: Employee }) }),
      summary: "Get an employee (monetary fields omitted without hr.salary.view)",
    },
    updateEmployee: {
      method: "PUT",
      path: "/employees/:id",
      pathParams: z.object({ id: uuid }),
      headers: ifMatchHeader,
      body: UpdateEmployeeRequest,
      responses: withErrors({ 200: z.object({ employee: Employee }) }),
      summary: "Update an employee (If-Match; 409 on version conflict)",
    },
    listEmployeeDocuments: {
      method: "GET",
      path: "/employees/:id/documents",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: z.object({ documents: z.array(EmployeeDocument) }) }),
      summary: "List an employee's documents (hr.employee.view)",
    },
    uploadEmployeeDocument: {
      method: "POST",
      path: "/employees/:id/documents",
      pathParams: z.object({ id: uuid }),
      contentType: "multipart/form-data",
      body: z.object({ file: z.any(), type: employeeDocumentType }),
      responses: withErrors({ 201: z.object({ document: EmployeeDocument }) }),
      summary: "Upload an employee document (stored under a signed-URL file_key)",
    },
    getEmployeeDocumentUrl: {
      method: "GET",
      path: "/employees/:id/documents/:documentId/url",
      pathParams: z.object({ id: uuid, documentId: uuid }),
      responses: withErrors({ 302: z.object({ url: z.string() }) }),
      summary: "Redirect to a signed, expiring document URL (never rendered inline)",
    },
    addSalaryRecord: {
      method: "POST",
      path: "/employees/:id/salary",
      pathParams: z.object({ id: uuid }),
      body: CreateSalaryRequest,
      responses: withErrors({ 201: z.object({ salary: SalaryRecord }) }),
      summary: "Add a salary record (hr.salary.edit)",
    },

    // Overtime
    listOtRequests: {
      method: "GET",
      path: "/ot-requests",
      query: OtRequestsQuery,
      responses: withErrors({ 200: z.object({ ot_requests: z.array(OtRequest) }) }),
      summary: "List OT requests (optional status/employee filters; hr.ot.approve)",
    },
    createOtRequest: {
      method: "POST",
      path: "/ot-requests",
      body: CreateOtRequest,
      responses: withErrors({ 201: z.object({ ot_request: OtRequest }) }),
      summary: "Create a DRAFT OT request",
    },
    submitOtRequest: {
      method: "POST",
      path: "/ot-requests/:id/submit",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ ot_request: OtRequest }) }),
      summary: "Submit an OT request for approval",
    },
    approveOtRequest: {
      method: "POST",
      path: "/ot-requests/:id/approve",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ ot_request: OtRequest }) }),
      summary: "Approve a submitted OT request (hr.ot.approve)",
    },
    reconcileOtRequest: {
      method: "POST",
      path: "/ot-requests/:id/reconcile",
      pathParams: z.object({ id: uuid }),
      body: ReconcileOtRequest,
      responses: withErrors({ 200: z.object({ ot_request: OtRequest }) }),
      summary: "Reconcile approved_hours against attendance (defaults to min(req, attended))",
    },

    // Cash advances
    listCashAdvances: {
      method: "GET",
      path: "/cash-advances",
      query: CashAdvancesQuery,
      responses: withErrors({ 200: z.object({ cash_advances: z.array(CashAdvance) }) }),
      summary: "List cash advances (optional status/employee filters; hr.employee.manage)",
    },
    createCashAdvance: {
      method: "POST",
      path: "/cash-advances",
      body: CreateCashAdvanceRequest,
      responses: withErrors({ 201: z.object({ cash_advance: CashAdvance }) }),
      summary: "Request a cash advance (422 over the configured ceiling)",
    },
    approveCashAdvance: {
      method: "POST",
      path: "/cash-advances/:id/approve",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ cash_advance: CashAdvance }) }),
      summary: "Approve a cash advance (Super-Admin only)",
    },
    rejectCashAdvance: {
      method: "POST",
      path: "/cash-advances/:id/reject",
      pathParams: z.object({ id: uuid }),
      body: z.object({ reason: z.string().optional() }),
      responses: withErrors({ 200: z.object({ cash_advance: CashAdvance }) }),
      summary: "Reject a submitted cash advance (hr.employee.manage)",
    },
    disburseCashAdvance: {
      method: "POST",
      path: "/cash-advances/:id/disburse",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ cash_advance: CashAdvance }) }),
      summary: "Disburse an approved advance (outstanding = amount)",
    },

    // Attendance
    listAttendance: {
      method: "GET",
      path: "/attendance",
      query: AttendanceQuery,
      responses: withErrors({ 200: z.object({ attendance: z.array(AttendanceRecord) }) }),
      summary: "List attendance records for a period (monthly grid; hr.employee.manage)",
    },
    importAttendance: {
      method: "POST",
      path: "/attendance/import",
      contentType: "multipart/form-data",
      body: z.object({ file: z.any() }),
      responses: withErrors({ 200: AttendanceImportResult }),
      summary: "Import attendance rows from an Excel/CSV file",
    },

    // Payroll
    listPayrollRuns: {
      method: "GET",
      path: "/payroll-runs",
      query: PayrollRunsQuery,
      responses: withErrors({ 200: z.object({ payroll_runs: z.array(PayrollRun) }) }),
      summary: "List payroll runs, newest period first (hr.payroll.approve)",
    },
    createPayrollRun: {
      method: "POST",
      path: "/payroll-runs",
      body: CreatePayrollRunRequest,
      responses: withErrors({ 201: z.object({ payroll_run: PayrollRun }) }),
      summary: "Create a DRAFT payroll run for a period (unique)",
    },
    calculatePayrollRun: {
      method: "POST",
      path: "/payroll-runs/:id/calculate",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue payslip calculation (only while DRAFT/CALCULATED)",
    },
    listPayslips: {
      method: "GET",
      path: "/payroll-runs/:id/payslips",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: z.object({ payslips: z.array(PayslipSummary) }) }),
      summary: "List a run's payslips (monetary fields gated by hr.salary.view)",
    },
    approvePayrollRun: {
      method: "POST",
      path: "/payroll-runs/:id/approve",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ payroll_run: PayrollRun }) }),
      summary: "Approve a run — pulls outstanding advances into deductions (409 on double-approve)",
    },
    getPayslipPdf: {
      method: "GET",
      path: "/payslips/:id/pdf",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 302: z.object({ url: z.string() }) }),
      summary: "Redirect to a signed, expiring payslip PDF URL (self or hr.payslip.view)",
    },
    exportPnd1: {
      method: "GET",
      path: "/payroll/exports/pnd1",
      query: PayrollExportQuery,
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue a PND.1 withholding-tax export (non-authoritative)",
    },
    exportSso: {
      method: "GET",
      path: "/payroll/exports/sso",
      query: PayrollExportQuery,
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue a social-security (SSO) export (non-authoritative)",
    },
  },
  { pathPrefix: API_PREFIX },
);
