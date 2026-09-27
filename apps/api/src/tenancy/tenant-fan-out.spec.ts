import type { Db } from "@erp/db";
import { describe, expect, it, vi } from "vitest";
import { fanOutPerTenant } from "./tenant-fan-out.js";

// M7 §7.4 / design D11 — one sweep tick enqueues one tenant-stamped job per ACTIVE tenant.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function fakeDb(ids: string[]) {
  const where = vi.fn().mockResolvedValue(ids.map((id) => ({ id })));
  const db = { select: () => ({ from: () => ({ where }) }) } as unknown as Db;
  return { db, where };
}

describe("fanOutPerTenant", () => {
  it("enqueues one { tenantId } job per active tenant, with tick-stable ids", async () => {
    const { db, where } = fakeDb([A, B]);
    const add = vi.fn().mockResolvedValue({});
    expect(await fanOutPerTenant(db, { add }, "sales.overdue.sweep", 1700)).toBe(2);
    expect(where).toHaveBeenCalledTimes(1);
    expect(add.mock.calls).toEqual([
      ["sales.overdue.sweep", { tenantId: A }, { jobId: `sales.overdue.sweep.${A}.1700` }],
      ["sales.overdue.sweep", { tenantId: B }, { jobId: `sales.overdue.sweep.${B}.1700` }],
    ]);
  });

  it("enqueues nothing when no tenant is active", async () => {
    const add = vi.fn();
    expect(await fanOutPerTenant(fakeDb([]).db, { add }, "hr.probation.scan", 1)).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });
});
