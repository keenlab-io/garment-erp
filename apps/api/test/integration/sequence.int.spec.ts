import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_TENANT_ID, createDb, documentSequence, tenant } from "@erp/db";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST (set by the Testcontainers globalSetup). Verifies the
// `SELECT … FOR UPDATE` lock in SequenceService.next produces no duplicate numbers
// under concurrent callers (design D9).
describe.skipIf(!url)("SequenceService concurrency (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let service: SequenceService;
  const key = "test-seq-concurrency";

  beforeAll(async () => {
    conn = createDb(url as string, { max: 25 });
    service = new SequenceService(conn.db, new UnitOfWork(conn.db));

    await conn.db.delete(documentSequence).where(eq(documentSequence.key, key));
    await conn.db.insert(documentSequence).values({
      key,
      prefix: "INV",
      format: "{prefix}-{seq:0000}",
      includeYear: false,
      padding: 4,
      resetYearly: false,
      currentValue: 0,
      yearScope: new Date().getFullYear(),
    });
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("produces unique, contiguous numbers under 50 concurrent next() calls", async () => {
    const N = 50;
    const numbers = await Promise.all(
      Array.from({ length: N }, () => service.next(key)),
    );

    expect(new Set(numbers).size).toBe(N);

    const seqs = numbers.map((n) => Number(n.split("-")[1])).sort((a, b) => a - b);
    expect(seqs[0]).toBe(1);
    expect(seqs[seqs.length - 1]).toBe(N);
  });

  // M7 §7.1 / design D9 — sequences are per tenant: PK (tenant_id, key). Two tenants minting
  // the same key concurrently each number from 1, and neither's lock or counter touches the
  // other's row.
  it("numbers each tenant independently under concurrent next() calls", async () => {
    const tenantKey = "test-seq-two-tenants";
    const suffix = randomUUID().slice(0, 8);
    const [other] = await conn.db
      .insert(tenant)
      .values({ slug: `seq-${suffix}`, name: "Sequence tenant B", kind: "CUSTOMER" })
      .returning({ id: tenant.id });
    const tenants = [DEFAULT_TENANT_ID, (other as { id: string }).id];

    for (const tenantId of tenants) {
      await conn.db
        .delete(documentSequence)
        .where(and(eq(documentSequence.tenantId, tenantId), eq(documentSequence.key, tenantKey)));
      await conn.db.insert(documentSequence).values({
        tenantId,
        key: tenantKey,
        prefix: "INV",
        format: "{prefix}-{seq:0000}",
        includeYear: false,
        padding: 4,
        resetYearly: false,
        currentValue: 0,
        yearScope: new Date().getFullYear(),
      });
    }

    const N = 10;
    const minted = await Promise.all(
      tenants.map((tenantId) =>
        Promise.all(
          Array.from({ length: N }, () =>
            runWithTenant(tenantId, "jwt", () => service.next(tenantKey)),
          ),
        ),
      ),
    );

    for (const numbers of minted) {
      expect(numbers).toContain("INV-0001");
      expect([...numbers].sort()).toEqual(
        Array.from({ length: N }, (_, i) => `INV-${String(i + 1).padStart(4, "0")}`),
      );
    }
  });
});
