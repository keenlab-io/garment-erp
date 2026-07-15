import { describe, expect, it } from "vitest";
import { collectRows, parseCodesCell, type RawImportRow } from "./import.service.js";

describe("parseCodesCell", () => {
  it("splits on commas, semicolons, and whitespace", () => {
    expect(parseCodesCell("a.b.c, d.e.f;g.h.i\n j.k.l")).toEqual([
      "a.b.c",
      "d.e.f",
      "g.h.i",
      "j.k.l",
    ]);
  });

  it("returns an empty list for a blank cell", () => {
    expect(parseCodesCell("   ")).toEqual([]);
  });
});

describe("collectRows", () => {
  const raw = (
    rowNumber: number,
    roleName: string,
    codesRaw: string,
  ): RawImportRow => ({ rowNumber, roleName, codesRaw });

  it("drops a leading header row", () => {
    const result = collectRows([
      raw(1, "role_name", "permission_codes"),
      raw(2, "Manager", "iam.user.manage"),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ roleName: "Manager", rowNumber: 2 });
  });

  it("ignores fully empty rows and skips rows missing a role name", () => {
    const result = collectRows([
      raw(1, "Manager", "iam.user.manage"),
      raw(2, "", ""),
      raw(3, "", "iam.audit.view"),
    ]);
    expect(result.rows.map((r) => r.roleName)).toEqual(["Manager"]);
    expect(result.skipped).toEqual([{ row: 3, reason: "Missing role name" }]);
  });

  it("parses the codes for each applicable row", () => {
    const result = collectRows([raw(1, "Ops", "a.b.c d.e.f")]);
    expect(result.rows[0]?.codes).toEqual(["a.b.c", "d.e.f"]);
  });
});
