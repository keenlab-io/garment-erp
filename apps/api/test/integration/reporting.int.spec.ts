import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TENANT_ID,
  createDb,
  documentSequence,
  stockBalance,
  tenant,
  uom,
  warehouse,
} from "@erp/db";
import { formatMoney, toDecimal } from "@erp/utils";
import type { Permission } from "@erp/contracts";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { assertPermissions } from "../../src/auth/authz.js";
import { ForbiddenError, NotFoundError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { DefaultTenantUnitOfWork } from "./tenant-harness.js";
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
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST (Testcontainers globalSetup). Drives the M6 reporting services
// against a real Postgres, covering the spec §6.7 acceptance criteria (tasks 5.2–5.4): the
// cost.valuation reconciliation to the M3 stock cards, weekly-schedule → BullMQ repeatable-job
// wiring, and the cost/profit RBAC gate. M7 §13 makes both per tenant: tenant B gets its own UOM,
// warehouse and ITEM sequence; the harness connects as the superuser (RLS bypassed), so the
// valuation isolation comes from the `v_*` views' GUC filter and the schedule isolation from the
// services' own tenant predicates.
describe.skipIf(!url)("Reporting services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let items: ItemService;
  let receipts: GoodsReceiptService;
  let reports: ReportService;
  let tenantB: string;
  const kgUom: Record<string, string> = {};

  const actorFor = (tenantId: string): AuthUser => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    tenantId,
    isSuperAdmin: true,
    permissions: new Set(),
  });
  const actor = actorFor(DEFAULT_TENANT_ID);
  /** Run `fn` in `tenantId`'s transaction — `app.tenant_id` set as on the HTTP/job path. */
  const inTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    runWithTenant(tenantId, "jwt", () => uow.withTransaction(fn));

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    const emitter = new EventEmitter2();
    const events = new EventBusService(emitter);
    uow = new DefaultTenantUnitOfWork(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    const costing = new CostingService(conn.db);
    const ledger = new LedgerService(conn.db, events);
    items = new ItemService(conn.db, sequences);
    receipts = new GoodsReceiptService(conn.db, items, costing, ledger, events);
    reports = new ReportService(conn.db);

    const [other] = await conn.db
      .insert(tenant)
      .values({ slug: `rep-b-${randomUUID().slice(0, 8)}`, name: "Reporting tenant B", kind: "CUSTOMER" })
      .returning({ id: tenant.id });
    tenantB = (other as { id: string }).id;

    for (const tenantId of [DEFAULT_TENANT_ID, tenantB]) {
      const uomId = randomUUID();
      kgUom[tenantId] = uomId;
      await conn.db
        .insert(uom)
        .values({ id: uomId, tenantId, code: `KG-${uomId.slice(0, 4)}`, name: "Kilogram" });
      await conn.db.insert(warehouse).values({ id: randomUUID(), tenantId, name: "Reporting WH" });
      await conn.db
        .insert(documentSequence)
        .values({
          tenantId,
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
    }
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  async function makeItem(tenantId: string): Promise<string> {
    const item = await inTenant(tenantId, () =>
      items.create(
        {
          name: `Reporting item ${randomUUID().slice(0, 8)}`,
          item_type: "RAW" as never,
          base_uom_id: kgUom[tenantId] as never,
          costing_method: "MAV" as never,
          attributes: {},
        },
        actorFor(tenantId),
      ),
    );
    return item.id;
  }

  async function receive(tenantId: string, itemId: string, qty: string, price: string): Promise<void> {
    const by = actorFor(tenantId);
    const receipt = await inTenant(tenantId, () =>
      receipts.create(
        {
          supplier_id: randomUUID() as never,
          lines: [
            {
              item_id: itemId as never,
              uom_id: kgUom[tenantId] as never,
              qty: qty as never,
              unit_price: price as never,
            },
          ],
        },
        by,
      ),
    );
    await inTenant(tenantId, () => receipts.confirm(receipt.id));
    await inTenant(tenantId, () => receipts.post(receipt.id, by));
  }

  /** Σ qty_on_hand × avg_cost over one tenant's stock cards, rounded once at money scale. */
  async function stockCardTotal(tenantId: string): Promise<string> {
    const cards = await conn.db
      .select()
      .from(stockBalance)
      .where(eq(stockBalance.tenantId, tenantId));
    return formatMoney(
      cards.reduce((acc, c) => acc.plus(toDecimal(c.qtyOnHand).times(c.avgCost)), toDecimal(0)),
    );
  }

  it("cost.valuation reconciles per tenant: Σ v_stock_valuation matches each tenant's own stock cards", async () => {
    const itemA1 = await makeItem(DEFAULT_TENANT_ID);
    const itemA2 = await makeItem(DEFAULT_TENANT_ID);
    const itemB = await makeItem(tenantB);
    await receive(DEFAULT_TENANT_ID, itemA1, "10", "50"); // 10 * 50 = 500.0000
    await receive(DEFAULT_TENANT_ID, itemA2, "4", "25"); // 4 * 25 = 100.0000
    await receive(tenantB, itemB, "3", "70"); // 3 * 70 = 210.0000

    // The MV holds every tenant's rows (the refresh runs with owner rights, M7 design D8).
    await conn.db.execute(sql`REFRESH MATERIALIZED VIEW mv_stock_valuation`);

    // Each tenant's report runs inside that tenant's transaction (M7 §13.2).
    const reportA = await inTenant(DEFAULT_TENANT_ID, () => reports.run("cost.valuation", {}));
    const reportB = await inTenant(tenantB, () => reports.run("cost.valuation", {}));

    const cardsFor = async (itemIds: string[]) =>
      Promise.all(
        itemIds.map(async (id) => {
          const [card] = await conn.db.select().from(stockBalance).where(eq(stockBalance.itemId, id));
          expect(card).toBeDefined();
          return card!;
        }),
      );

    // Item-by-item: every report row matches the owning tenant's stock card.
    for (const [report, ids] of [
      [reportA, [itemA1, itemA2]],
      [reportB, [itemB]],
    ] as const) {
      for (const card of await cardsFor([...ids])) {
        const row = report.rows.find((r) => r.item_id === card.itemId);
        expect(row?.qty_on_hand).toBe(card.qtyOnHand);
        expect(row?.avg_cost).toBe(card.avgCost);
      }
    }

    // Neither tenant's report includes the other tenant's stock.
    expect(reportA.rows.some((r) => r.item_id === itemB)).toBe(false);
    expect(reportB.rows.map((r) => r.item_id)).toEqual([itemB]);

    // Grand totals reconcile to Σ over each tenant's own stock cards (the whole tenant ledger at
    // refresh time — other specs stage stock in the default tenant too). Exact per-row products
    // are summed and rounded once, matching the report's `sumMoney` over the unrounded `value`.
    expect(reportA.totals.value).toBe(await stockCardTotal(DEFAULT_TENANT_ID));
    expect(reportB.totals.value).toBe(await stockCardTotal(tenantB));
    expect(reportB.totals.value).toBe("210.0000");
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
      // The repeatable job carries the owning tenant (M7 design D11).
      { name: REPORT_DIGEST_JOB, data: { schedule_id: created.id, tenantId: DEFAULT_TENANT_ID } },
    );

    // Deactivating removes the repeatable job so a Monday-08:00 send never fires again.
    await uow.withTransaction(() =>
      schedules.update(created.id, created.version, { is_active: false }, actor),
    );
    expect(stubQueue.removeJobScheduler).toHaveBeenCalledWith(scheduleSchedulerId(created.id));
  });

  it("report schedules are per-tenant rows: another tenant can neither list nor run them", async () => {
    const stubQueue = {
      add: vi.fn().mockResolvedValue({ id: "1" }),
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue;
    const schedules = new ReportScheduleService(conn.db, stubQueue);

    const ownedByB = await inTenant(tenantB, () =>
      schedules.create(
        {
          name: "Tenant B digest",
          report_key: "cost.valuation",
          cron: "0 7 * * *",
          recipients: ["b@example.com"],
          format: "CSV",
          params: {},
          is_active: true,
        },
        actorFor(tenantB),
      ),
    );
    // Tenant B's repeatable job carries tenant B, so each tick renders in B's scope.
    expect(stubQueue.upsertJobScheduler).toHaveBeenCalledWith(
      scheduleSchedulerId(ownedByB.id),
      { pattern: "0 7 * * *" },
      { name: REPORT_DIGEST_JOB, data: { schedule_id: ownedByB.id, tenantId: tenantB } },
    );

    const listedByA = await inTenant(DEFAULT_TENANT_ID, () => schedules.list({ limit: 100 }));
    const listedByB = await inTenant(tenantB, () => schedules.list({ limit: 100 }));
    expect(listedByA.data.some((r) => r.id === ownedByB.id)).toBe(false);
    expect(listedByB.data.map((r) => r.id)).toEqual([ownedByB.id]);

    await expect(
      inTenant(DEFAULT_TENANT_ID, () => schedules.runNow(ownedByB.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      inTenant(DEFAULT_TENANT_ID, () =>
        schedules.update(ownedByB.id, null, { is_active: false }, actor),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The owning tenant's run-now enqueues a digest stamped with that tenant.
    await inTenant(tenantB, () => schedules.runNow(ownedByB.id));
    expect(stubQueue.add).toHaveBeenCalledWith(REPORT_DIGEST_JOB, {
      schedule_id: ownedByB.id,
      tenantId: tenantB,
    });
  });

  it("a user with report.sales.view but not inventory.cost.view opens sales reports but gets 403 on cost/profit", () => {
    // Holds every report group's own view permission but not the cost-data gate — isolates
    // inventory.cost.view (not a missing group permission) as the sole reason cost/profit 403s.
    const noCostData: AuthUser = {
      id: randomUUID(),
      sessionId: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
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
