import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { createDb } from "@erp/db";

// Vitest globalSetup for the integration run. Boots a throwaway Postgres via
// Testcontainers, applies the committed migrations (repo-root `tooling/drizzle`),
// and publishes its URL as `DATABASE_URL_TEST` so the gated integration specs run.
// `pnpm test` (base config, no globalSetup) never sets it → those specs skip.
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
  } finally {
    await queryClient.end();
  }

  process.env.DATABASE_URL_TEST = url;
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
