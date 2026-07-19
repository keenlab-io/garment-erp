import * as React from "react";
import { useTranslation } from "react-i18next";
import type { WorkOrderStep, WorkOrderTimelineEntry } from "@erp/contracts";
import { InkChip, Skeleton, useToast } from "@erp/ui";
import {
  useHoldWoStepMutation,
  useSubcontractWoStepMutation,
  useWorkOrderTimelineQuery,
} from "../../../production/queries.js";
import { useProductionRealtimeSync } from "../../../production/realtime.js";
import { workOrderStepStatusToChip } from "../../../production/chip-status.js";
import { AlertRail, deriveDelayedStepAlerts } from "../../../production/components/alert-rail.js";
import { GanttTimelineRow } from "../../../production/components/gantt-timeline-row.js";
import { StepDrawer } from "../../../production/components/step-drawer.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";

/** The step a passing lead cares about most: running first, else the next one up. */
function currentStepOf(entry: WorkOrderTimelineEntry): WorkOrderStep | undefined {
  return (
    entry.steps.find((s) => s.status === "IN_PROGRESS") ??
    entry.steps.find((s) => s.status === "PENDING") ??
    entry.steps[entry.steps.length - 1]
  );
}

/**
 * The Gantt command center (M4 §4.1, design MD1): alert rail + one interactive row per work
 * order on desktop, live via `useProductionRealtimeSync`'s `timeline` room; mobile collapses to a
 * read-only list (bars need width to read, so the mobile list trades the Gantt view for a plain
 * current-step readout rather than squeezing it).
 */
export function ProductionTimelinePage() {
  const { t } = useTranslation("production");
  const { toast } = useToast();
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const timeline = useWorkOrderTimelineQuery();
  const { pulsingStepIds } = useProductionRealtimeSync("timeline");
  const holdStep = useHoldWoStepMutation();
  const subcontractStep = useSubcontractWoStepMutation();

  const [drawerEntry, setDrawerEntry] = React.useState<WorkOrderTimelineEntry | null>(null);
  const [drawerStep, setDrawerStep] = React.useState<WorkOrderStep | null>(null);

  const entries = timeline.data?.body.data ?? [];

  const alerts = React.useMemo(
    () =>
      deriveDelayedStepAlerts(entries, (step) =>
        t("timeline.alertDetail", { step: step.name, standard: step.standard_time_min }),
      ).map((alert) => ({
        ...alert,
        onClick: () => {
          const entry = entries.find((e) => e.steps.some((s) => s.id === alert.id));
          const step = entry?.steps.find((s) => s.id === alert.id);
          if (entry && step) {
            setDrawerEntry(entry);
            setDrawerStep(step);
          }
        },
      })),
    [entries, t],
  );

  function openStep(step: WorkOrderStep, entry: WorkOrderTimelineEntry) {
    setDrawerEntry(entry);
    setDrawerStep(step);
  }

  async function handleHold(reason: string) {
    if (!drawerStep) return;
    await holdStep.mutateAsync({ params: { id: drawerStep.id }, body: { reason } });
    toast({ tone: "success", title: t("timeline.stepHeld") });
  }

  async function handleSubcontract(vendor: string, slaDue: string) {
    if (!drawerStep) return;
    await subcontractStep.mutateAsync({ params: { id: drawerStep.id }, body: { vendor, sla_due: slaDue } });
    toast({ tone: "success", title: t("timeline.stepSubcontracted") });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("timeline.title")}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-3">
          {timeline.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : timeline.isError ? (
            <p className="text-sm text-danger">{t("timeline.loadError")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-text-muted">{t("timeline.empty")}</p>
          ) : (
            <>
              {/* Desktop/tablet: interactive Gantt rows. */}
              <div className="hidden flex-col rounded-lg border border-border bg-bg-surface p-4 shadow-sm md:flex">
                {entries.map((entry) => (
                  <GanttTimelineRow
                    key={entry.id}
                    entry={entry}
                    pulsingStepIds={pulsingStepIds}
                    onStepClick={openStep}
                    formatDueDate={(iso) => dateFormat.format(new Date(iso))}
                    labels={{ dueLabel: t("timeline.dueLabel"), emptySteps: t("timeline.emptySteps") }}
                  />
                ))}
              </div>

              {/* Mobile: read-only list, design MD1's "mobile = read-only list". */}
              <ul className="flex flex-col gap-2 md:hidden">
                {entries.map((entry) => {
                  const step = currentStepOf(entry);
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-surface px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-mono text-sm text-text-link">{entry.wo_no}</span>
                        <span className="truncate text-sm text-text-secondary">{step?.name ?? t("timeline.emptySteps")}</span>
                      </div>
                      {step && <InkChip status={workOrderStepStatusToChip(step.status, step.is_delayed)} />}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <AlertRail alerts={alerts} labels={{ title: t("timeline.alertsTitle"), empty: t("timeline.alertsEmpty") }} />
      </div>

      {drawerStep && drawerEntry && (
        <StepDrawer
          open={Boolean(drawerStep)}
          onOpenChange={(open) => {
            if (!open) {
              setDrawerStep(null);
              setDrawerEntry(null);
            }
          }}
          woNo={drawerEntry.wo_no}
          step={drawerStep}
          // The timeline feed carries steps, not defects (that's `WorkOrderDetail`'s field) —
          // the work-order detail screen is where a step's actual defect log renders.
          defects={[]}
          onHold={handleHold}
          onSubcontract={handleSubcontract}
          labels={{
            assigned: t("stepDrawer.assigned"),
            unassigned: t("stepDrawer.unassigned"),
            machine: t("stepDrawer.machine"),
            noMachine: t("stepDrawer.noMachine"),
            elapsed: t("stepDrawer.elapsed"),
            standard: t("stepDrawer.standard"),
            notStarted: t("stepDrawer.notStarted"),
            minutes: t("stepDrawer.minutes"),
            defects: t("stepDrawer.defects"),
            noDefects: t("stepDrawer.noDefects"),
            hold: t("stepDrawer.hold"),
            holdTitle: t("stepDrawer.holdTitle"),
            holdConsequence: t("stepDrawer.holdConsequence"),
            subcontract: t("stepDrawer.subcontract"),
            subcontractTitle: t("stepDrawer.subcontractTitle"),
            vendorLabel: t("stepDrawer.vendorLabel"),
            slaDueLabel: t("stepDrawer.slaDueLabel"),
            reassign: t("stepDrawer.reassign"),
            assignedToLabel: t("stepDrawer.assignedToLabel"),
            cancel: t("stepDrawer.cancel"),
            send: t("stepDrawer.send"),
          }}
        />
      )}
    </div>
  );
}
