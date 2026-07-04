import argon2 from "argon2";
import { createDb } from "../client.js";
import { documentSequence, user } from "../schema/index.js";

// Idempotent development seed: a super-admin and the base document-sequence rows.
// Safe to run repeatedly — both writes use `onConflictDoNothing`, so a second run
// neither duplicates nor fails.

// Base sequences (spec §0.6 examples). Modules may add their own later; these give
// the sequence service something to hand out in dev. One row per key.
const BASE_SEQUENCES = [
  { key: "EMPLOYEE", prefix: "EXT", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "ITEM", prefix: "AA", includeYear: false, resetYearly: false, format: "{prefix}{seq:0000}" },
  { key: "QUOTATION_VAT", prefix: "QV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "QUOTATION_NONVAT", prefix: "QNV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "INVOICE", prefix: "INV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
];

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

    console.log("Seed complete: super-admin + base sequences");
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
