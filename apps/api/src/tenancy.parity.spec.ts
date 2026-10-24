import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { schema } from "@erp/db";

/**
 * Control-plane / global-catalog tables that legitimately carry no `tenant_id` (M7 design D16).
 * Append-only by nature — adding a name here is a reviewed decision that a table is NOT tenant
 * data. `tenant_feature` is deliberately NOT here — it carries `tenant_id` and RLS like any
 * business table (M8 design D2).
 */
const TENANT_EXEMPT: ReadonlySet<string> = new Set([
  "tenant",
  "tenant_domain",
  "platform_admin",
  "platform_audit_log",
  "support_session",
  "permission", // the global permission catalog mirror
  "plan", // M8 commercial plan catalog (design D10)
  "platform_session", // M8 platform-admin sessions (design D7)
  "subscription", // M9 vendor-side billing (design D2)
  "subscription_invoice", // M9 vendor-side invoices (design D2)
  // M10 design D8: carries tenant_id as data but no RLS — the demo-pool OIDC callback resolves a
  // Google `sub` across DEMO_SANDBOX tenants before any tenant context exists; auth layer only.
  "auth_identity",
  "demo_lead", // M10 control-plane lead capture (design D6) — outlives the purged sandbox
]);

const tables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table));

// The structural tenancy guarantee, modeled on `enums.parity.spec.ts`: every table in the
// `@erp/db` schema barrel is either explicitly exempt or carries a `tenant_id` column. A new
// table that forgets `...tenantColumn` fails the build here instead of leaking across tenants.
describe("tenancy parity: every @erp/db table is tenant-scoped or exempt", () => {
  it("finds the schema's tables", () => {
    expect(tables.length).toBeGreaterThan(TENANT_EXEMPT.size);
  });

  it("every exempt name is a real table (no stale allowlist entries)", () => {
    const names = new Set(tables.map((t) => t.name));
    expect([...TENANT_EXEMPT].filter((name) => !names.has(name))).toEqual([]);
  });

  it.each(tables.map((t) => [t.name, t] as const))(
    "%s is in TENANT_EXEMPT or has a tenant_id column",
    (name, config) => {
      if (TENANT_EXEMPT.has(name)) return;
      // Unnamed builders keep their property key (`tenantId`) — the client's `casing:
      // "snake_case"` maps it to `tenant_id` at query time — so accept either spelling.
      const hasTenantId = config.columns.some(
        (column) => column.name === "tenantId" || column.name === "tenant_id",
      );
      expect(hasTenantId, `table "${name}" has no tenant_id column and is not TENANT_EXEMPT`).toBe(
        true,
      );
    },
  );
});
