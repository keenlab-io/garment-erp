import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, documentSequence } from "@erp/db";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";

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
});
