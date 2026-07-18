import { sql } from "drizzle-orm";
import type { Db, Tx } from "@erp/db";
import { sumMoney } from "@erp/utils";
import type { ReportColumn, ReportQuery, ReportResult, ReportRow } from "@erp/contracts";
import type { ReportWindow } from "./report-window.js";

/** Either executor honours the ambient transaction; both expose `.execute(sql…)`. */
export type ReportExecutor = Db | Tx;

/** One report builder: resolve a `{ columns, rows, totals }` result for the given window. */
type Builder = (ex: ReportExecutor, w: ReportWindow, q: ReportQuery) => Promise<ReportResult>;

// ── Row helpers ─────────────────────────────────────────────────────────────

/** postgres.js returns numeric/uuid/text as strings and date/timestamp as `Date`. Normalise a
 * raw driver row into the `ReportRow` wire shape (`string | number | null` cells). */
function toRow(raw: Record<string, unknown>): ReportRow {
  const row: ReportRow = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) row[k] = null;
    else if (v instanceof Date) row[k] = v.toISOString().slice(0, 10);
    else if (typeof v === "number" || typeof v === "string") row[k] = v;
    else row[k] = String(v);
  }
  return row;
}

/** Sum the named numeric columns across `rows` at money scale — the report `totals`. */
function sumColumns(rows: ReportRow[], keys: string[]): Record<string, string> {
  const totals: Record<string, string> = {};
  for (const key of keys) {
    totals[key] = sumMoney(rows.map((r) => (r[key] == null ? "0" : String(r[key]))));
  }
  return totals;
}

/** `WHERE col BETWEEN from AND to`, omitting whichever bound is absent (no filter → no clause). */
function windowClause(column: string, w: ReportWindow) {
  const bounds = [];
  if (w.from) bounds.push(sql`${sql.raw(column)} >= ${w.from}`);
  if (w.to) bounds.push(sql`${sql.raw(column)} <= ${w.to}`);
  return bounds.length ? sql` WHERE ${sql.join(bounds, sql` AND `)}` : sql``;
}

async function run(ex: ReportExecutor, query: ReturnType<typeof sql>): Promise<ReportRow[]> {
  const result = (await ex.execute(query)) as unknown as Record<string, unknown>[];
  return Array.from(result).map(toRow);
}

const col = (key: string, label: string): ReportColumn => ({ key, label });

/**
 * A builder for a catalogued report that has no dedicated read model yet: it resolves with the
 * declared columns, no rows, and zero totals so the catalog is complete and RBAC still applies.
 * The detailed read model lands with the owning module's analytics work.
 */
function emptyReport(columns: ReportColumn[], numericKeys: string[] = []): Builder {
  return async () => ({
    columns,
    rows: [],
    totals: Object.fromEntries(numericKeys.map((k) => [k, "0"])),
  });
}

// ── Builders ────────────────────────────────────────────────────────────────

/** Stock on-hand valuation — `qty_on_hand * avg_cost` per item/warehouse (design D2/D11). */
const stockValuation: Builder = async (ex) => {
  const columns = [
    col("item_id", "Item"),
    col("warehouse_id", "Warehouse"),
    col("qty_on_hand", "Qty on hand"),
    col("avg_cost", "Avg cost"),
    col("value", "Value"),
  ];
  const rows = await run(
    ex,
    sql`SELECT item_id, warehouse_id, qty_on_hand, avg_cost, value
        FROM mv_stock_valuation
        ORDER BY item_id, warehouse_id`,
  );
  return { columns, rows, totals: sumColumns(rows, ["value"]) };
};

/** Sales per day/customer over the window — the sales dashboard's spine (mv_sales_daily). */
const salesDaily = (byCustomer: boolean): Builder =>
  async (ex, w) => {
    const columns = byCustomer
      ? [col("customer_id", "Customer"), col("sales", "Sales"), col("vat", "VAT")]
      : [col("d", "Date"), col("sales", "Sales"), col("vat", "VAT")];
    const select = byCustomer
      ? sql`SELECT customer_id, sum(sales) AS sales, sum(vat) AS vat
            FROM mv_sales_daily${windowClause("d", w)}
            GROUP BY customer_id ORDER BY sales DESC`
      : sql`SELECT d, sum(sales) AS sales, sum(vat) AS vat
            FROM mv_sales_daily${windowClause("d", w)}
            GROUP BY d ORDER BY d`;
    const rows = await run(ex, select);
    return { columns, rows, totals: sumColumns(rows, ["sales", "vat"]) };
  };

