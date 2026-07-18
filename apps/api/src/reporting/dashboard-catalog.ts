/**
 * Dashboard catalog (design D6): each dashboard key maps to the ordered list of report keys
 * that become its panels. One `(dimension, value)` window is applied to **every** panel so a
 * dashboard's panels always reflect the same period (the sales dashboard's Top-Products and
 * Sales-by-Customer re-filter together). Each dashboard stays within a single report group so
 * its RBAC is the group's — cost/profit dashboards therefore also require `inventory.cost.view`.
 */
export const DASHBOARD_PANELS: Record<string, string[]> = {
  sales: ["sales.overview", "sales.top_products", "sales.by_customer", "sales.doc_status"],
  inventory: ["stock.balance", "stock.low", "stock.dead", "stock.movement"],
  cost: ["cost.cogs_monthly", "cost.variance", "cost.valuation"],
  profit: ["profit.margin_by_item", "profit.by_order", "profit.net_estimate"],
  tax: ["tax.pp30", "tax.aging"],
};
