import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmployeesQuery, PayrollExportQuery } from "@erp/contracts";
import { api } from "../api/client.js";

/**
 * Query keys for the `hr` domain (M2 §2.1) — one place so a mutation's invalidation and a
 * query's key can never drift apart. The contract has no list/detail endpoints for OT requests
 * or cash advances (or for payroll runs themselves) yet — only create/act-on-a-known-id — so
 * those stay mutation-only below until that lands.
 */
export const hrKeys = {
  all: ["hr"] as const,
  departmentsAll: () => [...hrKeys.all, "departments"] as const,
  positionsAll: () => [...hrKeys.all, "positions"] as const,
  employeesAll: () => [...hrKeys.all, "employees"] as const,
  employees: (query: Partial<EmployeesQuery> = {}) => [...hrKeys.employeesAll(), query] as const,
  employee: (id: string) => [...hrKeys.employeesAll(), id] as const,
  payrollRunsAll: () => [...hrKeys.all, "payroll-runs"] as const,
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

export function useUploadEmployeeDocumentMutation() {
  const queryClient = useQueryClient();
  return api.hr.uploadEmployeeDocument.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.employee(variables.params.id) });
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
// No list/detail endpoint exists yet for OT requests — these act on a known id; the approval
// queue (M2 §4.3) invalidates whatever query backs it once that endpoint lands.

export function useCreateOtRequestMutation() {
  return api.hr.createOtRequest.useMutation();
}

export function useSubmitOtRequestMutation() {
  return api.hr.submitOtRequest.useMutation();
}

export function useApproveOtRequestMutation() {
  return api.hr.approveOtRequest.useMutation();
}

export function useReconcileOtRequestMutation() {
  return api.hr.reconcileOtRequest.useMutation();
}

// ── Cash advances ─────────────────────────────────────────────────────────────
// Same shape as OT requests — create/approve/disburse only, no list endpoint yet.

export function useCreateCashAdvanceMutation() {
  return api.hr.createCashAdvance.useMutation();
}

export function useApproveCashAdvanceMutation() {
  return api.hr.approveCashAdvance.useMutation();
}

export function useDisburseCashAdvanceMutation() {
  return api.hr.disburseCashAdvance.useMutation();
}

// ── Attendance ────────────────────────────────────────────────────────────────

export function useImportAttendanceMutation() {
  return api.hr.importAttendance.useMutation();
}

// ── Payroll ───────────────────────────────────────────────────────────────────

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
