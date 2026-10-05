import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { schema } from "@erp/db";
import { tenantTablesInFkOrder } from "./tenant-tables.js";

// M8 §4.3 / design D9 — the export walks tenant tables parents-first; the purge deletes them in
// reverse, so every child row is gone before the parent it references.

describe("tenantTablesInFkOrder", () => {
  const ordered = tenantTablesInFkOrder();
  const position = new Map(ordered.map((t, i) => [t.name, i]));

  it("covers every tenant_id table except the surviving platform ledger", () => {
    const names = ordered.map((t) => t.name);
    expect(names).toContain("user");
    expect(names).toContain("audit_log");
    expect(names).toContain("tenant_domain");
    expect(names).toContain("support_session");
    expect(names).toContain("tenant_feature");
    expect(names).not.toContain("platform_audit_log");
    expect(names).not.toContain("tenant");
    expect(new Set(names).size).toBe(names.length);
  });

  it("orders every referenced tenant table before the tables that reference it", () => {
    for (const value of Object.values(schema) as unknown[]) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const child = position.get(config.name);
      if (child === undefined) continue;
      for (const fk of config.foreignKeys) {
        const parentName = getTableConfig(fk.reference().foreignTable).name;
        const parent = position.get(parentName);
        if (parent === undefined || parentName === config.name) continue;
        expect(parent, `${parentName} must precede ${config.name}`).toBeLessThan(child);
      }
    }
  });

  it("is deterministic", () => {
    expect(tenantTablesInFkOrder().map((t) => t.name)).toEqual(ordered.map((t) => t.name));
  });
});
