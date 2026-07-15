CREATE TABLE "item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"item_type" text NOT NULL,
	"base_uom_id" uuid NOT NULL,
	"costing_method" text DEFAULT 'MAV' NOT NULL,
	"standard_cost" numeric(18, 4),
	"min_stock" numeric(18, 6),
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sku" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"sku_code" text NOT NULL,
	"variant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"barcode" text,
	CONSTRAINT "sku_skuCode_unique" UNIQUE("sku_code"),
	CONSTRAINT "sku_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "uom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text,
	CONSTRAINT "uom_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "uom_conversion" (
	"item_id" uuid NOT NULL,
	"from_uom" uuid NOT NULL,
	"to_uom" uuid NOT NULL,
	"factor" numeric(18, 6) NOT NULL,
	CONSTRAINT "uom_conversion_item_id_from_uom_to_uom_pk" PRIMARY KEY("item_id","from_uom","to_uom")
);
--> statement-breakpoint
CREATE TABLE "warehouse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balance" (
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty_on_hand" numeric(18, 6) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_balance_item_id_warehouse_id_pk" PRIMARY KEY("item_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "stock_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"lot_no" text NOT NULL,
	"barcode" text,
	"supplier_id" uuid,
	"qty_remaining" numeric(18, 6) NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lot_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"sku_id" uuid,
	"lot_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"direction" text NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"purpose" text NOT NULL,
	"ref_wo_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "goods_issue_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "goods_issue_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"uom_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"supplier_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"landed_cost_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alloc_method" text DEFAULT 'VALUE' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "goods_receipt_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"uom_id" uuid NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"allocated_landed" numeric(18, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finished_item_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"conversion_cost" numeric(18, 4),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "bom_finishedItemId_version_unique" UNIQUE("finished_item_id","version")
);
--> statement-breakpoint
CREATE TABLE "bom_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"raw_item_id" uuid NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"uom_id" uuid NOT NULL,
	"scrap_pct" numeric(9, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment_line" (
	"adjustment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"delta_qty" numeric(18, 6) NOT NULL,
	CONSTRAINT "stock_adjustment_line_adjustment_id_item_id_warehouse_id_pk" PRIMARY KEY("adjustment_id","item_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "stock_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text,
	"status" text DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_line" (
	"count_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"system_qty" numeric(18, 6) NOT NULL,
	"counted_qty" numeric(18, 6),
	CONSTRAINT "stock_count_line_count_id_item_id_pk" PRIMARY KEY("count_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_base_uom_id_uom_id_fk" FOREIGN KEY ("base_uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku" ADD CONSTRAINT "sku_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_from_uom_uom_id_fk" FOREIGN KEY ("from_uom") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_to_uom_uom_id_fk" FOREIGN KEY ("to_uom") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_lot_id_stock_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issue_line" ADD CONSTRAINT "goods_issue_line_issue_id_goods_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."goods_issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issue_line" ADD CONSTRAINT "goods_issue_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issue_line" ADD CONSTRAINT "goods_issue_line_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_receipt_id_goods_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_finished_item_id_item_id_fk" FOREIGN KEY ("finished_item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_bom_id_bom_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_raw_item_id_item_id_fk" FOREIGN KEY ("raw_item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_adjustment_id_stock_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_count_id_stock_count_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_count"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_item_id_warehouse_id_at_index" ON "stock_movement" USING btree ("item_id","warehouse_id","at");