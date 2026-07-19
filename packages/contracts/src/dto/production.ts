import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { qtyString } from "../money/index.js";
import {
  ProductType,
  ScanAction,
  SubcontractStatus,
  WorkOrderStatus,
  WorkOrderStepStatus,
} from "../enums/index.js";
import { API_PREFIX, paginated, paginationQuery, uuid, withErrors } from "./_shared.js";

/**
 * M4 — Production Tracking contract (spec §4, plan `docs/plans/M4-production.md` §1). Router
 * `productionContract` covers routing templates & steps, work orders (auto `wo_no`, snapshot
 * step materialization, detail, timeline/Gantt feed), shop-floor scanning (start/finish, hold,
 * defects), subcontracting with SLA, and the WIP/bottleneck report. Quantities cross the wire
 * as decimal **strings** (`qtyString`), never floats. Every endpoint authorizes in-handler via
 * `assertPermissions(user, "production...")` (see M0 ts-rest note).
 */

const c = initContract();

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const productType = z.nativeEnum(ProductType);
export const workOrderStatus = z.nativeEnum(WorkOrderStatus);
export const workOrderStepStatus = z.nativeEnum(WorkOrderStepStatus);
export const subcontractStatus = z.nativeEnum(SubcontractStatus);
export const scanAction = z.nativeEnum(ScanAction);

// ── Routing templates ─────────────────────────────────────────────────────────

export const RoutingStepInput = z.object({
  seq: z.number().int().positive(),
  name: z.string().min(1),
  standard_time_min: z.number().int().nonnegative(),
  department_id: uuid.optional(),
});
export type RoutingStepInput = z.infer<typeof RoutingStepInput>;

export const RoutingStep = z.object({
  id: uuid,
  template_id: uuid,
  seq: z.number().int().positive(),
  name: z.string(),
  standard_time_min: z.number().int().nonnegative(),
  department_id: uuid.nullable(),
});
export type RoutingStep = z.infer<typeof RoutingStep>;

export const RoutingTemplate = z.object({
  id: uuid,
  name: z.string(),
  product_type: productType.nullable(),
  is_active: z.boolean(),
  steps: z.array(RoutingStep),
});
export type RoutingTemplate = z.infer<typeof RoutingTemplate>;

/** Steps must carry distinct `seq` values — enforced by the unique `(template_id, seq)`. */
export const CreateRoutingTemplateRequest = z.object({
  name: z.string().min(1),
  product_type: productType.optional(),
  steps: z.array(RoutingStepInput).min(1),
});
export type CreateRoutingTemplateRequest = z.infer<typeof CreateRoutingTemplateRequest>;

// ── Work orders ───────────────────────────────────────────────────────────────

/** A materialized step — snapshotted from the routing step at work-order creation. */
export const WorkOrderStep = z.object({
  id: uuid,
  wo_id: uuid,
  routing_step_id: uuid,
  seq: z.number().int().positive(),
  name: z.string(),
  status: workOrderStepStatus,
  standard_time_min: z.number().int().nonnegative(),
  started_at: z.string().datetime().nullable(),
  finished_at: z.string().datetime().nullable(),
  assigned_to: uuid.nullable(),
  machine: z.string().nullable(),
  /** Computed on read — elapsed time (to `finished_at`, or now if running) > `standard_time_min`. */
  is_delayed: z.boolean(),
});
export type WorkOrderStep = z.infer<typeof WorkOrderStep>;

export const Defect = z.object({
  id: uuid,
  wo_step_id: uuid,
  type: z.string(),
  qty: qtyString,
  note: z.string().nullable(),
});
export type Defect = z.infer<typeof Defect>;

export const WorkOrder = z.object({
  id: uuid,
  wo_no: z.string(),
  customer_id: uuid.nullable(),
  finished_item_id: uuid,
  qty: qtyString,
  due_date: z.string().nullable(), // ISO date (YYYY-MM-DD)
  routing_template_id: uuid,
  machine: z.string().nullable(),
  mockup_file_key: z.string().nullable(),
  status: workOrderStatus,
  version: z.number().int().nonnegative(),
});
export type WorkOrder = z.infer<typeof WorkOrder>;

export const CreateWorkOrderRequest = z.object({
  customer_id: uuid.optional(),
  finished_item_id: uuid,
  qty: qtyString,
  due_date: z.string().optional(), // ISO date (YYYY-MM-DD)
  routing_template_id: uuid,
  machine: z.string().optional(),
  mockup_file_key: z.string().optional(),
});
export type CreateWorkOrderRequest = z.infer<typeof CreateWorkOrderRequest>;

/** `GET /work-orders/{id}` detail — the work order plus its materialized steps and defects. */
export const WorkOrderDetail = z.object({
  work_order: WorkOrder,
  steps: z.array(WorkOrderStep),
  defects: z.array(Defect),
});
export type WorkOrderDetail = z.infer<typeof WorkOrderDetail>;

export const WorkOrderTimelineQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: workOrderStatus.optional(),
});
export type WorkOrderTimelineQuery = z.infer<typeof WorkOrderTimelineQuery>;

/** One work order's Gantt row — its materialized steps with `is_delayed` computed on read. */
export const WorkOrderTimelineEntry = z.object({
  id: uuid,
  wo_no: z.string(),
  customer_id: uuid.nullable(),
  due_date: z.string().nullable(), // ISO date (YYYY-MM-DD)
  status: workOrderStatus,
  steps: z.array(WorkOrderStep),
});
export type WorkOrderTimelineEntry = z.infer<typeof WorkOrderTimelineEntry>;

// ── Shop-floor scanning ───────────────────────────────────────────────────────

