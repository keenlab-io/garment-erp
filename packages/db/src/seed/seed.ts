import argon2 from "argon2";
import { createDb } from "../client.js";
import {
  documentSequence,
  permission,
  PERMISSION_CODES,
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
  { key: "EMPLOYEE", prefix: "EXT", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "ITEM", prefix: "AA", includeYear: false, resetYearly: false, padding: 5, format: "{prefix}{seq:00000}" },
  { key: "QUOTATION_VAT", prefix: "QV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "QUOTATION_NONVAT", prefix: "QNV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "INVOICE", prefix: "INV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
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

    console.log(
      "Seed complete: super-admin + base sequences + permission catalog + base uom + warehouse",
    );
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
