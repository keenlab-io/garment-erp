# M3 — Inventory & Costing (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m3-inventory`. UI-only; consumes the
> `inventory` contract. Touch density auto-applies on scan routes; cost masking throughout.

## 1. Deps, routes & i18n

- [x] 1.1 Register `inventory` routes with metadata (kiosk/Touch flag on scan routes, required
  `Permission`): `/inventory/items(/{id})`, `/inventory/receipts(/{id})`, `/inventory/issues`,
  `/inventory/counts(/{id})`, `/inventory/adjustments`, `/inventory/barcodes`, `/inventory/reports`
- [x] 1.2 Add the `inventory` i18next namespace (TH+EN); nav + ⌘K from route metadata

## 2. Data layer

- [x] 2.1 `inventory` query/mutation hooks (items, SKUs, lots, stock card, receipts, issues,
  counts, adjustments, reports, barcode job) + invalidation; job-status polling for label jobs

## 3. Module components

> M3 is the first module (UX Part C order) to need a **scan field** and a **multi-step wizard**,
> which M0 deferred. It **promotes both to `@erp/ui`** as shared primitives so M4 (kiosk) and
> M2/M4 (wizards) reuse them rather than re-implementing — see MD6.

- [ ] 3.1 **StockCardLedger** table (running balance, immutable, cost columns masked)
- [ ] 3.2 **ScanField** — new shared `@erp/ui` primitive (persistent input, last-5 + undo, camera/HID,
  qty stepper); M3 owns it, M4 reuses it
- [ ] 3.3 **Wizard/Stepper** — new shared `@erp/ui` primitive (steps + per-step validation + review);
  M3 owns it (goods-receipt), M2 (payroll) and M4 (create-WO) reuse it
- [ ] 3.4 **LandedCostAllocator** (method selector + live per-line cost-impact preview)
- [ ] 3.5 **BomTreeEditor** (expand/collapse, roll-up cost preview); **UomDualDisplay**; **StockHealthChip**

## 4. Screens / flows

- [ ] 4.1 `item-catalog-ui` — items list (type chips, low-stock chip, bulk barcode/export) +
  tabbed item detail with stock card + BOM (MD1)
- [ ] 4.2 `goods-receipt-ui` — receipt wizard: lines → landed-cost allocator → confirm → post (MD3)
- [ ] 4.3 `goods-issue-ui` — scan-first Touch issue; 422 insufficient-stock inline with remaining qty (MD2)
- [ ] 4.4 `stock-count-adjustment-ui` — count grid + reconcile → adjustment (reason-gated, guarded approve) (MD4)
- [ ] 4.5 `inventory-reports-ui` — stock-card/valuation/low/dead reports (cost masked) + barcode printing (MD5)

## 5. i18n, a11y & Storybook

- [ ] 5.1 TH+EN strings for `inventory`; BE/CE dates on ledger rows
- [ ] 5.2 WCAG AA + Touch: ≥56px scan/issue targets, stock-health chips not color-only, masked cost lock semantics
- [ ] 5.3 Stories: StockCardLedger, ScanField, LandedCostAllocator, BomTreeEditor at theme×density×locale

## 6. Verification

- [ ] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders
- [ ] 6.2 Scan routes auto-apply Touch on coarse-pointer; cost columns masked without `inventory.cost.view`
- [ ] 6.3 Drive: receive (landed-cost preview per line → post) → issue by scan on a handheld
  (422 shows remaining qty) → stock card shows immutable running balance; adjustment blocked without a reason
