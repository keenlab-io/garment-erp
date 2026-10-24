import { getTableConfig } from "drizzle-orm/pg-core";
import { tenantTablesInFkOrder, type TenantTable } from "../platform/tenant-tables.js";

/**
 * The tables deleted LAST, after the S3 prefix and the PDPA lead capture (`demo-sandbox-purge`
 * spec steps 5–6): the guest's `auth_identity` rows, then the `user` rows. Everything that
 * references them is gone by then (the bulk phase deletes children first).
 */
export const DEMO_PURGE_TAIL = ["auth_identity", "user"] as const;

/**
 * Foreign keys FROM a tail table TO a bulk-phase table. The bulk phase deletes the parent before
 * the tail row that points at it, so the purge first nulls these columns for the tenant. Adding a
 * new such FK without listing it here fails `demo-purge-plan.spec.ts`.
 */
export const DEMO_PURGE_DETACHED_FKS: ReadonlyArray<{
  table: (typeof DEMO_PURGE_TAIL)[number];
  column: string;
  references: string;
}> = [{ table: "user", column: "employee_id", references: "employee" }];

/** The ordered delete plan of one sandbox's rows. */
export interface DemoPurgePlan {
  /** Every other tenant table, children before parents (reverse FK order). */
  bulk: TenantTable[];
  /** `DEMO_PURGE_TAIL`, in that order. */
  tail: TenantTable[];
}

/**
 * The sandbox purge's delete order (M10 tasks 4.3/4.4): the reverse of M8's FK-topological
 * `tenantTablesInFkOrder` (derived from the `@erp/db` schema barrel, so an M11+ table is purged
 * without touching this file), with the identity/user tail split off so the lead capture can still
 * read the guest's email after every business row is gone. `tenant` itself is not a tenant table;
 * the purge deletes it after the tail. Verified statically by `demo-purge-plan.spec.ts`.
 */
export function demoPurgePlan(): DemoPurgePlan {
  const reversed = [...tenantTablesInFkOrder()].reverse();
  const tailNames: readonly string[] = DEMO_PURGE_TAIL;
  const tail = DEMO_PURGE_TAIL.map((name) => {
    const table = reversed.find((t) => t.name === name);
    if (!table) throw new Error(`demo purge tail table "${name}" is not a tenant table`);
    return table;
  });
  return { bulk: reversed.filter((t) => !tailNames.includes(t.name)), tail };
}

/** SQL column name of a drizzle column (unnamed builders keep their camelCase property key). */
export function sqlColumnName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** The FKs of `table` as `{ column, references }` pairs (SQL names, self-references dropped). */
export function foreignKeysOf(table: TenantTable): { column: string; references: string }[] {
  const config = getTableConfig(table.table);
  return config.foreignKeys.flatMap((fk) => {
    const ref = fk.reference();
    const references = getTableConfig(ref.foreignTable).name;
    if (references === config.name) return [];
    return ref.columns.map((c) => ({ column: sqlColumnName(c.name), references }));
  });
}
