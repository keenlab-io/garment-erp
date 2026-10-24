import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "../../client.js";
import {
  customer,
  department,
  docLine,
  documentSequence,
  employee,
  invoice,
  item,
  payment,
  payrollRun,
  payslip,
  position,
  productionScan,
  quotation,
  routingStep,
  routingTemplate,
  salaryRecord,
  sku,
  stockBalance,
  stockLot,
  stockMovement,
  uom,
  warehouse,
  workOrder,
  workOrderStep,
  type InvoiceStatus,
  type ItemType,
  type PaymentMethod,
  type QuotationStatus,
  type WorkOrderStatus,
  type WorkOrderStepStatus,
} from "../../schema/index.js";
import { seedTenantDefaults } from "../tenant-defaults.js";

// The public-demo factory (M10 design D2): a Thai custom-apparel shop with enough live data for
// the 15-minute GTM script — order tracking (work orders mid-production with a delayed step),
// job costing (stock lots + BOM-ish items), a completed payroll, and invoices in every state.
//
// ONE entry point, `seedDemoTenant(tenantId)`, used by sandbox provisioning (m10 §4), the
// DEMO_TEMPLATE curation tenant, and CI. Deterministic: every id is derived from
// `(tenantId, key)`, and every timestamp is an offset from `options.now`, so the dataset has the
// same shape on every run and re-running against the same tenant is a no-op
// (`onConflictDoNothing` on those ids / natural keys).

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Deterministic uuid (RFC-4122-shaped, v5-style) from the tenant and a stable key. Ids must be
// globally unique across sandboxes (they are primary keys), hence the tenant in the hash.
export function demoId(tenantId: string, key: string): string {
  const h = createHash("sha1").update(`${tenantId}:${key}`).digest("hex");
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const money4 = (n: number) => n.toFixed(4);
const qty6 = (n: number) => n.toFixed(6);

const CUSTOMERS = [
  { key: "c1", name: "บริษัท สยามสปอร์ตแวร์ จำกัด", taxId: "0105561000011", province: "กรุงเทพมหานคร", postal: "10110", terms: 30 },
  { key: "c2", name: "ห้างหุ้นส่วนจำกัด ลายไทยยูนิฟอร์ม", taxId: "0103562000022", province: "นนทบุรี", postal: "11000", terms: 15 },
  { key: "c3", name: "บริษัท โรงเรียนกวดวิชาพิมพ์ใจ จำกัด", taxId: "0105563000033", province: "ปทุมธานี", postal: "12000", terms: 30 },
  { key: "c4", name: "ร้านทีมเสื้อกีฬาเชียงใหม่ เอฟซี", taxId: "0503564000044", province: "เชียงใหม่", postal: "50000", terms: 0 },
] as const;

const ITEMS: ReadonlyArray<{
  key: string;
  code: string;
  name: string;
  itemType: ItemType;
  uom: string;
  cost: number;
  min: number;
}> = [
  { key: "fabric", code: "DEMO-FAB-001", name: "ผ้าโพลีเอสเตอร์ไมโคร (ซับลิเมชัน)", itemType: "RAW", uom: "M", cost: 85, min: 200 },
  { key: "cotton", code: "DEMO-FAB-002", name: "ผ้าคอตตอน TC 65/35 สีขาว", itemType: "RAW", uom: "KG", cost: 140, min: 50 },
  { key: "ink", code: "DEMO-INK-001", name: "หมึกซับลิเมชัน ชุด CMYK", itemType: "CONSUMABLE", uom: "PCS", cost: 650, min: 4 },
  { key: "thread", code: "DEMO-THR-001", name: "ด้ายโพลีเอสเตอร์ 40/2", itemType: "RAW", uom: "ROLL", cost: 45, min: 30 },
  { key: "jersey", code: "DEMO-FG-001", name: "เสื้อกีฬาพิมพ์ลาย (ทีม)", itemType: "FINISHED", uom: "PCS", cost: 165, min: 0 },
  { key: "polo", code: "DEMO-FG-002", name: "เสื้อโปโลปักโลโก้", itemType: "FINISHED", uom: "PCS", cost: 190, min: 0 },
  { key: "tee", code: "DEMO-FG-003", name: "เสื้อยืดสกรีนลาย", itemType: "FINISHED", uom: "PCS", cost: 95, min: 0 },
];

const ROUTING_STEPS = [
  { seq: 1, name: "ออกแบบ/พิมพ์ลาย", min: 60 },
  { seq: 2, name: "ตัดผ้า", min: 90 },
  { seq: 3, name: "เย็บประกอบ", min: 240 },
  { seq: 4, name: "ตรวจคุณภาพ (QC)", min: 45 },
  { seq: 5, name: "แพ็คและจัดส่ง", min: 30 },
];

export type SeedDemoTenantOptions = {
  /** Anchor for every relative date/timestamp. Defaults to `new Date()`. */
  now?: Date;
};

export type SeedDemoTenantResult = {
  customers: number;
  items: number;
  workOrders: number;
  employees: number;
  invoices: number;
};

/**
 * Seed the Thai demo factory into `tenantId`. Idempotent. Like `seedTenantDefaults`, the caller
 * MUST run it inside a transaction whose `app.tenant_id` GUC equals `tenantId` when RLS is in
 * force; `tenant_id` is written explicitly on every row.
 */
export async function seedDemoTenant(
  db: Db | Tx,
  tenantId: string,
  options: SeedDemoTenantOptions = {},
): Promise<SeedDemoTenantResult> {
  const now = options.now ?? new Date();
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  const id = (key: string) => demoId(tenantId, key);

  // Per-tenant sequences, uoms, warehouse and the SSO / tax / advance / template config rows.
  await seedTenantDefaults(db, tenantId, { year: now.getUTCFullYear() });

  // ── Customers ───────────────────────────────────────────────────────────────
  await db
    .insert(customer)
    .values(
      CUSTOMERS.map((c) => ({
        id: id(`customer:${c.key}`),
        tenantId,
        name: c.name,
        taxId: c.taxId,
        branchCode: "00000",
        addresses: [
          {
            line1: "99/9 ถนนสุขุมวิท",
            province: c.province,
            postal_code: c.postal,
            is_default: true,
          },
        ],
        creditTermsDays: c.terms,
      })),
    )
    .onConflictDoNothing();

  // ── Catalogue, SKUs, stock lots ─────────────────────────────────────────────
  const uomRows = await db
    .select({ id: uom.id, code: uom.code })
    .from(uom)
    .where(eq(uom.tenantId, tenantId));
  const uomIdByCode = new Map(uomRows.map((u) => [u.code, u.id]));
  const [wh] = await db
    .select({ id: warehouse.id })
    .from(warehouse)
    .where(eq(warehouse.tenantId, tenantId))
    .limit(1);
  if (!wh) throw new Error("seedDemoTenant: tenant has no warehouse after seedTenantDefaults");

  await db
    .insert(item)
    .values(
      ITEMS.map((i) => {
        const baseUomId = uomIdByCode.get(i.uom);
        if (!baseUomId) throw new Error(`seedDemoTenant: base uom "${i.uom}" is missing`);
        return {
          id: id(`item:${i.key}`),
          tenantId,
          code: i.code,
          name: i.name,
          itemType: i.itemType,
          baseUomId,
          standardCost: money4(i.cost),
          minStock: i.min > 0 ? qty6(i.min) : null,
        };
      }),
    )
    .onConflictDoNothing();

  const SIZES = ["S", "M", "L", "XL"];
  await db
    .insert(sku)
    .values(
      ITEMS.filter((i) => i.itemType === "FINISHED").flatMap((i) =>
        SIZES.map((size) => ({
          id: id(`sku:${i.key}:${size}`),
          tenantId,
          itemId: id(`item:${i.key}`),
          skuCode: `${i.code}-${size}`,
          variant: { color: "กรมท่า", size },
        })),
      ),
    )
    .onConflictDoNothing();

  // Raw materials/consumables are received into stock: one lot each (ledger IN + balance), with
  // the thread deliberately below its minimum so the low-stock alert has something to show.
  const stocked = ITEMS.filter((i) => i.itemType !== "FINISHED");
  const lotQty: Record<string, number> = { fabric: 640, cotton: 180, ink: 2, thread: 18 };
  await db
    .insert(stockLot)
    .values(
      stocked.map((i) => ({
        id: id(`lot:${i.key}`),
        tenantId,
        itemId: id(`item:${i.key}`),
        lotNo: `LOT-${i.code}-01`,
        qtyRemaining: qty6(lotQty[i.key] ?? 0),
        unitCost: money4(i.cost),
        receivedAt: at(-21 * DAY),
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(stockMovement)
    .values(
      stocked.map((i) => ({
        id: id(`movement:${i.key}`),
        tenantId,
        itemId: id(`item:${i.key}`),
        lotId: id(`lot:${i.key}`),
        warehouseId: wh.id,
        qty: qty6(lotQty[i.key] ?? 0),
        direction: "IN" as const,
        unitCost: money4(i.cost),
        refType: "GOODS_RECEIPT" as const,
        refId: id(`receipt:${i.key}`),
        at: at(-21 * DAY),
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(stockBalance)
    .values(
      stocked.map((i) => ({
        tenantId,
        itemId: id(`item:${i.key}`),
        warehouseId: wh.id,
        qtyOnHand: qty6(lotQty[i.key] ?? 0),
        avgCost: money4(i.cost),
      })),
    )
    .onConflictDoNothing();

  // ── Routing templates ───────────────────────────────────────────────────────
  const TEMPLATES = [
    { key: "sublimation", name: "เสื้อกีฬาซับลิเมชัน", productType: "SUBLIMATION" as const },
    { key: "embroidery", name: "เสื้อโปโลปักโลโก้", productType: "EMBROIDERY" as const },
  ];
  await db
    .insert(routingTemplate)
    .values(
      TEMPLATES.map((t) => ({
        id: id(`template:${t.key}`),
        tenantId,
        name: t.name,
        productType: t.productType,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(routingStep)
    .values(
      TEMPLATES.flatMap((t) =>
        ROUTING_STEPS.map((s) => ({
          id: id(`rstep:${t.key}:${s.seq}`),
          tenantId,
          templateId: id(`template:${t.key}`),
          seq: s.seq,
          name: s.name,
          standardTimeMin: s.min,
        })),
      ),
    )
    .onConflictDoNothing();

  // ── Work orders mid-production, with scan history ───────────────────────────
  // `done` = steps already FINISHed; the next step (if any) is IN_PROGRESS since `startedAgoMin`.
  // WO-0002's running step has been going 3× its standard time → the delayed step the demo shows.
  const WORK_ORDERS: ReadonlyArray<{
    key: string;
    template: string;
    customer: string;
    finished: string;
    quantity: number;
    dueInDays: number;
    done: number;
    startedAgoMin: number | null;
    status: WorkOrderStatus;
  }> = [
    { key: "wo1", template: "sublimation", customer: "c1", finished: "jersey", quantity: 120, dueInDays: 6, done: 2, startedAgoMin: 100, status: "IN_PROGRESS" },
    { key: "wo2", template: "sublimation", customer: "c4", finished: "jersey", quantity: 40, dueInDays: 2, done: 2, startedAgoMin: 240 * 3, status: "IN_PROGRESS" },
    { key: "wo3", template: "embroidery", customer: "c2", finished: "polo", quantity: 80, dueInDays: 9, done: 1, startedAgoMin: 30, status: "IN_PROGRESS" },
    { key: "wo4", template: "embroidery", customer: "c3", finished: "polo", quantity: 60, dueInDays: -1, done: 5, startedAgoMin: null, status: "COMPLETED" },
  ];
  const year = now.getUTCFullYear();
  const woNo = (n: number) => `WO${year}${String(n).padStart(4, "0")}`;

  await db
    .insert(workOrder)
    .values(
      WORK_ORDERS.map((w, idx) => ({
        id: id(`wo:${w.key}`),
        tenantId,
        woNo: woNo(idx + 1),
        customerId: id(`customer:${w.customer}`),
        finishedItemId: id(`item:${w.finished}`),
        qty: qty6(w.quantity),
        dueDate: dateOnly(at(w.dueInDays * DAY)),
        routingTemplateId: id(`template:${w.template}`),
        machine: w.template === "embroidery" ? "เครื่องปัก 6 หัว" : "เครื่องพิมพ์ซับลิเมชัน A1",
        status: w.status,
      })),
    )
    .onConflictDoNothing();

  const stepRows: Array<typeof workOrderStep.$inferInsert> = [];
  const scanRows: Array<typeof productionScan.$inferInsert> = [];
  for (const w of WORK_ORDERS) {
    // Each completed step finished in its standard time; stepping backwards from the start of
    // the running step (or from "just now" for a finished order) keeps the timeline coherent.
    let cursor =
      w.startedAgoMin === null
        ? -1 * HOUR
        : -w.startedAgoMin * MIN;
    const timeline = new Map<number, { start: number; finish: number | null }>();
    for (let seq = w.done; seq >= 1; seq--) {
      const std = ROUTING_STEPS[seq - 1]!.min * MIN;
      const finish = cursor;
      const start = finish - std;
      timeline.set(seq, { start, finish });
      cursor = start;
    }
    if (w.startedAgoMin !== null && w.done < ROUTING_STEPS.length) {
      timeline.set(w.done + 1, { start: -w.startedAgoMin * MIN, finish: null });
    }
    for (const s of ROUTING_STEPS) {
      const t = timeline.get(s.seq);
      const status: WorkOrderStepStatus = !t
        ? "PENDING"
        : t.finish === null
          ? "IN_PROGRESS"
          : "COMPLETED";
      const stepId = id(`wostep:${w.key}:${s.seq}`);
      stepRows.push({
        id: stepId,
        tenantId,
        woId: id(`wo:${w.key}`),
        routingStepId: id(`rstep:${w.template}:${s.seq}`),
        seq: s.seq,
        name: s.name,
        standardTimeMin: s.min,
        status,
        startedAt: t ? at(t.start) : null,
        finishedAt: t?.finish != null ? at(t.finish) : null,
      });
      if (t) {
        scanRows.push({
          id: id(`scan:${w.key}:${s.seq}:start`),
          tenantId,
          woStepId: stepId,
          action: "START",
          at: at(t.start),
        });
        if (t.finish !== null) {
          scanRows.push({
            id: id(`scan:${w.key}:${s.seq}:finish`),
            tenantId,
            woStepId: stepId,
            action: "FINISH",
            at: at(t.finish),
          });
        }
      }
    }
  }
  await db.insert(workOrderStep).values(stepRows).onConflictDoNothing();
  await db.insert(productionScan).values(scanRows).onConflictDoNothing();

  // ── HR: employees, salaries, one completed payroll run ──────────────────────
  await db
    .insert(department)
    .values({ id: id("dept:production"), tenantId, name: "ฝ่ายผลิต" })
    .onConflictDoNothing();
  await db
    .insert(position)
    .values({
      id: id("position:sewer"),
      tenantId,
      title: "ช่างเย็บ",
      departmentId: id("dept:production"),
    })
    .onConflictDoNothing();

  const EMPLOYEES = [
    { key: "e1", code: "EXT0001", first: "สมชาย", last: "ใจดี", type: "MONTHLY" as const, salary: 18000 },
    { key: "e2", code: "EXT0002", first: "สมหญิง", last: "แสงทอง", type: "MONTHLY" as const, salary: 16500 },
    { key: "e3", code: "EXT0003", first: "วิชัย", last: "เรืองศรี", type: "MONTHLY" as const, salary: 15000 },
    { key: "e4", code: "EXT0004", first: "นภา", last: "บุญมี", type: "DAILY" as const, salary: 9000 },
    { key: "e5", code: "EXT0005", first: "ประเสริฐ", last: "ทองคำ", type: "DAILY" as const, salary: 9000 },
  ];
  await db
    .insert(employee)
    .values(
      EMPLOYEES.map((e) => ({
        id: id(`employee:${e.key}`),
        tenantId,
        empCode: e.code,
        firstName: e.first,
        lastName: e.last,
        positionId: id("position:sewer"),
        employmentType: e.type,
        status: "ACTIVE" as const,
        hireDate: dateOnly(at(-400 * DAY)),
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(salaryRecord)
    .values(
      EMPLOYEES.map((e) => ({
        id: id(`salary:${e.key}`),
        tenantId,
        employeeId: id(`employee:${e.key}`),
        baseSalary: money4(e.salary),
        effectiveDate: dateOnly(at(-400 * DAY)),
      })),
    )
    .onConflictDoNothing();

  // The previous calendar month, fully paid out. Social security: 5% clamped to the [1650, 15000]
  // wage band that `seedTenantDefaults` installs; no withholding tax at these wages.
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const period = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  await db
    .insert(payrollRun)
    .values({ id: id("payroll:run"), tenantId, period, status: "PAID" })
    .onConflictDoNothing();
  await db
    .insert(payslip)
    .values(
      EMPLOYEES.map((e) => {
        const sso = Math.min(Math.max(e.salary, 1650), 15000) * 0.05;
        return {
          id: id(`payslip:${e.key}`),
          tenantId,
          runId: id("payroll:run"),
          employeeId: id(`employee:${e.key}`),
          breakdown: {
            base: money4(e.salary),
            ot: "0.0000",
            allowances: [],
            deductions: [],
            sso: money4(sso),
            tax: "0.0000",
            advance: "0.0000",
          },
          gross: money4(e.salary),
          net: money4(e.salary - sso),
        };
      }),
    )
    .onConflictDoNothing();

  // ── Quotations ──────────────────────────────────────────────────────────────
  const VAT = 0.07;
  type Line = { desc: string; item: string; qty: number; price: number };
  const priced = (lines: Line[]) => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const vat = Math.round(subtotal * VAT * 100) / 100;
    return { subtotal, vat, total: subtotal + vat };
  };
  const QUOTES: ReadonlyArray<{
    key: string;
    customer: string;
    status: QuotationStatus;
    validDays: number;
    lines: Line[];
  }> = [
    { key: "q1", customer: "c1", status: "SENT", validDays: 14, lines: [{ desc: "เสื้อกีฬาพิมพ์ลาย (ทีม)", item: "jersey", qty: 200, price: 320 }] },
    { key: "q2", customer: "c3", status: "APPROVED", validDays: 7, lines: [{ desc: "เสื้อโปโลปักโลโก้", item: "polo", qty: 150, price: 360 }] },
    { key: "q3", customer: "c2", status: "DRAFT", validDays: 30, lines: [{ desc: "เสื้อยืดสกรีนลาย", item: "tee", qty: 300, price: 180 }] },
  ];
  const docLines: Array<typeof docLine.$inferInsert> = [];
  await db
    .insert(quotation)
    .values(
      QUOTES.map((q, idx) => {
        const t = priced(q.lines);
        q.lines.forEach((l, li) =>
          docLines.push({
            id: id(`line:${q.key}:${li}`),
            tenantId,
            parentType: "QUOTATION",
            parentId: id(`quotation:${q.key}`),
            itemId: id(`item:${l.item}`),
            description: l.desc,
            qty: qty6(l.qty),
            unitPrice: money4(l.price),
            lineTotal: money4(l.qty * l.price),
          }),
        );
        return {
          id: id(`quotation:${q.key}`),
          tenantId,
          docNo: `QV${year}${String(idx + 1).padStart(4, "0")}`,
          customerId: id(`customer:${q.customer}`),
          vatMode: "VAT" as const,
          vatCalc: "VatNok" as const,
          validUntil: dateOnly(at(q.validDays * DAY)),
          status: q.status,
          subtotal: money4(t.subtotal),
          vatAmount: money4(t.vat),
          grandTotal: money4(t.total),
        };
      }),
    )
    .onConflictDoNothing();

  // ── Invoices: one in each of draft / issued / partially-paid / paid / overdue ─
  const INVOICES: ReadonlyArray<{
    key: string;
    customer: string;
    status: InvoiceStatus;
    issueDaysAgo: number;
    dueInDays: number;
    paidFraction: number;
    lines: Line[];
  }> = [
    { key: "i1", customer: "c1", status: "DRAFT", issueDaysAgo: 0, dueInDays: 30, paidFraction: 0, lines: [{ desc: "เสื้อกีฬาพิมพ์ลาย (ทีม)", item: "jersey", qty: 120, price: 320 }] },
    { key: "i2", customer: "c2", status: "ISSUED", issueDaysAgo: 5, dueInDays: 10, paidFraction: 0, lines: [{ desc: "เสื้อโปโลปักโลโก้", item: "polo", qty: 80, price: 360 }] },
    { key: "i3", customer: "c3", status: "PARTIALLY_PAID", issueDaysAgo: 12, dueInDays: 18, paidFraction: 0.5, lines: [{ desc: "เสื้อโปโลปักโลโก้", item: "polo", qty: 60, price: 360 }] },
    { key: "i4", customer: "c4", status: "PAID", issueDaysAgo: 30, dueInDays: 0, paidFraction: 1, lines: [{ desc: "เสื้อยืดสกรีนลาย", item: "tee", qty: 100, price: 180 }] },
    { key: "i5", customer: "c1", status: "OVERDUE", issueDaysAgo: 60, dueInDays: -30, paidFraction: 0, lines: [{ desc: "เสื้อกีฬาพิมพ์ลาย (ทีม)", item: "jersey", qty: 50, price: 320 }] },
  ];
  const paymentRows: Array<typeof payment.$inferInsert> = [];
  await db
    .insert(invoice)
    .values(
      INVOICES.map((inv, idx) => {
        const t = priced(inv.lines);
        inv.lines.forEach((l, li) =>
          docLines.push({
            id: id(`line:${inv.key}:${li}`),
            tenantId,
            parentType: "INVOICE",
            parentId: id(`invoice:${inv.key}`),
            itemId: id(`item:${l.item}`),
            description: l.desc,
            qty: qty6(l.qty),
            unitPrice: money4(l.price),
            lineTotal: money4(l.qty * l.price),
          }),
        );
        const paid = Math.round(t.total * inv.paidFraction * 100) / 100;
        if (paid > 0) {
          const method: PaymentMethod = inv.status === "PAID" ? "TRANSFER" : "PROMPTPAY";
          paymentRows.push({
            id: id(`payment:${inv.key}`),
            tenantId,
            invoiceId: id(`invoice:${inv.key}`),
            method,
            amount: money4(paid),
            promptpayRef: method === "PROMPTPAY" ? `DEMO-${inv.key.toUpperCase()}` : null,
            paidAt: at(-3 * DAY),
          });
        }
        return {
          id: id(`invoice:${inv.key}`),
          tenantId,
          docNo: `INV${year}${String(idx + 1).padStart(4, "0")}`,
          customerId: id(`customer:${inv.customer}`),
          issueDate: dateOnly(at(-inv.issueDaysAgo * DAY)),
          dueDate: dateOnly(at(inv.dueInDays * DAY)),
          status: inv.status,
          subtotal: money4(t.subtotal),
          vatAmount: money4(t.vat),
          grandTotal: money4(t.total),
          amountPaid: money4(paid),
        };
      }),
    )
    .onConflictDoNothing();
  await db.insert(docLine).values(docLines).onConflictDoNothing();
  await db.insert(payment).values(paymentRows).onConflictDoNothing();

  // Advance the document counters past the numbers consumed above so the next document a guest
  // creates doesn't collide. `GREATEST` keeps a re-run (or a guest who already created more)
  // from moving a counter backwards.
  const consumed: Record<string, number> = {
    QUOTATION_VAT: QUOTES.length,
    INVOICE: INVOICES.length,
    WORK_ORDER: WORK_ORDERS.length,
    EMPLOYEE: EMPLOYEES.length,
  };
  for (const [key, value] of Object.entries(consumed)) {
    await db
      .update(documentSequence)
      .set({ currentValue: sql`GREATEST(${documentSequence.currentValue}, ${value})` })
      .where(and(eq(documentSequence.tenantId, tenantId), eq(documentSequence.key, key)));
  }

  return {
    customers: CUSTOMERS.length,
    items: ITEMS.length,
    workOrders: WORK_ORDERS.length,
    employees: EMPLOYEES.length,
    invoices: INVOICES.length,
  };
}
