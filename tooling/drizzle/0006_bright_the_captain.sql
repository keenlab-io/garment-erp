CREATE TABLE "routing_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"standard_time_min" integer NOT NULL,
	"department_id" uuid,
	CONSTRAINT "routing_step_templateId_seq_unique" UNIQUE("template_id","seq")
);
--> statement-breakpoint
CREATE TABLE "routing_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"product_type" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_no" text NOT NULL,
	"customer_id" uuid,
	"finished_item_id" uuid NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"due_date" date,
	"routing_template_id" uuid NOT NULL,
	"machine" text,
	"mockup_file_key" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "work_order_woNo_unique" UNIQUE("wo_no")
);
--> statement-breakpoint
CREATE TABLE "work_order_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_id" uuid NOT NULL,
	"routing_step_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"standard_time_min" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"assigned_to" uuid,
	"machine" text,
	CONSTRAINT "work_order_step_woId_routingStepId_unique" UNIQUE("wo_id","routing_step_id")
);
--> statement-breakpoint
CREATE TABLE "defect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_step_id" uuid NOT NULL,
	"type" text NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "production_scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_step_id" uuid NOT NULL,
	"action" text NOT NULL,
	"by_user" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontract" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_step_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"sla_due" timestamp with time zone,
	"status" text DEFAULT 'SENT' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routing_step" ADD CONSTRAINT "routing_step_template_id_routing_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."routing_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_routing_template_id_routing_template_id_fk" FOREIGN KEY ("routing_template_id") REFERENCES "public"."routing_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_step" ADD CONSTRAINT "work_order_step_wo_id_work_order_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_step" ADD CONSTRAINT "work_order_step_routing_step_id_routing_step_id_fk" FOREIGN KEY ("routing_step_id") REFERENCES "public"."routing_step"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_wo_step_id_work_order_step_id_fk" FOREIGN KEY ("wo_step_id") REFERENCES "public"."work_order_step"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_scan" ADD CONSTRAINT "production_scan_wo_step_id_work_order_step_id_fk" FOREIGN KEY ("wo_step_id") REFERENCES "public"."work_order_step"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract" ADD CONSTRAINT "subcontract_wo_step_id_work_order_step_id_fk" FOREIGN KEY ("wo_step_id") REFERENCES "public"."work_order_step"("id") ON DELETE no action ON UPDATE no action;