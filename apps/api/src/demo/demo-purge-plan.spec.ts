import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { schema } from "@erp/db";
import {
  DEMO_PURGE_DETACHED_FKS,
  DEMO_PURGE_TAIL,
  demoPurgePlan,
  foreignKeysOf,
  sqlColumnName,
} from "./demo-purge-plan.js";

// M10 task 4.4 (`demo-sandbox-purge` "Purge ordering is complete and safety-checked") — the static
// purge-order spec, modelled on `tenancy.parity.spec.ts`: walk the `@erp/db` FK metadata and fail
// the build when a tenant-scoped table is missing from the sandbox purge, or ordered after a
// table it references.

/** Tables carrying `tenant_id` that are not sandbox data — they must survive the purge. */
const SURVIVES_PURGE: ReadonlySet<string> = new Set(["platform_audit_log"]);

const tables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table));

const tenantScoped = tables
  .filter((t) => t.columns.some((c) => c.name === "tenantId" || c.name === "tenant_id"))
  .map((t) => t.name)
  .filter((name) => !SURVIVES_PURGE.has(name));

const plan = demoPurgePlan();
const sequence = [...plan.bulk, ...plan.tail].map((t) => t.name);
const position = new Map(sequence.map((name, i) => [name, i]));

describe("demo purge order", () => {
  it("deletes every tenant-scoped table exactly once", () => {
    expect(tenantScoped.length).toBeGreaterThan(10);
    const missing = tenantScoped.filter((name) => !position.has(name));
    expect(missing, `tenant tables missing from the demo purge: ${missing.join(", ")}`).toEqual([]);
    expect(new Set(sequence).size).toBe(sequence.length);
  });

  it("never deletes the surviving control-plane ledger or the tenant row in the table phase", () => {
    expect(sequence).not.toContain("platform_audit_log");
    expect(sequence).not.toContain("tenant");
  });

  it("ends with the identity → user tail", () => {
    expect(plan.tail.map((t) => t.name)).toEqual([...DEMO_PURGE_TAIL]);
    expect(sequence.slice(-DEMO_PURGE_TAIL.length)).toEqual([...DEMO_PURGE_TAIL]);
  });

  it("deletes every child before the tenant table it references (detached FKs excepted)", () => {
    const detached = new Set(DEMO_PURGE_DETACHED_FKS.map((d) => `${d.table}.${d.column}`));
    for (const t of [...plan.bulk, ...plan.tail]) {
      for (const fk of foreignKeysOf(t)) {
        const parent = position.get(fk.references);
        if (parent === undefined || detached.has(`${t.name}.${fk.column}`)) continue;
        expect(
          position.get(t.name),
          `${t.name}.${fk.column} → ${fk.references}: the child must be deleted first`,
        ).toBeLessThan(parent);
      }
    }
  });

  it("lists only real FKs from a tail table into the bulk phase as detached", () => {
    const bulk = new Set(plan.bulk.map((t) => t.name));
    const actual = plan.tail.flatMap((t) =>
      foreignKeysOf(t)
        .filter((fk) => bulk.has(fk.references))
        .map((fk) => `${t.name}.${fk.column}→${fk.references}`),
    );
    expect(actual.sort()).toEqual(
      DEMO_PURGE_DETACHED_FKS.map((d) => `${d.table}.${d.column}→${d.references}`).sort(),
    );
  });

  it("detached FK columns are nullable (the purge nulls them before the bulk phase)", () => {
    for (const d of DEMO_PURGE_DETACHED_FKS) {
      const config = tables.find((t) => t.name === d.table);
      const column = config?.columns.find((c) => sqlColumnName(c.name) === d.column);
      expect(column, `${d.table}.${d.column}`).toBeDefined();
      expect(column?.notNull, `${d.table}.${d.column} must be nullable`).toBe(false);
    }
  });
});

describe("sqlColumnName", () => {
  it("snake-cases drizzle property keys and leaves SQL names alone", () => {
    expect(sqlColumnName("employeeId")).toBe("employee_id");
    expect(sqlColumnName("tenant_id")).toBe("tenant_id");
  });
});
