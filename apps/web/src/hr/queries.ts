import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttendanceQuery,
  CashAdvancesQuery,
  EmployeesQuery,
  OtRequestsQuery,
  PayrollExportQuery,
  PayrollRunsQuery,
} from "@erp/contracts";
import { api } from "../api/client.js";

/**
 * Query keys for the `hr` domain (M2 §2.1/§4). One place so a mutation's invalidation and a
 * query's key can never drift apart.
 */
export const hrKeys = {
  all: ["hr"] as const,
  departmentsAll: () => [...hrKeys.all, "departments"] as const,
  positionsAll: () => [...hrKeys.all, "positions"] as const,
  employeesAll: () => [...hrKeys.all, "employees"] as const,
  employees: (query: Partial<EmployeesQuery> = {}) => [...hrKeys.employeesAll(), query] as const,
  employee: (id: string) => [...hrKeys.employeesAll(), id] as const,
  employeeDocuments: (id: string) => [...hrKeys.employeesAll(), id, "documents"] as const,
  otRequestsAll: () => [...hrKeys.all, "ot-requests"] as const,
  otRequests: (query: Partial<OtRequestsQuery> = {}) => [...hrKeys.otRequestsAll(), query] as const,
  cashAdvancesAll: () => [...hrKeys.all, "cash-advances"] as const,
  cashAdvances: (query: Partial<CashAdvancesQuery> = {}) =>
    [...hrKeys.cashAdvancesAll(), query] as const,
  attendanceAll: () => [...hrKeys.all, "attendance"] as const,
  attendance: (query: Partial<AttendanceQuery> = {}) => [...hrKeys.attendanceAll(), query] as const,
  payrollRunsAll: () => [...hrKeys.all, "payroll-runs"] as const,
  payrollRuns: (query: Partial<PayrollRunsQuery> = {}) =>
    [...hrKeys.payrollRunsAll(), query] as const,
  payslips: (runId: string) => [...hrKeys.payrollRunsAll(), runId, "payslips"] as const,
  payslipPdf: (payslipId: string) => [...hrKeys.all, "payslips", payslipId, "pdf"] as const,
};

// ── Polling predicates ──────────────────────────────────────────────────────────
// Pure so they're unit-testable without faking react-query's refetch timers.

/**
 * The payroll `calculate` job (202 `{ job_id }`) has no status endpoint of its own — an empty
 * payslips list is the only observable "still running" signal, so poll on that while `poll` is
 * requested (M2 §2.1 "job-status polling", design MD1/MD5).
 */
export function payslipsPollInterval(
  data: { status: number; body?: { payslips: unknown[] } } | undefined,
  poll: boolean,
): number | false {
  if (!poll || !data) return false;
  return data.status === 200 && (data.body?.payslips.length ?? 0) === 0 ? 2000 : false;
}

/**
 * `getPayslipPdf` answers 409 ("not generated yet") until the background worker renders it —
 * poll on that until it flips to 302 (design MD5, job-toast "PDF pending" → download).
 */
export function payslipPdfPollInterval(data: { status: number } | undefined): number | false {
  return data?.status === 409 ? 3000 : false;
}

// ── Org structure ─────────────────────────────────────────────────────────────

export function useDepartmentsQuery() {
  return api.hr.listDepartments.useQuery(hrKeys.departmentsAll());
}

export function useCreateDepartmentMutation() {
  const queryClient = useQueryClient();
  return api.hr.createDepartment.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.departmentsAll() });
    },
  });
}

export function usePositionsQuery() {
  return api.hr.listPositions.useQuery(hrKeys.positionsAll());
}

export function useCreatePositionMutation() {
  const queryClient = useQueryClient();
  return api.hr.createPosition.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.positionsAll() });
    },
  });
}

// ── Employees ─────────────────────────────────────────────────────────────────
// Monetary fields (`base_salary`) arrive omitted (never nulled) for callers without
// `hr.salary.view` — the contract does the gating; screens (M2 §3–4) render `MaskedValue`.

