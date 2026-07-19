import * as React from "react";
import { useTranslation } from "react-i18next";
import type { WorkOrderStep, WorkOrderTimelineEntry } from "@erp/contracts";
import { ScanField, Skeleton, type ScanEntry, useToast } from "@erp/ui";
import {
  useRecordDefectMutation,
  useScanWoStepMutation,
  useWorkOrderQuery,
  useWorkOrderTimelineQuery,
} from "../../../production/queries.js";
import { DefectTilePicker } from "../../../production/components/defect-tile-picker.js";
import { KioskCard } from "../../../production/components/kiosk-card.js";
import { OfflineScanQueueBadge } from "../../../production/components/offline-scan-queue-badge.js";
import { useOfflineScanQueue } from "../../../production/components/offline-scan-queue.js";

/** The step a traveler-card scan lands on: running first, else the next one up. */
function currentStepOf(entry: WorkOrderTimelineEntry): WorkOrderStep | undefined {
  return entry.steps.find((s) => s.status === "IN_PROGRESS") ?? entry.steps.find((s) => s.status === "PENDING");
}

/**
 * The scan-station kiosk (M4 §4.3, design MD2/MD3). Locked to Touch by the route's `kiosk: true`
 * flag (density-context reads it, no extra wiring here). A scan resolves the traveler card's
 * `wo_no` against the timeline feed (the contract has no lookup-by-code endpoint, mirroring
 * `inventory`'s scan-first goods issue, which resolves by item `code` the same way) to the WO and
 * its current step, shows the `KioskCard`, and returns to the scan field after each START/FINISH
 * tap — the operator re-scans the same card for the next action. Offline: scans queue locally via
 * `useOfflineScanQueue` and sync on reconnect.
 */
export function ProductionScanPage() {
  const { t } = useTranslation("production");
  const { toast } = useToast();
  const timeline = useWorkOrderTimelineQuery();
  const scanStep = useScanWoStepMutation();
  const recordDefect = useRecordDefectMutation();

  const [resolvedEntry, setResolvedEntry] = React.useState<WorkOrderTimelineEntry | null>(null);
  const [defectMode, setDefectMode] = React.useState(false);
  const [scanHistory, setScanHistory] = React.useState<ScanEntry[]>([]);

  const entries = timeline.data?.body.data ?? [];
  const entryByWoNo = React.useMemo(() => new Map(entries.map((e) => [e.wo_no, e])), [entries]);

  // The timeline feed carries steps/status but not qty/finished_item_id — fetch the full work
  // order once a scan resolves one, for the card's "item x qty" line.
  const resolvedDetail = useWorkOrderQuery(resolvedEntry?.id ?? "", { enabled: Boolean(resolvedEntry) });

  const offlineQueue = useOfflineScanQueue({
    submit: async (scan) => {
      await scanStep.mutateAsync({ params: { id: scan.stepId }, body: { action: scan.action } });
    },
  });

  function handleScan(code: string) {
    const entry = entryByWoNo.get(code.trim());
    if (!entry) {
      toast({ tone: "danger", title: t("scanStation.unknownCode", { code }) });
      return;
    }
    setDefectMode(false);
    setResolvedEntry(entry);
    setScanHistory((prev) => [{ id: crypto.randomUUID(), code: entry.wo_no, qty: "1" }, ...prev]);
  }

  const currentStep = resolvedEntry ? currentStepOf(resolvedEntry) : undefined;

  function handleStart() {
    if (!currentStep) return;
    offlineQueue.enqueue(currentStep.id, "START");
    toast({ tone: "success", title: t("scanStation.started") });
    setResolvedEntry(null);
  }

  function handleFinish() {
    if (!currentStep) return;
    offlineQueue.enqueue(currentStep.id, "FINISH");
    toast({ tone: "success", title: t("scanStation.finished") });
    setResolvedEntry(null);
  }

  async function handleReportDefect(type: string, qty: string) {
    if (!currentStep) return;
    await recordDefect.mutateAsync({ params: { id: currentStep.id }, body: { type, qty } });
    toast({ tone: "success", title: t("scanStation.defectReported") });
    setDefectMode(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-h2 font-semibold text-text-primary">{t("scanStation.title")}</h1>
        <OfflineScanQueueBadge
          isOnline={offlineQueue.isOnline}
          queuedCount={offlineQueue.queue.length}
          syncing={offlineQueue.syncing}
          labels={{
            offline: (count) => t("scanStation.offline", { count }),
            syncing: (count) => t("scanStation.syncing", { count }),
            queued: (count) => t("scanStation.queued", { count }),
          }}
        />
      </div>

      {timeline.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !resolvedEntry ? (
        <ScanField
          recentScans={scanHistory}
          onScan={(code) => handleScan(code)}
          onUndo={(entryId) => setScanHistory((prev) => prev.filter((s) => s.id !== entryId))}
          labels={{
            placeholder: t("scanStation.placeholder"),
            qtyLabel: t("scanStation.qtyLabel"),
            addButton: t("scanStation.addButton"),
            cameraButton: t("scanStation.cameraButton"),
            undo: t("scanStation.undo"),
            lastScans: t("scanStation.lastScans"),
            decrement: t("scanStation.decrement"),
            increment: t("scanStation.increment"),
          }}
        />
      ) : !currentStep ? (
        <p className="text-sm text-text-muted">{t("scanStation.noCurrentStep")}</p>
      ) : defectMode ? (
        <DefectTilePicker
          onSubmit={handleReportDefect}
          labels={{
            qtyLabel: t("scanStation.defectQty"),
            decrement: t("scanStation.decrement"),
            increment: t("scanStation.increment"),
            submit: t("scanStation.submitDefect"),
          }}
        />
      ) : (
        <KioskCard
          woNo={resolvedEntry.wo_no}
          itemLabel={resolvedDetail.data?.body.work_order.finished_item_id ?? t("scanStation.itemFallback")}
          qty={resolvedDetail.data?.body.work_order.qty ?? "—"}
          step={currentStep}
          onStart={handleStart}
          onFinish={handleFinish}
          onReportDefect={() => setDefectMode(true)}
          labels={{
            elapsed: t("scanStation.elapsed"),
            notStarted: t("scanStation.notStarted"),
            minutes: t("scanStation.minutes"),
            start: t("scanStation.start"),
            finish: t("scanStation.finish"),
            reportDefect: t("scanStation.reportDefect"),
          }}
        />
      )}
    </div>
  );
}
