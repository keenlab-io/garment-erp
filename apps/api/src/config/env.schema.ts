import { z } from "zod";

/**
 * Environment schema — validated once at boot so a missing or malformed variable
 * fails fast before Nest wires any provider (M0 design §5, R "fail fast"). Every
 * runtime dependency's connection settings are declared here.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Postgres (postgres.js) — numeric columns return as strings.
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis (BullMQ connection).
  REDIS_URL: z.string().url(),

  // JWT signing — secrets required, TTLs default to sane values.
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().min(1).default("15m"),
  JWT_REFRESH_TTL: z.string().min(1).default("7d"),

  // PII encryption (M2). A 32-byte AES-256-GCM key as 64 hex characters. Validated
  // fail-fast at boot (like the JWT secrets) — the crypto helper refuses to start without
  // it, so national IDs are never stored in plaintext (design D1).
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

  // HR — how many days before an employee's `probation_end_date` the daily scan raises a
  // `ProbationEnding` alert (design D6). The default of 30 days is a sane dev value.
  PROBATION_ALERT_DAYS: z.coerce.number().int().positive().default(30),

  // Production — how often (ms) the repeatable monitor sweep runs to flag delayed steps and
  // overdue subcontracts (M4 design D5). The default of 60s matches the acceptable alert
  // latency; tune down in dev, up in prod.
  PRODUCTION_MONITOR_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  // Sales (M5) — the PromptPay ID (mobile number or national/tax ID) the PromptPay QR payload
  // credits (design D9). Optional in dev; `getInvoicePromptPayQr` 422s if it is unset when a QR
  // is requested. `SALES_OVERDUE_SWEEP_MS` is how often the repeatable sweep flips past-due,
  // unpaid invoices to OVERDUE (design D11) — default daily.
  PROMPTPAY_ID: z.string().min(1).optional(),
  SALES_OVERDUE_SWEEP_MS: z.coerce.number().int().positive().default(86_400_000),

  // Object storage (S3 / MinIO). `S3_FORCE_PATH_STYLE` must be true for MinIO.
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Inventory — when false (default), issuing more than on-hand is a 422 before any
  // ledger write; when true, the OUT posts and on-hand may go negative (M3 design D7).
  INVENTORY_ALLOW_NEGATIVE_STOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * `ConfigModule.forRoot({ validate })` hook. Throws with every failing field
 * listed so a bad `.env` is obvious at startup.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
