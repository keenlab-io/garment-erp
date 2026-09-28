import { randomUUID } from "node:crypto";
import { eq, is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_TENANT_ID, createDb, schema, uom } from "@erp/db";

const url = process.env.DATABASE_URL_TEST;
const appUrl = process.env.DATABASE_URL_TEST_APP;

/** Tables with no `tenant_id` policy — mirrors `TENANT_EXEMPT` in `src/tenancy.parity.spec.ts`. */
const TENANT_EXEMPT = new Set([
  "tenant",
  "tenant_domain",
  "platform_admin",
  "platform_audit_log",
  "support_session",
  "permission",
  "plan",
]);

/** Every tenant-scoped table in the `@erp/db` schema barrel. */
const tenantTables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table).name)
  .filter((name) => !TENANT_EXEMPT.has(name));

// M7 task 7.9 / design D1-D2-D16 — migration 0013 turns Row-Level Security on. The parity spec
// proves every table *has* a tenant column; this proves the database enforces it: each tenant
// table has RLS enabled + forced with a `tenant_isolation` policy (USING + WITH CHECK), the
// runtime role `erp_app` cannot bypass it, and with no tenant GUC it reads nothing and writes
// nothing. Gated on the Testcontainers globalSetup (it publishes both URLs).
describe.skipIf(!url || !appUrl)("tenancy row-level security (integration)", () => {
  let admin: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  const code = `RLS-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    admin = createDb(url as string, { max: 1 });
    app = createDb(appUrl as string, { max: 1 });
    // A default-tenant row the runtime role must not see without the tenant GUC.
    await admin.db.insert(uom).values({ tenantId: DEFAULT_TENANT_ID, code, name: "RLS probe" });
  });

  afterAll(async () => {
    await admin?.db.delete(uom).where(eq(uom.code, code));
    await admin?.queryClient.end();
    await app?.queryClient.end();
  });

  it("enables + forces RLS with a tenant_isolation policy on every tenant table", async () => {
    const rows = await admin.db.execute<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      qual: string | null;
      with_check: string | null;
    }>(sql`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, p.qual, p.with_check
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      LEFT JOIN pg_policies p
        ON p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'
      WHERE c.relkind = 'r'`);
    const byName = new Map(rows.map((r) => [r.relname, r]));

    expect(tenantTables.length).toBeGreaterThan(50);
    const broken = tenantTables.filter((name) => {
      const r = byName.get(name);
      return !r || !r.relrowsecurity || !r.relforcerowsecurity || !r.qual || !r.with_check;
    });
    expect(broken).toEqual([]);
  });

  it("runs erp_app without BYPASSRLS and without direct access to the materialized views", async () => {
    const [role] = await admin.db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'erp_app'`,
    );
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });

    const [grants] = await admin.db.execute<Record<string, boolean>>(sql`
      SELECT has_table_privilege('erp_app', 'mv_sales_daily', 'SELECT') AS sales,
             has_table_privilege('erp_app', 'mv_stock_valuation', 'SELECT') AS valuation,
             has_table_privilege('erp_app', 'mv_cogs_monthly', 'SELECT') AS cogs,
             has_table_privilege('erp_app', 'v_sales_daily', 'SELECT') AS view`);
    expect(grants).toEqual({ sales: false, valuation: false, cogs: false, view: true });
  });

  // Task 8.2 / migration 0014 — the global permission catalog is readable, never writable, by
  // the runtime role (only the owner-run seed mirrors PERMISSION_CODES into it).
  it("grants erp_app read-only access to the global permission catalog", async () => {
    const [grants] = await admin.db.execute<Record<string, boolean>>(sql`
      SELECT has_table_privilege('erp_app', 'permission', 'SELECT') AS "select",
             has_table_privilege('erp_app', 'permission', 'INSERT') AS "insert",
             has_table_privilege('erp_app', 'permission', 'UPDATE') AS "update",
             has_table_privilege('erp_app', 'permission', 'DELETE') AS "delete",
             has_table_privilege('erp_app', 'permission', 'TRUNCATE') AS "truncate"`);
    expect(grants).toEqual({
      select: true,
      insert: false,
      update: false,
      delete: false,
      truncate: false,
    });
  });

  it("with no tenant GUC, erp_app reads no rows and cannot insert", async () => {
    const visible = await app.db.select().from(uom).where(eq(uom.code, code));
    expect(visible).toEqual([]);

    // The fail-closed default: no tenant in scope → NULL tenant_id → rejected.
    await expect(
      app.db.insert(uom).values({ code: `${code}-X`, name: "no tenant" }),
    ).rejects.toThrow();
  });

  it("with the tenant GUC set, erp_app sees only that tenant's rows", async () => {
    const other = randomUUID();
    const [mine, theirs] = await Promise.all(
      [DEFAULT_TENANT_ID, other].map((tenantId) =>
        app.db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
          return tx.select().from(uom).where(eq(uom.code, code));
        }),
      ),
    );
    expect(mine).toHaveLength(1);
    expect(theirs).toEqual([]);

    // WITH CHECK: a row naming another tenant is refused even with a GUC set.
    await expect(
      app.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${DEFAULT_TENANT_ID}, true)`);
        await tx.insert(uom).values({ tenantId: other, code: `${code}-Y`, name: "foreign" });
      }),
    ).rejects.toThrow();
  });
});
