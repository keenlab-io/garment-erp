import { Module } from "@nestjs/common";
import { CompletionService } from "./completion.service.js";
import { ProductionController } from "./production.controller.js";
import { ProductionMonitorWorker } from "./production-monitor.worker.js";
import { RoutingService } from "./routing.service.js";
import { ScanService } from "./scan.service.js";
import { SubcontractService } from "./subcontract.service.js";
import { WipReportService } from "./wip-report.service.js";
import { WorkOrderService } from "./work-order.service.js";

/**
 * M4 Production Tracking module (task 4.8). Routing templates, work orders with snapshot step
 * materialization, append-only shop-floor scanning with realtime broadcasts, subcontracting,
 * the completion → `WorkOrderCompleted` (M3 backflush) trigger, the WIP/bottleneck report, and
 * the repeatable monitor sweep (delay + subcontract-SLA detection). Everything it depends on
 * (DB, UnitOfWork, EventBus, Sequence, Queue, Realtime) comes from the global M0 modules.
 */
@Module({
  controllers: [ProductionController],
  providers: [
    RoutingService,
    WorkOrderService,
    ScanService,
    SubcontractService,
    CompletionService,
    WipReportService,
    ProductionMonitorWorker,
  ],
})
export class ProductionModule {}
