import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  stockBalance,
  stockCount,
  stockCountLine,
  type Db,
} from "@erp/db";
import { and } from "drizzle-orm";
import type {
  CreateStockCountRequest,
  SetStockCountLinesRequest,
  StockAdjustment,
  StockCount,
} from "@erp/contracts";
import { formatQty, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import {
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { q, qN } from "./inventory.util.js";
import { ItemService } from "./item.service.js";
import { StockAdjustmentService } from "./stock-adjustment.service.js";

/**
 * Physical stock counts (task 5.8). OPEN snapshots `system_qty` from `stock_balance` per
 * item; `setLines` records the physical tally (→ COUNTING); `reconcile` turns each
 * counted-vs-system delta into a DRAFT stock adjustment (→ RECONCILED) that then flows
 * through the normal approve/post path.
 */
@Injectable()
export class StockCountService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly items: ItemService,
    private readonly adjustments: StockAdjustmentService,
  ) {}

  async create(
    input: CreateStockCountRequest,
    _actor: AuthUser,
  ): Promise<StockCount> {
    const ex = currentExecutor(this.db);
    const warehouseId = await this.items.defaultWarehouseId();

    const [header] = await ex
      .insert(stockCount)
      .values({ period: input.period, status: "OPEN" })
      .returning({ id: stockCount.id });
    if (!header) throw new StateConflictError("Count could not be created");

    for (const itemId of input.item_ids) {
      const [bal] = await ex
        .select({ qtyOnHand: stockBalance.qtyOnHand })
        .from(stockBalance)
        .where(
          and(
            eq(stockBalance.itemId, itemId),
            eq(stockBalance.warehouseId, warehouseId),
          ),
        )
        .limit(1);
      await ex.insert(stockCountLine).values({
        countId: header.id,
        itemId,
        systemQty: formatQty(bal?.qtyOnHand ?? "0"),
      });
    }

    return this.load(header.id);
  }

  async setLines(
    id: string,
    input: SetStockCountLinesRequest,
    _actor: AuthUser,
  ): Promise<StockCount> {
    const ex = currentExecutor(this.db);
    const count = await this.load(id);
    if (count.status !== "OPEN" && count.status !== "COUNTING") {
      throw new StateConflictError(`Cannot record lines on a ${count.status} count`);
    }

    for (const line of input.lines) {
      await ex
        .update(stockCountLine)
        .set({ countedQty: formatQty(line.counted_qty) })
        .where(
          and(
            eq(stockCountLine.countId, id),
            eq(stockCountLine.itemId, line.item_id),
          ),
        );
    }

    await ex
      .update(stockCount)
      .set({ status: "COUNTING" })
      .where(eq(stockCount.id, id));

    return this.load(id);
  }

  /** Turn counted-vs-system deltas into a DRAFT adjustment; move the count → RECONCILED. */
  async reconcile(id: string, _actor: AuthUser): Promise<StockAdjustment> {
    const ex = currentExecutor(this.db);
    const count = await this.load(id);
    if (count.status !== "COUNTING") {
      throw new StateConflictError("Only a counting count can be reconciled");
    }

    const deltas = count.lines
      .filter((l) => l.counted_qty !== null)
      .map((l) => ({
        item_id: l.item_id,
        qty_delta: q(
          formatQty(toDecimal(l.counted_qty ?? "0").minus(toDecimal(l.system_qty))),
        ),
      }))
      .filter((l) => !toDecimal(l.qty_delta).isZero());

    if (deltas.length === 0) {
      throw new StateConflictError("No differences to reconcile");
    }

    const adjustment = await this.adjustments.createDraft(
      `Stock count reconciliation (${count.period})`,
      deltas,
    );

    await ex
      .update(stockCount)
      .set({ status: "RECONCILED" })
      .where(eq(stockCount.id, id));

    return adjustment;
  }

  private async load(id: string): Promise<StockCount> {
    const ex = currentExecutor(this.db);
    const [header] = await ex
      .select()
      .from(stockCount)
      .where(eq(stockCount.id, id))
      .limit(1);
    if (!header) throw new NotFoundError("Stock count not found");

    const lines = await ex
      .select()
      .from(stockCountLine)
      .where(eq(stockCountLine.countId, id))
      .orderBy(stockCountLine.itemId);

    return {
      id: header.id,
      period: header.period ?? "",
      status: header.status,
      lines: lines.map((l) => ({
        id: `${l.countId}:${l.itemId}`,
        item_id: l.itemId,
        system_qty: q(l.systemQty),
        counted_qty: qN(l.countedQty),
      })),
    };
  }
}
