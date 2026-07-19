import * as React from "react";
import { cn } from "@erp/ui";

export type AttendanceDayStatus = "present" | "absent" | "leave" | "holiday";

export interface AttendanceEmployee {
  id: string;
  name: string;
}

export interface AttendanceRecord {
  employeeId: string;
  /** ISO date (YYYY-MM-DD), must fall within `period`. */
  date: string;
  status: AttendanceDayStatus;
}

interface DayGlyph {
  glyph: string;
  tone: string;
}

/** Glyph + tone never localize (a single-letter, non-color-only signature); only the label does. */
const DAY_GLYPH: Record<AttendanceDayStatus, DayGlyph> = {
  present: { glyph: "P", tone: "bg-success-subtle text-success-on" },
  absent: { glyph: "A", tone: "bg-danger-subtle text-danger-on" },
  leave: { glyph: "L", tone: "bg-warning-subtle text-warning-on" },
  holiday: { glyph: "H", tone: "bg-info-subtle text-info-on" },
};
const UNRECORDED_GLYPH: DayGlyph = { glyph: "–", tone: "text-text-muted" };

export interface AttendanceMonthGridLabels {
  employeeColumn: string;
  legendTitle: string;
  empty: string;
}

const defaultLabels: AttendanceMonthGridLabels = {
  employeeColumn: "Employee",
  legendTitle: "Legend",
  empty: "No employees in scope.",
};

const defaultStatusLabels: Record<AttendanceDayStatus, string> = {
  present: "Present",
  absent: "Absent",
  leave: "Leave",
  holiday: "Holiday",
};

export interface AttendanceMonthGridProps {
  /** The month being reviewed, "YYYY-MM". */
  period: string;
  employees: AttendanceEmployee[];
  records: AttendanceRecord[];
  labels?: Partial<AttendanceMonthGridLabels>;
  /** Per-status day labels (legend + cell `aria-label`/`title`). */
  statusLabels?: Partial<Record<AttendanceDayStatus, string>>;
  /** Label for a day with no attendance row at all. */
  noRecordLabel?: string;
  className?: string;
}

/** Number of days in a "YYYY-MM" period. */
function daysInPeriod(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return new Date(year!, month!, 0).getDate();
}

/**
 * Attendance monthly grid (M2 §3.4) — rows are employees, columns are the days of `period`; each
 * cell shows the day's attendance status as a letter glyph (never color alone). Presentational:
 * the attendance screen (M2 §4.4) supplies `records` from the import result / attendance query.
 */
export function AttendanceMonthGrid({
  period,
  employees,
  records,
  labels: labelsProp,
  statusLabels: statusLabelsProp,
  noRecordLabel = "No record",
  className,
}: AttendanceMonthGridProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const statusLabels = { ...defaultStatusLabels, ...statusLabelsProp };
  const days = React.useMemo(() => Array.from({ length: daysInPeriod(period) }, (_, i) => i + 1), [period]);

  const byCell = React.useMemo(() => {
    const map = new Map<string, AttendanceDayStatus>();
    for (const record of records) map.set(`${record.employeeId}:${record.date}`, record.status);
    return map;
  }, [records]);

  if (employees.length === 0) {
    return <p className={cn("text-sm text-text-muted", className)}>{labels.empty}</p>;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="border-collapse text-left text-sm">
          <thead className="bg-bg-sunken">
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-bg-sunken px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted"
              >
                {labels.employeeColumn}
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="px-1.5 py-2 text-center text-caption font-semibold text-text-muted"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-border last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-bg-surface px-3 py-1.5 text-left font-normal text-text-primary"
                >
                  {employee.name}
                </th>
                {days.map((day) => {
                  const date = `${period}-${String(day).padStart(2, "0")}`;
                  const status = byCell.get(`${employee.id}:${date}`);
                  const glyph = status ? DAY_GLYPH[status] : UNRECORDED_GLYPH;
                  const label = status ? statusLabels[status] : noRecordLabel;
                  return (
                    <td key={day} className="p-1 text-center">
                      <span
                        title={label}
                        aria-label={`${employee.name}, ${date}: ${label}`}
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-sm text-caption font-medium",
                          glyph.tone,
                        )}
                      >
                        {glyph.glyph}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-caption text-text-muted">
        <span className="font-semibold">{labels.legendTitle}:</span>
        {(Object.keys(DAY_GLYPH) as AttendanceDayStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1">
            <span className={cn("inline-flex size-4 items-center justify-center rounded-sm text-[10px] font-medium", DAY_GLYPH[status].tone)}>
              {DAY_GLYPH[status].glyph}
            </span>
            {statusLabels[status]}
          </span>
        ))}
      </div>
    </div>
  );
}
