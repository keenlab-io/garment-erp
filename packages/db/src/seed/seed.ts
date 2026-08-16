import argon2 from "argon2";
import { inArray } from "drizzle-orm";
import { createDb } from "../client.js";
import {
  advancePolicy,
  customer,
  documentSequence,
  item,
  otRate,
  permission,
  PERMISSION_CODES,
  role,
  rolePermission,
  sku,
  ssoConfig,
  taxBracket,
  uom,
  user,
  userRole,
  warehouse,
  type ItemType,
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

// UI-test personas (docs/testing/UI_TEST_PLAN.md §4). The running app has **no** permission
// override — `VITE_DEV_PERMISSIONS` only shapes the Vitest stub — so every browser persona
// must be a real role + a real logged-in user. This list mirrors `e2e/fixtures/personas.ts`
// one-for-one and `username` IS the fixture's `key`, which is how a spec maps a persona to
// its login. Keep the two in sync: a persona here the fixture doesn't know is dead test data.
// Passwords come from `SEED_PERSONA_PASSWORD` (default `changeme`) — dev-only, the same risk
// profile as the seeded super-admin; never point this seed at a real environment.
// Ids are database-generated: `roleName`/`key` are the natural keys the seed reconciles on.
const SEED_PERSONAS = [
  {
    key: "salesClerk",
    roleName: "Sales Clerk",
    permissions: [
      "sales.quotation.manage",
      "sales.invoice.create",
      "sales.customer.manage",
      "sales.payment.record",
    ],
  },
  {
    key: "salesSupervisor",
    roleName: "Sales Supervisor",
    permissions: [
      "sales.quotation.manage",
      "sales.invoice.create",
      "sales.invoice.approve",
      "sales.document.void",
      "sales.etax.submit",
      "sales.payment.record",
      "report.sales.view",
    ],
  },
  {
    key: "payrollApprover",
    roleName: "Payroll Approver",
    permissions: ["hr.payroll.approve", "hr.ot.approve", "hr.salary.view", "hr.payslip.view"],
  },
  {
    key: "hrOfficer",
    roleName: "HR Officer",
    // Deliberately NO hr.salary.view — this persona proves salary fields render masked.
    permissions: ["hr.employee.view", "hr.employee.manage"],
  },
  {
    key: "inventoryOperator",
    roleName: "Inventory Operator",
    // Deliberately NO inventory.cost.view — cost columns must render masked.
    permissions: ["inventory.product.create", "inventory.receipt.manage", "inventory.issue.manage"],
  },
  {
    key: "inventoryApprover",
    roleName: "Inventory Approver",
    permissions: ["inventory.issue.manage", "inventory.adjustment.approve", "inventory.cost.view"],
  },
  {
    key: "productionScanner",
    roleName: "Production Scanner",
    permissions: ["production.scan"],
  },
  {
    key: "productionPlanner",
    roleName: "Production Planner",
    permissions: ["production.wo.manage", "production.subcontract.manage"],
  },
  {
    key: "reportsViewer",
    roleName: "Reports Viewer",
    permissions: ["report.sales.view", "report.inventory.view"],
  },
  // The "sees nothing" side of every permission gate: a valid login bound to NO role, so the
  // resolver returns an empty set. Deliberately has no role row — zero roles is the truest
  // representation of zero permissions, and it exercises the empty-nav path.
  {
    key: "none",
    roleName: null,
    permissions: [],
  },
];

// Sales master data — the billing party every quotation/invoice golden path needs. Without
// at least one customer the document editor's CustomerAutocomplete has nothing to select and
// TC-SALES-04 cannot run. `addresses` is the contract's snake_case `CustomerAddress` shape.
const SEED_CUSTOMER = {
  id: "88888888-8888-4888-8888-000000000001",
  name: "Acme Garments Co., Ltd.",
  taxId: "0105556000000",
  branchCode: "00000",
  addresses: [
    {
      line1: "199/8 Sukhumvit Road",
      subdistrict: "Khlong Toei",
      district: "Khlong Toei",
      province: "Bangkok",
      postal_code: "10110",
      is_default: true,
    },
  ],
  creditTermsDays: 30,
};

// Inventory master data — one raw material + one finished good, enough for document lines,
// stock movements and BOM-shaped cases. `code` is normally issued by SequenceService from the
// ITEM sequence (`AA00001`); these use a `SEED-` prefix so they can never collide with a
// generated code no matter how far that sequence has advanced. `uomCode` is resolved to the
// base uom's generated id at insert time.
const SEED_ITEMS = [
  {
    id: "99999999-9999-4999-8999-000000000001",
    code: "SEED-FAB-001",
    name: 'Cotton Twill Fabric 60"',
    itemType: "RAW",
    uomCode: "M",
    standardCost: "120.0000",
    minStock: "100.000000",
  },
  {
    id: "99999999-9999-4999-8999-000000000002",
    code: "SEED-FG-001",
    name: "Polo Shirt — Navy",
    itemType: "FINISHED",
    uomCode: "PCS",
    standardCost: "250.0000",
    minStock: "20.000000",
  },
];

// One scannable variant of the finished good, so the barcode/label screens and the kiosk
// scan field have a real code to resolve. `barcode` is a valid EAN-13 (check digit included).
const SEED_SKU = {
  id: "99999999-9999-4999-8999-000000000101",
  itemId: SEED_ITEMS[1]!.id,
  skuCode: "SEED-FG-001-M",
  variant: { color: "Navy", size: "M" },
  barcode: "8850000000017",
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

    // --- UI-test personas: role → grants → user → binding.
    //
    // Identity here is the NATURAL key — `role.name` and `user.username` are unique — not a
    // hardcoded uuid. A role created earlier (by an Admin-UI bootstrap, or by an older revision
    // of this list) already owns its name under a database-generated id, and a fixed-id insert
    // would then lose the primary-key race, silently no-op, and leave the grants pointing at a
    // row that does not exist. So: insert-if-absent, then read the real ids back by name and
    // hang the grants and bindings off those.
    const personaPasswordHash = await argon2.hash(
      process.env.SEED_PERSONA_PASSWORD ?? "changeme",
      { type: argon2.argon2id },
    );
    const rolePersonas = SEED_PERSONAS.filter((p) => p.roleName !== null);

    await db
      .insert(role)
      .values(
        rolePersonas.map((p) => ({
          name: p.roleName!,
          description: "UI-test persona (seeded) — see docs/testing/UI_TEST_PLAN.md",
          isSystem: false,
        })),
      )
      .onConflictDoNothing();

    const roleRows = await db
      .select({ id: role.id, name: role.name })
      .from(role)
      .where(inArray(role.name, rolePersonas.map((p) => p.roleName!)));
    const roleIdByName = new Map(roleRows.map((r) => [r.name, r.id]));

    // Resolve permission ids by code — the catalog rows were inserted above, and their ids
    // are database-generated, so the grants can only be built after that insert.
    const grantedCodes = [...new Set(rolePersonas.flatMap((p) => p.permissions))];
    const permissionRows = await db
      .select({ id: permission.id, code: permission.code })
      .from(permission)
      .where(inArray(permission.code, grantedCodes));
    const permissionIdByCode = new Map(permissionRows.map((r) => [r.code, r.id]));

    const grants = rolePersonas.flatMap((p) => {
      const roleId = roleIdByName.get(p.roleName!);
      if (!roleId) throw new Error(`Persona role "${p.roleName}" was not created`);
      return p.permissions.map((code) => {
        const permissionId = permissionIdByCode.get(code);
        // A typo'd code would otherwise seed a silently under-powered persona, which reads in
        // the UI as a permission bug rather than as bad test data. Fail loudly.
        if (!permissionId) {
          throw new Error(`Persona "${p.key}" references unknown permission code "${code}"`);
        }
        return { roleId, permissionId };
      });
    });

    // Grants are declared EXACTLY, not additively: clear this seed's roles first so editing a
    // persona's permission list actually removes what it dropped. A stale extra grant would
    // quietly defeat the masked-cost / masked-salary assertions those personas exist to prove.
    await db.delete(rolePermission).where(inArray(rolePermission.roleId, [...roleIdByName.values()]));
    await db.insert(rolePermission).values(grants).onConflictDoNothing();

    await db
      .insert(user)
      .values(
        SEED_PERSONAS.map((p) => ({
          username: p.key,
          email: `${p.key.toLowerCase()}@erp.local`,
          passwordHash: personaPasswordHash,
          status: "ACTIVE" as const,
          isSuperAdmin: false,
          permissionsVersion: 1,
        })),
      )
      .onConflictDoNothing();

    const personaUserRows = await db
      .select({ id: user.id, username: user.username })
      .from(user)
      .where(inArray(user.username, SEED_PERSONAS.map((p) => p.key)));
    const userIdByUsername = new Map(personaUserRows.map((r) => [r.username, r.id]));

    // Bindings are exact for the same reason — and it is what gives the `none` persona its
    // defining property (a valid login bound to zero roles).
    await db.delete(userRole).where(inArray(userRole.userId, [...userIdByUsername.values()]));
    await db
      .insert(userRole)
      .values(
        rolePersonas.map((p) => ({
          userId: userIdByUsername.get(p.key)!,
          roleId: roleIdByName.get(p.roleName!)!,
        })),
      )
      .onConflictDoNothing();

    // --- Golden-path master data: one customer, two items, one scannable sku.
    await db.insert(customer).values(SEED_CUSTOMER).onConflictDoNothing();

    // Base uom ids are database-generated, so map the seed items' `uomCode` after the
    // BASE_UOMS insert above. A missing uom means the base set changed — fail loudly.
    const uomRows = await db.select({ id: uom.id, code: uom.code }).from(uom);
    const uomIdByCode = new Map(uomRows.map((r) => [r.code, r.id]));

    await db
      .insert(item)
      .values(
        SEED_ITEMS.map((i) => {
          const baseUomId = uomIdByCode.get(i.uomCode);
          if (!baseUomId) throw new Error(`Seed item "${i.code}" needs uom "${i.uomCode}"`);
          return {
            id: i.id,
            code: i.code,
            name: i.name,
            itemType: i.itemType as ItemType,
            baseUomId,
            standardCost: i.standardCost,
            minStock: i.minStock,
          };
        }),
      )
      .onConflictDoNothing();

    await db.insert(sku).values(SEED_SKU).onConflictDoNothing();

    console.log(
      "Seed complete: super-admin + base sequences + permission catalog + base uom + warehouse + " +
        `HR config + ${SEED_PERSONAS.length} UI-test personas + sales/inventory master data`,
    );
  } finally {
    await queryClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
