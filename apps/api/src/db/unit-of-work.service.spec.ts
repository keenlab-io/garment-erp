import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@erp/db";
import { runWithTenant, tenantContext } from "../tenancy/tenant-context.js";
import { UnitOfWork } from "./unit-of-work.service.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const dialect = new PgDialect();

/** A fake drizzle `Db` whose transactions record every executed statement. */
function fakeDb() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  let transactions = 0;
  const tx = {
    execute: async (query: SQL) => {
      statements.push(dialect.sqlToQuery(query));
    },
  };
  const db = {
    transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
      transactions += 1;
      return fn(tx);
    },
  } as unknown as Db;
  return { db, statements, transactions: () => transactions };
}

describe("UnitOfWork tenant GUC", () => {
  it("sets app.tenant_id (parameterized, tx-local) as the first statement", async () => {
    const { db, statements } = fakeDb();
    const uow = new UnitOfWork(db);
    await runWithTenant(TENANT, "jwt", () =>
      uow.withTransaction((tx) => tx.execute(sql`SELECT 1`)),
    );
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      sql: "SELECT set_config('app.tenant_id', $1, true)",
      params: [TENANT],
    });
  });

  it("sets no GUC when no tenant is in scope (fail-closed under RLS)", async () => {
    const { db, statements, transactions } = fakeDb();
    await new UnitOfWork(db).withTransaction(async () => undefined);
    expect(transactions()).toBe(1);
    expect(statements).toEqual([]);
  });

  it("nested calls join the caller's tx without re-setting the GUC", async () => {
    const { db, statements, transactions } = fakeDb();
    const uow = new UnitOfWork(db);
    await runWithTenant(TENANT, "job", () =>
      uow.withTransaction(() => uow.withTransaction(async () => undefined)),
    );
    expect(transactions()).toBe(1);
    expect(statements).toHaveLength(1);
  });

  it("refuses to open a transaction for a malformed tenant id in scope", async () => {
    const { db, transactions } = fakeDb();
    const uow = new UnitOfWork(db);
    await expect(
      tenantContext.run({ tenantId: "x'); DROP TABLE t;--", source: "jwt" }, () =>
        uow.withTransaction(async () => undefined),
      ),
    ).rejects.toThrow(/not a uuid/);
    expect(transactions()).toBe(0);
  });
});
