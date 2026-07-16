import { describe, expect, it } from "vitest";
import type { AuthUser } from "../auth/auth-user.js";
import { canViewSalary, gateSalaryFields } from "./salary-gating.js";

// Salary gating omits monetary fields for a caller without `hr.salary.view` (task 5.3) —
// the keys are absent, not present-and-null.
const base = (over: Partial<AuthUser>): AuthUser => ({
  id: "u1",
  sessionId: "s1",
  isSuperAdmin: false,
  permissions: new Set(),
  ...over,
});

const record = { id: "e1", name: "Alice", base_salary: "50000.0000", national_id: "x" };

describe("salary gating", () => {
  it("omits gated keys for a user lacking hr.salary.view", () => {
    const user = base({});
    const gated = gateSalaryFields(user, record, ["base_salary", "national_id"]);
    expect("base_salary" in gated).toBe(false);
    expect("national_id" in gated).toBe(false);
    expect(gated.name).toBe("Alice");
  });

  it("keeps the fields for a holder of hr.salary.view", () => {
    const user = base({ permissions: new Set(["hr.salary.view"]) });
    const gated = gateSalaryFields(user, record, ["base_salary", "national_id"]);
    expect(gated.base_salary).toBe("50000.0000");
    expect(gated.national_id).toBe("x");
  });

  it("keeps the fields for a super-admin", () => {
    const user = base({ isSuperAdmin: true });
    expect(canViewSalary(user)).toBe(true);
    const gated = gateSalaryFields(user, record, ["base_salary"]);
    expect(gated.base_salary).toBe("50000.0000");
  });

  it("does not mutate the original record", () => {
    const user = base({});
    const original = { ...record };
    gateSalaryFields(user, record, ["base_salary"]);
    expect(record).toEqual(original);
  });
});