export function useEmployeesQuery(query: Partial<EmployeesQuery> = {}) {
  return api.hr.listEmployees.useQuery(hrKeys.employees(query), { query });
}

export function useEmployeeQuery(id: string) {
  return api.hr.getEmployee.useQuery(hrKeys.employee(id), { params: { id } });
}

export function useCreateEmployeeMutation() {
  const queryClient = useQueryClient();
  return api.hr.createEmployee.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.employeesAll() });
    },
  });
}

export function useUpdateEmployeeMutation() {
  const queryClient = useQueryClient();
  return api.hr.updateEmployee.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.employeesAll() });
      void queryClient.invalidateQueries({ queryKey: hrKeys.employee(variables.params.id) });
    },
  });
}

export function useEmployeeDocumentsQuery(employeeId: string) {
  return api.hr.listEmployeeDocuments.useQuery(hrKeys.employeeDocuments(employeeId), {
    params: { id: employeeId },
  });
}

export function useUploadEmployeeDocumentMutation() {
  const queryClient = useQueryClient();
  return api.hr.uploadEmployeeDocument.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.employeeDocuments(variables.params.id) });
    },
  });
}

/**
 * A fresh signed URL is requested on demand (never cached/rendered inline) — wrapped as a
 * mutation like the export triggers below since it's an imperative "download now" action.
 */
export function useEmployeeDocumentUrlMutation() {
  return useMutation({
    mutationFn: async (params: { id: string; documentId: string }) => {
      const response = await api.hr.getEmployeeDocumentUrl.query({ params });
      if (response.status !== 302) throw response;
      return response.body.url;
    },
  });
}

export function useAddSalaryRecordMutation() {
  const queryClient = useQueryClient();
  return api.hr.addSalaryRecord.useMutation({
    onSuccess: (_data, variables) => {
      // base_salary is derived from the latest salary record — refresh the list row + detail.
      void queryClient.invalidateQueries({ queryKey: hrKeys.employeesAll() });
      void queryClient.invalidateQueries({ queryKey: hrKeys.employee(variables.params.id) });
    },
  });
}

// ── Overtime ──────────────────────────────────────────────────────────────────

export function useOtRequestsQuery(query: Partial<OtRequestsQuery> = {}) {
  return api.hr.listOtRequests.useQuery(hrKeys.otRequests(query), { query });
}

export function useCreateOtRequestMutation() {
  return api.hr.createOtRequest.useMutation();
}

export function useSubmitOtRequestMutation() {
  const queryClient = useQueryClient();
  return api.hr.submitOtRequest.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.otRequestsAll() });
    },
  });
}

export function useApproveOtRequestMutation() {
  const queryClient = useQueryClient();
  return api.hr.approveOtRequest.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.otRequestsAll() });
    },
  });
}

export function useReconcileOtRequestMutation() {
  const queryClient = useQueryClient();
  return api.hr.reconcileOtRequest.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.otRequestsAll() });
    },
  });
}

// ── Cash advances ─────────────────────────────────────────────────────────────

export function useCashAdvancesQuery(query: Partial<CashAdvancesQuery> = {}) {
  return api.hr.listCashAdvances.useQuery(hrKeys.cashAdvances(query), { query });
}

export function useCreateCashAdvanceMutation() {
  const queryClient = useQueryClient();
  return api.hr.createCashAdvance.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.cashAdvancesAll() });
    },
  });
}

export function useApproveCashAdvanceMutation() {
  const queryClient = useQueryClient();
  return api.hr.approveCashAdvance.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.cashAdvancesAll() });
    },
  });
}

export function useRejectCashAdvanceMutation() {
  const queryClient = useQueryClient();
  return api.hr.rejectCashAdvance.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.cashAdvancesAll() });
    },
  });
}

