import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { WorkOrderStep } from "@erp/contracts";
import { InkChip, QtyCell, Skeleton, cn, useToast } from "@erp/ui";
import { PRODUCTION_WORK_ORDERS_PATH } from "../../../nav/production-paths.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import {
  useHoldWoStepMutation,
  useSubcontractWoStepMutation,
  useWorkOrderQuery,
} from "../../../production/queries.js";
import { useProductionRealtimeSync } from "../../../production/realtime.js";
import { workOrderStatusToChip, workOrderStepStatusToChip } from "../../../production/chip-status.js";
import { StepDrawer } from "../../../production/components/step-drawer.js";

const TABS = ["overview", "steps", "defects", "history"] as const;
type WorkOrderTab = (typeof TABS)[number];

const TAB_LABEL_KEY = {
  overview: "workOrderDetail.tabOverview",
  steps: "workOrderDetail.tabSteps",
  defects: "workOrderDetail.tabDefects",
  history: "workOrderDetail.tabHistory",
} as const satisfies Record<WorkOrderTab, string>;

/**
 * The work-order detail screen (M4 §4.2, design MD1): overview, the step list (click-through to
 * `StepDrawer`), the defect log, and a history readout built from each step's `started_at`/
 * `finished_at` (the contract has no separate scan-history read, so this is what's available).
 * `mockup_file_key` has no signed-URL endpoint on the `production` contract yet (unlike `hr`'s
 * document vault), so the mockup viewer shows the raw key rather than fabricating an image fetch.
 */
export function WorkOrderDetailPage() {
  const { id } = useParams({ from: "/production/work-orders/$id" });
  const { t } = useTranslation("production");
  const { toast } = useToast();
  const [tab, setTab] = React.useState<WorkOrderTab>("overview");
  const [drawerStep, setDrawerStep] = React.useState<WorkOrderStep | null>(null);
  const dateFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });

  const detail = useWorkOrderQuery(id);
  useProductionRealtimeSync(`wo:${id}`);
  const holdStep = useHoldWoStepMutation();
  const subcontractStep = useSubcontractWoStepMutation();

  if (detail.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-danger">{t("workOrderDetail.loadError")}</p>
        <Link to={PRODUCTION_WORK_ORDERS_PATH} className="text-sm text-text-link">
          ← {t("workOrderDetail.backToList")}
        </Link>
      </div>
    );
  }

  const { work_order: workOrder, steps, defects } = detail.data.body;
  const sortedSteps = [...steps].sort((a, b) => a.seq - b.seq);

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={PRODUCTION_WORK_ORDERS_PATH} className="text-sm text-text-link">
          ← {t("workOrderDetail.back")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-h1 font-semibold text-text-primary">{workOrder.wo_no}</h1>
          <InkChip status={workOrderStatusToChip(workOrder.status)} />
        </div>
      </div>

      <div role="tablist" aria-label={t("workOrderDetail.tabOverview")} className="flex gap-1 border-b border-border">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === key ? "border-b-2 border-accent text-text-primary" : "text-text-muted hover:text-text-primary",
            )}
          >
            {t(TAB_LABEL_KEY[key])}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("workOrderDetail.fieldFinishedItemId")}</dt>
              <dd className="font-mono text-mono text-text-primary">{workOrder.finished_item_id}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("workOrderDetail.fieldQty")}</dt>
              <dd className="text-text-primary">
                <QtyCell value={workOrder.qty} />
              </dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("workOrderDetail.fieldDueDate")}</dt>
              <dd className="text-text-primary">{workOrder.due_date ? dateFormat.format(new Date(workOrder.due_date)) : "—"}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("workOrderDetail.fieldMachine")}</dt>
              <dd className="text-text-primary">{workOrder.machine ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("workOrderDetail.fieldCustomerId")}</dt>
              <dd className="font-mono text-mono text-text-primary">{workOrder.customer_id ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("workOrderDetail.fieldMockup")}</dt>
              <dd className="font-mono text-mono text-text-primary">{workOrder.mockup_file_key ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}

      {tab === "steps" && (
        <ul className="flex flex-col gap-1.5">
          {sortedSteps.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setDrawerStep(step)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-bg-surface px-3 py-2 text-left hover:bg-bg-sunken"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-text-primary">{step.name}</span>
                  <span className="text-caption text-text-muted">{step.standard_time_min} {t("stepDrawer.minutes")}</span>
                </span>
                <InkChip status={workOrderStepStatusToChip(step.status, step.is_delayed)} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "defects" &&
        (defects.length === 0 ? (
          <p className="text-sm text-text-muted">{t("workOrderDetail.defectsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {defects.map((defect) => (
              <li key={defect.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="text-text-primary">{defect.type}</span>
                <span className="text-text-secondary">
                  <QtyCell value={defect.qty} />
                </span>
              </li>
            ))}
          </ul>
        ))}

      {tab === "history" && (
        <ul className="flex flex-col gap-1.5">
          {sortedSteps
            .filter((step) => step.started_at)
            .map((step) => (
              <li key={step.id} className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-sm">
                <span className="font-medium text-text-primary">{step.name}</span>
                <span className="text-caption text-text-muted">
                  {t("workOrderDetail.historyStarted", { at: dateFormat.format(new Date(step.started_at as string)) })}
                  {step.finished_at
                    ? ` · ${t("workOrderDetail.historyFinished", { at: dateFormat.format(new Date(step.finished_at)) })}`
                    : ` · ${t("workOrderDetail.historyInProgress")}`}
                </span>
              </li>
            ))}
          {sortedSteps.every((step) => !step.started_at) && (
            <p className="text-sm text-text-muted">{t("workOrderDetail.historyEmpty")}</p>
          )}
        </ul>
      )}

      {drawerStep && (
        <StepDrawer
          open={Boolean(drawerStep)}
          onOpenChange={(open) => !open && setDrawerStep(null)}
          woNo={workOrder.wo_no}
          step={drawerStep}
          defects={defects.filter((d) => d.wo_step_id === drawerStep.id)}
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
