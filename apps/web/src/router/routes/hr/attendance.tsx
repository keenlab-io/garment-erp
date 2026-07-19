import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, PermissionButton, useToast } from "@erp/ui";
import { useAttendanceQuery, useEmployeesQuery, useImportAttendanceMutation } from "../../../hr/queries.js";
import { AttendanceMonthGrid, type AttendanceRecord } from "../../../hr/components/attendance-month-grid.js";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The attendance screen (M2 §4.4): import + the monthly grid. The `attendance` table only
 * tracks `clock_in`/`clock_out` (no leave/holiday distinction) — a day with either clock
 * timestamp maps to "present"; a day with a row but neither timestamp maps to "absent". Days
 * with no row at all render as "no record" (the grid's own default), never fabricated as leave
 * or holiday since the API has no such source.
 */
export function AttendancePage() {
  const { t } = useTranslation(["hr", "common"]);
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [period, setPeriod] = React.useState(currentPeriod);
  const attendance = useAttendanceQuery({ "filter[period]": period });
  const employees = useEmployeesQuery({ limit: 100 });
  const importAttendance = useImportAttendanceMutation();

  const gridEmployees = React.useMemo(
    () => (employees.data?.body.data ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` })),
    [employees.data],
  );

  const records = React.useMemo<AttendanceRecord[]>(
    () =>
      (attendance.data?.body.attendance ?? []).map((r) => ({
        employeeId: r.employee_id,
        date: r.work_date,
        status: r.clock_in || r.clock_out ? "present" : "absent",
      })),
    [attendance.data],
  );

  function handleFile(file: File | undefined) {
    if (!file) return;
    importAttendance.mutate(
      { body: { file } },
      {
        onSuccess: (result) =>
          toast({
            tone: "success",
            title: t("attendance.importSuccess", { count: result.body.rows_imported }),
          }),
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("attendance.title")}</h1>
        <div className="flex items-end gap-3">
          <FormField label={t("attendance.periodLabel")}>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </FormField>
          <PermissionButton
            required="hr.employee.manage"
            onClick={() => inputRef.current?.click()}
            loading={importAttendance.isPending}
          >
            {t("attendance.import")}
          </PermissionButton>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            aria-label={t("attendance.import")}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {attendance.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-danger">{t("attendance.loadError")}</p>
          <Button variant="secondary" onClick={() => attendance.refetch()}>
            {t("common:actions.retry")}
          </Button>
        </div>
      ) : (
        <AttendanceMonthGrid
          period={period}
          employees={gridEmployees}
          records={records}
          labels={{
            employeeColumn: t("attendance.columnEmployee"),
            legendTitle: t("attendance.legendTitle"),
            empty: t("attendance.noEmployeesInScope"),
          }}
          statusLabels={{
            present: t("attendance.statusPresent"),
            absent: t("attendance.statusAbsent"),
            leave: t("attendance.statusLeave"),
            holiday: t("attendance.statusHoliday"),
          }}
          noRecordLabel={t("attendance.statusNoRecord")}
        />
      )}
    </div>
  );
}
