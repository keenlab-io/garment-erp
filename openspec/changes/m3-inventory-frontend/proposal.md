# M3 — Inventory & Costing (Frontend)

## Why

Warehouse work is scan-heavy and happens on handhelds; the numbers must be trustworthy. M3
frontend delivers the **stock card** — the immutable, bank-statement-like ledger that is M3's
trust object — plus scan-first receive/issue flows that run in **Touch density** on a handheld,
and a landed-cost allocator that previews cost impact before posting. Cost figures are
permission-masked.

**UI-only** — consumes the `inventory` contract in `@erp/contracts` and the M0 foundation. This
module is where Touch density and the immutable-ledger pattern are proven (UX Part C).

## What Changes

- **Inventory module** routes (nav `▣ Inventory`): Items, Goods receipt, Goods issue, Stock
  count, Stock adjustment, Barcode printing, Reports.
- The **stock-card ledger** view, **scan-first** issue (Touch), **landed-cost allocator** wizard.
- Reuses M0 `DataTable`, `InkChip` (stock-health), `MaskedValue` (cost gating), `ConfirmDialog`,
  job-toast (barcode/label jobs). As the first scan/wizard consumer, M3 **promotes a shared
  `ScanField` and a `Wizard`/`Stepper` to `@erp/ui`** (M0 deferred both) for M4/M2 to reuse.

## Capabilities

New:
1. **item-catalog-ui** — items list + tabbed item detail (incl. stock card + BOM), cost masking.
2. **goods-receipt-ui** — receipt wizard with landed-cost allocation preview.
3. **goods-issue-ui** — scan-first issue (Touch), insufficient-stock inline.
4. **stock-count-adjustment-ui** — count grid + reconcile → adjustment (reason-gated, approve).
5. **inventory-reports-ui** — stock/valuation/low/dead reports + barcode printing.

## Impact

- **Affected code:** `apps/web` `inventory` routes/screens consuming the `inventory` contract;
  new `inventory` i18next namespace (TH+EN).
- **Depends on:** `m0-frontend-foundation` + backend `m3-inventory` contract.
- **No new dependencies.** Contract-only; no cross-app import.
