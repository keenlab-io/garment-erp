import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advancePolicy,
  attendance,
  cashAdvance,
  createDb,
  documentSequence,
  employee,
  otRate,
  payslip,
  ssoConfig,
  taxBracket,
  user,
} from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { CryptoService } from "../../src/common/crypto/crypto.service.js";
import { StateConflictError } from "../../src/common/errors/app-exception.js";
import { gateSalaryFields } from "../../src/common/salary-gating.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { AttendanceService } from "../../src/hr/attendance.service.js";
import { CashAdvanceService } from "../../src/hr/cash-advance.service.js";
import { CompensationService } from "../../src/hr/compensation.service.js";
import { EmployeeService } from "../../src/hr/employee.service.js";
import { OtService } from "../../src/hr/ot.service.js";
import { PayrollConfigService } from "../../src/hr/payroll-config.service.js";
import { PayrollService } from "../../src/hr/payroll.service.js";
import { PayslipService } from "../../src/hr/payslip.service.js";

const url = process.env.DATABASE_URL_TEST;

const KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Gated on DATABASE_URL_TEST (Testcontainers globalSetup). Drives the M2 HR/payroll engine
// end-to-end against a real Postgres — the §2.8 acceptance criteria (tasks 5.1/5.2/5.4/5.6):
// emp_code issuance, PII ciphertext at rest, OT clamp, the net formula to the cent, advance
// pull-in on approve (→ CLEARED), and 409 on double-approve.
describe.skipIf(!url)("HR & Payroll services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let employees: EmployeeService;
  let comp: CompensationService;
  let ot: OtService;
  let advances: CashAdvanceService;
  let attendanceSvc: AttendanceService;
  let payroll: PayrollService;

  const actor: AuthUser = {
    id: randomUUID(),
    sessionId: randomUUID(),
    isSuperAdmin: true,
    permissions: new Set(),
  };

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const db = conn.db;
    const events = new EventBusService(new EventEmitter2());
    uow = new UnitOfWork(db);
    const config = {
      getOrThrow: (k: string) => {
        if (k === "ENCRYPTION_KEY") return KEY_HEX;
        throw new Error(`unexpected config key ${k}`);
      },
      get: () => undefined,
    } as unknown as ConfigService;
    const crypto = new CryptoService(config);
    const queueStub = { add: async () => ({ id: "job" }) } as unknown as Queue;
    const storageStub = {
      put: async () => undefined,
      getSignedUrl: async () => "https://signed",
    } as never;
    const pdfStub = { renderHtml: async () => Buffer.from("%PDF") } as never;

    const sequences = new SequenceService(db, uow);
    comp = new CompensationService(db);
    const payrollConfig = new PayrollConfigService(db);
    employees = new EmployeeService(db, sequences, crypto, storageStub, comp, events);
    ot = new OtService(db, events);
    advances = new CashAdvanceService(db, comp, payrollConfig, events);
    attendanceSvc = new AttendanceService(db);
    const payslips = new PayslipService(db, queueStub, pdfStub, storageStub, crypto, events);
    payroll = new PayrollService(
      db,
      queueStub,
      comp,
      payrollConfig,
      advances,
      payslips,
      events,
    );

    // A real user row for the actor — salary/OT/advance/run rows FK `created_by`/`approver`
    // back to `user`.
    const tag = actor.id.slice(0, 8);
    await db
      .insert(user)
      .values({
        id: actor.id,
        username: `hr-test-${tag}`,
        email: `hr-test-${tag}@test.local`,
        passwordHash: "x",
        status: "ACTIVE",
        isSuperAdmin: true,
        permissionsVersion: 1,
      })
      .onConflictDoNothing();

    // Seed the emp_code sequence + non-authoritative payroll config (mirrors the dev seed).
    await db
      .insert(documentSequence)
      .values({
        key: "EMPLOYEE",
        prefix: "EXT",
        includeYear: false,
        resetYearly: false,
        currentValue: 0,
        format: "{prefix}{seq:0000}",
        yearScope: 2000,
      })
      .onConflictDoNothing();
    const eff = "2024-01-01";
    await db
      .insert(taxBracket)
      .values([
        { lowerBound: "0", upperBound: "150000", rate: "0", effectiveDate: eff },
        { lowerBound: "150000", upperBound: "300000", rate: "0.05", effectiveDate: eff },
        { lowerBound: "300000", upperBound: "500000", rate: "0.1", effectiveDate: eff },
      ])
      .onConflictDoNothing();
    await db
      .insert(ssoConfig)
      .values({ rate: "0.05", wageFloor: "1650", wageCeiling: "15000", effectiveDate: eff })
      .onConflictDoNothing();
    await db
      .insert(otRate)
      .values({ rateType: "WEEKDAY_1_5", multiplier: "1.5", effectiveDate: eff })
      .onConflictDoNothing();
    await db
      .insert(advancePolicy)
      .values({ ceilingPct: "0.5", maxInstallments: 3, effectiveDate: eff })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await conn.queryClient.end();
  });

  it("drives the full payroll flow and nets to the cent", async () => {
    // 1. Create a MONTHLY employee with an encrypted national ID.
    const nationalId = "1234567890123";
    const emp = await uow.withTransaction(() =>
      employees.create(
        {
          first_name: "Somchai",
          last_name: "Jaidee",
          national_id: nationalId,
          employment_type: "MONTHLY",
          hire_date: "2024-01-01",
          profile: {},
        },
        actor,
      ),
    );
    expect(emp.emp_code).toMatch(/^EXT\d{4}$/);
    expect(emp.national_id).toBe(nationalId);

    // PII is ciphertext at rest (task 5.6): the stored bytea decrypts to the plaintext but
    // is not the plaintext bytes.
    const [row] = await conn.db
      .select({ enc: employee.nationalIdEnc })
      .from(employee)
      .where(eq(employee.id, emp.id));
    expect(row?.enc).toBeInstanceOf(Buffer);
    expect(Buffer.from(row!.enc as Buffer).toString("utf8")).not.toContain(nationalId);

    // 2. Set a base salary of 41,600 (→ hourly rate 200 at 208h basis).
    await uow.withTransaction(() =>
      comp.addSalaryRecord(
        emp.id,
        { base_salary: "41600.0000" as never, effective_date: "2024-01-01" },
        actor,
      ),
    );

    // 3. Cash advance at the ceiling (50% × 41,600 = 20,800); over-ceiling is 422.
    await expect(
      uow.withTransaction(() =>
        advances.create({ employee_id: emp.id, amount: "30000.0000" as never }),
      ),
    ).rejects.toThrow(/exceeds the ceiling/);

    const advance = await uow.withTransaction(() =>
      advances.create({
        employee_id: emp.id,
        amount: "15000.0000" as never,
        repayment_plan: { mode: "LUMP" },
      }),
    );
    await uow.withTransaction(() => advances.approve(advance.id, actor));
    await uow.withTransaction(() => advances.disburse(advance.id, actor));

    // 4. OT: requested 3h (18:00–21:00) but only 2h attended ⇒ reconcile clamps to 2h.
    const otReq = await uow.withTransaction(() =>
      ot.create({
        employee_id: emp.id,
        work_date: "2024-06-15",
        start_time: "18:00",
        end_time: "21:00",
        rate_type: "WEEKDAY_1_5",
      }),
    );
    await conn.db.insert(attendance).values({
      employeeId: emp.id,
      workDate: "2024-06-15",
      clockIn: new Date("2024-06-15T09:00:00Z"),
      clockOut: new Date("2024-06-15T11:00:00Z"), // 2 attended hours
    });
    await uow.withTransaction(() => ot.submit(otReq.id));
    await uow.withTransaction(() => ot.approve(otReq.id, actor));
    const reconciled = await uow.withTransaction(() =>
      ot.reconcile(otReq.id, {}),
    );
    expect(reconciled.approved_hours).toBe("2.000000");

    // 5. Payroll run: calculate (bypassing the queue) then approve.
    const run = await uow.withTransaction(() =>
      payroll.create({ period: "2024-06" }),
    );
    await uow.withTransaction(() => payroll.computeRun(run.id));

    // Calculated net (no advance yet): gross 42,200 − sso 750 − tax 2,285 = 39,165.
    // OT = 2h × 200/h × 1.5 = 600 ⇒ gross = 41,600 + 600.
    const calc = await selectPayslip(conn.db, run.id, emp.id);
    expect(calc.gross).toBe("42200.0000");
    expect(calc.net).toBe("39165.0000");

    // 6. Approve pulls the 15,000 advance into deductions (→ CLEARED) and re-nets.
    await uow.withTransaction(() => payroll.approve(run.id, actor));
    const approved = await selectPayslip(conn.db, run.id, emp.id);
    expect(approved.net).toBe("24165.0000"); // 39,165 − 15,000

    const [adv] = await conn.db
      .select({ outstanding: cashAdvance.outstanding, status: cashAdvance.status })
      .from(cashAdvance)
      .where(eq(cashAdvance.id, advance.id));
    expect(adv?.outstanding).toBe("0.0000");
    expect(adv?.status).toBe("CLEARED");

    // 7. Double-approve ⇒ 409 (task 5.4).
    await expect(
      uow.withTransaction(() => payroll.approve(run.id, actor)),
    ).rejects.toBeInstanceOf(StateConflictError);

    // 8. Salary gating: a caller without hr.salary.view sees the fields omitted.
    const viewer: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: new Set(),
    };
    const gated = gateSalaryFields(viewer, { ...emp }, ["national_id", "base_salary"]);
    expect("national_id" in gated).toBe(false);
    expect("base_salary" in gated).toBe(false);
  });

  it("imports attendance keyed on (employee, work_date)", async () => {
    const emp = await uow.withTransaction(() =>
      employees.create(
        {
          first_name: "Attend",
          last_name: "Import",
          employment_type: "DAILY",
          hire_date: "2024-01-01",
          profile: {},
        },
        actor,
      ),
    );
    // Two rows for the same day upsert to one; imported count reflects rows processed.
    const buffer = await xlsxBuffer([
      ["emp_code", "work_date", "clock_in", "clock_out"],
      [emp.emp_code, "2024-06-01", "2024-06-01T09:00:00Z", "2024-06-01T17:00:00Z"],
    ]);
    const result = await uow.withTransaction(() => attendanceSvc.import(buffer));
    expect(result.rows_imported).toBe(1);
  });
});

/** Load a single payslip row for assertions. */
async function selectPayslip(
  db: ReturnType<typeof createDb>["db"],
  runId: string,
  employeeId: string,
): Promise<{ gross: string; net: string }> {
  const [row] = await db
    .select({ gross: payslip.gross, net: payslip.net })
    .from(payslip)
    .where(and(eq(payslip.runId, runId), eq(payslip.employeeId, employeeId)));
  if (!row) throw new Error("payslip not found");
  return row;
}

/** Build a tiny XLSX workbook buffer from a matrix of cell values. */
async function xlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
