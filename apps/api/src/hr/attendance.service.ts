import { Inject, Injectable } from "@nestjs/common";
import { and, between, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { attendance, employee, type Db } from "@erp/db";
import type { AttendanceImportResult, AttendanceQuery, AttendanceRecord } from "@erp/contracts";
import { ValidationError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { periodBounds } from "./hr.util.js";

/** One parsed attendance row (emp_code + day + optional clock window). */
export interface AttendanceRow {
  empCode: string;
  workDate: string; // YYYY-MM-DD
  clockIn: Date | null;
  clockOut: Date | null;
}

const HEADER_TOKENS = new Set(["emp_code", "employee", "code", "emp code"]);

/**
 * Attendance import (task 4.5). Reads an Excel/CSV export — columns
 * `emp_code | work_date | clock_in | clock_out` — resolves each `emp_code` to an employee
 * and upserts one row per `(employee, work_date)` (composite PK). Unknown emp codes fail
 * the import (all-or-nothing) so a typo never silently drops attendance.
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** List a period's attendance records (optional employee filter — the monthly grid). */
  async list(query: AttendanceQuery): Promise<AttendanceRecord[]> {
    const ex = currentExecutor(this.db);
    const { start, end } = periodBounds(query["filter[period]"]);
    const filters = [
      between(attendance.workDate, start, end),
      query["filter[employee_id]"]
        ? eq(attendance.employeeId, query["filter[employee_id]"])
        : undefined,
    ].filter(Boolean);
    const rows = await ex
      .select()
      .from(attendance)
      .where(and(...filters))
      .orderBy(attendance.workDate);
    return rows.map((row) => ({
      employee_id: row.employeeId,
      work_date: row.workDate,
      clock_in: row.clockIn ? row.clockIn.toISOString() : null,
      clock_out: row.clockOut ? row.clockOut.toISOString() : null,
    }));
  }

  async import(buffer: Buffer): Promise<AttendanceImportResult> {
    const rows = await readWorkbook(buffer);
    if (rows.length === 0) return { rows_imported: 0 };

    const ex = currentExecutor(this.db);
    const codes = [...new Set(rows.map((r) => r.empCode))];
    const employees = await ex
      .select({ id: employee.id, empCode: employee.empCode })
      .from(employee);
    const idByCode = new Map(employees.map((e) => [e.empCode, e.id]));

    const unknown = codes.filter((c) => !idByCode.has(c));
    if (unknown.length > 0) {
      throw new ValidationError("Attendance import references unknown employees", [
        { issue: `unknown emp_code(s): ${unknown.join(", ")}` },
      ]);
    }

    let imported = 0;
    for (const row of rows) {
      const employeeId = idByCode.get(row.empCode) as string;
      await ex
        .insert(attendance)
        .values({
          employeeId,
          workDate: row.workDate,
          clockIn: row.clockIn,
          clockOut: row.clockOut,
          source: "IMPORT",
        })
        .onConflictDoUpdate({
          target: [attendance.employeeId, attendance.workDate],
          set: { clockIn: row.clockIn, clockOut: row.clockOut, source: "IMPORT" },
        });
      imported += 1;
    }
    return { rows_imported: imported };
  }
}

/** Read the first worksheet's rows into parsed attendance records (skips a header). */
async function readWorkbook(buffer: Buffer): Promise<AttendanceRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new ValidationError("The workbook has no worksheets");

  const rows: AttendanceRow[] = [];
  ws.eachRow((row, rowNumber) => {
    const empCode = cellText(row.getCell(1).value).trim();
    const workDate = cellDate(row.getCell(2).value);
    if (rowNumber === 1 && HEADER_TOKENS.has(empCode.toLowerCase())) return; // header
    if (!empCode || !workDate) return; // blank/incomplete
    rows.push({
      empCode,
      workDate,
      clockIn: cellDateTime(row.getCell(3).value),
      clockOut: cellDateTime(row.getCell(4).value),
    });
  });
  return rows;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text);
  }
  return String(value);
}

/** Coerce a cell to a `YYYY-MM-DD` date string. */
function cellDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cellText(value).trim();
  return text ? text.slice(0, 10) : "";
}

/** Coerce a cell to a Date (timestamp) or null. */
function cellDateTime(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date) return value;
  const text = cellText(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
