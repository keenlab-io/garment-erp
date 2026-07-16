import { Module } from "@nestjs/common";
import { CryptoService } from "../common/crypto/crypto.service.js";
import { AttendanceService } from "./attendance.service.js";
import { CashAdvanceService } from "./cash-advance.service.js";
import { CompensationService } from "./compensation.service.js";
import { EmployeeService } from "./employee.service.js";
import { ExportService } from "./export.service.js";
import { HrController } from "./hr.controller.js";
import { OtService } from "./ot.service.js";
import { PayrollConfigService } from "./payroll-config.service.js";
import { PayrollService } from "./payroll.service.js";
import { PayrollWorker } from "./payroll.worker.js";
import { PayslipPdfWorker } from "./payslip-pdf.worker.js";
import { PayslipService } from "./payslip.service.js";
import { ProbationService } from "./probation.service.js";

/**
 * M2 HR & Payroll module (task 4.11). Employee master + org + documents, salary/components,
 * OT, cash advances, attendance import, the payroll run engine + encrypted e-payslips, the
 * statutory exports, and the probation-alert scheduler. Everything it depends on (DB,
 * UnitOfWork, EventBus, Config, Sequence, Queue, Pdf, Storage) comes from the global M0
 * modules; `CryptoService` (PII encryption) is provided locally.
 */
@Module({
  controllers: [HrController],
  providers: [
    CryptoService,
    EmployeeService,
    CompensationService,
    OtService,
    CashAdvanceService,
    AttendanceService,
    PayrollConfigService,
    PayrollService,
    PayslipService,
    ExportService,
    ProbationService,
    PayrollWorker,
    PayslipPdfWorker,
  ],
})
export class HrModule {}
