import * as React from "react";
import { useTranslation } from "react-i18next";
import { REPORT_KEYS, ExportStatus, ReportExportFormat, type ReportSchedule } from "@erp/contracts";
import { Badge, Button, ConfirmDialog, useToast } from "@erp/ui";
import { ScheduleEditor, type ScheduleEditorValue } from "../../../reporting/components/schedule-editor.js";
import { cadenceFromCron, cronFromCadence, type Cadence } from "../../../reporting/components/cron.js";
import { useCadenceLabel, useWeekdayLabel } from "../../../reporting/use-cadence-label.js";
import { reportKeyLabelKey } from "../../../reporting/report-catalog.js";
import {
  useCreateReportScheduleMutation,
  useDeleteReportScheduleMutation,
  useExportStatusQuery,
  useReportSchedulesQuery,
  useRunReportScheduleNowMutation,
  useUpdateReportScheduleMutation,
} from "../../../reporting/queries.js";

const DEFAULT_CADENCE: Cadence = { frequency: "daily", time: "08:00" };

function emptyDraft(): ScheduleEditorValue {
  return {
    name: "",
    reportKey: REPORT_KEYS[0],
    cadence: DEFAULT_CADENCE,
    recipients: [],
    format: ReportExportFormat.PDF,
    isActive: true,
  };
}

/**
 * The digest schedule manager (M6 §4.3 report-schedules-ui, design MD5) — a `ScheduleEditor` form
 * (create, or edit the selected row) above the schedule list. Run-now reuses the generic job
 * poll/toast (`getExport` is job-id-generic, per its controller comment) and a failed run's toast
 * carries a Retry action, matching design MD5's "failures surface in the notification center with
 * retry" — there's no persisted last-run-status field on `ReportSchedule` to show in the list.
 */
