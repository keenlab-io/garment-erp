import { describe, expect, it } from "vitest";
import type { TenantStatus } from "@erp/contracts";
import { StateConflictError } from "../common/errors/app-exception.js";
import { assertStatusTransition, STATUS_TRANSITIONS } from "./tenant-lifecycle.js";

// M8 §4.2 — `ACTIVE ↔ READ_ONLY ↔ SUSPENDED → PURGING`; PURGING only via the purge endpoint.

const ALL: TenantStatus[] = ["ACTIVE", "READ_ONLY", "SUSPENDED", "PURGING"];

describe("tenant lifecycle transitions", () => {
  it.each([
    ["ACTIVE", "READ_ONLY"],
    ["READ_ONLY", "ACTIVE"],
    ["READ_ONLY", "SUSPENDED"],
    ["SUSPENDED", "READ_ONLY"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(() => assertStatusTransition(from, to)).not.toThrow();
  });

  it("refuses every other move with 409, including skips, no-ops and anything into/out of PURGING", () => {
    const allowed = new Set(
      Object.entries(STATUS_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)),
    );
    expect(allowed.size).toBe(4);
    for (const from of ALL) {
      for (const to of ALL) {
        if (allowed.has(`${from}>${to}`)) continue;
        expect(() => assertStatusTransition(from, to)).toThrow(StateConflictError);
      }
    }
  });
});
