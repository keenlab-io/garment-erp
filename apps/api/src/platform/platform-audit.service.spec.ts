import { describe, expect, it } from "vitest";
import { platformAuditLog, type Db, type Tx } from "@erp/db";
import { txContext } from "../db/tx-context.js";
import { PlatformAuditService } from "./platform-audit.service.js";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";
const CORRELATION = "33333333-3333-4333-8333-333333333333";

function fakeDb() {
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const db = {
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => void inserts.push({ table, values }),
    }),
  };
  return { db: db as unknown as Db, tx: db as unknown as Tx, inserts };
}

// M8 task 3.2 — every control-plane mutation appends one row naming the actor, action, target
// tenant, before/after, and a correlation id tying it to the writing transaction.
describe("PlatformAuditService.append", () => {
  const entry = {
    action: "UPDATE" as const,
    entityType: "tenant",
    entityId: TENANT,
    platformAdminId: ADMIN,
    tenantId: TENANT,
    before: { status: "ACTIVE" },
    after: { status: "READ_ONLY" },
    reason: "billing overdue",
  };

  it("stamps the active transaction's correlation id", async () => {
    const { db, tx, inserts } = fakeDb();
    await txContext.run({ tx, onCommit: [], correlationId: CORRELATION }, () =>
      new PlatformAuditService(db).append(entry),
    );
    expect(inserts).toEqual([
      {
        table: platformAuditLog,
        values: {
          action: "UPDATE",
          entityType: "tenant",
          entityId: TENANT,
          platformAdminId: ADMIN,
          tenantId: TENANT,
          before: { status: "ACTIVE" },
          after: { status: "READ_ONLY" },
          reason: "billing overdue",
          correlationId: CORRELATION,
        },
      },
    ]);
  });

  it("honors an explicit correlation id and mints one outside a transaction", async () => {
    const { db, inserts } = fakeDb();
    const audit = new PlatformAuditService(db);
    await audit.append({ ...entry, correlationId: CORRELATION });
    await audit.append(entry);
    expect(inserts[0]?.values.correlationId).toBe(CORRELATION);
    expect(inserts[1]?.values.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(inserts[1]?.values.correlationId).not.toBe(CORRELATION);
  });
});
