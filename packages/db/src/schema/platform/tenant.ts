import { foreignKey, pgTable, text, uuid, type PgColumn } from "drizzle-orm/pg-core";
import { auditColumns, citext, versionColumn } from "../../base-columns.js";
import type { DomainResolutionMode, TenantKind, TenantStatus } from "../enums.js";

// Control-plane tenant registry (M7 design D1/D5). Exempt from `tenantColumn` and RLS —
// these rows ARE the tenants. `slug` is citext so it is unique case-insensitively; `status`
// drives the central lifecycle enforcement (SUSPENDED/PURGING reject everything, READ_ONLY
// rejects mutations).
export const tenant = pgTable("tenant", {
  ...auditColumns,
  slug: citext().notNull().unique(),
  name: text().notNull(),
  kind: text().$type<TenantKind>().notNull(),
  status: text().$type<TenantStatus>().notNull().default("ACTIVE"),
  ...versionColumn,
});

// Hostname → tenant mapping for pre-login resolution (branding, per-tenant lockout, IdP
// choice). After login the token's `tid` claim is authoritative, never the host.
// `resolution_mode` DEMO_POOL routes a host into the m10 demo pool instead of one tenant.
export const tenantDomain = pgTable("tenant_domain", {
  ...auditColumns,
  hostname: citext().notNull().unique(),
  tenantId: uuid()
    .notNull()
    .references(() => tenant.id),
  resolutionMode: text().$type<DomainResolutionMode>().notNull().default("TENANT"),
});

// Per-table FK from a business table's `tenant_id` (spread from `tenantColumn`) to
// `tenant.id`. Declared in each table's extra-config callback rather than on the shared
// column builder: `.references()` mutates the builder, which every table shares.
export const tenantFk = (t: { tenantId: PgColumn }) =>
  foreignKey({ columns: [t.tenantId], foreignColumns: [tenant.id] });
