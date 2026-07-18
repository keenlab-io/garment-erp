CREATE TABLE "report_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"report_key" text NOT NULL,
	"cron" text NOT NULL,
	"recipients" text[] NOT NULL,
	"format" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
