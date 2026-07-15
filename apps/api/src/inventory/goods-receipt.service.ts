import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import {
  goodsReceipt,
  goodsReceiptLine,
  stockLot,
  type Db,
} from "@erp/db";
import type { CreateGoodsReceiptRequest, GoodsReceipt } from "@erp/contracts";
import { divideMoney, formatMoney, formatQty, lineTotal, sumMoney, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import {
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { CostingService } from "./costing.service.js";
import { INVENTORY_EVENTS } from "./inventory.events.js";
import { docCode, m, q } from "./inventory.util.js";
import { ItemService } from "./item.service.js";
import { LedgerService } from "./ledger.service.js";

/**
 * Goods receipts (task 5.4). DRAFT → CONFIRMED (landed-cost allocated across lines by
 * `alloc_method`) → POSTED (a `stock_lot` at the landed unit cost + one IN movement per
 * line, ledger updated in the same transaction). Emits `GoodsReceiptPosted` after commit.
 * Quantities convert to base UOM before the ledger sees them (invariant §3.5).
 */
@Injectable()
export class GoodsReceiptService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly items: ItemService,
    private readonly costing: CostingService,
    private readonly ledger: LedgerService,
    private readonly events: EventBusService,
  ) {}

  async create(
    input: CreateGoodsReceiptRequest,
    _actor: AuthUser,
  ): Promise<GoodsReceipt> {
    const ex = currentExecutor(this.db);
    const [header] = await ex
      .insert(goodsReceipt)
      .values({
        supplierId: input.supplier_id,
        status: "DRAFT",
        landedCostTotal: formatMoney(input.landed_cost_total ?? "0"),
        allocMethod: input.alloc_method ?? "VALUE",
      })
      .returning({ id: goodsReceipt.id });
    if (!header) throw new StateConflictError("Receipt could not be created");

    await ex
      .update(goodsReceipt)
      .set({ docNo: docCode("GR", header.id) })
      .where(eq(goodsReceipt.id, header.id));

    await ex.insert(goodsReceiptLine).values(
      input.lines.map((l) => ({
        receiptId: header.id,
        itemId: l.item_id,
        qty: formatQty(l.qty),
        uomId: l.uom_id,
        unitPrice: formatMoney(l.unit_price),
      })),
    );

    return this.load(header.id);
  }

  /** Allocate landed cost across lines and move DRAFT → CONFIRMED. */
  async confirm(id: string): Promise<GoodsReceipt> {
    const ex = currentExecutor(this.db);
    const receipt = await this.load(id);
    if (receipt.status !== "DRAFT") {
      throw new StateConflictError(`Cannot confirm a ${receipt.status} receipt`);
    }

    // Allocation basis: VALUE = extended price, QTY/WEIGHT = quantity. `unit_weight` is
    // not persisted by the schema, so WEIGHT degrades to a QTY basis (documented gap).
    const weights = receipt.lines.map((l) =>
      receipt.alloc_method === "VALUE" ? lineTotal(l.qty, l.unit_price) : formatQty(l.qty),
    );
    const allocated = this.costing.allocateLanded(
      receipt.landed_cost_total ?? "0",
      weights,
    );

    for (let i = 0; i < receipt.lines.length; i++) {
      const line = receipt.lines[i];
      if (!line) continue;
      await ex
        .update(goodsReceiptLine)
        .set({ allocatedLanded: allocated[i] ?? "0" })
        .where(eq(goodsReceiptLine.id, line.id));
    }

    await ex
      .update(goodsReceipt)
      .set({ status: "CONFIRMED", version: sql`${goodsReceipt.version} + 1` })
      .where(eq(goodsReceipt.id, id));

    return this.load(id);
  }

  /** Create lots + post IN movements; move CONFIRMED → POSTED. */
  async post(id: string, actor: AuthUser): Promise<GoodsReceipt> {
    const ex = currentExecutor(this.db);
    const receipt = await this.load(id);
    if (receipt.status === "POSTED") {
      throw new StateConflictError("Receipt is already posted");
    }
    if (receipt.status !== "CONFIRMED") {
      throw new StateConflictError("Receipt must be confirmed before posting");
    }

    const warehouseId = await this.items.defaultWarehouseId();

    for (const line of receipt.lines) {
      const baseQty = await this.items.toBase(line.item_id, line.uom_id, line.qty);
      // Landed unit cost per base unit = (extended price + allocated landed) / base qty.
      const lineCost = sumMoney([
        lineTotal(line.qty, line.unit_price),
        line.allocated_landed,
      ]);
      const unitCost = toDecimal(baseQty).isZero()
        ? formatMoney(line.unit_price)
        : divideMoney(lineCost, baseQty);

      const [lot] = await ex
        .insert(stockLot)
        .values({
          itemId: line.item_id,
          lotNo: docCode("LOT", line.id),
          qtyRemaining: baseQty,
          unitCost,
        })
        .returning({ id: stockLot.id });

      await this.ledger.post({
        itemId: line.item_id,
        warehouseId,
        lotId: lot?.id ?? null,
        qty: baseQty,
        unitCost,
        direction: "IN",
        refType: "GOODS_RECEIPT",
        refId: id,
        actorUserId: actor.id,
      });
    }

    await ex
      .update(goodsReceipt)
      .set({ status: "POSTED", version: sql`${goodsReceipt.version} + 1` })
      .where(eq(goodsReceipt.id, id));

    this.events.publishAfterCommit(
      makeEvent({
        event: INVENTORY_EVENTS.goodsReceiptPosted,
        actorUserId: actor.id,
        payload: { receipt_id: id, warehouse_id: warehouseId },
      }),
    );

    return this.load(id);
  }

  async list(
    limit: number,
    _cursor: string | undefined,
  ): Promise<{ data: GoodsReceipt[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({ id: goodsReceipt.id })
      .from(goodsReceipt)
      .orderBy(sql`${goodsReceipt.id}`)
      .limit(limit);
    const data = await Promise.all(rows.map((r) => this.load(r.id)));
    return { data, next_cursor: null };
  }

  /** Load a receipt with its lines as the wire DTO. */
  private async load(id: string): Promise<GoodsReceipt> {
    const ex = currentExecutor(this.db);
    const [header] = await ex
      .select()
      .from(goodsReceipt)
      .where(eq(goodsReceipt.id, id))
      .limit(1);
    if (!header) throw new NotFoundError("Goods receipt not found");

    const lines = await ex
      .select()
      .from(goodsReceiptLine)
      .where(eq(goodsReceiptLine.receiptId, id))
      .orderBy(goodsReceiptLine.id);

    return {
      id: header.id,
      code: header.docNo ?? docCode("GR", header.id),
      supplier_id: header.supplierId ?? "",
      status: header.status,
      landed_cost_total: m(header.landedCostTotal),
      alloc_method: header.allocMethod,
      version: header.version,
      lines: lines.map((l) => {
        const unitCost = toDecimal(l.qty).isZero()
          ? l.unitPrice
          : formatMoney(
              toDecimal(l.unitPrice).plus(
                toDecimal(l.allocatedLanded).dividedBy(toDecimal(l.qty)),
              ),
            );
        return {
          id: l.id,
          item_id: l.itemId,
          uom_id: l.uomId,
          qty: q(l.qty),
          unit_price: m(l.unitPrice),
          unit_weight: null,
          allocated_landed: m(l.allocatedLanded),
          unit_cost: m(unitCost),
        };
      }),
    };
  }
}