export function useDisburseCashAdvanceMutation() {
  const queryClient = useQueryClient();
  return api.hr.disburseCashAdvance.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.cashAdvancesAll() });
    },
  });
}

// ── Attendance ────────────────────────────────────────────────────────────────

export function useAttendanceQuery(query: AttendanceQuery) {
  return api.hr.listAttendance.useQuery(hrKeys.attendance(query), { query });
}

export function useImportAttendanceMutation() {
  const queryClient = useQueryClient();
  return api.hr.importAttendance.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.attendanceAll() });
    },
  });
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export function usePayrollRunsQuery(query: Partial<PayrollRunsQuery> = {}) {
  return api.hr.listPayrollRuns.useQuery(hrKeys.payrollRuns(query), { query });
}

export function useCreatePayrollRunMutation() {
  const queryClient = useQueryClient();
  return api.hr.createPayrollRun.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.payrollRunsAll() });
    },
  });
}

/**
 * `calculate` enqueues the payslip-calculation job (202 `{ job_id }`) — pair this with
 * `usePayslipsQuery(runId, { poll: true })`, which is what actually observes completion.
 */
export function useCalculatePayrollRunMutation() {
  const queryClient = useQueryClient();
  return api.hr.calculatePayrollRun.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.payslips(variables.params.id) });
    },
  });
}

/** `poll: true` refetches on an interval while the run's payslips are still empty (see above). */
export function usePayslipsQuery(runId: string, options: { poll?: boolean } = {}) {
  const queryKey = hrKeys.payslips(runId);
  return api.hr.listPayslips.useQuery(
    queryKey,
    { params: { id: runId } },
    {
      // ts-rest's `options` type is the raw TanStack options (queryKey required) even though
      // the positional queryKey above already sets it — restate it here to satisfy that type.
      queryKey,
      refetchInterval: (query) => payslipsPollInterval(query.state.data, options.poll ?? false),
    },
  );
}

export function useApprovePayrollRunMutation() {
  const queryClient = useQueryClient();
  return api.hr.approvePayrollRun.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.payrollRunsAll() });
      void queryClient.invalidateQueries({ queryKey: hrKeys.payslips(variables.params.id) });
    },
  });
}

/**
 * Polls on the 409 "not generated yet" response until the background worker renders the PDF.
 * Built on the raw (non-throwing) `query()` fetcher rather than the generated `useQuery` — that
 * one throws for any non-2xx status (including this route's 302 "ready" response, per ts-rest's
 * `isErrorResponse`), which would surface the signed URL as a query *error* instead of data.
 */
export function usePayslipPdfQuery(payslipId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: hrKeys.payslipPdf(payslipId),
    queryFn: () => api.hr.getPayslipPdf.query({ params: { id: payslipId } }),
    enabled: options.enabled ?? true,
    refetchInterval: (query) => payslipPdfPollInterval(query.state.data),
  });
}

/**
 * PND.1 / SSO exports are modelled as `GET` routes in the contract (they only take a query
 * string), so ts-rest gives them `query`/`useQuery`, not `useMutation` — wrap the imperative
 * `query()` fetch as a plain TanStack mutation so screens can trigger them like any other action.
 * The 202 response has no companion status/result endpoint yet — unlike `reporting`'s
 * `GET /exports/{job_id}` — so the job-toast can announce that the export started; wire the
 * download once the contract grows a matching poll endpoint for these.
 */
export function useExportPnd1Mutation() {
  return useMutation({
    mutationFn: async (query: PayrollExportQuery) => {
      const response = await api.hr.exportPnd1.query({ query });
      if (response.status !== 202) throw response;
      return response.body;
    },
  });
}

export function useExportSsoMutation() {
  return useMutation({
    mutationFn: async (query: PayrollExportQuery) => {
      const response = await api.hr.exportSso.query({ query });
      if (response.status !== 202) throw response;
      return response.body;
    },
  });
}
