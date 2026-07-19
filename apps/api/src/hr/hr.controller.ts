import { Controller, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract, type Employee, type PayslipSummary } from "@erp/contracts";
import { assertPermissions } from "../auth/authz.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { ValidationError } from "../common/errors/app-exception.js";
import { parseIfMatch } from "../common/concurrency/if-match.js";
import { gateSalaryFields } from "../common/salary-gating.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { AttendanceService } from "./attendance.service.js";
import { CashAdvanceService } from "./cash-advance.service.js";
import { CompensationService } from "./compensation.service.js";
import { EmployeeService } from "./employee.service.js";
import { ExportService } from "./export.service.js";
import { OtService } from "./ot.service.js";
import { PayrollService } from "./payroll.service.js";
import { PayslipService } from "./payslip.service.js";

/** An uploaded file as multer attaches it (subset of `Express.Multer.File`). */
interface UploadedDoc {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}

/** Strip `national_id` + `base_salary` from an employee unless the caller can view salary. */
function gateEmployee(user: AuthUser, e: Employee): Employee {
  return gateSalaryFields(user, e, ["national_id", "base_salary"]);
}

/** Strip `gross` + `net` from a payslip summary unless the caller can view salary. */
function gatePayslip(user: AuthUser, p: PayslipSummary): PayslipSummary {
  return gateSalaryFields(user, p, ["gross", "net"]);
}

/**
 * The M2 HR & Payroll surface (task 4.11). Every handler authorizes in-handler via
 * `assertPermissions` (M0 design D7) and wraps mutations in `uow.withTransaction`. Salary/PII
 * fields are gated by `hr.salary.view`; cash-advance approval and payslip access enforce
 * their own rules (super-admin / self) inside the services.
 */
