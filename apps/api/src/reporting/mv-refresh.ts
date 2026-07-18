import { INVENTORY_EVENTS } from "../inventory/inventory.events.js";
import { SALES_EVENTS } from "../sales/sales.events.js";

/** `mv-refresh`-queue job name. */
export const MV_REFRESH_JOB = "reporting.mv-refresh";

/** The three M6 materialized views (design D2). */
export const MV = {
  stockValuation: "mv_stock_valuation",
  salesDaily: "mv_sales_daily",
  cogsMonthly: "mv_cogs_monthly",
} as const;

export type MvName = (typeof MV)[keyof typeof MV];

/** All view names — the allowlist a refresh is validated against and the fallback refreshes. */
export const ALL_VIEWS: MvName[] = Object.values(MV);

/** Stock-ledger events that dirty the valuation + COGS views (M3). */
const STOCK_EVENTS: string[] = [
  INVENTORY_EVENTS.goodsReceiptPosted,
  INVENTORY_EVENTS.goodsIssued,
  INVENTORY_EVENTS.stockAdjusted,
  INVENTORY_EVENTS.backflushPosted,
];

/** Sales events that dirty the daily-sales view (M5). */
const SALES_REFRESH_EVENTS: string[] = [
  SALES_EVENTS.invoiceIssued,
  SALES_EVENTS.paymentReceived,
];

/** All refresh-triggering domain events (the subscriber's `@OnEvent` set). */
export const MV_REFRESH_TRIGGERS: string[] = [...STOCK_EVENTS, ...SALES_REFRESH_EVENTS];

/**
 * The materialized views a domain event invalidates (design D10). Stock events refresh the
 * valuation + COGS views; sales events refresh daily sales. An unrelated event maps to none.
 */
export function viewsForEvent(event: string): MvName[] {
  if (STOCK_EVENTS.includes(event)) return [MV.stockValuation, MV.cogsMonthly];
  if (SALES_REFRESH_EVENTS.includes(event)) return [MV.salesDaily];
  return [];
}
