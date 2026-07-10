# M3 — Inventory & Costing (Frontend): Design

## Context

M3 frontend serves warehouse staff on desktop + handheld. Its signature is the **item detail /
stock card** — an immutable running-balance ledger that reads like a bank statement, the trust
object of the whole module. Receive/issue are scan-first and auto-apply Touch density on
handhelds. Cost/valuation figures are gated by `inventory.cost.view`. `frontend only`, consuming
the `inventory` contract.

Sequenced **after `m0-frontend-foundation`** + backend `m3-inventory`. Per UX Part C this is the
module that proves Touch density and the immutable-ledger pattern.

## Shared frontend conventions (FD1–FD12)

M0 `@erp/ui` + tokens (FD1); typed `@ts-rest/react-query` (FD2); routes-as-metadata (FD3);
`InkChip` for stock-health chips (FD4); `MoneyCell`/`QtyCell` + `MaskedValue` on cost gated by
`inventory.cost.view` (FD5); guarded `ConfirmDialog` for stock adjustment (FD6); job-toast for
barcode/label PDF jobs (FD7); `inventory` i18next namespace + BE/CE dates (FD8);
**kiosk/Touch auto-apply on scan routes** via route metadata + coarse-pointer detection (FD11);
app isolation (FD12).

## Module decisions

### MD1. Stock card reads as an immutable ledger
The stock card renders `stock_movement` rows with a **running balance** (Date · Ref · In · Out ·
Balance · Unit cost), append-only and visually immutable — no row actions, no edits. Corrections
appear only as **new compensating rows**, never edits. Cost/unit-cost columns are `MaskedValue`
without `inventory.cost.view`; on-hand stays visible. Item detail is tabbed (Overview · SKUs ·
Lots · Stock Card · BOM), with a **BOM tree editor** (expand/collapse, roll-up cost preview).

### MD2. Scan-first goods issue (Touch)
The issue screen (Touch density on handhelds) is a **persistent scan field** loop: scan
item/lot → qty stepper → repeat, with the last 5 scans listed and undo. Post writes ledger OUT;
**insufficient stock returns 422 shown inline with the exact remaining qty** ("only 12 m left").
Minimal chrome, large targets.

### MD3. Goods receipt with landed-cost allocator
The receipt wizard adds lines (scan or search) with receiving-UOM qty + unit price (echoing item
name + running line total and **dual UOM** "1 roll = 50 m"), then a **landed-cost step** where
freight/import total + allocation method (value/weight/qty) drives a **live per-line cost-impact
preview** before confirm → post (creates lots, ledger IN, lot-barcode label job).

### MD4. Reason-gated stock adjustment
Adjustment create requires a **reason** (submit blocked with a field error otherwise); approval
uses the guarded `ConfirmDialog`. Counts lock items "for counting" with an explanatory badge that
disables movement.

### MD5. Reports + barcode printing
Stock-card / valuation / low-stock / dead-stock reads (cost columns masked). Items list carries a
**low-stock health chip** and bulk barcode printing (a label job → job-toast).

### MD6. M3 owns the shared `ScanField` and `Wizard`/`Stepper`
M0 built the foundation subset but deferred the **scan field** and a **multi-step wizard** to the
modules. M3 is the first consumer of both in the UX Part C build order (goods-issue needs the scan
field; goods-receipt needs the wizard), so M3 **promotes both to `@erp/ui`** as shared primitives
— `ScanField` (persistent input, last-5 + undo, camera/HID, qty stepper) and `Wizard`/`Stepper`
(steps + per-step validation + review). **M4** reuses `ScanField` (kiosk) and `Wizard` (create-WO);
**M2** reuses `Wizard` (payroll run). This avoids three divergent scan fields / steppers.

## Risks / Trade-offs

- **Handheld scanners** emit keystrokes + Enter — the scan field must debounce and not lose focus.
- **Cost masking is display-only** — the backend omits cost when `inventory.cost.view` is absent.
- **Ledger immutability is a UI contract too** — never expose edit affordances on movement rows.

## Sequencing

After `m0-frontend-foundation` + backend `m3-inventory`. Second in the UX Part C order (proves
Touch + ledger).

## Open Questions

- Barcode scanner input mode (HID keystroke vs camera) — support both via the scan-field primitive.
- Whether stock-count grid edits autosave or batch-submit on reconcile.
