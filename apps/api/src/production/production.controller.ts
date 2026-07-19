import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { assertPermissions } from "../auth/authz.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { RoutingService } from "./routing.service.js";
import { ScanService } from "./scan.service.js";
import { SubcontractService } from "./subcontract.service.js";
import { WipReportService } from "./wip-report.service.js";
import { WorkOrderService } from "./work-order.service.js";

/**
 * The M4 production surface (task 4.8). Every handler authorizes in-handler via
 * `assertPermissions` (M0 design D7) — routing/work-order endpoints require
 * `production.wo.manage`, scanning `production.scan`, subcontracting
 * `production.subcontract.manage` — and wraps mutations in `uow.withTransaction` so the scan
 * append + step/WO update (and any after-commit event) commit atomically.
 */
@Controller()
export class ProductionController {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly routing: RoutingService,
    private readonly workOrders: WorkOrderService,
    private readonly scans: ScanService,
    private readonly subcontracts: SubcontractService,
    private readonly wip: WipReportService,
  ) {}

  // ── Routing templates (production.wo.manage) ────────────────────────────────

  @TsRestHandler(contract.production.listRoutingTemplates)
  listRoutingTemplates(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.listRoutingTemplates, async ({ query }) => {
      assertPermissions(user, "production.wo.manage");
      return { status: 200, body: await this.routing.list(query) };
    });
  }

  @TsRestHandler(contract.production.createRoutingTemplate)
  createRoutingTemplate(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.createRoutingTemplate, async ({ body }) => {
      assertPermissions(user, "production.wo.manage");
      const template = await this.uow.withTransaction(() => this.routing.create(body));
      return { status: 201, body: { template } };
    });
  }

  // ── Work orders (production.wo.manage) ──────────────────────────────────────

  @TsRestHandler(contract.production.createWorkOrder)
  createWorkOrder(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.createWorkOrder, async ({ body }) => {
      assertPermissions(user, "production.wo.manage");
      const work_order = await this.uow.withTransaction(() =>
        this.workOrders.create(body, user),
      );
      return { status: 201, body: { work_order } };
    });
  }

  @TsRestHandler(contract.production.workOrderTimeline)
  workOrderTimeline(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.workOrderTimeline, async ({ query }) => {
      assertPermissions(user, "production.wo.manage");
      return { status: 200, body: { data: await this.workOrders.timeline(query) } };
    });
  }

  @TsRestHandler(contract.production.getWorkOrder)
  getWorkOrder(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.getWorkOrder, async ({ params }) => {
      assertPermissions(user, "production.wo.manage");
      return { status: 200, body: await this.workOrders.detail(params.id) };
    });
  }

  // ── Shop-floor scanning (production.scan) ───────────────────────────────────

  @TsRestHandler(contract.production.scanWoStep)
  scanWoStep(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.scanWoStep, async ({ params, body }) => {
      assertPermissions(user, "production.scan");
      const step = await this.uow.withTransaction(() =>
        this.scans.scan(params.id, body, user),
      );
      return { status: 200, body: { step } };
    });
  }

  @TsRestHandler(contract.production.holdWoStep)
  holdWoStep(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.holdWoStep, async ({ params, body }) => {
      assertPermissions(user, "production.scan");
      const step = await this.uow.withTransaction(() =>
        this.scans.hold(params.id, body, user),
      );
      return { status: 200, body: { step } };
    });
  }

  @TsRestHandler(contract.production.recordDefect)
  recordDefect(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.recordDefect, async ({ params, body }) => {
      assertPermissions(user, "production.scan");
      const defect = await this.uow.withTransaction(() =>
        this.scans.recordDefect(params.id, body, user),
      );
      return { status: 201, body: { defect } };
    });
  }

  // ── Subcontracting (production.subcontract.manage) ──────────────────────────

  @TsRestHandler(contract.production.subcontractWoStep)
  subcontractWoStep(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.subcontractWoStep, async ({ params, body }) => {
      assertPermissions(user, "production.subcontract.manage");
      const subcontract = await this.uow.withTransaction(() =>
        this.subcontracts.send(params.id, body, user),
      );
      return { status: 201, body: { subcontract } };
    });
  }

  @TsRestHandler(contract.production.receiveSubcontract)
  receiveSubcontract(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.receiveSubcontract, async ({ params }) => {
      assertPermissions(user, "production.subcontract.manage");
      const subcontract = await this.uow.withTransaction(() =>
        this.subcontracts.receive(params.id, user),
      );
      return { status: 200, body: { subcontract } };
    });
  }

  @TsRestHandler(contract.production.listSubcontracts)
  listSubcontracts(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.listSubcontracts, async ({ query }) => {
      assertPermissions(user, "production.subcontract.manage");
      return { status: 200, body: await this.subcontracts.list(query) };
    });
  }

  // ── Reports (production.wo.manage) ──────────────────────────────────────────

  @TsRestHandler(contract.production.wipReport)
  wipReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.production.wipReport, async () => {
      assertPermissions(user, "production.wo.manage");
      return { status: 200, body: { rows: await this.wip.report() } };
    });
  }
}
