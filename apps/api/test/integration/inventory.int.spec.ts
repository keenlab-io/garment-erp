import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLog,
  createDb,
  documentSequence,
  stockBalance,
  stockLot,
  stockMovement,
  uom,
  warehouse,
} from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { AuditService } from "../../src/audit/audit.service.js";
import { ValidationError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { BackflushService } from "../../src/inventory/backflush.service.js";
import { BomService } from "../../src/inventory/bom.service.js";
import { CostingService } from "../../src/inventory/costing.service.js";
import { GoodsIssueService } from "../../src/inventory/goods-issue.service.js";
import { GoodsReceiptService } from "../../src/inventory/goods-receipt.service.js";
import { ItemService } from "../../src/inventory/item.service.js";
import { LedgerService } from "../../src/inventory/ledger.service.js";
import { StockAdjustmentService } from "../../src/inventory/stock-adjustment.service.js";
import { StockCountService } from "../../src/inventory/stock-count.service.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST (the Testcontainers globalSetup). Drives the M3 inventory
// services end-to-end against a real Postgres, covering the spec §3.8 acceptance criteria
// (tasks 6.1–6.7): lot/ledger/balance consistency, MAV & FIFO costing, backflush
// idempotency, replay-equivalence, reason-gated adjustments, and ledger immutability.
describe.skipIf(!url)("Inventory services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let items: ItemService;
  let receipts: GoodsReceiptService;
  let issues: GoodsIssueService;
  let boms: BomService;
  let adjustments: StockAdjustmentService;
  let counts: StockCountService;
  let backflush: BackflushService;
  let uow: UnitOfWork;

  let kgUom: string;
  let warehouseId: string;
  const actor: AuthUser = {
    id: randomUUID(),
    sessionId: randomUUID(),
    isSuperAdmin: true,
    permissions: new Set(),
  };

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const emitter = new EventEmitter2();
    const events = new EventBusService(emitter);
    uow = new UnitOfWork(conn.db);
    const audit = new AuditService(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    const costing = new CostingService(conn.db);
    const ledger = new LedgerService(conn.db, events);
    items = new ItemService(conn.db, sequences);
    receipts = new GoodsReceiptService(conn.db, items, costing, ledger, events);
    const config = {
      get: (key: string) =>
        key === "INVENTORY_ALLOW_NEGATIVE_STOCK" ? false : undefined,
    } as unknown as ConfigService;
    issues = new GoodsIssueService(conn.db, config, items, costing, ledger, events);
    boms = new BomService(conn.db, items);
    adjustments = new StockAdjustmentService(conn.db, items, ledger, events, audit);
    counts = new StockCountService(conn.db, items, adjustments);
    backflush = new BackflushService(conn.db, uow, items, costing, ledger, boms, events);

    kgUom = randomUUID();
    warehouseId = randomUUID();
    await conn.db.insert(uom).values({ id: kgUom, code: `KG-${kgUom.slice(0, 4)}`, name: "Kilogram" });
    await conn.db.insert(warehouse).values({ id: warehouseId, name: "Main WH" });
    await conn.db
      .insert(documentSequence)
      .values({
        key: "ITEM",
        prefix: "AA",
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
    await conn.queryClient.end();
  });

  // ── helpers ─────────────────────────────────────────────────────────────────

  async function makeItem(
    costingMethod: "MAV" | "FIFO" | "STANDARD",
    opts: { itemType?: "RAW" | "FINISHED"; standardCost?: string } = {},
  ): Promise<string> {
    const item = await items.create(
      {
        name: `Item ${costingMethod}`,
        item_type: (opts.itemType ?? "RAW") as never,
        base_uom_id: kgUom as never,
        costing_method: costingMethod as never,
        standard_cost: opts.standardCost as never,
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

  async function issue(itemId: string, qty: string): Promise<string> {
    const gi = await uow.withTransaction(() =>
      issues.create(
        {
          purpose: "PRODUCTION" as never,
          lines: [{ item_id: itemId as never, uom_id: kgUom as never, qty: qty as never }],
        },
        actor,
      ),
    );
    await uow.withTransaction(() => issues.post(gi.id, actor));
    return gi.id;
  }

  function balanceOf(itemId: string) {
    return conn.db
      .select()
      .from(stockBalance)
      .where(and(eq(stockBalance.itemId, itemId), eq(stockBalance.warehouseId, warehouseId)))
      .limit(1)
      .then((r) => r[0]);
  }

  function movementsOf(itemId: string, direction?: "IN" | "OUT" | "ADJUST") {
    const filters = [eq(stockMovement.itemId, itemId)];
    if (direction) filters.push(eq(stockMovement.direction, direction));
    return conn.db
      .select()
      .from(stockMovement)
      .where(and(...filters))
      .orderBy(stockMovement.at, stockMovement.unitCost);
  }

  // ── §6.1 ──────────────────────────────────────────────────────────────────────

  it("receive 20 then issue 5 (FIFO) ⇒ lot 15, ledger IN 20 + OUT 5, balance 15", async () => {
    const itemId = await makeItem("FIFO");
    await receive(itemId, "20", "100");
    await issue(itemId, "5");

    const [lot] = await conn.db.select().from(stockLot).where(eq(stockLot.itemId, itemId));
    expect(lot?.qtyRemaining).toBe("15.000000");

    const ins = await movementsOf(itemId, "IN");
    const outs = await movementsOf(itemId, "OUT");
    expect(ins).toHaveLength(1);
    expect(ins[0]?.qty).toBe("20.000000");
    expect(outs).toHaveLength(1);
    expect(outs[0]?.qty).toBe("-5.000000");

    const balance = await balanceOf(itemId);
    expect(balance?.qtyOnHand).toBe("15.000000");
  });

  // ── §6.2 ──────────────────────────────────────────────────────────────────────

  it("MAV: receive 10@100 then 10@120 ⇒ avg 110; issuing 5 posts OUT @110", async () => {
    const itemId = await makeItem("MAV");
    await receive(itemId, "10", "100");
    await receive(itemId, "10", "120");

    const balance = await balanceOf(itemId);
    expect(balance?.avgCost).toBe("110.0000");

    await issue(itemId, "5");
    const outs = await movementsOf(itemId, "OUT");
    expect(outs).toHaveLength(1);
    expect(outs[0]?.unitCost).toBe("110.0000");
  });

  // ── §6.7 ──────────────────────────────────────────────────────────────────────

  it("FIFO issue spanning two lots ⇒ two OUT movements at each lot's cost", async () => {
    const itemId = await makeItem("FIFO");
    await receive(itemId, "10", "100");
    await receive(itemId, "10", "120");
    await issue(itemId, "15");

    const outs = await movementsOf(itemId, "OUT");
    expect(outs).toHaveLength(2);
    const costs = outs.map((o) => o.unitCost).sort();
    expect(costs).toEqual(["100.0000", "120.0000"]);
    // 10 from the first lot, 5 from the second.
    const byCost = Object.fromEntries(outs.map((o) => [o.unitCost, o.qty]));
    expect(byCost["100.0000"]).toBe("-10.000000");
    expect(byCost["120.0000"]).toBe("-5.000000");
  });

  it("landed-cost allocation sums to landed_cost_total", async () => {
    const a = await makeItem("MAV");
    const b = await makeItem("MAV");
    const receipt = await uow.withTransaction(() =>
      receipts.create(
        {
          supplier_id: randomUUID() as never,
          landed_cost_total: "50" as never,
          alloc_method: "VALUE" as never,
          lines: [
            { item_id: a as never, uom_id: kgUom as never, qty: "10" as never, unit_price: "100" as never },
            { item_id: b as never, uom_id: kgUom as never, qty: "10" as never, unit_price: "120" as never },
          ],
        },
        actor,
      ),
    );
    const confirmed = await uow.withTransaction(() => receipts.confirm(receipt.id));
    const total = confirmed.lines.reduce((acc, l) => acc + Number(l.allocated_landed), 0);
    expect(total.toFixed(4)).toBe("50.0000");
  });

  // ── §6.3 ──────────────────────────────────────────────────────────────────────

  it("backflush posts FG IN + RM OUT atomically and is idempotent on wo_id", async () => {
    const fg = await makeItem("MAV", { itemType: "FINISHED" });
    const rm = await makeItem("MAV");
    await receive(rm, "1000", "5"); // seed RM stock

    const bom = await uow.withTransaction(() =>
      boms.create(
        {
          finished_item_id: fg as never,
          conversion_cost: "2" as never,
          lines: [{ item_id: rm as never, uom_id: kgUom as never, qty: "2" as never, scrap_pct: "0.1" as never }],
        },
        actor,
      ),
    );
    expect(bom.version).toBe(1);

    const wo = { wo_id: randomUUID(), finished_item_id: fg, warehouse_id: warehouseId, qty_produced: "100" };
    await backflush.backflush(wo, actor.id);

    const fgBal = await balanceOf(fg);
    expect(fgBal?.qtyOnHand).toBe("100.000000");
    // RM consumed = 2 · 100 · (1 + 0.1) = 220 ⇒ 1000 − 220 = 780.
    const rmBal = await balanceOf(rm);
    expect(rmBal?.qtyOnHand).toBe("780.000000");

    // Redelivery must not double-post.
    await backflush.backflush(wo, actor.id);
    expect((await balanceOf(fg))?.qtyOnHand).toBe("100.000000");
    expect((await balanceOf(rm))?.qtyOnHand).toBe("780.000000");
    const backflushMovements = await conn.db
      .select()
      .from(stockMovement)
      .where(eq(stockMovement.refId, wo.wo_id));
    expect(backflushMovements).toHaveLength(2); // one FG IN + one RM OUT, not four
  });

  it("backflush failure rolls back fully — the FG IN posted before the fault is not persisted", async () => {
    const fg = await makeItem("MAV", { itemType: "FINISHED" });
    const rm = await makeItem("MAV");
    await receive(rm, "1000", "5"); // seed RM stock so roll-up has a cost

    // A second UOM with **no** conversion registered to the RM's base unit. The BOM
    // line quotes it, so roll-up (cost-only, no UOM math) succeeds and the FG IN is
    // posted — then the RM OUT leg calls `toBase`, which throws for the missing
    // conversion, and the whole transaction must unwind.
    const gramUom = randomUUID();
    await conn.db
      .insert(uom)
      .values({ id: gramUom, code: `G-${gramUom.slice(0, 4)}`, name: "Gram" });
    await uow.withTransaction(() =>
      boms.create(
        {
          finished_item_id: fg as never,
          lines: [{ item_id: rm as never, uom_id: gramUom as never, qty: "2" as never }],
        },
        actor,
      ),
    );

    const wo = { wo_id: randomUUID(), finished_item_id: fg, warehouse_id: warehouseId, qty_produced: "100" };
    await expect(backflush.backflush(wo, actor.id)).rejects.toThrow();

    // Nothing from the aborted transaction survives: no FG balance, no lot, and no
    // movement references the work order.
    expect(await balanceOf(fg)).toBeUndefined();
    const fgMovements = await movementsOf(fg);
    expect(fgMovements).toHaveLength(0);
    const anyForWo = await conn.db
      .select()
      .from(stockMovement)
      .where(eq(stockMovement.refId, wo.wo_id));
    expect(anyForWo).toHaveLength(0);
  });

  // ── §6.4 ──────────────────────────────────────────────────────────────────────

  it("replaying stock_movement reproduces stock_balance exactly", async () => {
    const itemId = await makeItem("MAV");
    await receive(itemId, "10", "100");
    await receive(itemId, "10", "120");
    await issue(itemId, "7");

    const before = await balanceOf(itemId);
    const ledger = new LedgerService(conn.db, new EventBusService(new EventEmitter2()));
    const rebuilt = await ledger.rebuildBalance(itemId, warehouseId);

    expect(rebuilt.qtyOnHand).toBe(before?.qtyOnHand);
    expect(rebuilt.avgCost).toBe(before?.avgCost);
  });

  // ── §6.5 ──────────────────────────────────────────────────────────────────────

  it("adjustment without a reason ⇒ 400 (ValidationError)", async () => {
    const itemId = await makeItem("MAV");
    await expect(
      adjustments.createDraft("  ", [{ item_id: itemId as never, qty_delta: "5" as never }]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("adjustment with a reason ⇒ exactly one audit_log row (actor + reason + before/after)", async () => {
    const itemId = await makeItem("MAV");
    await receive(itemId, "10", "100");

    const draft = await uow.withTransaction(() =>
      adjustments.createDraft("Cycle-count correction", [
        { item_id: itemId as never, warehouse_id: warehouseId as never, qty_delta: "-3" as never },
      ]),
    );
    await uow.withTransaction(() => adjustments.approve(draft.id, actor));
    await uow.withTransaction(() => adjustments.post(draft.id, actor));

    const rows = await conn.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "stock_adjustment"), eq(auditLog.entityId, draft.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("Cycle-count correction");
    expect(rows[0]?.actorUserId).toBe(actor.id);
    expect(rows[0]?.before).not.toBeNull();
    expect(rows[0]?.after).not.toBeNull();

    const balance = await balanceOf(itemId);
    expect(balance?.qtyOnHand).toBe("7.000000");
  });

  // ── §6.6 ──────────────────────────────────────────────────────────────────────

  it("ledger is immutable: UPDATE and DELETE on stock_movement are rejected", async () => {
    const itemId = await makeItem("MAV");
    await receive(itemId, "5", "10");
    const [row] = await movementsOf(itemId, "IN");
    expect(row).toBeDefined();

    await expect(
      conn.db
        .update(stockMovement)
        .set({ qty: "999" })
        .where(eq(stockMovement.id, row!.id)),
    ).rejects.toThrow();
    await expect(
      conn.db.delete(stockMovement).where(eq(stockMovement.id, row!.id)),
    ).rejects.toThrow();
  });

  // ── reconcile flow ───────────────────────────────────────────────────────────

  it("stock count reconcile produces a draft adjustment for the delta", async () => {
    const itemId = await makeItem("MAV");
    await receive(itemId, "10", "100");

    const count = await uow.withTransaction(() =>
      counts.create({ period: "2026-07", item_ids: [itemId as never] }, actor),
    );
    await uow.withTransaction(() =>
      counts.setLines(count.id, { lines: [{ item_id: itemId as never, counted_qty: "8" as never }] }, actor),
    );
    const adjustment = await uow.withTransaction(() => counts.reconcile(count.id, actor));
    expect(adjustment.status).toBe("DRAFT");
    expect(adjustment.lines).toHaveLength(1);
    expect(adjustment.lines[0]?.qty_delta).toBe("-2.000000");
  });
});
