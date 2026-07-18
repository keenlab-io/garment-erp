import { describe, expectTypeOf, it } from "vitest";
import type {
  AllocMethod as ContractAllocMethod,
  AuditAction as ContractAuditAction,
  CashAdvanceStatus as ContractCashAdvanceStatus,
  CostingMethod as ContractCostingMethod,
  EmployeeDocumentType as ContractEmployeeDocumentType,
  EmployeeStatus as ContractEmployeeStatus,
  EmploymentType as ContractEmploymentType,
  ExportStatus as ContractExportStatus,
  GoodsIssueStatus as ContractGoodsIssueStatus,
  GoodsReceiptStatus as ContractGoodsReceiptStatus,
  InvoiceStatus as ContractInvoiceStatus,
  IssuePurpose as ContractIssuePurpose,
  ItemType as ContractItemType,
  MovementDirection as ContractMovementDirection,
  MovementRefType as ContractMovementRefType,
  OtRequestStatus as ContractOtRequestStatus,
  PayComponentType as ContractPayComponentType,
  PaymentMethod as ContractPaymentMethod,
  PayrollRunStatus as ContractPayrollRunStatus,
  ProductType as ContractProductType,
  QuotationStatus as ContractQuotationStatus,
  ReceiptType as ContractReceiptType,
  RepaymentMode as ContractRepaymentMode,
  ReportExportFormat as ContractReportExportFormat,
  ReportGroup as ContractReportGroup,
  ScanAction as ContractScanAction,
  StockAdjustmentStatus as ContractStockAdjustmentStatus,
  StockCountStatus as ContractStockCountStatus,
  SubcontractStatus as ContractSubcontractStatus,
  UserStatus as ContractUserStatus,
  VatApplicability as ContractVatApplicability,
  VatMode as ContractVatMode,
  WorkOrderStatus as ContractWorkOrderStatus,
  WorkOrderStepStatus as ContractWorkOrderStepStatus,
} from "@erp/contracts";
import type {
  AllocMethod as DbAllocMethod,
  AuditAction as DbAuditAction,
  CashAdvanceStatus as DbCashAdvanceStatus,
  CostingMethod as DbCostingMethod,
  EmployeeDocumentType as DbEmployeeDocumentType,
  EmployeeStatus as DbEmployeeStatus,
  EmploymentType as DbEmploymentType,
  ExportStatus as DbExportStatus,
  GoodsIssueStatus as DbGoodsIssueStatus,
  GoodsReceiptStatus as DbGoodsReceiptStatus,
  InvoiceStatus as DbInvoiceStatus,
  IssuePurpose as DbIssuePurpose,
  ItemType as DbItemType,
  MovementDirection as DbMovementDirection,
  MovementRefType as DbMovementRefType,
  OtRequestStatus as DbOtRequestStatus,
  PayComponentType as DbPayComponentType,
  PaymentMethod as DbPaymentMethod,
  PayrollRunStatus as DbPayrollRunStatus,
  ProductType as DbProductType,
  QuotationStatus as DbQuotationStatus,
  ReceiptType as DbReceiptType,
  RepaymentMode as DbRepaymentMode,
  ReportExportFormat as DbReportExportFormat,
  ReportGroup as DbReportGroup,
  ScanAction as DbScanAction,
  StockAdjustmentStatus as DbStockAdjustmentStatus,
  StockCountStatus as DbStockCountStatus,
  SubcontractStatus as DbSubcontractStatus,
  UserStatus as DbUserStatus,
  VatApplicability as DbVatApplicability,
  VatMode as DbVatMode,
  WorkOrderStatus as DbWorkOrderStatus,
  WorkOrderStepStatus as DbWorkOrderStepStatus,
} from "@erp/db";

