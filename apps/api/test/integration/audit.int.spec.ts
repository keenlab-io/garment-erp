import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, createDb } from "@erp/db";

const url = process.env.DATABASE_URL_TEST;

/** Collect messages down the error's `cause` chain (drizzle wraps the pg error). */
function causeChainMessage(err: unknown): string {
  let message = "";
  let current: unknown = err;
  while (current instanceof Error) {
    message += `${current.message} `;
    current = (current as { cause?: unknown }).cause;
  }
  return message;
}

// Gated on DATABASE_URL_TEST. Verifies the `audit_append_only` migration's trigger
// makes audit_log immutable: UPDATE and DELETE are both rejected at the DB level.
describe.skipIf(!url)("audit_log append-only (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let id: string;

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const [row] = await conn.db
      .insert(auditLog)
      .values({ action: "CREATE", entityType: "user" })
      .returning({ id: auditLog.id });
    if (!row) throw new Error("failed to insert audit_log seed row");
    id = row.id;
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("rejects UPDATE via the trigger", async () => {
    const err = await conn.db
      .update(auditLog)
      .set({ reason: "tampered" })
      .where(eq(auditLog.id, id))
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(causeChainMessage(err)).toMatch(/append-only/);
  });

  it("rejects DELETE via the trigger", async () => {
    const err = await conn.db
      .delete(auditLog)
      .where(eq(auditLog.id, id))
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(causeChainMessage(err)).toMatch(/append-only/);

    // The row must still be present — the trigger blocked the delete.
    const rows = await conn.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, id));
    expect(rows).toHaveLength(1);
  });
});
