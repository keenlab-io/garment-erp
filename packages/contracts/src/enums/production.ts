// M4 — Production Tracking enums (spec §4.3). Work-order/step/subcontract state machines,
// the shop-floor scan action, and the routing-template product classification. Keep in sync
// with @erp/db/schema/enums.ts (parity is asserted by test).

// Work-order lifecycle (spec §4.3): PENDING -> IN_PROGRESS (first step START) -> COMPLETED
// (all steps COMPLETED) | CANCELLED. No backward transitions.
export const WorkOrderStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

// Work-order-step lifecycle (spec §4.3): PENDING -> IN_PROGRESS (scan START) -> COMPLETED
// (scan FINISH), with HOLD/DEFECT/OUTSOURCED side-branches back onto the line.
export const WorkOrderStepStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  HOLD: "HOLD",
  DEFECT: "DEFECT",
  OUTSOURCED: "OUTSOURCED",
} as const;
export type WorkOrderStepStatus =
  (typeof WorkOrderStepStatus)[keyof typeof WorkOrderStepStatus];

// Subcontract lifecycle (spec §4.3): SENT -> OVERDUE (monitor sweep, past sla_due) |
// RECEIVED (returns the step to the line).
export const SubcontractStatus = {
  SENT: "SENT",
  OVERDUE: "OVERDUE",
  RECEIVED: "RECEIVED",
} as const;
export type SubcontractStatus = (typeof SubcontractStatus)[keyof typeof SubcontractStatus];

// Shop-floor scan action (spec §4.6 `POST /wo-steps/{id}/scan`). START begins the step (and
// the work order, if first); FINISH completes it (409 if already COMPLETED).
export const ScanAction = {
  START: "START",
  FINISH: "FINISH",
} as const;
export type ScanAction = (typeof ScanAction)[keyof typeof ScanAction];

// Routing-template product classification (spec §4.2 `routing_template.product_type`).
export const ProductType = {
  SUBLIMATION: "SUBLIMATION",
  DTF: "DTF",
  DTG: "DTG",
  EMBROIDERY: "EMBROIDERY",
  SCREEN_PRINT: "SCREEN_PRINT",
  CUT_SEW: "CUT_SEW",
  OTHER: "OTHER",
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];
