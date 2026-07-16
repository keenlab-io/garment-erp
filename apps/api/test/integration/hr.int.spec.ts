import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advancePolicy,
  attendance,
  cashAdvance,
  createDb,
  employee,
  otRate,
  payrollRun,
  payslip,
  salaryRecord,
  ssoConfig,
  taxBracket,
  user,
} from "@erp/db";
import {
  computeTotals,
  hourlyRate,
  monthlyTax,
  otPay,
  ssoContribution,
  type PayslipBreakdown,
  type TaxBracket,
} from "../../src/hr/payroll-math.js";
import type { AuthUser } from "../../src/auth/auth-user.js";
import type { CryptoService } from "../../src/common/crypto/crypto.service.js";
import {
  BusinessRuleError,
  ForbiddenError,
  StateConflictError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import type { PdfService } from "../../src/pdf/pdf.service.js";
import type { StorageService } from "../../src/storage/storage.service.js";
import { CashAdvanceService } from "../../src/hr/cash-advance.service.js";
import { CompensationService } from "../../src/hr/compensation.service.js";
import { OtService } from "../../src/hr/ot.service.js";
import { PayrollConfigService } from "../../src/hr/payroll-config.service.js";
import { PayrollService } from "../../src/hr/payroll.service.js";
import { PayslipService } from "../../src/hr/payslip.service.js";

const url = process.env.DATABASE_URL_TEST;

// Effective-dated payroll config (mirrors the dev seed, spec §2.5). Held as constants so the
// same numbers seed the DB and drive the expected math below — the test asserts the *service
// wiring* reproduces the canonical `payroll-math` result, which is unit-tested separately.
const CONFIG_EFFECTIVE = "2024-01-01";
const TAX_BRACKETS: TaxBracket[] = [
  { lowerBound: "0", upperBound: "150000", rate: "0" },
  { lowerBound: "150000", upperBound: "300000", rate: "0.05" },
  { lowerBound: "300000", upperBound: "500000", rate: "0.1" },
  { lowerBound: "500000", upperBound: "750000", rate: "0.15" },
  { lowerBound: "750000", upperBound: "1000000", rate: "0.2" },
  { lowerBound: "1000000", upperBound: null, rate: "0.25" },
];
const SSO = { rate: "0.05", wageFloor: "1650", wageCeiling: "15000" };
const OT_MULTIPLIER = "1.5";
const OT_RATE_TYPE = "WEEKDAY_1_5";
const ADVANCE_CEILING_PCT = "0.5";

// Gated on DATABASE_URL_TEST (the Testcontainers globalSetup). Drives the M2 HR services
// end-to-end against a real Postgres, covering the spec §2.8 acceptance criteria (tasks
// 5.1/5.2/5.4/5.7 and the signed-URL/403 leg of 5.5): OT reconcile clamps to attended hours
// and pays them, an approved run pulls each employee's advance into the deductions and clears
// it (net to the cent), double-approve/recalc → 409, the advance ceiling → 422 and a
// non-super-admin approval → 403, and a payslip URL is signed + view-gated.
describe.skipIf(!url)("HR & payroll services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let comp: CompensationService;
  let ot: OtService;
  let advances: CashAdvanceService;
  let payroll: PayrollService;
  let payslips: PayslipService;

  // A fake BullMQ queue — `calculate` and payslip generation only enqueue; the workers
  // themselves are exercised elsewhere. `getSignedUrl` stands in for S3 presigning.
  const fakeQueue = {
    add: () => Promise.resolve({ id: "job-1" }),
  } as unknown as Queue;
  let signedFor: string | undefined;
  const fakeStorage = {
    getSignedUrl: (key: string) => {
      signedFor = key;
      return Promise.resolve(`https://signed.example/${key}?X-Expires=900`);
    },
  } as unknown as StorageService;

  const superAdmin: AuthUser = {
    id: randomUUID(),
    sessionId: randomUUID(),
    isSuperAdmin: true,
    permissions: new Set(),
  };

  let employeeId: string;

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    uow = new UnitOfWork(conn.db);
    const events = new EventBusService(new EventEmitter2());
    const config = new PayrollConfigService(conn.db);
    comp = new CompensationService(conn.db);
    ot = new OtService(conn.db, events);
    advances = new CashAdvanceService(conn.db, comp, config, events);
    payslips = new PayslipService(
      conn.db,
      fakeQueue,
      {} as PdfService,
      fakeStorage,
      {} as CryptoService,
      events,
    );
    payroll = new PayrollService(
      conn.db,
      fakeQueue,
      comp,
      config,
      advances,
      payslips,
      events,
    );

    // The approving actor must exist (payroll_run.approved_by / approver_id FK to user).
    await conn.db.insert(user).values({
      id: superAdmin.id,
      username: `admin-${superAdmin.id.slice(0, 8)}`,
      email: `admin-${superAdmin.id.slice(0, 8)}@erp.local`,
      passwordHash: "x",
      status: "ACTIVE",
      isSuperAdmin: true,
    });

    // Seed the effective-dated payroll config.
    await conn.db.insert(taxBracket).values(
      TAX_BRACKETS.map((b) => ({
        effectiveDate: CONFIG_EFFECTIVE,
        lowerBound: b.lowerBound,
        upperBound: b.upperBound,
        rate: b.rate,
      })),
    );
    await conn.db.insert(ssoConfig).values({
      effectiveDate: CONFIG_EFFECTIVE,
      rate: SSO.rate,
      wageFloor: SSO.wageFloor,
      wageCeiling: SSO.wageCeiling,
    });
    await conn.db.insert(otRate).values({
      effectiveDate: CONFIG_EFFECTIVE,
      rateType: OT_RATE_TYPE,
      multiplier: OT_MULTIPLIER,
    });
    await conn.db.insert(advancePolicy).values({
      effectiveDate: CONFIG_EFFECTIVE,
      ceilingPct: ADVANCE_CEILING_PCT,
      maxInstallments: 3,
    });

    // One ACTIVE, MONTHLY employee at 30,000/month effective in the past.
    const [emp] = await conn.db
      .insert(employee)
      .values({
        empCode: `EXT-${randomUUID().slice(0, 6)}`,
        firstName: "Somchai",
        lastName: "Tester",
        employmentType: "MONTHLY",
        status: "ACTIVE",
        hireDate: "2024-01-01",
      })
      .returning({ id: employee.id });
    employeeId = emp!.id;
    await comp.addSalaryRecord(
      employeeId,
      { base_salary: "30000", effective_date: "2024-01-01" } as never,
      superAdmin,
    );
  });

  afterAll(async () => {
    await conn.queryClient.end();
  });

  // ── §2.8 · OT clamps to attended hours (task 5.1) ─────────────────────────────

  it("reconcile sets approved_hours = min(requested 3h, attended 2h) = 2", async () => {
    // Requested 18:00–21:00 (3h); attendance clocks only 2h that day.
    const workDate = "2026-07-10";
    await conn.db.insert(attendance).values({
      employeeId,
      workDate,
      clockIn: new Date("2026-07-10T09:00:00.000Z"),
      clockOut: new Date("2026-07-10T11:00:00.000Z"),
    });

    const created = await uow.withTransaction(() =>
      ot.create({
        employee_id: employeeId,
        work_date: workDate,
        start_time: "18:00",
        end_time: "21:00",
        rate_type: OT_RATE_TYPE,
      } as never),
    );
    await uow.withTransaction(() => ot.submit(created.id));
    await uow.withTransaction(() => ot.approve(created.id, superAdmin));
    const reconciled = await uow.withTransaction(() =>
      ot.reconcile(created.id, {} as never),
    );

    expect(reconciled.status).toBe("RECONCILED");
    expect(reconciled.approved_hours).toBe("2.000000");
  });

  // ── §2.8 · approved run pulls the advance; net to the cent (tasks 5.2/5.4) ─────

  it("approve pulls the outstanding advance into deductions, clears it, and nets to the cent", async () => {
    // Disburse a 5,000 advance (LUMP): ceiling = 0.5 × 30,000 = 15,000, so it is allowed.
    const advance = await uow.withTransaction(() =>
      advances.create({
        employee_id: employeeId,
        amount: "5000",
        repayment_plan: { mode: "LUMP" },
      } as never),
    );
    await uow.withTransaction(() => advances.approve(advance.id, superAdmin));
    const disbursed = await uow.withTransaction(() =>
      advances.disburse(advance.id, superAdmin),
    );
    expect(disbursed.status).toBe("DISBURSED");
    expect(disbursed.outstanding).toBe("5000.0000");

    // Open + calculate the run.
    const period = "2026-07";
    const run = await uow.withTransaction(() => payroll.create({ period } as never));
    await uow.withTransaction(() => payroll.computeRun(run.id));

    // Expected inputs, computed from the same config via the canonical math.
    const base = "30000.0000";
    const hourly = hourlyRate(base, "MONTHLY");
    const expectedOt = otPay("2.000000", hourly, OT_MULTIPLIER);
    const expectedSso = ssoContribution(base, SSO);
    const expectedTax = monthlyTax(base, TAX_BRACKETS);

    const calculated = await slipFor(run.id);
    const calcBreakdown = calculated.breakdown as PayslipBreakdown;
    expect(calcBreakdown.base).toBe(base);
    expect(calcBreakdown.ot).toBe(expectedOt);
    expect(calcBreakdown.sso).toBe(expectedSso);
    expect(calcBreakdown.tax).toBe(expectedTax);
    expect(calcBreakdown.advance).toBe("0"); // pulled only at approval
    expect(calculated.net).toBe(computeTotals(calcBreakdown).net);

    // Approve → the advance is pulled into the deduction line and cleared to zero.
    const approved = await uow.withTransaction(() =>
      payroll.approve(run.id, superAdmin),
    );
    expect(approved.status).toBe("APPROVED");

    const settled = await slipFor(run.id);
    const settledBreakdown = settled.breakdown as PayslipBreakdown;
    expect(settledBreakdown.advance).toBe("5000.0000");
    const expected: PayslipBreakdown = {
      base,
      ot: expectedOt,
      allowances: [],
      sso: expectedSso,
      tax: expectedTax,
      advance: "5000.0000",
      deductions: [],
    };
    expect(settled.net).toBe(computeTotals(expected).net);

    const [clearedAdvance] = await conn.db
      .select()
      .from(cashAdvance)
      .where(eq(cashAdvance.id, advance.id));
    expect(clearedAdvance?.outstanding).toBe("0.0000");
    expect(clearedAdvance?.status).toBe("CLEARED");
  });

  it("approving an APPROVED run again ⇒ 409 (StateConflictError)", async () => {
    const [run] = await conn.db
      .select({ id: payrollRun.id })
      .from(payrollRun)
      .where(eq(payrollRun.period, "2026-07"));
    await expect(
      uow.withTransaction(() => payroll.approve(run!.id, superAdmin)),
    ).rejects.toBeInstanceOf(StateConflictError);
    // Recalculating a frozen (APPROVED) run is likewise rejected.
    await expect(
      uow.withTransaction(() => payroll.calculate(run!.id, superAdmin)),
    ).rejects.toBeInstanceOf(StateConflictError);
  });

  // ── §2.8 · cash-advance ceiling + approval authority (task 5.7) ────────────────

  it("a cash advance over the ceiling ⇒ 422 (BusinessRuleError)", async () => {
    // 20,000 > 0.5 × 30,000 = 15,000.
    await expect(
      uow.withTransaction(() =>
        advances.create({ employee_id: employeeId, amount: "20000" } as never),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("a non-super-admin approving a cash advance ⇒ 403 (ForbiddenError)", async () => {
    const pending = await uow.withTransaction(() =>
      advances.create({ employee_id: employeeId, amount: "1000" } as never),
    );
    const clerk: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: new Set(["hr.employee.manage"]),
    };
    await expect(
      uow.withTransaction(() => advances.approve(pending.id, clerk)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // ── §2.8 · payslip is signed + view-gated (task 5.5, sans qpdf) ───────────────

  it("payslip PDF URL is signed for the owner and 403 for an unrelated caller", async () => {
    const slip = await slipFor2026();

    // Not generated yet (worker is async) ⇒ conflict for an authorized viewer.
    await expect(payslips.getPdfUrl(slip.id, superAdmin)).rejects.toBeInstanceOf(
      StateConflictError,
    );

    // Simulate the worker having stored the encrypted object.
    const key = `payslips/${slip.runId}/${slip.id}.pdf`;
    await conn.db.update(payslip).set({ pdfKey: key }).where(eq(payslip.id, slip.id));

    // The payslip's own employee (self) gets a signed, expiring URL.
    const selfUser: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: new Set(),
    };
    await conn.db.insert(user).values({
      id: selfUser.id,
      username: `emp-${selfUser.id.slice(0, 8)}`,
      email: `emp-${selfUser.id.slice(0, 8)}@erp.local`,
      passwordHash: "x",
      status: "ACTIVE",
      employeeId,
    });
    const selfUrl = await payslips.getPdfUrl(slip.id, selfUser);
    expect(selfUrl).toContain(key);
    expect(selfUrl).toContain("X-Expires=900");
    expect(signedFor).toBe(key);

    // A holder of hr.payslip.view is also allowed.
    const viewer: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: new Set(["hr.payslip.view"]),
    };
    await expect(payslips.getPdfUrl(slip.id, viewer)).resolves.toContain(key);

    // An unrelated caller (no permission, not the owner) ⇒ 403.
    const stranger: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: new Set(),
    };
    await conn.db.insert(user).values({
      id: stranger.id,
      username: `x-${stranger.id.slice(0, 8)}`,
      email: `x-${stranger.id.slice(0, 8)}@erp.local`,
      passwordHash: "x",
      status: "ACTIVE",
    });
    await expect(payslips.getPdfUrl(slip.id, stranger)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  // ── helpers ────────────────────────────────────────────────────────────────────

  async function slipFor(runId: string) {
    const [row] = await conn.db
      .select()
      .from(payslip)
      .where(and(eq(payslip.runId, runId), eq(payslip.employeeId, employeeId)))
      .limit(1);
    return row!;
  }

  async function slipFor2026() {
    const [run] = await conn.db
      .select({ id: payrollRun.id })
      .from(payrollRun)
      .where(eq(payrollRun.period, "2026-07"));
    return slipFor(run!.id);
  }
});
