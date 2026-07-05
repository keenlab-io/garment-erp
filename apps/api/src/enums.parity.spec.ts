import { describe, expectTypeOf, it } from "vitest";
import type {
  AuditAction as ContractAuditAction,
  UserStatus as ContractUserStatus,
} from "@erp/contracts";
import type {
  AuditAction as DbAuditAction,
  UserStatus as DbUserStatus,
} from "@erp/db";

// `@erp/db` may not import `@erp/contracts` (M0 design D1), so the two duplicate the
// IAM enums. This asserts they stay identical at the type level — any drift fails
// `tsc --noEmit` (the typecheck task), keeping the string unions in lockstep.
describe("enum parity: @erp/contracts <-> @erp/db", () => {
  it("UserStatus unions are identical", () => {
    expectTypeOf<ContractUserStatus>().toEqualTypeOf<DbUserStatus>();
  });

  it("AuditAction unions are identical", () => {
    expectTypeOf<ContractAuditAction>().toEqualTypeOf<DbAuditAction>();
  });
});
