import { is } from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { schema } from "@erp/db";

/**
 * Tables that carry a `tenant_id` but are NOT the tenant's data: `platform_audit_log` is the
 * control-plane ledger that must outlive a purged tenant (M8 design D9) and is never exported.
 */
const NOT_TENANT_DATA: ReadonlySet<string> = new Set(["platform_audit_log"]);

/** One tenant-owned table: its SQL name, the drizzle table, and its `tenant_id` column. */
export interface TenantTable {
  name: string;
  table: PgTable;
  tenantId: PgColumn;
}

/**
 * Every table holding a tenant's rows, parents before children (topological by foreign key) —
 * the order the PDPA export walks and, reversed, the order the purge deletes in (M8 design D9).
 * Derived from the `@erp/db` schema barrel rather than hand-listed, so a new business table is
 * exported and purged without touching this file (the M7 parity spec already forces it to carry
 * `tenant_id`). Self-references (`user.created_by`) are ignored — one `DELETE … WHERE tenant_id`
 * removes the whole set at once. A cycle between distinct tables would make a single-pass purge
 * impossible, so it throws (the unit test pins that the schema has none).
 */
export function tenantTablesInFkOrder(): TenantTable[] {
  const byName = new Map<string, TenantTable>();
  const parents = new Map<string, Set<string>>();

  for (const value of Object.values(schema) as unknown[]) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    if (NOT_TENANT_DATA.has(config.name)) continue;
    // Unnamed builders keep their property key; the client's snake_case casing maps it at query time.
    const tenantId = config.columns.find((c) => c.name === "tenantId" || c.name === "tenant_id");
    if (!tenantId) continue;
    byName.set(config.name, { name: config.name, table: value, tenantId });
    parents.set(
      config.name,
      new Set(config.foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name)),
    );
  }

  const ordered: TenantTable[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, path: string[]): void => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") {
      throw new Error(`Foreign-key cycle between tenant tables: ${[...path, name].join(" → ")}`);
    }
    state.set(name, "visiting");
    for (const parent of [...(parents.get(name) ?? [])].sort()) {
      if (parent !== name && byName.has(parent)) visit(parent, [...path, name]);
    }
    state.set(name, "done");
    ordered.push(byName.get(name) as TenantTable);
  };
  for (const name of [...byName.keys()].sort()) visit(name, []);
  return ordered;
}
