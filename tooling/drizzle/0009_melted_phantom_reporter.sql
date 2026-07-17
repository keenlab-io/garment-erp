CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"tax_id" text,
	"branch_code" text,
	"addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"credit_terms_days" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"vat_mode" text NOT NULL,
	"vat_calc" text NOT NULL,
	"valid_until" date,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quotation_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"quotation_id" uuid,
	"customer_id" uuid NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"wht_rate" numeric(9, 6),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"wht_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(18, 4) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "doc_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_type" text NOT NULL,
	"parent_id" uuid NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"qty" numeric(18, 6) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"promptpay_ref" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_tax_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"doc_no" text NOT NULL,
	"type" text NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_tax_invoice_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "wht_certificate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"cert_no" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wht_certificate_certNo_unique" UNIQUE("cert_no")
);
--> statement-breakpoint
CREATE TABLE "document_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logo_key" text,
	"signature_key" text,
	"stamp_key" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_quotation_id_quotation_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" ADD CONSTRAINT "receipt_tax_invoice_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificate" ADD CONSTRAINT "wht_certificate_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_line_parent_type_parent_id_index" ON "doc_line" USING btree ("parent_type","parent_id");