import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, customer, invoice, tenant } from "@erp/db";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;
const appUrl = process.env.DATABASE_URL_TEST_APP;

// Gated on DATABASE_URL_TEST(_APP). M7 task 15.6 — the MV read path end to end: after a refresh,
// the `v_sales_daily` security-barrier view (migration 0012) filters by the GUC so tenant B's
// read never includes tenant A's invoices, and the runtime role is denied a direct read of the
// underlying `mv_sales_daily` materialized view itself (RLS cannot apply to a matview — this is
// the actual `REVOKE`, not just the `pg_*` catalog check `tenancy-rls.int.spec.ts` already does).
// The tenant debounce-key targeting (an event in tenant A only dirties `(A, view)`) is unit-
// tested in `src/reporting/mv-refresh.spec.ts` — no real Postgres needed there.
describe.skipIf(!url || !appUrl)("v_sales_daily / mv_sales_daily are per-tenant (integration)", () => {
  let admin: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let appUow: UnitOfWork;

  const TENANT_A = randomUUID();
  const TENANT_B = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  async function stageInvoice(tenantId: string, subtotal: string, vat: string): Promise<string> {
    const [cust] = await admin.db
      .insert(customer)
      .values({ tenantId, name: `MV customer ${tenantId.slice(0, 8)}` })
      .returning({ id: customer.id });
    const custId = (cust as { id: string }).id;
    await admin.db.insert(invoice).values({
      tenantId,
      docNo: `MV-${randomUUID().slice(0, 8)}`,
      customerId: custId,
      issueDate: today,
      status: "ISSUED",
      subtotal,
      vatAmount: vat,
      grandTotal: (Number(subtotal) + Number(vat)).toFixed(4),
    });
    return custId;
  }

  beforeAll(async () => {
    admin = createDb(url as string, { max: 5 });
    app = createDb(appUrl as string, { max: 5 });
    appUow = new UnitOfWork(app.db);

    await admin.db.insert(tenant).values([
      { id: TENANT_A, slug: `mv-a-${TENANT_A.slice(0, 8)}`, name: "MV tenant A", kind: "CUSTOMER" },
      { id: TENANT_B, slug: `mv-b-${TENANT_B.slice(0, 8)}`, name: "MV tenant B", kind: "CUSTOMER" },
    ]);
    await stageInvoice(TENANT_A, "1000.0000", "70.0000");
    await stageInvoice(TENANT_B, "250.0000", "17.5000");

    await admin.db.execute(sql`REFRESH MATERIALIZED VIEW mv_sales_daily`);
  });

  afterAll(async () => {
    await admin?.queryClient.end();
    await app?.queryClient.end();
  });

  it("v_sales_daily, read as tenant B, excludes tenant A's rows", async () => {
    const rowsA = await runWithTenant(TENANT_A, "jwt", () =>
      appUow.withTransaction((tx) =>
        tx.execute<{ tenant_id: string; sales: string }>(
          sql`SELECT tenant_id, sales FROM v_sales_daily WHERE tenant_id = ${TENANT_A}`,
        ),
      ),
    );
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.sales).toBe("1000.0000");

    const rowsBSeenAsB = await runWithTenant(TENANT_B, "jwt", () =>
      appUow.withTransaction((tx) => tx.execute(sql`SELECT tenant_id, sales FROM v_sales_daily`)),
    );
    expect(rowsBSeenAsB.every((r) => (r as { tenant_id: string }).tenant_id === TENANT_B)).toBe(
      true,
    );
    expect(rowsBSeenAsB.some((r) => (r as { tenant_id: string }).tenant_id === TENANT_A)).toBe(
      false,
    );

    // Tenant B asking for tenant A's slice by id gets nothing — the view's own WHERE (bound to
    // the GUC) wins regardless of what the caller names in its own predicate.
    const spoofed = await runWithTenant(TENANT_B, "jwt", () =>
      appUow.withTransaction((tx) =>
        tx.execute(sql`SELECT * FROM v_sales_daily WHERE tenant_id = ${TENANT_A}`),
      ),
    );
    expect(spoofed).toEqual([]);
  });

  it("erp_app is denied a direct SELECT on mv_sales_daily itself", async () => {
    // drizzle-orm wraps the driver error (DrizzleQueryError) — the Postgres SQLSTATE lives on
    // `.cause`, not the top-level error (42501 = insufficient_privilege).
    await expect(app.db.execute(sql`SELECT * FROM mv_sales_daily`)).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });
});