/** Monthly COGS from goods-issue/backflush OUT movements (mv_cogs_monthly). */
const cogsMonthly: Builder = async (ex, w) => {
  const columns = [col("m", "Month"), col("cogs", "COGS")];
  const rows = await run(
    ex,
    sql`SELECT m, sum(cogs) AS cogs FROM mv_cogs_monthly${windowClause("m", w)}
        GROUP BY m ORDER BY m`,
  );
  return { columns, rows, totals: sumColumns(rows, ["cogs"]) };
};

/** PP30 output-tax summary — taxable base + VAT per day, from the sales MV. */
const taxPp30: Builder = async (ex, w) => {
  const columns = [col("d", "Date"), col("base", "Taxable base"), col("vat", "Output VAT")];
  const rows = await run(
    ex,
    sql`SELECT d, sum(sales) AS base, sum(vat) AS vat
        FROM mv_sales_daily${windowClause("d", w)} GROUP BY d ORDER BY d`,
  );
  return { columns, rows, totals: sumColumns(rows, ["base", "vat"]) };
};

/**
 * The full report catalog (design D4). MV-backed reports query the M6 materialized views;
 * catalogued reports whose detailed read model is not built yet resolve as empty (still gated,
 * still shaped). An unknown key is absent here → the caller 404s.
 */
export const REPORT_BUILDERS: Record<string, Builder> = {
  // Inventory
  "stock.balance": stockValuation,
  "stock.movement": emptyReport([
    col("item_id", "Item"),
    col("direction", "Direction"),
    col("qty", "Qty"),
    col("at", "At"),
  ]),
  "stock.low": emptyReport([
    col("item_id", "Item"),
    col("warehouse_id", "Warehouse"),
    col("qty_on_hand", "Qty on hand"),
  ]),
  "stock.dead": emptyReport([
    col("item_id", "Item"),
    col("warehouse_id", "Warehouse"),
    col("qty_on_hand", "Qty on hand"),
    col("last_movement", "Last movement"),
  ]),
  // Sales
  "sales.overview": salesDaily(false),
  "sales.top_products": emptyReport(
    [col("item_id", "Item"), col("qty", "Qty sold"), col("sales", "Sales")],
    ["qty", "sales"],
  ),
  "sales.by_customer": salesDaily(true),
  "sales.doc_status": emptyReport(
    [col("status", "Status"), col("count", "Count"), col("total", "Total")],
    ["count", "total"],
  ),
  // Cost
  "cost.cogs_monthly": cogsMonthly,
  "cost.variance": emptyReport(
    [col("item_id", "Item"), col("std_cost", "Std cost"), col("actual_cost", "Actual cost"), col("variance", "Variance")],
    ["variance"],
  ),
  "cost.valuation": stockValuation,
  // Profit
  "profit.margin_by_item": emptyReport(
    [col("item_id", "Item"), col("revenue", "Revenue"), col("cogs", "COGS"), col("margin", "Margin")],
    ["revenue", "cogs", "margin"],
  ),
  "profit.by_order": emptyReport(
    [col("order_id", "Order"), col("revenue", "Revenue"), col("cogs", "COGS"), col("margin", "Margin")],
    ["revenue", "cogs", "margin"],
  ),
  "profit.net_estimate": emptyReport(
    [col("period", "Period"), col("revenue", "Revenue"), col("cost", "Cost"), col("net", "Net")],
    ["revenue", "cost", "net"],
  ),
  // Tax
  "tax.pp30": taxPp30,
  "tax.aging": emptyReport(
    [col("bucket", "Bucket"), col("count", "Count"), col("amount", "Amount")],
    ["count", "amount"],
  ),
};