export const ScanRequest = z.object({
  action: scanAction,
});
export type ScanRequest = z.infer<typeof ScanRequest>;

export const HoldRequest = z.object({
  reason: z.string().min(1),
});
export type HoldRequest = z.infer<typeof HoldRequest>;

export const RecordDefectRequest = z.object({
  type: z.string().min(1),
  qty: qtyString,
  note: z.string().optional(),
});
export type RecordDefectRequest = z.infer<typeof RecordDefectRequest>;

// ── Subcontracting ────────────────────────────────────────────────────────────

export const Subcontract = z.object({
  id: uuid,
  wo_step_id: uuid,
  vendor: z.string(),
  sla_due: z.string().datetime().nullable(),
  status: subcontractStatus,
});
export type Subcontract = z.infer<typeof Subcontract>;

export const SubcontractRequest = z.object({
  vendor: z.string().min(1),
  sla_due: z.string().datetime(),
});
export type SubcontractRequest = z.infer<typeof SubcontractRequest>;

/** A subcontract row for the SLA tracker (M4 §4.4), with its work order/step joined in for display —
 * the bare `Subcontract` DTO only carries `wo_step_id`, which isn't enough to label a tracker row. */
export const SubcontractWithContext = Subcontract.extend({
  wo_no: z.string(),
  step_name: z.string(),
});
export type SubcontractWithContext = z.infer<typeof SubcontractWithContext>;

export const ListSubcontractsQuery = paginationQuery.extend({
  status: subcontractStatus.optional(),
});
export type ListSubcontractsQuery = z.infer<typeof ListSubcontractsQuery>;

// ── Reports ───────────────────────────────────────────────────────────────────

/** One department's WIP row — bottleneck view over in-progress and delayed steps. */
export const WipReportRow = z.object({
  department_id: uuid,
  in_progress_count: z.number().int().nonnegative(),
  delayed_count: z.number().int().nonnegative(),
});
export type WipReportRow = z.infer<typeof WipReportRow>;

// ── Router ────────────────────────────────────────────────────────────────────

export const productionContract = c.router(
  {
    // Routing templates (production.wo.manage)
    listRoutingTemplates: {
      method: "GET",
      path: "/routing-templates",
      query: paginationQuery,
      responses: withErrors({ 200: paginated(RoutingTemplate) }),
      summary: "List routing templates (paginated)",
    },
    createRoutingTemplate: {
      method: "POST",
      path: "/routing-templates",
      body: CreateRoutingTemplateRequest,
      responses: withErrors({ 201: z.object({ template: RoutingTemplate }) }),
      summary: "Create a routing template with its ordered steps",
    },

    // Work orders (production.wo.manage)
    createWorkOrder: {
      method: "POST",
      path: "/work-orders",
      body: CreateWorkOrderRequest,
      responses: withErrors({ 201: z.object({ work_order: WorkOrder }) }),
      summary: "Create a work order (auto wo_no; materializes template steps)",
    },
    getWorkOrder: {
      method: "GET",
      path: "/work-orders/:id",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: WorkOrderDetail }),
      summary: "Get a work order with its materialized steps and defects",
    },
    workOrderTimeline: {
      method: "GET",
      path: "/work-orders/timeline",
      query: WorkOrderTimelineQuery,
      responses: withErrors({ 200: z.object({ data: z.array(WorkOrderTimelineEntry) }) }),
      summary: "Timeline/Gantt feed — work orders with steps and computed is_delayed",
    },

    // Shop-floor scanning (production.scan)
    scanWoStep: {
      method: "POST",
      path: "/wo-steps/:id/scan",
      pathParams: z.object({ id: uuid }),
      body: ScanRequest,
      responses: withErrors({ 200: z.object({ step: WorkOrderStep }) }),
      summary: "Scan a step START/FINISH (409 re-FINISH on a COMPLETED step)",
    },
    holdWoStep: {
      method: "POST",
      path: "/wo-steps/:id/hold",
      pathParams: z.object({ id: uuid }),
      body: HoldRequest,
      responses: withErrors({ 200: z.object({ step: WorkOrderStep }) }),
      summary: "Put a step on hold with a reason",
    },
    recordDefect: {
      method: "POST",
      path: "/wo-steps/:id/defects",
      pathParams: z.object({ id: uuid }),
      body: RecordDefectRequest,
      responses: withErrors({ 201: z.object({ defect: Defect }) }),
      summary: "Record a defect against a step",
    },

    // Subcontracting (production.subcontract.manage)
    subcontractWoStep: {
      method: "POST",
      path: "/wo-steps/:id/subcontract",
      pathParams: z.object({ id: uuid }),
      body: SubcontractRequest,
      responses: withErrors({ 201: z.object({ subcontract: Subcontract }) }),
      summary: "Send a step to a subcontractor (step -> OUTSOURCED, subcontract SENT)",
    },
    receiveSubcontract: {
      method: "POST",
      path: "/subcontracts/:id/receive",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ subcontract: Subcontract }) }),
      summary: "Receive a subcontracted step back onto the line",
    },
    listSubcontracts: {
      method: "GET",
      path: "/subcontracts",
      query: ListSubcontractsQuery,
      responses: withErrors({ 200: paginated(SubcontractWithContext) }),
      summary: "List subcontracts (paginated), optionally filtered by status — SLA tracker feed",
    },

    // Reports
    wipReport: {
      method: "GET",
      path: "/reports/wip",
      responses: withErrors({ 200: z.object({ rows: z.array(WipReportRow) }) }),
      summary: "WIP/bottleneck report — in-progress and delayed step counts per department",
    },
  },
  { pathPrefix: API_PREFIX },
);
