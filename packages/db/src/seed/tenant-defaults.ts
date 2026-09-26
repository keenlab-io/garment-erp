import { eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db, Tx } from "../client.js";
import {
  advancePolicy,
  documentSequence,
  documentTemplate,
  otRate,
  ssoConfig,
  taxBracket,
  uom,
  warehouse,
} from "../schema/index.js";

// Per-tenant defaults (M7 design D14): the rows that were single-tenant singletons before
// tenancy. ONE function, three callers — the dev seed, cloud provisioning
// (`TenantProvisioningService`), and the self-hosted first boot — so a backfilled tenant and a
// freshly provisioned one cannot drift.

// Base sequences (spec §0.6 examples). Modules may add their own later; these give the
// sequence service something to hand out. One row per (tenant, key); every tenant numbers
// from 1.
export const BASE_SEQUENCES = [
  { key: "EMPLOYEE", prefix: "EXT", includeYear: false, resetYearly: false, format: "{prefix}{seq:0000}" },
  { key: "ITEM", prefix: "AA", includeYear: false, resetYearly: false, padding: 5, format: "{prefix}{seq:00000}" },
  { key: "QUOTATION_VAT", prefix: "QV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "QUOTATION_NONVAT", prefix: "QNV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "INVOICE", prefix: "INV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "WORK_ORDER", prefix: "WO", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "RECEIPT", prefix: "RE", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
];

// Base units of measure (M3). Unique per tenant on `code`, so re-runs are a no-op. Per-item
// conversions between them live in `uom_conversion`.
export const BASE_UOMS = [
  { code: "PCS", name: "Piece" },
  { code: "KG", name: "Kilogram" },
  { code: "M", name: "Meter" },
  { code: "ROLL", name: "Roll" },
];

// A default warehouse so inventory movements have somewhere to land.
const DEFAULT_WAREHOUSE = { name: "Main Warehouse" };

// Default HR payroll parameters (M2, design D3) — **non-authoritative**, flagged for
// accountant confirmation (spec §2.5). All effective 2024-01-01. Values are illustrative
// defaults.
const CONFIG_EFFECTIVE = "2024-01-01";

// Illustrative progressive withholding bands (annual, THB). `upper_bound` null = top band.
const DEFAULT_TAX_BRACKETS = [
  { lowerBound: "0", upperBound: "150000", rate: "0" },
  { lowerBound: "150000", upperBound: "300000", rate: "0.05" },
  { lowerBound: "300000", upperBound: "500000", rate: "0.1" },
  { lowerBound: "500000", upperBound: "750000", rate: "0.15" },
  { lowerBound: "750000", upperBound: "1000000", rate: "0.2" },
  { lowerBound: "1000000", upperBound: null, rate: "0.25" },
].map((b) => ({ ...b, effectiveDate: CONFIG_EFFECTIVE }));

// Thai social security: 5% of wage clamped to [1650, 15000].
const DEFAULT_SSO_CONFIG = {
  effectiveDate: CONFIG_EFFECTIVE,
  rate: "0.05",
  wageFloor: "1650",
  wageCeiling: "15000",
};

// OT multipliers per rate_type.
const DEFAULT_OT_RATES = [
  { rateType: "WEEKDAY_1_5", multiplier: "1.5" },
  { rateType: "HOLIDAY_1_0", multiplier: "1" },
  { rateType: "HOLIDAY_3_0", multiplier: "3" },
].map((r) => ({ ...r, effectiveDate: CONFIG_EFFECTIVE }));

// Cash advance ≤ 50% of base salary, up to 3 installments.
const DEFAULT_ADVANCE_POLICY = {
  effectiveDate: CONFIG_EFFECTIVE,
  ceilingPct: "0.5",
  maxInstallments: 3,
};

// The rendering template sales exports use until an admin uploads branding.
const DEFAULT_DOCUMENT_TEMPLATE = { name: "Default", layout: {}, isActive: true };

// Base roles: none today. Roles are tenant-defined through the Admin UI and the tenant
// super-admin bypasses permissions, so a new tenant starts with no role rows; add entries
// here (inserted on the per-tenant unique `name`) if a standard set is ever agreed.

/**
 * Seed `tenantId`'s default rows. Idempotent: keyed tables conflict on their per-tenant
 * natural key (`document_sequence (tenant_id, key)`, `uom (tenant_id, code)`); the unkeyed
 * config tables are seeded only when the tenant has no row yet, so re-running (or running on
 * a tenant whose rows were backfilled by the tenancy migration) never duplicates.
 *
 * `tenant_id` is written explicitly on every row, so this works with or without the
 * `app.tenant_id` GUC set; under RLS the caller MUST run it in a transaction whose GUC equals
 * `tenantId` (the policies' `WITH CHECK` rejects anything else).
 */
export async function seedTenantDefaults(
  db: Db | Tx,
  tenantId: string,
  options: { year?: number } = {},
): Promise<void> {
  const yearScope = options.year ?? new Date().getFullYear();

  await db
    .insert(documentSequence)
    .values(BASE_SEQUENCES.map((s) => ({ ...s, tenantId, yearScope })))
    .onConflictDoNothing();

  await db
    .insert(uom)
    .values(BASE_UOMS.map((u) => ({ ...u, tenantId })))
    .onConflictDoNothing();

  if (await hasNoRows(db, warehouse, warehouse.tenantId, tenantId)) {
    await db.insert(warehouse).values({ ...DEFAULT_WAREHOUSE, tenantId });
  }
  if (await hasNoRows(db, taxBracket, taxBracket.tenantId, tenantId)) {
    await db.insert(taxBracket).values(DEFAULT_TAX_BRACKETS.map((b) => ({ ...b, tenantId })));
  }
  if (await hasNoRows(db, ssoConfig, ssoConfig.tenantId, tenantId)) {
    await db.insert(ssoConfig).values({ ...DEFAULT_SSO_CONFIG, tenantId });
  }
  if (await hasNoRows(db, otRate, otRate.tenantId, tenantId)) {
    await db.insert(otRate).values(DEFAULT_OT_RATES.map((r) => ({ ...r, tenantId })));
  }
  if (await hasNoRows(db, advancePolicy, advancePolicy.tenantId, tenantId)) {
    await db.insert(advancePolicy).values({ ...DEFAULT_ADVANCE_POLICY, tenantId });
  }
  if (await hasNoRows(db, documentTemplate, documentTemplate.tenantId, tenantId)) {
    await db.insert(documentTemplate).values({ ...DEFAULT_DOCUMENT_TEMPLATE, tenantId });
  }
}

// True when `table` holds no row for `tenantId` — the idempotency check for the config tables
// that have no natural key to conflict on.
async function hasNoRows(db: Db | Tx, table: PgTable, tenantCol: PgColumn, tenantId: string) {
  const rows = await db
    .select({ one: sql`1` })
    .from(table)
    .where(eq(tenantCol, tenantId))
    .limit(1);
  return rows.length === 0;
}
