# M4 — Production Tracking (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m4-production`. UI-only; consumes the
> `production` contract + realtime rooms. Adds `socket.io-client`.

## 1. Deps, routes & i18n

- [x] 1.1 Add `socket.io-client`; a realtime client that joins the `wo:{id}` / `timeline` rooms
  (JWT handshake) and resubscribes on reconnect
- [x] 1.2 Register `production` routes with metadata (kiosk flag on the scan route → Touch,
  required `Permission`): `/production/timeline`, `/production/work-orders(/{id})`,
  `/production/scan`, `/production/wip`, `/production/subcontracts`
- [x] 1.3 Add the `production` i18next namespace (TH+EN); nav + ⌘K from route metadata

## 2. Data layer

- [x] 2.1 `production` query/mutation hooks (routing templates, work orders, timeline feed,
  wo-steps scan/hold/defects/subcontract, wip, subcontracts) + invalidation
- [x] 2.2 Realtime event handlers (`StepStarted`/`StepFinished`/`StepDelayed`) merging into the
  timeline/query cache with soft animation (idempotent apply)

## 3. Module components

- [x] 3.1 **GanttTimelineRow** (interactive bars, production-status dots) + **AlertRail**
- [x] 3.2 **StepDrawer** (assigned/machine/elapsed vs standard/defects → reassign/hold/subcontract)
- [x] 3.3 **KioskCard** (WO card + two giant START/FINISH buttons + status edge color), using the
  shared `@erp/ui` **ScanField** (from M3) for the routing-card scan; create-WO wizard uses the shared **Wizard/Stepper** (from M3)
- [x] 3.4 **DefectTilePicker** + qty stepper; **SubcontractSlaChip** (countdown); **OfflineScanQueue** (local store + sync badge)

## 4. Screens / flows

- [x] 4.1 `production-timeline-ui` — Gantt command center + alert rail + step drawer, live updates,
  mobile read-only list (MD1)
- [x] 4.2 `work-orders-ui` — WO list, WO detail (steps/mockup viewer/defect log/history), create-from-routing wizard
- [x] 4.3 `scan-station-kiosk` — Touch kiosk: scan → WO card → START/FINISH → defect tiles; offline queue + sync (MD2, MD3)
- [x] 4.4 `wip-subcontract-ui` — by-department bottleneck board + subcontract SLA tracker (MD4)

## 5. i18n, a11y & Storybook

- [x] 5.1 TH+EN strings for `production`; BE/CE dates on due/timeline
- [x] 5.2 WCAG AA + Touch: status by shape+label (not color), ≥56px kiosk buttons, gloved-hand targets,
  live-region announces delays
- [x] 5.3 Stories: GanttTimelineRow, KioskCard, StepDrawer, SubcontractSlaChip at theme×density×locale (incl. Touch)

## 6. Verification

- [ ] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders
- [ ] 6.2 Scan route locks to Touch, no nav; timeline updates within seconds of a floor scan (realtime)
- [ ] 6.3 Drive: scan START on a step (kiosk) → timeline bar advances live on the lead's screen →
  exceed standard → step pulses + appears in the alert rail; go offline → scans queue + sync badge → reconnect syncs
