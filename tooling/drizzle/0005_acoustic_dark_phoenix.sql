CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"title" text NOT NULL,
	"job_description" text,
	"department_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"emp_code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"national_id_enc" "bytea",
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position_id" uuid,
	"employment_type" text NOT NULL,
	"status" text DEFAULT 'PROBATION' NOT NULL,
	"hire_date" date NOT NULL,
	"probation_end_date" date,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "employee_empCode_unique" UNIQUE("emp_code")
);
--> statement-breakpoint
CREATE TABLE "employee_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"file_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_line" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"manager_employee_id" uuid
);
--> statement-breakpoint
CREATE TABLE "employee_pay_component" (
	"employee_id" uuid NOT NULL,
	"pay_component_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	CONSTRAINT "employee_pay_component_employee_id_pay_component_id_pk" PRIMARY KEY("employee_id","pay_component_id")
);
--> statement-breakpoint
CREATE TABLE "pay_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"default_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"recurring" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"base_salary" numeric(18, 4) NOT NULL,
	"effective_date" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"clock_in" timestamp with time zone,
	"clock_out" timestamp with time zone,
	"source" text DEFAULT 'IMPORT' NOT NULL,
	CONSTRAINT "attendance_employee_id_work_date_pk" PRIMARY KEY("employee_id","work_date")
);
--> statement-breakpoint
CREATE TABLE "ot_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"reason" text,
	"rate_type" text NOT NULL,
	"approved_hours" numeric(18, 6),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approver_id" uuid,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_advance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"reason" text,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"approver_id" uuid,
	"repayment_plan" jsonb,
	"outstanding" numeric(18, 4) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payroll_run_period_unique" UNIQUE("period")
);
--> statement-breakpoint
CREATE TABLE "payslip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"breakdown" jsonb NOT NULL,
	"gross" numeric(18, 4) NOT NULL,
	"net" numeric(18, 4) NOT NULL,
	"pdf_key" text,
	CONSTRAINT "payslip_run_employee_uq" UNIQUE("run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "advance_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"ceiling_pct" numeric(9, 6) NOT NULL,
	"max_installments" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ot_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"rate_type" text NOT NULL,
	"multiplier" numeric(9, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"rate" numeric(9, 6) NOT NULL,
	"wage_floor" numeric(18, 4) DEFAULT '0' NOT NULL,
	"wage_ceiling" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_bracket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"lower_bound" numeric(18, 4) NOT NULL,
	"upper_bound" numeric(18, 4),
	"rate" numeric(9, 6) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_parent_id_department_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_line" ADD CONSTRAINT "reporting_line_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_line" ADD CONSTRAINT "reporting_line_manager_employee_id_employee_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_component" ADD CONSTRAINT "employee_pay_component_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_component" ADD CONSTRAINT "employee_pay_component_pay_component_id_pay_component_id_fk" FOREIGN KEY ("pay_component_id") REFERENCES "public"."pay_component"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_record" ADD CONSTRAINT "salary_record_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_record" ADD CONSTRAINT "salary_record_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_request" ADD CONSTRAINT "ot_request_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_request" ADD CONSTRAINT "ot_request_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advance" ADD CONSTRAINT "cash_advance_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advance" ADD CONSTRAINT "cash_advance_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_run_id_payroll_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;