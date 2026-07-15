import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { stockLot, type Db } from "@erp/db";
import type { CostingMethod } from "@erp/contracts";
import { allocate, formatMoney, formatQty, toDecimal } from "@erp/utils";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";

/** One OUT movement to post — `qty` is **signed negative** base UOM, at `unitCost`. */
export interface IssueSegment {
  qty: string;
  unitCost: string;
  lotId: string | null;
}

/** The minimal item facts costing needs. */
export interface CostingItem {
  id: string;
  costingMethod: CostingMethod;
  standardCost: string | null;
}

/**
 * Costing engine (design D3/D4/D6). Turns an issue quantity into the OUT movement(s) to
 * post under the item's costing method — MAV at the current average, STANDARD at the
 * standard cost, FIFO consuming `stock_lot` rows oldest-first (one movement per lot at
 * that lot's cost, decrementing `qty_remaining`). Also allocates landed cost across
 * receipt lines. All arithmetic is decimal-string via `@erp/utils`.
 */
@Injectable()
export class CostingService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Resolve the OUT segment(s) for issuing `baseQty` (positive base UOM) of `item`.
   * `avgCost` is the item/warehouse moving average (used by MAV, and as the FIFO fallback
   * when negative stock is permitted and lots are exhausted).
   */
  async resolveIssue(
    item: CostingItem,
    baseQty: string,
    avgCost: string,
  ): Promise<IssueSegment[]> {
    const qty = formatQty(baseQty);
    if (item.costingMethod === "STANDARD") {
      return [{ qty: negate(qty), unitCost: formatMoney(item.standardCost ?? "0"), lotId: null }];
    }
    if (item.costingMethod === "MAV") {
      return [{ qty: negate(qty), unitCost: formatMoney(avgCost), lotId: null }];
    }
    return this.resolveFifo(item.id, qty, avgCost);
  }

  /** FIFO: consume lots oldest-first, one segment per lot at its `unit_cost`. */
  private async resolveFifo(
    itemId: string,
    baseQty: string,
    fallbackCost: string,
  ): Promise<IssueSegment[]> {
    const ex = currentExecutor(this.db);
    const lots = await ex
      .select({
        id: stockLot.id,
        qtyRemaining: stockLot.qtyRemaining,
        unitCost: stockLot.unitCost,
      })
      .from(stockLot)
      .where(and(eq(stockLot.itemId, itemId), gt(stockLot.qtyRemaining, "0")))
      .orderBy(asc(stockLot.receivedAt), asc(stockLot.id));

    const segments: IssueSegment[] = [];
    let remaining = toDecimal(baseQty);

    for (const lot of lots) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const avail = toDecimal(lot.qtyRemaining);
      const take = remaining.lessThan(avail) ? remaining : avail;
      if (take.lessThanOrEqualTo(0)) continue;

      segments.push({
        qty: negate(formatQty(take)),
        unitCost: formatMoney(lot.unitCost),
        lotId: lot.id,
      });
      await ex
        .update(stockLot)
        .set({ qtyRemaining: sql`${stockLot.qtyRemaining} - ${formatQty(take)}` })
        .where(eq(stockLot.id, lot.id));
      remaining = remaining.minus(take);
    }

    // Lots exhausted but demand remains (only reachable when negative stock is allowed):
    // post the shortfall at the fallback (moving-average) cost.
    if (remaining.greaterThan(0)) {
      segments.push({
        qty: negate(formatQty(remaining)),
        unitCost: formatMoney(fallbackCost),
        lotId: null,
      });
    }
    return segments;
  }

  /**
   * Allocate `total` landed cost across lines by `weights` so the parts sum exactly to
   * the total (rounding remainder to the largest weight) — design D6.
   */
  allocateLanded(total: string, weights: string[]): string[] {
    return allocate(total, weights);
  }
}

/** Flip the sign of a quantity string. */
function negate(qty: string): string {
  return formatQty(toDecimal(qty).negated());
}
