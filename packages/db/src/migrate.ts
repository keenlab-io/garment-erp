import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

// Apply committed migrations from tooling/drizzle (repo root) using the postgres.js
// migrator. Run via `pnpm --filter @erp/db db:migrate` (tsx). Both src (tsx) and
// dist sit one level under packages/db, so the migrations folder is three levels up.
const migrationsFolder = fileURLToPath(new URL("../../../tooling/drizzle", import.meta.url));

async function main() {
  // Migrations run as the object owner (`erp_owner`), never the RLS-bound runtime role
  // (`erp_app`). Falls back to DATABASE_URL where there is only one role (M7 D2).
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required to run migrations");

  const { db, queryClient } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
    console.log(`Migrations applied from ${migrationsFolder}`);

    // Production has no infra/postgres/init: 0012 creates `erp_app` without a password, so it
    // cannot log in and the API would otherwise have to connect as the superuser, which
    // bypasses RLS even under FORCE. The deploy passes the runtime role's password here; it is
    // applied after the migrations (which guarantee the role exists) and before any pod rolls.
    // ALTER ROLE takes no bind parameters, so the value travels as a transaction-local GUC and
    // is quoted server-side with %L. Re-running with the same value is a no-op in effect.
    const appPassword = process.env.DATABASE_APP_PASSWORD;
    if (appPassword) {
      await queryClient.begin(async (tx) => {
        await tx`select set_config('erp.app_password', ${appPassword}, true)`;
        await tx`do $$ begin execute format('ALTER ROLE erp_app WITH LOGIN PASSWORD %L', current_setting('erp.app_password')); end $$`;
      });
      console.log("erp_app login password set");
    }
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
