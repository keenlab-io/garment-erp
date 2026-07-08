# M4 — Production Tracking (Frontend): Design

## Context

M4 frontend is the dual-mode module: a desktop **Gantt timeline** command center for the lead
and a **full-screen kiosk** for the operator. Status is the visual language here — the production
`InkChip` set (color + glyph + label) must read across a room, and the floor tiles are just
oversized chips. `frontend only`, consuming the `production` contract + the realtime gateway.

Sequenced **after `m0-frontend-foundation`** + backend `m4-production`.

## Shared frontend conventions (FD1–FD12)

M0 `@erp/ui` + tokens (FD1); typed `@ts-rest/react-query` (FD2); routes-as-metadata (FD3);
**production `InkChip` set everywhere** — dots, tiles, bars (FD4); guarded actions where relevant
(FD6); job-toast where async (FD7); `production` i18next namespace + BE/CE dates (FD8);
**realtime via `socket.io-client`** on the `wo:{id}`/`timeline` rooms (FD9); **kiosk route flag →
Touch density auto + offline scan queue** (FD11); app isolation (FD12).

## Module decisions

### MD1. Gantt timeline command center (realtime)
Rows = work orders, bars = steps color-coded by the production-status `InkChip` set (color + dot
shape + label — legible without color). An **alert rail** lists delayed steps / overdue SLAs; a
delayed step pulses. Clicking a bar opens a **step drawer** (assigned worker, machine, elapsed vs
standard, defects → reassign / hold / subcontract / message). Floor scans update bars **live**
via the `timeline` room with a soft in-animation. Mobile = read-only list.

### MD2. Scan station kiosk (Touch, two actions)
Locked to the kiosk route → Touch density, **no nav/menus/free-text** — a frame around two
actions. Auto-focused scan field reads the routing-traveler card → shows the WO card (customer,
item, qty, THIS step, mockup thumb, elapsed) → **two giant buttons [▶ START] / [■ FINISH]** with
only the valid one enabled → tap flashes confirmation and auto-returns to the scan field. Defect
path: a large **tile picker** (Misprint/Bad stitch/…) + qty stepper. The **status edge color** of
the card fills so a passing supervisor reads state across the room.

### MD3. Offline scan queue (M4 owns offline)
When offline, the kiosk shows an **offline banner + queued-scan count**, stores scans locally, and
**syncs on reconnect** with a sync badge — the operator keeps working. This is the offline
capability M0 deferred to M4.

### MD4. WIP board + subcontract SLA
A by-department **bottleneck board** shows backlog columns; the subcontract tracker shows an
**SLA countdown chip** that flips to a danger chip + alert when overdue.

## Risks / Trade-offs

- **Realtime reconnection** — the socket client must resubscribe to rooms and reconcile missed
  events on reconnect (and the timeline must not double-apply).
- **Offline queue integrity** — locally queued scans must be idempotent on replay (dedupe by a
  client scan id) so a reconnect doesn't double-post.
- **Kiosk lockdown** — the kiosk route suppresses nav/hover affordances and cannot be manually
  switched out of Touch.

## Sequencing

After `m0-frontend-foundation` + backend `m4-production`. Reuses the status tokens and scan-field
groundwork proven in M3.

## Open Questions

- Camera vs HID scanner on the tablet (support both via the scan-field primitive).
- Offline persistence store (IndexedDB) and the conflict policy on reconnect.
