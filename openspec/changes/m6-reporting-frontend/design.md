# M6 — Reporting & Analytics (Frontend): Design

## Context

M6 frontend is the analytical layer — read-only, glanceable on mobile for the owner and drillable
on desktop for analysts. The signature is **cross-filtering**: one selection re-filters every
panel, always showing the active slice. Cost/profit figures are gated by `inventory.cost.view`.
`frontend only`, consuming the `reporting` contract. **Built last** (UX Part C) — it visualizes
data the other modules produce.

Sequenced **after `m0-frontend-foundation`** + backend `m6-reporting`.

## Shared frontend conventions (FD1–FD12)

M0 `@erp/ui` + tokens (FD1); typed `@ts-rest/react-query` (FD2); routes-as-metadata (FD3);
`InkChip` for alert chips (FD4); `MoneyCell` + **`MaskedValue` on cost/profit KPIs gated by
`inventory.cost.view`** (FD5); **job-toast** for report exports (FD7); `reporting` i18next
namespace + BE/CE dates (FD8); dashboards animate soft realtime/poll updates (FD9);
**`recharts` themed from tokens** — categorical palette from status inks + cyan/violet (FD10);
app isolation (FD12).

## Module decisions

### MD1. Cross-filtering with a visible active slice
Clicking a dimension anywhere (a month bar, a product slice) **re-filters every panel** of the
dashboard consistently; an **active-filter chip rail** above the panels always shows what's
applied (visibility of system status). Clicking a data point drills to the underlying report
rows. **Filter state is encoded in the URL** via TanStack Router search params, so a view is
shareable; Clear resets.

### MD2. KPI cards + interactive charts
KPI/stat cards show a big tabular number + delta (colored **with ▲/▼**, not color-only) +
sparkline. Charts are `recharts`, themed from tokens (never raw hex). **Cost/profit KPIs and
panels are `MaskedValue`** (lock + "requires cost access") without `inventory.cost.view`.

### MD3. Unified alerts panel
An alerts panel unifies **low-stock (M3), delays (M4), overdue (M5)** — the owner's single glance
— each an `InkChip`-tagged, actionable entry linking to the source record.

### MD4. Report viewer + async export
The report viewer renders `{ columns, rows, totals }` as a Data Table with drill-down and an
**export menu (PDF/Excel/CSV)** that runs as an async job (job-toast → notification with the
signed-URL file). Valuation/KPIs reconcile visibly with the underlying report on drill-down.

### MD5. Cron-friendly schedule manager
The schedules screen manages digest schedules with a **friendly cadence UI** ("Every Monday
08:00" ↔ cron), recipients, format, and a **[Run now]** preview-send; failures surface in the
notification center with retry.

### MD6. Progressive dashboard load; mobile glance
KPI skeletons first, then panels fill progressively (never block the whole page). Mobile = stacked
single-column, KPI cards first (the owner's glance).

## Risks / Trade-offs

- **Chart theming** — `recharts` must read token CSS variables, not hardcoded colors, so
  light/dark and the palette stay consistent.
- **Cross-filter correctness** — a single filter model must drive every panel; avoid per-panel
  drift (the acceptance criterion).
- **Masking** — cost/profit gating is display-only; the backend omits gated aggregates.

## Sequencing

After `m0-frontend-foundation` + backend `m6-reporting`. Last in the UX Part C order.

## Open Questions

- Realtime vs poll for dashboard freshness (poll acceptable given MV refresh cadence).
- Chart interaction depth (brush/zoom) beyond cross-filter — deferred.
