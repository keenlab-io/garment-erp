import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { DEFAULT_TENANT_ID, createDb } from "@erp/db";

// Vitest globalSetup for the integration run. Boots a throwaway Postgres via
// Testcontainers, applies the committed migrations (repo-root `tooling/drizzle`),
// and publishes its URL as `DATABASE_URL_TEST` so the gated integration specs run.
// `pnpm test` (base config, no globalSetup) never sets it → those specs skip.
//
// Tenancy (M7 migration 0013): every `tenant_id` default is fail-closed — no `app.tenant_id` in
// scope → NULL → the insert fails. The specs seed fixtures through the raw pool and drive
// services outside any request, so the test URL sets a *session-level* `app.tenant_id` (the
// default tenant) as a startup parameter: fixture writes land in the default tenant, while
// every `UnitOfWork` transaction still overrides it with its own transaction-local tenant. The
// connection is the bootstrap superuser (RLS-exempt), so specs can stage rows in any tenant.
// `DATABASE_URL_TEST_APP` is the RLS-bound runtime role `erp_app`, for isolation assertions.
let container: StartedTestContainer | undefined;

// From apps/api/test/integration → repo root is four levels up.
const migrationsFolder = fileURLToPath(
  new URL("../../../../tooling/drizzle", import.meta.url),
);

export async function setup(): Promise<void> {
  container = await new GenericContainer("postgres:16-alpine")
    .withEnvironment({
      POSTGRES_USER: "erp",
      POSTGRES_PASSWORD: "erp",
      POSTGRES_DB: "erp",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .start();

  const url = `postgres://erp:erp@${container.getHost()}:${container.getMappedPort(
    5432,
  )}/erp`;

  const { db, queryClient } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
    // Migration 0012 creates erp_app without a password (ops set one); give it a test one.
    await queryClient.unsafe(`ALTER ROLE erp_app PASSWORD 'erp_app'`);
  } finally {
    await queryClient.end();
  }

  const tenantParam = `?app.tenant_id=${DEFAULT_TENANT_ID}`;
  process.env.DATABASE_URL_TEST = `${url}${tenantParam}`;
  process.env.DATABASE_URL_TEST_APP = `${url.replace("erp:erp@", "erp_app:erp_app@")}`;
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
