import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { item, stockBalance, stockMovement, type Db } from "@erp/db";
import type {
  DeadStockRow,
  LowStockRow,
  StockCardMovement,
  StockCardQuery,
  StockCardReport,
  ValuationLine,
  ValuationReport,
} from "@erp/contracts";
import { formatMoney, formatQty, lineTotal, sumMoney, toDecimal } from "@erp/utils";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { m, q } from "./inventory.util.js";
import { ItemService } from "./item.service.js";

const HIDDEN_COST = "0";

/**
 * Operational inventory reports (task 5.10, design D11) — live reads, no materialized
 * views (that is M6). Stock-card reconstructs opening/movements/closing from the ledger;
 * valuation and dead-stock read `stock_balance`; low-stock compares on-hand to `min_stock`.
 * Cost columns are blanked unless the caller holds `inventory.cost.view` (`canViewCost`).
 */
@Injectable()
export class ReportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly items: ItemService,
  ) {}

  async stockCard(
    query: StockCardQuery,
    canViewCost: boolean,
  ): Promise<StockCardReport> {
    const ex = currentExecutor(this.db);
    const warehouseId = query.warehouse_id ?? (await this.items.defaultWarehouseId());
    const base = [
      eq(stockMovement.itemId, query.item_id),
      eq(stockMovement.warehouseId, warehouseId),
    ];

    // Opening = everything strictly before `from` (or empty when no lower bound).
    let openingQty = "0";
    let openingValue = "0";
    if (query.from) {
      const [row] = await ex
        .select({
          qty: sql<string>`coalesce(sum(${stockMovement.qty}), 0)`,
          value: sql<string>`coalesce(sum(${stockMovement.qty} * ${stockMovement.unitCost}), 0)`,
        })
        .from(stockMovement)
        .where(and(...base, sql`${stockMovement.at} < ${new Date(query.from)}`));
      openingQty = formatQty(row?.qty ?? "0");
      openingValue = formatMoney(row?.value ?? "0");
    }

    const windowFilters = [
      ...base,
      query.from ? gte(stockMovement.at, new Date(query.from)) : undefined,
      query.to ? lte(stockMovement.at, new Date(query.to)) : undefined,
    ].filter(Boolean);

    const rows = await ex
      .select()
      .from(stockMovement)
      .where(and(...windowFilters))
      .orderBy(asc(stockMovement.at), asc(stockMovement.id));

    const movements: StockCardMovement[] = rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      direction: row.direction,
      qty: q(row.qty),
      unit_cost: m(canViewCost ? row.unitCost : HIDDEN_COST),
      ref_type: row.refType,
      ref_id: row.refId,
    }));

    const closingQty = formatQty(
      movements.reduce((acc, m) => acc.plus(toDecimal(m.qty)), toDecimal(openingQty)),
    );
    const movementValue = sumMoney([
      "0",
      ...rows.map((m) => lineTotal(m.qty, m.unitCost)),
    ]);
    const closingValue = sumMoney([openingValue, movementValue]);

    return {
      item_id: query.item_id,
      warehouse_id: warehouseId,
      opening_qty: q(openingQty),
      opening_value: m(canViewCost ? openingValue : HIDDEN_COST),
      movements,
      closing_qty: q(closingQty),
      closing_value: m(canViewCost ? closingValue : HIDDEN_COST),
    };
  }

  async valuation(
    asOf: string | undefined,
    canViewCost: boolean,
  ): Promise<ValuationReport> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({
        itemId: stockBalance.itemId,
        warehouseId: stockBalance.warehouseId,
        qtyOnHand: stockBalance.qtyOnHand,
        avgCost: stockBalance.avgCost,
      })
      .from(stockBalance)
      .orderBy(asc(stockBalance.itemId));

    const lines: ValuationLine[] = rows.map((r) => ({
      item_id: r.itemId,
      warehouse_id: r.warehouseId,
      qty_on_hand: q(r.qtyOnHand),
      avg_cost: m(canViewCost ? r.avgCost : HIDDEN_COST),
      value: m(canViewCost ? lineTotal(r.qtyOnHand, r.avgCost) : HIDDEN_COST),
    }));

    return {
      as_of: asOf ?? null,
      lines,
      total_value: m(
        canViewCost ? sumMoney(["0", ...lines.map((l) => l.value)]) : HIDDEN_COST,
      ),
    };
  }

  async lowStock(): Promise<LowStockRow[]> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({
        itemId: stockBalance.itemId,
        warehouseId: stockBalance.warehouseId,
        onHand: stockBalance.qtyOnHand,
        minStock: item.minStock,
      })
      .from(stockBalance)
      .innerJoin(item, eq(item.id, stockBalance.itemId))
      .where(
        and(
          sql`${item.minStock} is not null`,
          sql`${stockBalance.qtyOnHand} <= ${item.minStock}`,
        ),
      );

    return rows.map((r) => ({
      item_id: r.itemId,
      warehouse_id: r.warehouseId,
      on_hand: q(r.onHand),
      min_stock: q(formatQty(r.minStock ?? "0")),
    }));
  }

  async deadStock(months: number): Promise<DeadStockRow[]> {
    const ex = currentExecutor(this.db);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const rows = await ex
      .select({
        itemId: stockBalance.itemId,
        warehouseId: stockBalance.warehouseId,
        qtyOnHand: stockBalance.qtyOnHand,
        lastAt: sql<
          string | null
        >`(select max(${stockMovement.at}) from ${stockMovement} where ${stockMovement.itemId} = ${stockBalance.itemId} and ${stockMovement.warehouseId} = ${stockBalance.warehouseId})`,
      })
      .from(stockBalance);

    return rows
      .filter((r) => r.lastAt === null || new Date(r.lastAt) < cutoff)
      .map((r) => ({
        item_id: r.itemId,
        warehouse_id: r.warehouseId,
        qty_on_hand: q(r.qtyOnHand),
        last_movement_at: r.lastAt ? new Date(r.lastAt).toISOString() : null,
      }));
  }
}
