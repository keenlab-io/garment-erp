import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, documentSequence, stockBalance, uom, warehouse } from "@erp/db";
import { formatMoney, toDecimal } from "@erp/utils";
import type { Permission } from "@erp/contracts";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { assertPermissions } from "../../src/auth/authz.js";
import { ForbiddenError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { CostingService } from "../../src/inventory/costing.service.js";
import { GoodsReceiptService } from "../../src/inventory/goods-receipt.service.js";
import { ItemService } from "../../src/inventory/item.service.js";
import { LedgerService } from "../../src/inventory/ledger.service.js";
import {
  requiredDashboardPermissions,
  requiredReportPermissions,
} from "../../src/reporting/report-access.js";
import { REPORT_DIGEST_JOB, ReportScheduleService } from "../../src/reporting/report-schedule.service.js";
import { ReportService } from "../../src/reporting/report.service.js";
import { scheduleSchedulerId } from "../../src/reporting/schedule.util.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST (Testcontainers globalSetup). Drives the M6 reporting services
// against a real Postgres, covering the spec §6.7 acceptance criteria (tasks 5.2–5.4): the
// cost.valuation reconciliation to the M3 stock cards, weekly-schedule → BullMQ repeatable-job
// wiring, and the cost/profit RBAC gate.
describe.skipIf(!url)("Reporting services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let items: ItemService;
  let receipts: GoodsReceiptService;
  let reports: ReportService;
  let kgUom: string;

  const actor: AuthUser = {
    id: randomUUID(),
    sessionId: randomUUID(),
    isSuperAdmin: true,
    permissions: new Set(),
  };

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    const emitter = new EventEmitter2();
    const events = new EventBusService(emitter);
    uow = new UnitOfWork(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    const costing = new CostingService(conn.db);
    const ledger = new LedgerService(conn.db, events);
    items = new ItemService(conn.db, sequences);
    receipts = new GoodsReceiptService(conn.db, items, costing, ledger, events);
    reports = new ReportService(conn.db);

    kgUom = randomUUID();
    await conn.db.insert(uom).values({ id: kgUom, code: `KG-${kgUom.slice(0, 4)}`, name: "Kilogram" });
    await conn.db.insert(warehouse).values({ id: randomUUID(), name: "Reporting WH" });
    await conn.db
      .insert(documentSequence)
      .values({
        key: "ITEM",
        prefix: "RP",
        includeYear: false,
        padding: 5,
        resetYearly: false,
        currentValue: 0,
        format: "{prefix}{seq:00000}",
        yearScope: 2000,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  async function makeItem(): Promise<string> {
    const item = await items.create(
      {
        name: `Reporting item ${randomUUID().slice(0, 8)}`,
        item_type: "RAW" as never,
        base_uom_id: kgUom as never,
        costing_method: "MAV" as never,
        attributes: {},
      },
      actor,
    );
    return item.id;
  }

  async function receive(itemId: string, qty: string, price: string): Promise<void> {
    const receipt = await uow.withTransaction(() =>
      receipts.create(
        {
          supplier_id: randomUUID() as never,
          lines: [{ item_id: itemId as never, uom_id: kgUom as never, qty: qty as never, unit_price: price as never }],
        },
        actor,
      ),
    );
    await uow.withTransaction(() => receipts.confirm(receipt.id));
    await uow.withTransaction(() => receipts.post(receipt.id, actor));
  }

  it("cost.valuation total equals Σ mv_stock_valuation, matching M3 stock cards item-by-item", async () => {
    const itemA = await makeItem();
    const itemB = await makeItem();
    await receive(itemA, "10", "50"); // 10 * 50 = 500.0000
    await receive(itemB, "4", "25"); // 4 * 25 = 100.0000

    await conn.db.execute(sql`REFRESH MATERIALIZED VIEW mv_stock_valuation`);

    const [cardA] = await conn.db.select().from(stockBalance).where(eq(stockBalance.itemId, itemA));
    const [cardB] = await conn.db.select().from(stockBalance).where(eq(stockBalance.itemId, itemB));
    expect(cardA).toBeDefined();
    expect(cardB).toBeDefined();

    const report = await reports.run("cost.valuation", {});
    const rowA = report.rows.find((r) => r.item_id === itemA);
    const rowB = report.rows.find((r) => r.item_id === itemB);
    expect(rowA?.qty_on_hand).toBe(cardA?.qtyOnHand);
    expect(rowA?.avg_cost).toBe(cardA?.avgCost);
    expect(rowB?.qty_on_hand).toBe(cardB?.qtyOnHand);
    expect(rowB?.avg_cost).toBe(cardB?.avgCost);

    // Reconcile the report's grand total to Σ over every mv_stock_valuation row (the whole
    // M3 stock ledger at refresh time), not just this test's two items. Sum the exact
    // (unrounded) per-row products first and round once at the end, matching how the MV's
    // `value` column (qty*cost, unrounded) is aggregated by the report's `sumMoney(...)`.
    const allCards = await conn.db.select().from(stockBalance);
    const expectedTotal = formatMoney(
      allCards.reduce(
        (acc, c) => acc.plus(toDecimal(c.qtyOnHand).times(c.avgCost)),
        toDecimal(0),
      ),
    );
    expect(report.totals.value).toBe(expectedTotal);
  });

  it("creating a weekly '0 8 * * 1' schedule upserts its BullMQ repeatable job", async () => {
    const stubQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue;
    const schedules = new ReportScheduleService(conn.db, stubQueue);

    const created = await uow.withTransaction(() =>
      schedules.create(
        {
          name: "Weekly ops digest",
          report_key: "sales.overview",
          cron: "0 8 * * 1",
          recipients: ["ops@example.com"],
          format: "PDF",
          params: {},
          is_active: true,
        },
        actor,
      ),
    );

    expect(stubQueue.upsertJobScheduler).toHaveBeenCalledWith(
      scheduleSchedulerId(created.id),
      { pattern: "0 8 * * 1" },
      { name: REPORT_DIGEST_JOB, data: { schedule_id: created.id } },
    );

    // Deactivating removes the repeatable job so a Monday-08:00 send never fires again.
    await uow.withTransaction(() =>
      schedules.update(created.id, created.version, { is_active: false }, actor),
    );
    expect(stubQueue.removeJobScheduler).toHaveBeenCalledWith(scheduleSchedulerId(created.id));
  });

  it("a user with report.sales.view but not inventory.cost.view opens sales reports but gets 403 on cost/profit", () => {
    // Holds every report group's own view permission but not the cost-data gate — isolates
    // inventory.cost.view (not a missing group permission) as the sole reason cost/profit 403s.
    const noCostData: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: new Set<Permission>([
        "report.sales.view",
        "report.cost.view",
        "report.profit.view",
      ]),
    };

    // Sales report: authorized.
    expect(() =>
      assertPermissions(noCostData, ...(requiredReportPermissions("sales.overview") ?? [])),
    ).not.toThrow();

    // Cost/profit reports and the cost dashboard: missing inventory.cost.view → 403.
    expect(() =>
      assertPermissions(noCostData, ...(requiredReportPermissions("cost.valuation") ?? [])),
    ).toThrow(ForbiddenError);
    expect(() =>
      assertPermissions(noCostData, ...(requiredReportPermissions("profit.margin_by_item") ?? [])),
    ).toThrow(ForbiddenError);
    expect(() =>
      assertPermissions(noCostData, ...(requiredDashboardPermissions("cost") ?? [])),
    ).toThrow(ForbiddenError);
  });
});
