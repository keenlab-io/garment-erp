import { Module } from "@nestjs/common";
import { BackflushService } from "./backflush.service.js";
import { BarcodeLabelWorker } from "./barcode-label.worker.js";
import { BarcodeService } from "./barcode.service.js";
import { BomService } from "./bom.service.js";
import { CostingService } from "./costing.service.js";
import { GoodsIssueService } from "./goods-issue.service.js";
import { GoodsReceiptService } from "./goods-receipt.service.js";
import { InventoryController } from "./inventory.controller.js";
import { ItemService } from "./item.service.js";
import { LedgerService } from "./ledger.service.js";
import { ReportService } from "./report.service.js";
import { SalesStockSubscriber } from "./sales-stock.subscriber.js";
import { StockAdjustmentService } from "./stock-adjustment.service.js";
import { StockCountService } from "./stock-count.service.js";

/**
 * M3 Inventory & Costing module (task 5.12). The whole costing core — item catalog, the
 * append-only ledger + costing engine, receipts/issues/BOMs/counts/adjustments, reports,
 * the barcode-label queue worker, and the dormant backflush / sales-stock event consumers.
 * Everything it depends on (DB, UnitOfWork, EventBus, Audit, Config, Sequence, Queue, Pdf,
 * Storage) comes from the global M0 modules.
 */
@Module({
  controllers: [InventoryController],
  providers: [
    ItemService,
    CostingService,
    LedgerService,
    GoodsReceiptService,
    GoodsIssueService,
    BomService,
    BackflushService,
    SalesStockSubscriber,
    StockCountService,
    StockAdjustmentService,
    ReportService,
    BarcodeService,
    BarcodeLabelWorker,
  ],
})
export class InventoryModule {}
