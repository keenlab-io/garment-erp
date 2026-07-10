# M6 — Reporting & Analytics (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m6-reporting`. Built last. UI-only; consumes
> the `reporting` contract. Adds `recharts`.

## 1. Deps, routes & i18n

- [ ] 1.1 Add `recharts`; a token-themed chart wrapper (reads CSS vars, categorical palette from status inks + cyan/violet)
- [ ] 1.2 Register `reporting` routes with metadata + required `Permission` and **typed search
  params for filter state**: `/` (overview), `/reports/dashboards/{key}`, `/reports/{report_key}`,
  `/reports/schedules`
- [ ] 1.3 Add the `reporting` i18next namespace (TH+EN); nav + ⌘K from route metadata

## 2. Data layer

- [ ] 2.1 `reporting` query hooks (`/reports/{key}`, `/dashboards/{key}`, exports, schedules) +
  job-status polling for exports; filter state read/written via router search params

## 3. Module components

- [ ] 3.1 **KpiStatCard** (number + delta ▲/▼ + sparkline, cost/profit masked)
- [ ] 3.2 **ChartPanel** (recharts, token-themed, cross-filter aware)
- [ ] 3.3 **ActiveFilterChipRail**; **AlertsPanel** (unifies stock/production/finance); **ScheduleEditor** (cron-friendly)
- [ ] 3.4 **ReportDataTable** (columns/rows/totals + drill-down + export menu)

## 4. Screens / flows

- [ ] 4.1 `dashboards-ui` — overview + domain dashboards; cross-filtering + chip rail; alerts panel;
  cost/profit masking; shareable URL filter state; progressive load; mobile glance (MD1–MD3, MD6)
- [ ] 4.2 `report-viewer-ui` — tabular report + drill-down + async export (PDF/Excel/CSV) (MD4)
- [ ] 4.3 `report-schedules-ui` — schedule manager (cron-friendly), recipients, run-now, failure surfacing (MD5)

## 5. i18n, a11y & Storybook

- [ ] 5.1 TH+EN strings for `reporting`; BE/CE dates on periods
- [ ] 5.2 WCAG AA: deltas not color-only (▲/▼), chart aria/labels, masked KPI lock semantics
- [ ] 5.3 Stories: KpiStatCard, ChartPanel, ActiveFilterChipRail, AlertsPanel, ScheduleEditor at theme×density×locale

## 6. Verification

- [ ] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders; charts theme in light/dark
- [ ] 6.2 Cost/profit KPIs masked without `inventory.cost.view`; filter state survives URL share/reload
- [ ] 6.3 Drive: click a month → all panels re-filter + chip rail shows the slice → drill to report rows →
  export (job) → alerts panel shows stock/production/finance in one glance; schedule "Every Monday 08:00" + run-now
