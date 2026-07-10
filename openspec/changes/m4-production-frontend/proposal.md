# M4 — Production Tracking (Frontend)

## Why

M4 has two users on two devices: the production lead watching a **timeline** on a desktop, and
the floor operator scanning start/finish on a wall/handheld **tablet with gloves**. This is the
module that most needs the dual-mode (Comfortable ↔ Touch) design. The lead needs to spot delays
across a room; the operator needs exactly two actions and nothing else.

**UI-only** — consumes the `production` contract in `@erp/contracts`, subscribes to the backend
realtime gateway, and builds on the M0 foundation.

## What Changes

- **Production module** routes (nav `⚙ Production`): Timeline/Gantt, Work orders, Scan station
  (kiosk), WIP/bottleneck board, Subcontract tracker.
- The **Gantt command center** (realtime), the **two-giant-button scan kiosk** (Touch, offline
  queue), the WIP board and subcontract SLA tracker.
- **New dependency `socket.io-client`** to consume the `RealtimeGateway` rooms (`wo:{id}`,
  `timeline`). Introduces the **offline scan queue** (M0 deferred offline to M4).
- Reuses M0 `InkChip` (the production-status set — floor tiles are oversized chips), `DataTable`,
  `Drawer`, kiosk/Touch route flag.

## Capabilities

New:
1. **production-timeline-ui** — the Gantt command center + alert rail + step drawer, live.
2. **work-orders-ui** — WO list, detail (steps/mockup/defects/history), create-from-routing wizard.
3. **scan-station-kiosk** — the Touch kiosk scan UI with offline queue.
4. **wip-subcontract-ui** — WIP/bottleneck board + subcontract SLA tracker.

## Impact

- **Affected code:** `apps/web` `production` routes/screens consuming the `production` contract +
  a realtime client; new `production` i18next namespace (TH+EN).
- **New dependency:** `socket.io-client`.
- **Depends on:** `m0-frontend-foundation` + backend `m4-production` contract + `RealtimeGateway`.
- No `apps/web` ↔ `apps/api` import (contract + socket rooms only).