export function ReportSchedulesPage() {
  const { t } = useTranslation(["reporting"]);
  const { toast } = useToast();
  const cadenceLabel = useCadenceLabel();
  const weekdayLabel = useWeekdayLabel();
  const schedules = useReportSchedulesQuery();
  const createSchedule = useCreateReportScheduleMutation();
  const updateSchedule = useUpdateReportScheduleMutation();
  const deleteSchedule = useDeleteReportScheduleMutation();

  const [selected, setSelected] = React.useState<{ id: string; version: number } | null>(null);
  const [draft, setDraft] = React.useState<ScheduleEditorValue>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);

  const reportOptions = REPORT_KEYS.map((key) => ({ key, label: t(reportKeyLabelKey(key)) }));

  function editRow(row: ReportSchedule) {
    setSelected({ id: row.id, version: row.version });
    setDraft({
      name: row.name,
      reportKey: row.report_key,
      cadence: cadenceFromCron(row.cron) ?? DEFAULT_CADENCE,
      recipients: row.recipients,
      format: row.format,
      isActive: row.is_active,
    });
  }

  function resetForm() {
    setSelected(null);
    setDraft(emptyDraft());
  }

  async function handleSubmit() {
    const body = {
      name: draft.name,
      report_key: draft.reportKey,
      cron: cronFromCadence(draft.cadence),
      recipients: draft.recipients,
      format: draft.format,
      is_active: draft.isActive,
    };
    try {
      if (selected) {
        await updateSchedule.mutateAsync({
          params: { id: selected.id },
          headers: { "if-match": String(selected.version) },
          body,
        });
      } else {
        await createSchedule.mutateAsync({ body: { ...body, params: {} } });
      }
      toast({ title: t("schedules.saved"), tone: "success" });
      resetForm();
    } catch {
      toast({ title: t("schedules.saveFailed"), tone: "danger" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSchedule.mutateAsync({ params: { id: deleteTarget.id }, body: undefined });
      toast({ title: t("schedules.deleted"), tone: "success" });
      if (selected?.id === deleteTarget.id) resetForm();
    } catch {
      toast({ title: t("schedules.deleteFailed"), tone: "danger" });
    } finally {
      setDeleteTarget(null);
    }
  }

  const rows = schedules.data?.body.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("nav.schedules")}</h1>

      <section className="flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-4">
        <h2 className="text-body-strong text-text-primary">
          {selected ? t("schedules.editTitle") : t("schedules.createTitle")}
        </h2>
        <ScheduleEditor
          value={draft}
          onChange={setDraft}
          reportOptions={reportOptions}
          onSubmit={() => void handleSubmit()}
          submitting={createSchedule.isPending || updateSchedule.isPending}
          labels={{
            nameLabel: t("scheduleEditor.nameLabel"),
            reportLabel: t("scheduleEditor.reportLabel"),
            frequencyLabel: t("scheduleEditor.frequencyLabel"),
            daily: t("scheduleEditor.daily"),
            weekly: t("scheduleEditor.weekly"),
            dayOfWeekLabel: t("scheduleEditor.dayOfWeekLabel"),
            weekdayLabel,
            timeLabel: t("scheduleEditor.timeLabel"),
            recipientsLabel: t("scheduleEditor.recipientsLabel"),
            recipientPlaceholder: t("scheduleEditor.recipientPlaceholder"),
            addRecipient: t("scheduleEditor.addRecipient"),
            removeRecipient: (email) => t("scheduleEditor.removeRecipient", { email }),
            formatLabel: t("scheduleEditor.formatLabel"),
            activeLabel: t("schedules.active"),
            describeCadence: cadenceLabel,
            preview: (text) => t("scheduleEditor.preview", { text }),
            save: t("scheduleEditor.save"),
            runNow: t("schedules.runNow"),
          }}
        />
        {selected && (
          <Button variant="ghost" onClick={resetForm}>
            {t("schedules.cancelEdit")}
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-body-strong text-text-primary">{t("schedules.listTitle")}</h2>
        {schedules.isLoading ? (
          <p className="text-sm text-text-muted">{t("schedules.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted">{t("schedules.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-bg-surface">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">{row.name}</span>
                  <Badge tone={row.is_active ? "success" : "neutral"}>
                    {row.is_active ? t("schedules.active") : t("schedules.inactive")}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">
                  {t(reportKeyLabelKey(row.report_key))} ·{" "}
                  {cadenceFromCron(row.cron) ? cadenceLabel(cadenceFromCron(row.cron)!) : row.cron} · {row.format}
                </p>
                <p className="text-caption text-text-muted">{row.recipients.join(", ")}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => editRow(row)}>
                    {t("schedules.edit")}
                  </Button>
                  <RunNowButton scheduleId={row.id} scheduleName={row.name} />
                  <Button variant="ghost" onClick={() => setDeleteTarget({ id: row.id, name: row.name })}>
                    {t("schedules.delete")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("schedules.deleteTitle")}
        consequence={deleteTarget ? t("schedules.deleteConsequence", { name: deleteTarget.name }) : ""}
        onConfirm={() => void handleDelete()}
        destructive
        loading={deleteSchedule.isPending}
      />
    </div>
  );
}

function RunNowButton({ scheduleId, scheduleName }: { scheduleId: string; scheduleName: string }) {
  const { t } = useTranslation(["reporting"]);
  const { jobToast } = useToast();
  const runNow = useRunReportScheduleNowMutation();
  const [pollingJobId, setPollingJobId] = React.useState<string | null>(null);
  const statusQuery = useExportStatusQuery(pollingJobId ?? "", { enabled: Boolean(pollingJobId) });
  const handleRef = React.useRef<ReturnType<typeof jobToast> | null>(null);

  const trigger = React.useCallback(async () => {
    const handle = jobToast({ title: t("schedules.runPending", { name: scheduleName }) });
    handleRef.current = handle;
    try {
      const result = await runNow.mutateAsync({ params: { id: scheduleId }, body: undefined });
      if (result.status === 202) {
        setPollingJobId(result.body.job_id);
      } else {
        handle.resolve({ tone: "danger", title: t("schedules.runFailed") });
        handleRef.current = null;
      }
    } catch {
      handle.resolve({
        tone: "danger",
        title: t("schedules.runFailed"),
        action: { label: t("schedules.retry"), onClick: () => void trigger() },
      });
      handleRef.current = null;
    }
  }, [jobToast, runNow, scheduleId, scheduleName, t]);

  React.useEffect(() => {
    if (!pollingJobId || !handleRef.current || statusQuery.data?.status !== 200) return;
    const result = statusQuery.data.body;
    if (result.status === ExportStatus.DONE) {
      handleRef.current.resolve({ tone: "success", title: t("schedules.runDone") });
      handleRef.current = null;
      setPollingJobId(null);
    } else if (result.status === ExportStatus.FAILED) {
      handleRef.current.resolve({
        tone: "danger",
        title: t("schedules.runFailed"),
        action: { label: t("schedules.retry"), onClick: () => void trigger() },
      });
      handleRef.current = null;
      setPollingJobId(null);
    }
  }, [statusQuery.data, pollingJobId, t, trigger]);

  return (
    <Button variant="secondary" onClick={() => void trigger()} loading={runNow.isPending || Boolean(pollingJobId)}>
      {t("schedules.runNow")}
    </Button>
  );
}
