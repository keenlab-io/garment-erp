import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { assertPermissions } from "../auth/authz.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { BarcodeService } from "./barcode.service.js";
import { BomService } from "./bom.service.js";
import { GoodsIssueService } from "./goods-issue.service.js";
import { GoodsReceiptService } from "./goods-receipt.service.js";
import { ItemService } from "./item.service.js";
import { ReportService } from "./report.service.js";
import { StockAdjustmentService } from "./stock-adjustment.service.js";
import { StockCountService } from "./stock-count.service.js";

/** True when the user may see cost columns (`inventory.cost.view`, or super-admin). */
function canViewCost(user: AuthUser): boolean {
  return user.isSuperAdmin || user.permissions.has("inventory.cost.view");
}

/**
 * The M3 inventory surface (task 5.12). Every handler authorizes in-handler via
 * `assertPermissions` (M0 design D7) and wraps mutations in `uow.withTransaction`, so the
 * ledger write + balance update commit atomically. Cost columns on reports are gated by
 * `inventory.cost.view`.
 */
@Controller()
export class InventoryController {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly items: ItemService,
    private readonly receipts: GoodsReceiptService,
    private readonly issues: GoodsIssueService,
    private readonly boms: BomService,
    private readonly counts: StockCountService,
    private readonly adjustments: StockAdjustmentService,
    private readonly reports: ReportService,
    private readonly barcodes: BarcodeService,
  ) {}

  // ── Item catalog ──────────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.listItems)
  listItems(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.listItems, async ({ query }) => {
      assertPermissions(user, "inventory.product.create");
      return { status: 200, body: await this.items.list(query) };
    });
  }

  @TsRestHandler(contract.inventory.createItem)
  createItem(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createItem, async ({ body }) => {
      assertPermissions(user, "inventory.product.create");
      const item = await this.uow.withTransaction(() => this.items.create(body, user));
      return { status: 201, body: { item } };
    });
  }

  @TsRestHandler(contract.inventory.createSku)
  createSku(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createSku, async ({ params, body }) => {
      assertPermissions(user, "inventory.product.create");
      const sku = await this.uow.withTransaction(() =>
        this.items.createSku(params.id, body),
      );
      return { status: 201, body: { sku } };
    });
  }

  @TsRestHandler(contract.inventory.createUomConversion)
  createUomConversion(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createUomConversion, async ({ body }) => {
      assertPermissions(user, "inventory.product.create");
      const conversion = await this.uow.withTransaction(() =>
        this.items.createConversion(body),
      );
      return { status: 201, body: { conversion } };
    });
  }

  @TsRestHandler(contract.inventory.printBarcodes)
  printBarcodes(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.printBarcodes, async ({ body }) => {
      assertPermissions(user, "inventory.product.create");
      return { status: 202, body: await this.barcodes.print(body) };
    });
  }

  // ── Goods receipts ──────────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.listGoodsReceipts)
  listGoodsReceipts(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.listGoodsReceipts, async ({ query }) => {
      assertPermissions(user, "inventory.receipt.manage");
      return { status: 200, body: await this.receipts.list(query.limit, query.cursor) };
    });
  }

  @TsRestHandler(contract.inventory.createGoodsReceipt)
  createGoodsReceipt(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createGoodsReceipt, async ({ body }) => {
      assertPermissions(user, "inventory.receipt.manage");
      const receipt = await this.uow.withTransaction(() =>
        this.receipts.create(body, user),
      );
      return { status: 201, body: { receipt } };
    });
  }

  @TsRestHandler(contract.inventory.confirmGoodsReceipt)
  confirmGoodsReceipt(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.confirmGoodsReceipt, async ({ params }) => {
      assertPermissions(user, "inventory.receipt.manage");
      const receipt = await this.uow.withTransaction(() =>
        this.receipts.confirm(params.id),
      );
      return { status: 200, body: { receipt } };
    });
  }

  @TsRestHandler(contract.inventory.postGoodsReceipt)
  postGoodsReceipt(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.postGoodsReceipt, async ({ params }) => {
      assertPermissions(user, "inventory.receipt.manage");
      const receipt = await this.uow.withTransaction(() =>
        this.receipts.post(params.id, user),
      );
      return { status: 200, body: { receipt } };
    });
  }

  // ── Goods issues ────────────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.listGoodsIssues)
  listGoodsIssues(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.listGoodsIssues, async ({ query }) => {
      assertPermissions(user, "inventory.issue.manage");
      return { status: 200, body: await this.issues.list(query.limit) };
    });
  }

  @TsRestHandler(contract.inventory.createGoodsIssue)
  createGoodsIssue(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createGoodsIssue, async ({ body }) => {
      assertPermissions(user, "inventory.issue.manage");
      const issue = await this.uow.withTransaction(() => this.issues.create(body, user));
      return { status: 201, body: { issue } };
    });
  }

  @TsRestHandler(contract.inventory.postGoodsIssue)
  postGoodsIssue(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.postGoodsIssue, async ({ params }) => {
      assertPermissions(user, "inventory.issue.manage");
      const issue = await this.uow.withTransaction(() =>
        this.issues.post(params.id, user),
      );
      return { status: 200, body: { issue } };
    });
  }

  // ── Bills of materials ──────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.createBom)
  createBom(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createBom, async ({ body }) => {
      assertPermissions(user, "inventory.product.create");
      const bom = await this.uow.withTransaction(() => this.boms.create(body, user));
      return { status: 201, body: { bom } };
    });
  }

  @TsRestHandler(contract.inventory.rollupBom)
  rollupBom(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.rollupBom, async ({ params }) => {
      assertPermissions(user, "inventory.product.create");
      return { status: 200, body: await this.boms.rollup(params.id) };
    });
  }

  // ── Stock counts ────────────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.createStockCount)
  createStockCount(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createStockCount, async ({ body }) => {
      assertPermissions(user, "inventory.issue.manage");
      const count = await this.uow.withTransaction(() => this.counts.create(body, user));
      return { status: 201, body: { count } };
    });
  }

  @TsRestHandler(contract.inventory.setStockCountLines)
  setStockCountLines(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.setStockCountLines, async ({ params, body }) => {
      assertPermissions(user, "inventory.issue.manage");
      const count = await this.uow.withTransaction(() =>
        this.counts.setLines(params.id, body, user),
      );
      return { status: 200, body: { count } };
    });
  }

  @TsRestHandler(contract.inventory.reconcileStockCount)
  reconcileStockCount(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.reconcileStockCount, async ({ params }) => {
      assertPermissions(user, "inventory.issue.manage");
      const adjustment = await this.uow.withTransaction(() =>
        this.counts.reconcile(params.id, user),
      );
      return { status: 200, body: { adjustment } };
    });
  }

  // ── Stock adjustments ─────────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.createStockAdjustment)
  createStockAdjustment(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.createStockAdjustment, async ({ body }) => {
      assertPermissions(user, "inventory.issue.manage");
      const adjustment = await this.uow.withTransaction(() =>
        this.adjustments.create(body, user),
      );
      return { status: 201, body: { adjustment } };
    });
  }

  @TsRestHandler(contract.inventory.approveStockAdjustment)
  approveStockAdjustment(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.approveStockAdjustment, async ({ params }) => {
      assertPermissions(user, "inventory.adjustment.approve");
      const adjustment = await this.uow.withTransaction(() =>
        this.adjustments.approve(params.id, user),
      );
      return { status: 200, body: { adjustment } };
    });
  }

  @TsRestHandler(contract.inventory.postStockAdjustment)
  postStockAdjustment(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.postStockAdjustment, async ({ params }) => {
      assertPermissions(user, "inventory.adjustment.approve");
      const adjustment = await this.uow.withTransaction(() =>
        this.adjustments.post(params.id, user),
      );
      return { status: 200, body: { adjustment } };
    });
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  @TsRestHandler(contract.inventory.stockCardReport)
  stockCardReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.stockCardReport, async ({ query }) => {
      assertPermissions(user, "inventory.issue.manage");
      return { status: 200, body: await this.reports.stockCard(query, canViewCost(user)) };
    });
  }

  @TsRestHandler(contract.inventory.valuationReport)
  valuationReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.valuationReport, async ({ query }) => {
      assertPermissions(user, "inventory.cost.view");
      return { status: 200, body: await this.reports.valuation(query.as_of, true) };
    });
  }

  @TsRestHandler(contract.inventory.lowStockReport)
  lowStockReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.lowStockReport, async () => {
      assertPermissions(user, "inventory.issue.manage");
      return { status: 200, body: { rows: await this.reports.lowStock() } };
    });
  }

  @TsRestHandler(contract.inventory.deadStockReport)
  deadStockReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.inventory.deadStockReport, async ({ query }) => {
      assertPermissions(user, "inventory.issue.manage");
      return { status: 200, body: { rows: await this.reports.deadStock(query.months) } };
    });
  }
}