@Controller()
export class HrController {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly employees: EmployeeService,
    private readonly comp: CompensationService,
    private readonly ot: OtService,
    private readonly advances: CashAdvanceService,
    private readonly attendance: AttendanceService,
    private readonly payroll: PayrollService,
    private readonly payslips: PayslipService,
    private readonly exports: ExportService,
  ) {}

  // ── Org structure ─────────────────────────────────────────────────────────

  @TsRestHandler(contract.hr.listDepartments)
  listDepartments(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listDepartments, async () => {
      assertPermissions(user, "hr.employee.view");
      return { status: 200, body: { departments: await this.employees.listDepartments() } };
    });
  }

  @TsRestHandler(contract.hr.createDepartment)
  createDepartment(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.createDepartment, async ({ body }) => {
      assertPermissions(user, "hr.employee.manage");
      const department = await this.uow.withTransaction(() =>
        this.employees.createDepartment(body, user),
      );
      return { status: 201, body: { department } };
    });
  }

  @TsRestHandler(contract.hr.listPositions)
  listPositions(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listPositions, async () => {
      assertPermissions(user, "hr.employee.view");
      return { status: 200, body: { positions: await this.employees.listPositions() } };
    });
  }

  @TsRestHandler(contract.hr.createPosition)
  createPosition(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.createPosition, async ({ body }) => {
      assertPermissions(user, "hr.employee.manage");
      const position = await this.uow.withTransaction(() =>
        this.employees.createPosition(body, user),
      );
      return { status: 201, body: { position } };
    });
  }

  // ── Employees ─────────────────────────────────────────────────────────────

  @TsRestHandler(contract.hr.listEmployees)
  listEmployees(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listEmployees, async ({ query }) => {
      assertPermissions(user, "hr.employee.view");
      const page = await this.employees.list(query);
      return {
        status: 200,
        body: { data: page.data.map((e) => gateEmployee(user, e)), next_cursor: page.next_cursor },
      };
    });
  }

  @TsRestHandler(contract.hr.createEmployee)
  createEmployee(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.createEmployee, async ({ body }) => {
      assertPermissions(user, "hr.employee.manage");
      const employee = await this.uow.withTransaction(() =>
        this.employees.create(body, user),
      );
      return { status: 201, body: { employee: gateEmployee(user, employee) } };
    });
  }

  @TsRestHandler(contract.hr.getEmployee)
  getEmployee(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.getEmployee, async ({ params }) => {
      assertPermissions(user, "hr.employee.view");
      const employee = await this.employees.get(params.id);
      return { status: 200, body: { employee: gateEmployee(user, employee) } };
    });
  }

  @TsRestHandler(contract.hr.updateEmployee)
  updateEmployee(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.updateEmployee, async ({ params, body, headers }) => {
      assertPermissions(user, "hr.employee.manage");
      const expected = parseIfMatch(headers["if-match"]);
      const employee = await this.uow.withTransaction(() =>
        this.employees.update(params.id, expected, body, user),
      );
      return { status: 200, body: { employee: gateEmployee(user, employee) } };
    });
  }

  @TsRestHandler(contract.hr.listEmployeeDocuments)
  listEmployeeDocuments(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listEmployeeDocuments, async ({ params }) => {
      assertPermissions(user, "hr.employee.view");
      return { status: 200, body: { documents: await this.employees.listDocuments(params.id) } };
    });
  }

  @TsRestHandler(contract.hr.uploadEmployeeDocument)
  @UseInterceptors(FileInterceptor("file"))
  uploadEmployeeDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedDoc | undefined,
  ) {
    return tsRestHandler(contract.hr.uploadEmployeeDocument, async ({ params, body }) => {
      assertPermissions(user, "hr.employee.manage");
      if (!file) throw new ValidationError("A document file is required");
      const document = await this.uow.withTransaction(() =>
        this.employees.addDocument(params.id, body.type, file.buffer, file.mimetype),
      );
      return { status: 201, body: { document } };
    });
  }

  @TsRestHandler(contract.hr.getEmployeeDocumentUrl)
  getEmployeeDocumentUrl(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.getEmployeeDocumentUrl, async ({ params }) => {
      assertPermissions(user, "hr.employee.view");
      const url = await this.employees.getDocumentUrl(params.id, params.documentId);
      return { status: 302, body: { url } };
    });
  }

  @TsRestHandler(contract.hr.addSalaryRecord)
  addSalaryRecord(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.addSalaryRecord, async ({ params, body }) => {
      assertPermissions(user, "hr.salary.edit");
      const salary = await this.uow.withTransaction(() =>
        this.comp.addSalaryRecord(params.id, body, user),
      );
      return { status: 201, body: { salary } };
    });
  }

  // ── Overtime ──────────────────────────────────────────────────────────────

  @TsRestHandler(contract.hr.listOtRequests)
  listOtRequests(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listOtRequests, async ({ query }) => {
      assertPermissions(user, "hr.ot.approve");
      return { status: 200, body: { ot_requests: await this.ot.list(query) } };
    });
  }

  @TsRestHandler(contract.hr.createOtRequest)
  createOtRequest(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.createOtRequest, async ({ body }) => {
      assertPermissions(user, "hr.employee.manage");
      const ot_request = await this.uow.withTransaction(() => this.ot.create(body));
      return { status: 201, body: { ot_request } };
    });
  }

  @TsRestHandler(contract.hr.submitOtRequest)
  submitOtRequest(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.submitOtRequest, async ({ params }) => {
      assertPermissions(user, "hr.employee.manage");
      const ot_request = await this.uow.withTransaction(() => this.ot.submit(params.id));
      return { status: 200, body: { ot_request } };
    });
  }

  @TsRestHandler(contract.hr.approveOtRequest)
  approveOtRequest(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.approveOtRequest, async ({ params }) => {
      assertPermissions(user, "hr.ot.approve");
      const ot_request = await this.uow.withTransaction(() =>
        this.ot.approve(params.id, user),
      );
      return { status: 200, body: { ot_request } };
    });
  }

  @TsRestHandler(contract.hr.reconcileOtRequest)
  reconcileOtRequest(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.reconcileOtRequest, async ({ params, body }) => {
      assertPermissions(user, "hr.ot.approve");
      const ot_request = await this.uow.withTransaction(() =>
        this.ot.reconcile(params.id, body),
      );
      return { status: 200, body: { ot_request } };
    });
  }

  // ── Cash advances ───────────────────────────────────────────────────────────

  @TsRestHandler(contract.hr.listCashAdvances)
  listCashAdvances(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listCashAdvances, async ({ query }) => {
      assertPermissions(user, "hr.employee.manage");
      return { status: 200, body: { cash_advances: await this.advances.list(query) } };
    });
  }

  @TsRestHandler(contract.hr.createCashAdvance)
  createCashAdvance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.createCashAdvance, async ({ body }) => {
      assertPermissions(user, "hr.employee.manage");
      const cash_advance = await this.uow.withTransaction(() => this.advances.create(body));
      return { status: 201, body: { cash_advance } };
    });
  }

  @TsRestHandler(contract.hr.approveCashAdvance)
  approveCashAdvance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.approveCashAdvance, async ({ params }) => {
      // Super-admin enforcement lives in the service (spec §2.4).
      const cash_advance = await this.uow.withTransaction(() =>
        this.advances.approve(params.id, user),
      );
      return { status: 200, body: { cash_advance } };
    });
  }

  @TsRestHandler(contract.hr.rejectCashAdvance)
  rejectCashAdvance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.rejectCashAdvance, async ({ params }) => {
      assertPermissions(user, "hr.employee.manage");
      const cash_advance = await this.uow.withTransaction(() =>
        this.advances.reject(params.id, user),
      );
      return { status: 200, body: { cash_advance } };
    });
  }

  @TsRestHandler(contract.hr.disburseCashAdvance)
  disburseCashAdvance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.disburseCashAdvance, async ({ params }) => {
      assertPermissions(user, "hr.employee.manage");
      const cash_advance = await this.uow.withTransaction(() =>
        this.advances.disburse(params.id, user),
      );
      return { status: 200, body: { cash_advance } };
    });
  }

  // ── Attendance ──────────────────────────────────────────────────────────────

  @TsRestHandler(contract.hr.listAttendance)
  listAttendance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listAttendance, async ({ query }) => {
      assertPermissions(user, "hr.employee.manage");
      return { status: 200, body: { attendance: await this.attendance.list(query) } };
    });
  }

  @TsRestHandler(contract.hr.importAttendance)
  @UseInterceptors(FileInterceptor("file"))
  importAttendance(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedDoc | undefined,
  ) {
    return tsRestHandler(contract.hr.importAttendance, async () => {
      assertPermissions(user, "hr.employee.manage");
      if (!file) throw new ValidationError("An attendance file is required");
      const result = await this.uow.withTransaction(() =>
        this.attendance.import(file.buffer),
      );
      return { status: 200, body: result };
    });
  }

  // ── Payroll ─────────────────────────────────────────────────────────────────

  @TsRestHandler(contract.hr.listPayrollRuns)
  listPayrollRuns(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listPayrollRuns, async ({ query }) => {
      assertPermissions(user, "hr.payroll.approve");
      return { status: 200, body: { payroll_runs: await this.payroll.list(query) } };
    });
  }

  @TsRestHandler(contract.hr.createPayrollRun)
  createPayrollRun(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.createPayrollRun, async ({ body }) => {
      assertPermissions(user, "hr.payroll.approve");
      const payroll_run = await this.uow.withTransaction(() => this.payroll.create(body));
      return { status: 201, body: { payroll_run } };
    });
  }

  @TsRestHandler(contract.hr.calculatePayrollRun)
  calculatePayrollRun(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.calculatePayrollRun, async ({ params }) => {
      assertPermissions(user, "hr.payroll.approve");
      return { status: 202, body: await this.payroll.calculate(params.id, user) };
    });
  }

  @TsRestHandler(contract.hr.listPayslips)
  listPayslips(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.listPayslips, async ({ params }) => {
      assertPermissions(user, "hr.employee.view");
      const payslips = await this.payroll.listPayslips(params.id);
      return { status: 200, body: { payslips: payslips.map((p) => gatePayslip(user, p)) } };
    });
  }

  @TsRestHandler(contract.hr.approvePayrollRun)
  approvePayrollRun(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.approvePayrollRun, async ({ params }) => {
      assertPermissions(user, "hr.payroll.approve");
      const payroll_run = await this.uow.withTransaction(() =>
        this.payroll.approve(params.id, user),
      );
      return { status: 200, body: { payroll_run } };
    });
  }

  @TsRestHandler(contract.hr.getPayslipPdf)
  getPayslipPdf(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.getPayslipPdf, async ({ params }) => {
      // Self-or-`hr.payslip.view` enforcement lives in the service.
      const url = await this.payslips.getPdfUrl(params.id, user);
      return { status: 302, body: { url } };
    });
  }

  @TsRestHandler(contract.hr.exportPnd1)
  exportPnd1(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.exportPnd1, async ({ query }) => {
      assertPermissions(user, "hr.payroll.approve");
      return { status: 202, body: await this.exports.enqueue("pnd1", query.period) };
    });
  }

  @TsRestHandler(contract.hr.exportSso)
  exportSso(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.hr.exportSso, async ({ query }) => {
      assertPermissions(user, "hr.payroll.approve");
      return { status: 202, body: await this.exports.enqueue("sso", query.period) };
    });
  }
}
