-- M6 reporting materialized views (design D2). Sequenced after the M3 (stock_balance,
-- stock_movement) and M5 (invoice) migrations that create their source tables. Each view
-- carries a UNIQUE index so it can be refreshed with REFRESH MATERIALIZED VIEW CONCURRENTLY.

CREATE MATERIALIZED VIEW "mv_stock_valuation" AS
SELECT
	"item_id",
	"warehouse_id",
	"qty_on_hand",
	"avg_cost",
	"qty_on_hand" * "avg_cost" AS "value"
FROM "stock_balance";--> statement-breakpoint
CREATE UNIQUE INDEX "mv_stock_valuation_item_id_warehouse_id_index" ON "mv_stock_valuation" USING btree ("item_id","warehouse_id");--> statement-breakpoint

CREATE MATERIALIZED VIEW "mv_sales_daily" AS
SELECT
	"issue_date"::date AS "d",
	"customer_id",
	sum("subtotal") AS "sales",
	sum("vat_amount") AS "vat"
FROM "invoice"
WHERE "status" <> 'VOID'
GROUP BY 1, 2;--> statement-breakpoint
CREATE UNIQUE INDEX "mv_sales_daily_d_customer_id_index" ON "mv_sales_daily" USING btree ("d","customer_id");--> statement-breakpoint

CREATE MATERIALIZED VIEW "mv_cogs_monthly" AS
SELECT
	date_trunc('month', "at") AS "m",
	sum("qty" * "unit_cost") AS "cogs"
FROM "stock_movement"
WHERE "direction" = 'OUT' AND "ref_type" IN ('GOODS_ISSUE', 'BACKFLUSH')
GROUP BY 1;--> statement-breakpoint
CREATE UNIQUE INDEX "mv_cogs_monthly_m_index" ON "mv_cogs_monthly" USING btree ("m");
