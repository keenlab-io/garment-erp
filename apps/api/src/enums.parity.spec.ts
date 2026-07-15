import { describe, expectTypeOf, it } from "vitest";
import type {
  AllocMethod as ContractAllocMethod,
  AuditAction as ContractAuditAction,
  CostingMethod as ContractCostingMethod,
  GoodsIssueStatus as ContractGoodsIssueStatus,
  GoodsReceiptStatus as ContractGoodsReceiptStatus,
  IssuePurpose as ContractIssuePurpose,
  ItemType as ContractItemType,
  MovementDirection as ContractMovementDirection,
  MovementRefType as ContractMovementRefType,
  StockAdjustmentStatus as ContractStockAdjustmentStatus,
  StockCountStatus as ContractStockCountStatus,
  UserStatus as ContractUserStatus,
} from "@erp/contracts";
import type {
  AllocMethod as DbAllocMethod,
  AuditAction as DbAuditAction,
  CostingMethod as DbCostingMethod,
  GoodsIssueStatus as DbGoodsIssueStatus,
  GoodsReceiptStatus as DbGoodsReceiptStatus,
  IssuePurpose as DbIssuePurpose,
  ItemType as DbItemType,
  MovementDirection as DbMovementDirection,
  MovementRefType as DbMovementRefType,
  StockAdjustmentStatus as DbStockAdjustmentStatus,
  StockCountStatus as DbStockCountStatus,
  UserStatus as DbUserStatus,
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
});
