import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkOrderStep, WorkOrderStepStatus } from "@erp/contracts";
import { api } from "../api/client.js";
import { realtimeClient, type RealtimeRoom } from "../realtime/realtime-client.js";
import { productionKeys } from "./queries.js";

/**
 * Step realtime event names the `wo:{id}`/`timeline` rooms broadcast (M4 §2.2, design FD9) —
 * must match `apps/api/src/production/production.events.ts`'s `REALTIME_EVENTS`. Web never
 * imports from `apps/api` (boundary rule), so these are re-declared, not shared.
 */
const STEP_REALTIME_EVENTS = ["StepStarted", "StepFinished", "StepDelayed"] as const;
type StepRealtimeEvent = (typeof STEP_REALTIME_EVENTS)[number];

/** How long a step stays flagged as "just changed" for a caller's soft in-animation. */
const PULSE_DURATION_MS = 1500;

/** Matches `apps/api`'s `StepEventPayload` — a partial step transition, not the full row. */
interface StepEventPayload {
  wo_id: string;
  step_id: string;
  seq: number;
  name: string;
  status: WorkOrderStepStatus;
}

function isStepEventPayload(value: unknown): value is StepEventPayload {
  const v = value as Partial<StepEventPayload> | null | undefined;
  return (
    !!v &&
    typeof v.wo_id === "string" &&
    typeof v.step_id === "string" &&
    typeof v.seq === "number" &&
    typeof v.name === "string" &&
    typeof v.status === "string"
  );
}

/**
 * Applies one step-event payload onto a cached step (pure — same event applied twice yields the
 * same result, so replays/duplicate deliveries are idempotent, design "Risks/Trade-offs"). The
 * payload carries only `seq`/`name`/`status`, so `is_delayed` is only ever flipped by the events
 * that can prove it: `StepStarted` clears it (a step can't be delayed the instant it begins),
 * `StepDelayed` sets it; `StepFinished` leaves it as last known (a full refetch reconciles it).
 */
function patchStep(step: WorkOrderStep, event: StepRealtimeEvent, payload: StepEventPayload): WorkOrderStep {
  if (step.id !== payload.step_id) return step;
  return {
    ...step,
    seq: payload.seq,
    name: payload.name,
    status: event === "StepDelayed" ? step.status : payload.status,
    is_delayed: event === "StepDelayed" ? true : event === "StepStarted" ? false : step.is_delayed,
  };
}

/** Merges a step-event payload into every cached timeline page and the matching WO detail. */
function applyStepEvent(queryClient: QueryClient, event: StepRealtimeEvent, payload: StepEventPayload): void {
  for (const [queryKey] of queryClient.getQueriesData({ queryKey: productionKeys.timelineAll() })) {
    api.production.workOrderTimeline.setQueryData(queryClient, queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        body: {
          ...old.body,
          data: old.body.data.map((entry) =>
            entry.id === payload.wo_id
              ? { ...entry, steps: entry.steps.map((step) => patchStep(step, event, payload)) }
              : entry,
          ),
        },
      };
    });
  }

  api.production.getWorkOrder.setQueryData(
    queryClient,
    productionKeys.workOrder(payload.wo_id),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        body: { ...old.body, steps: old.body.steps.map((step) => patchStep(step, event, payload)) },
      };
    },
  );
}

/**
 * Joins a realtime room for the component's lifetime and merges `StepStarted`/`StepFinished`/
 * `StepDelayed` broadcasts into the timeline/work-order-detail query cache (M4 §2.2). Returns the
 * set of step ids that just changed, cleared after `PULSE_DURATION_MS`, so a caller (the Gantt
 * bar / step drawer, M4 §3) can apply a soft in-animation without owning any socket logic itself.
 */
export function useProductionRealtimeSync(room: RealtimeRoom): { pulsingStepIds: ReadonlySet<string> } {
  const queryClient = useQueryClient();
  const [pulsingStepIds, setPulsingStepIds] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    realtimeClient.joinRoom(room);
    return () => realtimeClient.leaveRoom(room);
  }, [room]);

  React.useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    function pulse(stepId: string): void {
      setPulsingStepIds((prev) => (prev.has(stepId) ? prev : new Set(prev).add(stepId)));
      clearTimeout(timers.get(stepId));
      timers.set(
        stepId,
        setTimeout(() => {
          timers.delete(stepId);
          setPulsingStepIds((prev) => {
            if (!prev.has(stepId)) return prev;
            const next = new Set(prev);
            next.delete(stepId);
            return next;
          });
        }, PULSE_DURATION_MS),
      );
    }

    const bindings = STEP_REALTIME_EVENTS.map((event) => {
      const handler = (payload: unknown): void => {
        if (!isStepEventPayload(payload)) return;
        applyStepEvent(queryClient, event, payload);
        pulse(payload.step_id);
      };
      realtimeClient.on(event, handler);
      return { event, handler };
    });

    return () => {
      for (const { event, handler } of bindings) realtimeClient.off(event, handler);
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [queryClient]);

  return { pulsingStepIds };
}
