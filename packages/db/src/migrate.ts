import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

// Apply committed migrations from tooling/drizzle (repo root) using the postgres.js
// migrator. Run via `pnpm --filter @erp/db db:migrate` (tsx). Both src (tsx) and
// dist sit one level under packages/db, so the migrations folder is three levels up.
const migrationsFolder = fileURLToPath(new URL("../../../tooling/drizzle", import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run migrations");

  const { db, queryClient } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
    console.log(`Migrations applied from ${migrationsFolder}`);
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
