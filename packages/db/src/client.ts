import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// Postgres client factory. `postgres` (postgres.js) is ESM-native, has first-class
// drizzle transaction support, and returns `numeric` columns as strings — matching
// the money/qty wire contract (no floats). `casing: "snake_case"` must match
// drizzle.config.ts so migrations and runtime queries address the same column names.
export function createDb(url: string, options?: { max?: number }) {
  const queryClient = postgres(url, { max: options?.max ?? 10 });
  const db = drizzle(queryClient, { schema, casing: "snake_case" });
  return { db, queryClient };
}

export type Db = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
