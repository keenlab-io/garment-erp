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
