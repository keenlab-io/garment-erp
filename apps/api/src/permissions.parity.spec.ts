import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@erp/contracts";
import { PERMISSION_CODES } from "@erp/db";

// `@erp/db` may not import `@erp/contracts` (M0 design D1), so the permission catalog the
// seed writes into the `permission` table is duplicated in `@erp/db`. This asserts that
// DB-side list is exactly the contract catalog — so `permission.code` rows always match
// `PERMISSIONS` (issue #9 "done when"). Any drift fails `pnpm test`.
describe("permission catalog parity: @erp/contracts <-> @erp/db", () => {
  it("the DB seed catalog equals the contract PERMISSIONS", () => {
    expect([...PERMISSION_CODES].sort()).toEqual([...PERMISSIONS].sort());
  });
});
