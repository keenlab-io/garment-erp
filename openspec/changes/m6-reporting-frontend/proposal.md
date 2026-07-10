# M6 — Reporting & Analytics (Frontend)

## Why

M6 frontend is the read-only lens the Owner glances at daily and analysts drill into weekly. Its
signature is **cross-filtering** — clicking any dimension re-filters every panel consistently,
with an active-filter chip rail so the current slice is always visible. It unifies the alerts the
other modules produce (low-stock, delays, overdue) into the owner's single glance. Charts land
here (M0 deferred the charting dependency to M6).

**UI-only** — consumes the `reporting` contract in `@erp/contracts` and the M0 foundation.

## What Changes

- **Reports module + Dashboard landing** routes (nav `⌂ Dashboard`, `▤ Reports`): Overview
  dashboard, domain dashboards, report viewer, schedules.
- **Cross-filtering** with an active-filter chip rail, an alerts panel, cost/profit KPI masking,
  a report viewer with async export, and a cron-friendly schedule editor.
- **New dependency `recharts`** (themed from tokens) for KPI sparklines + chart panels.
- Uses **TanStack Router search params** for shareable URL filter state (the reason that router
  was chosen in M0). Reuses M0 `DataTable`, `MaskedValue`, job-toast.

## Capabilities

New:
1. **dashboards-ui** — overview + domain dashboards, KPI cards, cross-filtering, alerts, masking.
2. **report-viewer-ui** — tabular report + drill-down + async export.
3. **report-schedules-ui** — cron-friendly digest schedule manager.

## Impact

- **Affected code:** `apps/web` `reporting` routes/screens consuming the `reporting` contract;
  new `reporting` i18next namespace (TH+EN).
- **New dependency:** `recharts` (charts themed from tokens).
- **Depends on:** `m0-frontend-foundation` + backend `m6-reporting` contract. Built last (reads
  data the other modules produce). Contract-only; no cross-app import.
