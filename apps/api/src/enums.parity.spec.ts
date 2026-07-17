import { describe, expectTypeOf, it } from "vitest";
import type {
  AllocMethod as ContractAllocMethod,
  AuditAction as ContractAuditAction,
  CashAdvanceStatus as ContractCashAdvanceStatus,
  CostingMethod as ContractCostingMethod,
  EmployeeDocumentType as ContractEmployeeDocumentType,
  EmployeeStatus as ContractEmployeeStatus,
  EmploymentType as ContractEmploymentType,
  GoodsIssueStatus as ContractGoodsIssueStatus,
  GoodsReceiptStatus as ContractGoodsReceiptStatus,
  IssuePurpose as ContractIssuePurpose,
  ItemType as ContractItemType,
  MovementDirection as ContractMovementDirection,
  MovementRefType as ContractMovementRefType,
  OtRequestStatus as ContractOtRequestStatus,
  PayComponentType as ContractPayComponentType,
  PayrollRunStatus as ContractPayrollRunStatus,
  ProductType as ContractProductType,
  RepaymentMode as ContractRepaymentMode,
  ScanAction as ContractScanAction,
  StockAdjustmentStatus as ContractStockAdjustmentStatus,
  StockCountStatus as ContractStockCountStatus,
  SubcontractStatus as ContractSubcontractStatus,
  UserStatus as ContractUserStatus,
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
  GoodsIssueStatus as DbGoodsIssueStatus,
  GoodsReceiptStatus as DbGoodsReceiptStatus,
  IssuePurpose as DbIssuePurpose,
  ItemType as DbItemType,
  MovementDirection as DbMovementDirection,
  MovementRefType as DbMovementRefType,
  OtRequestStatus as DbOtRequestStatus,
  PayComponentType as DbPayComponentType,
  PayrollRunStatus as DbPayrollRunStatus,
  ProductType as DbProductType,
  RepaymentMode as DbRepaymentMode,
  ScanAction as DbScanAction,
  StockAdjustmentStatus as DbStockAdjustmentStatus,
  StockCountStatus as DbStockCountStatus,
  SubcontractStatus as DbSubcontractStatus,
  UserStatus as DbUserStatus,
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
});
