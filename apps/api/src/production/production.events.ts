/**
 * M4 production domain-event names and payload shapes (design D6/D7). The module both
 * emits work-order / step / subcontract lifecycle events and pushes a subset of them over
 * Socket.IO to the `wo:{id}` and `timeline` rooms. `WorkOrderCompleted` is the cross-module
 * event M3's backflush consumes — its name and payload MUST match `inventory.events.ts`
 * (`WORK_ORDER_COMPLETED` / `WorkOrderCompletedPayload`), so a completed work order drives
 * exactly one idempotent backflush.
 */

export const PRODUCTION_EVENTS = {
  workOrderCreated: "production.work_order.created",
  workOrderStarted: "production.work_order.started",
  // Must equal `inventory.events.ts` WORK_ORDER_COMPLETED — the M3 backflush trigger.
  workOrderCompleted: "production.work_order.completed",
  stepStarted: "production.step.started",
  stepFinished: "production.step.finished",
  stepDelayed: "production.step.delayed",
  stepHeld: "production.step.held",
  defectRecorded: "production.defect.recorded",
  subcontractSent: "production.subcontract.sent",
  subcontractOverdue: "production.subcontract.overdue",
  subcontractReceived: "production.subcontract.received",
} as const;

/**
 * Socket.IO event names broadcast to the `wo:{id}` / `timeline` rooms (design D6). The
 * realtime channel carries the shop-floor-visible transitions; supervisors subscribe to a
 * work order's room (or the global `timeline`) to see steps move live.
 */
export const REALTIME_EVENTS = {
  stepStarted: "StepStarted",
  stepFinished: "StepFinished",
  stepDelayed: "StepDelayed",
} as const;

/** The room a single work order broadcasts to. `timeline` is the global Gantt room. */
export function woRoom(woId: string): string {
  return `wo:${woId}`;
}
export const TIMELINE_ROOM = "timeline";

/**
 * Payload of `WorkOrderCompleted` — matches `WorkOrderCompletedPayload` in
 * `inventory.events.ts`. `warehouse_id` is left empty by M4 (a work order has no warehouse);
 * the backflush consumer defaults it to the platform warehouse.
 */
export interface WorkOrderCompletedPayload {
  wo_id: string;
  finished_item_id: string;
  warehouse_id: string;
  qty_produced: string;
}

/** Payload common to the step realtime broadcasts. */
export interface StepEventPayload {
  wo_id: string;
  step_id: string;
  seq: number;
  name: string;
  status: string;
}

/** Payload of `SubcontractOverdue` (monitor sweep past `sla_due`). */
export interface SubcontractOverduePayload {
  subcontract_id: string;
  wo_step_id: string;
  vendor: string;
}
