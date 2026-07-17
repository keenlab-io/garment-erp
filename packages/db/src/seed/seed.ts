import argon2 from "argon2";
import { createDb } from "../client.js";
import {
  advancePolicy,
  documentSequence,
  otRate,
  permission,
  PERMISSION_CODES,
  ssoConfig,
  taxBracket,
  uom,
  user,
  warehouse,
} from "../schema/index.js";

// Idempotent development seed: a super-admin and the base document-sequence rows.
// Safe to run repeatedly — both writes use `onConflictDoNothing`, so a second run
// neither duplicates nor fails.

// Base sequences (spec §0.6 examples). Modules may add their own later; these give
// the sequence service something to hand out in dev. One row per key.
const BASE_SEQUENCES = [
  { key: "EMPLOYEE", prefix: "EXT", includeYear: false, resetYearly: false, format: "{prefix}{seq:0000}" },
  { key: "ITEM", prefix: "AA", includeYear: false, resetYearly: false, padding: 5, format: "{prefix}{seq:00000}" },
  { key: "QUOTATION_VAT", prefix: "QV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "QUOTATION_NONVAT", prefix: "QNV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "INVOICE", prefix: "INV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "WORK_ORDER", prefix: "WO", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "RECEIPT", prefix: "RE", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
];

// Base units of measure (M3). Seeded by unique `code`, so re-runs are a no-op. Modules and
// items reference these; per-item conversions between them live in `uom_conversion`.
const BASE_UOMS = [
  { code: "PCS", name: "Piece" },
  { code: "KG", name: "Kilogram" },
  { code: "M", name: "Meter" },
  { code: "ROLL", name: "Roll" },
];

// A default warehouse so inventory movements have somewhere to land in dev. Fixed `id` so
// re-runs conflict on the primary key and do nothing (idempotent).
const DEFAULT_WAREHOUSE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Main Warehouse",
};

// Default HR payroll parameters (M2, design D3) — **non-authoritative**, flagged for
// accountant confirmation (spec §2.5). All effective 2024-01-01. Fixed `id`s make the
// inserts idempotent (conflict on the primary key). Values are illustrative dev defaults.
const CONFIG_EFFECTIVE = "2024-01-01";

// Illustrative progressive withholding bands (annual, THB). `upper_bound` null = top band.
const DEFAULT_TAX_BRACKETS = [
  { id: "22222222-2222-4222-8222-000000000001", lowerBound: "0", upperBound: "150000", rate: "0" },
  { id: "22222222-2222-4222-8222-000000000002", lowerBound: "150000", upperBound: "300000", rate: "0.05" },
  { id: "22222222-2222-4222-8222-000000000003", lowerBound: "300000", upperBound: "500000", rate: "0.1" },
  { id: "22222222-2222-4222-8222-000000000004", lowerBound: "500000", upperBound: "750000", rate: "0.15" },
  { id: "22222222-2222-4222-8222-000000000005", lowerBound: "750000", upperBound: "1000000", rate: "0.2" },
  { id: "22222222-2222-4222-8222-000000000006", lowerBound: "1000000", upperBound: null, rate: "0.25" },
].map((b) => ({ ...b, effectiveDate: CONFIG_EFFECTIVE }));

// Thai social security: 5% of wage clamped to [1650, 15000].
const DEFAULT_SSO_CONFIG = {
  id: "33333333-3333-4333-8333-000000000001",
  effectiveDate: CONFIG_EFFECTIVE,
  rate: "0.05",
  wageFloor: "1650",
  wageCeiling: "15000",
};

// OT multipliers per rate_type.
const DEFAULT_OT_RATES = [
  { id: "44444444-4444-4444-8444-000000000001", rateType: "WEEKDAY_1_5", multiplier: "1.5" },
  { id: "44444444-4444-4444-8444-000000000002", rateType: "HOLIDAY_1_0", multiplier: "1" },
  { id: "44444444-4444-4444-8444-000000000003", rateType: "HOLIDAY_3_0", multiplier: "3" },
].map((r) => ({ ...r, effectiveDate: CONFIG_EFFECTIVE }));

// Cash advance ≤ 50% of base salary, up to 3 installments.
const DEFAULT_ADVANCE_POLICY = {
  id: "55555555-5555-4555-8555-000000000001",
  effectiveDate: CONFIG_EFFECTIVE,
  ceilingPct: "0.5",
  maxInstallments: 3,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run the seed");

  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? "changeme";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const currentYear = new Date().getFullYear();

  const { db, queryClient } = createDb(url, { max: 1 });
  try {
    await db
      .insert(user)
      .values({
        username: "superadmin",
        email: "admin@erp.local",
        passwordHash,
        status: "ACTIVE",
        isSuperAdmin: true,
        permissionsVersion: 1,
      })
      .onConflictDoNothing();

    await db
      .insert(documentSequence)
      .values(BASE_SEQUENCES.map((s) => ({ ...s, yearScope: currentYear })))
      .onConflictDoNothing();

    // Mirror the permission catalog into the `permission` table (M1 design D8). Idempotent:
    // `onConflictDoNothing` on the unique `code` keeps re-runs a no-op and never duplicates.
    await db
      .insert(permission)
      .values(PERMISSION_CODES.map((code) => ({ code })))
      .onConflictDoNothing();

    // Base inventory reference data (M3). Both idempotent: uom conflicts on unique `code`,
    // the warehouse on its fixed primary key.
    await db.insert(uom).values(BASE_UOMS).onConflictDoNothing();
    await db.insert(warehouse).values(DEFAULT_WAREHOUSE).onConflictDoNothing();

    // Default HR payroll config (M2). All idempotent — fixed `id`s conflict on the PK.
    await db.insert(taxBracket).values(DEFAULT_TAX_BRACKETS).onConflictDoNothing();
    await db.insert(ssoConfig).values(DEFAULT_SSO_CONFIG).onConflictDoNothing();
    await db.insert(otRate).values(DEFAULT_OT_RATES).onConflictDoNothing();
    await db.insert(advancePolicy).values(DEFAULT_ADVANCE_POLICY).onConflictDoNothing();

    console.log(
      "Seed complete: super-admin + base sequences + permission catalog + base uom + warehouse + HR config",
    );
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