// `@erp/db` may not import `@erp/contracts` (M0 design D1), so the two duplicate the
// IAM + inventory enums. This asserts they stay identical at the type level — any drift
// fails `tsc --noEmit` (the typecheck task), keeping the string unions in lockstep.
describe("enum parity: @erp/contracts <-> @erp/db", () => {
  it("UserStatus unions are identical", () => {
    expectTypeOf<ContractUserStatus>().toEqualTypeOf<DbUserStatus>();
  });

  it("AuditAction unions are identical", () => {
    expectTypeOf<ContractAuditAction>().toEqualTypeOf<DbAuditAction>();
  });

  it("ItemType unions are identical", () => {
    expectTypeOf<ContractItemType>().toEqualTypeOf<DbItemType>();
  });

  it("CostingMethod unions are identical", () => {
    expectTypeOf<ContractCostingMethod>().toEqualTypeOf<DbCostingMethod>();
  });

  it("MovementDirection unions are identical", () => {
    expectTypeOf<ContractMovementDirection>().toEqualTypeOf<DbMovementDirection>();
  });

  it("MovementRefType unions are identical", () => {
    expectTypeOf<ContractMovementRefType>().toEqualTypeOf<DbMovementRefType>();
  });

  it("AllocMethod unions are identical", () => {
    expectTypeOf<ContractAllocMethod>().toEqualTypeOf<DbAllocMethod>();
  });

  it("IssuePurpose unions are identical", () => {
    expectTypeOf<ContractIssuePurpose>().toEqualTypeOf<DbIssuePurpose>();
  });

  it("GoodsReceiptStatus unions are identical", () => {
    expectTypeOf<ContractGoodsReceiptStatus>().toEqualTypeOf<DbGoodsReceiptStatus>();
  });

  it("GoodsIssueStatus unions are identical", () => {
    expectTypeOf<ContractGoodsIssueStatus>().toEqualTypeOf<DbGoodsIssueStatus>();
  });

  it("StockCountStatus unions are identical", () => {
    expectTypeOf<ContractStockCountStatus>().toEqualTypeOf<DbStockCountStatus>();
  });

  it("StockAdjustmentStatus unions are identical", () => {
    expectTypeOf<ContractStockAdjustmentStatus>().toEqualTypeOf<DbStockAdjustmentStatus>();
  });

  it("EmploymentType unions are identical", () => {
    expectTypeOf<ContractEmploymentType>().toEqualTypeOf<DbEmploymentType>();
  });

  it("EmployeeStatus unions are identical", () => {
    expectTypeOf<ContractEmployeeStatus>().toEqualTypeOf<DbEmployeeStatus>();
  });

  it("OtRequestStatus unions are identical", () => {
    expectTypeOf<ContractOtRequestStatus>().toEqualTypeOf<DbOtRequestStatus>();
  });

  it("CashAdvanceStatus unions are identical", () => {
    expectTypeOf<ContractCashAdvanceStatus>().toEqualTypeOf<DbCashAdvanceStatus>();
  });

  it("PayrollRunStatus unions are identical", () => {
    expectTypeOf<ContractPayrollRunStatus>().toEqualTypeOf<DbPayrollRunStatus>();
  });

  it("EmployeeDocumentType unions are identical", () => {
    expectTypeOf<ContractEmployeeDocumentType>().toEqualTypeOf<DbEmployeeDocumentType>();
  });

  it("PayComponentType unions are identical", () => {
    expectTypeOf<ContractPayComponentType>().toEqualTypeOf<DbPayComponentType>();
  });

  it("RepaymentMode unions are identical", () => {
    expectTypeOf<ContractRepaymentMode>().toEqualTypeOf<DbRepaymentMode>();
  });

  it("WorkOrderStatus unions are identical", () => {
    expectTypeOf<ContractWorkOrderStatus>().toEqualTypeOf<DbWorkOrderStatus>();
  });

  it("WorkOrderStepStatus unions are identical", () => {
    expectTypeOf<ContractWorkOrderStepStatus>().toEqualTypeOf<DbWorkOrderStepStatus>();
  });

  it("SubcontractStatus unions are identical", () => {
    expectTypeOf<ContractSubcontractStatus>().toEqualTypeOf<DbSubcontractStatus>();
  });

  it("ScanAction unions are identical", () => {
    expectTypeOf<ContractScanAction>().toEqualTypeOf<DbScanAction>();
  });

  it("ProductType unions are identical", () => {
    expectTypeOf<ContractProductType>().toEqualTypeOf<DbProductType>();
  });

  it("VatApplicability unions are identical", () => {
    expectTypeOf<ContractVatApplicability>().toEqualTypeOf<DbVatApplicability>();
  });

  it("VatMode unions are identical", () => {
    expectTypeOf<ContractVatMode>().toEqualTypeOf<DbVatMode>();
  });

  it("QuotationStatus unions are identical", () => {
    expectTypeOf<ContractQuotationStatus>().toEqualTypeOf<DbQuotationStatus>();
  });

  it("InvoiceStatus unions are identical", () => {
    expectTypeOf<ContractInvoiceStatus>().toEqualTypeOf<DbInvoiceStatus>();
  });

  it("ReceiptType unions are identical", () => {
    expectTypeOf<ContractReceiptType>().toEqualTypeOf<DbReceiptType>();
  });

  it("PaymentMethod unions are identical", () => {
    expectTypeOf<ContractPaymentMethod>().toEqualTypeOf<DbPaymentMethod>();
  });

  it("ReportExportFormat unions are identical", () => {
    expectTypeOf<ContractReportExportFormat>().toEqualTypeOf<DbReportExportFormat>();
  });

  it("ExportStatus unions are identical", () => {
    expectTypeOf<ContractExportStatus>().toEqualTypeOf<DbExportStatus>();
  });

  it("ReportGroup unions are identical", () => {
    expectTypeOf<ContractReportGroup>().toEqualTypeOf<DbReportGroup>();
  });
});
