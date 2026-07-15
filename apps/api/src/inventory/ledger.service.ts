import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { item, stockBalance, stockMovement, type Db } from "@erp/db";
import type { MovementDirection, MovementRefType } from "@erp/contracts";
import { formatMoney, formatQty, movingAverage, toDecimal } from "@erp/utils";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { INVENTORY_EVENTS } from "./inventory.events.js";

/** A single ledger posting — `qty` is the **signed** base-UOM quantity. */
export interface PostMovementInput {
  itemId: string;
  warehouseId: string;
  skuId?: string | null;
  lotId?: string | null;
  /** Signed base-UOM quantity: IN `> 0`, OUT `< 0`, ADJUST either sign. */
  qty: string;
  unitCost: string;
  direction: MovementDirection;
  refType: MovementRefType;
  refId: string;
  /** Allow the resulting on-hand to go negative (issue policy / adjustments). */
  allowNegative?: boolean;
  actorUserId?: string | null;
}

/** The `(qty_on_hand, avg_cost)` pair held in `stock_balance`. */
export interface Balance {
  qtyOnHand: string;
  avgCost: string;
}

const ZERO_BALANCE: Balance = { qtyOnHand: "0", avgCost: "0" };

/**
 * The append-only stock ledger (design D1/D2/D3). `post` writes one immutable
 * `stock_movement` row and updates the derived `stock_balance` cache **in the same
 * transaction**; `rebuildBalance` replays the ledger to reproduce that cache exactly,
 * proving the balance is never authoritative. Moving-average is recomputed on every IN
 * using the running balance so a replay reproduces `avg_cost` bit-for-bit. Callers pass
 * quantities already converted to the item's base UOM (invariant §3.5).
 */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly events: EventBusService,
  ) {}

  /** Current balance for `(item, warehouse)`, or a zero balance when none exists yet. */
  async loadBalance(itemId: string, warehouseId: string): Promise<Balance> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ qtyOnHand: stockBalance.qtyOnHand, avgCost: stockBalance.avgCost })
      .from(stockBalance)
      .where(
        and(
          eq(stockBalance.itemId, itemId),
          eq(stockBalance.warehouseId, warehouseId),
        ),
      )
      .limit(1);
    return row ?? ZERO_BALANCE;
  }

  /**
   * Apply one movement to a running balance. The single source of truth for how a
   * movement mutates `(qty_on_hand, avg_cost)` — used by both live posting and replay,
   * so they can never diverge. Only IN moves the moving average.
   */
  private applyToBalance(
    before: Balance,
    direction: MovementDirection,
    signedQty: string,
    unitCost: string,
  ): Balance {
    const newQty = formatQty(toDecimal(before.qtyOnHand).plus(toDecimal(signedQty)));
    const avgCost =
      direction === "IN"
        ? movingAverage(before.qtyOnHand, before.avgCost, signedQty, unitCost)
        : before.avgCost;
    return { qtyOnHand: newQty, avgCost };
  }

  /** Insert a movement, update the balance cache, and signal low-stock crossings. */
  async post(input: PostMovementInput): Promise<Balance> {
    const ex = currentExecutor(this.db);
    const before = await this.loadBalance(input.itemId, input.warehouseId);

    const after = this.applyToBalance(
      before,
      input.direction,
      input.qty,
      input.unitCost,
    );

    if (
      !input.allowNegative &&
      input.direction === "OUT" &&
      toDecimal(after.qtyOnHand).isNegative()
    ) {
      throw new BusinessRuleError(
        "Insufficient stock: issuing more than on-hand is not allowed",
      );
    }

    await ex.insert(stockMovement).values({
      itemId: input.itemId,
      skuId: input.skuId ?? null,
      lotId: input.lotId ?? null,
      warehouseId: input.warehouseId,
      qty: formatQty(input.qty),
      direction: input.direction,
      unitCost: formatMoney(input.unitCost),
      refType: input.refType,
      refId: input.refId,
    });

    await ex
      .insert(stockBalance)
      .values({
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        qtyOnHand: after.qtyOnHand,
        avgCost: after.avgCost,
      })
      .onConflictDoUpdate({
        target: [stockBalance.itemId, stockBalance.warehouseId],
        set: { qtyOnHand: after.qtyOnHand, avgCost: after.avgCost },
      });

    await this.maybeSignalLowStock(input, before, after);
    return after;
  }

  /** Emit `LowStockReached` when on-hand crosses at/below `min_stock` on this movement. */
  private async maybeSignalLowStock(
    input: PostMovementInput,
    before: Balance,
    after: Balance,
  ): Promise<void> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ minStock: item.minStock })
      .from(item)
      .where(eq(item.id, input.itemId))
      .limit(1);
    const min = row?.minStock;
    if (min == null) return;

    const crossedDown =
      toDecimal(after.qtyOnHand).lessThanOrEqualTo(min) &&
      toDecimal(before.qtyOnHand).greaterThan(min);
    if (!crossedDown) return;

    this.events.publishAfterCommit(
      makeEvent({
        event: INVENTORY_EVENTS.lowStockReached,
        actorUserId: input.actorUserId ?? null,
        payload: {
          item_id: input.itemId,
          warehouse_id: input.warehouseId,
          on_hand: after.qtyOnHand,
          min_stock: formatQty(min),
        },
      }),
    );
  }

  /**
   * Replay every `stock_movement` for `(item, warehouse)` in `(at, id)` order and upsert
   * the reconstructed balance. The invariant (design D2): the result equals the live
   * cache. Movements posted in one transaction share `now()`, so the id tie-break fixes a
   * stable order.
   */
  async rebuildBalance(itemId: string, warehouseId: string): Promise<Balance> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({
        direction: stockMovement.direction,
        qty: stockMovement.qty,
        unitCost: stockMovement.unitCost,
      })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.itemId, itemId),
          eq(stockMovement.warehouseId, warehouseId),
        ),
      )
      .orderBy(asc(stockMovement.at), asc(stockMovement.id));

    let balance = ZERO_BALANCE;
    for (const row of rows) {
      balance = this.applyToBalance(
        balance,
        row.direction,
        row.qty,
        row.unitCost,
      );
    }

    await ex
      .insert(stockBalance)
      .values({
        itemId,
        warehouseId,
        qtyOnHand: balance.qtyOnHand,
        avgCost: balance.avgCost,
      })
      .onConflictDoUpdate({
        target: [stockBalance.itemId, stockBalance.warehouseId],
        set: { qtyOnHand: balance.qtyOnHand, avgCost: balance.avgCost },
      });

    return balance;
  }
}
