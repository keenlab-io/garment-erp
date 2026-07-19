import * as React from "react";
import { X } from "lucide-react";
import { ReportExportFormat, type ReportExportFormat as ReportExportFormatT } from "@erp/contracts";
import {
  Badge,
  Button,
  FormField,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@erp/ui";
import { describeCadence, weekdayLabel, type Cadence } from "./cron.js";

export interface ScheduleEditorValue {
  name: string;
  reportKey: string;
  cadence: Cadence;
  recipients: string[];
  format: ReportExportFormatT;
  isActive: boolean;
}

export interface ScheduleEditorReportOption {
  key: string;
  label: string;
}

export interface ScheduleEditorLabels {
  nameLabel: string;
  reportLabel: string;
  frequencyLabel: string;
  daily: string;
  weekly: string;
  dayOfWeekLabel: string;
  timeLabel: string;
  recipientsLabel: string;
  recipientPlaceholder: string;
  addRecipient: string;
  removeRecipient: (email: string) => string;
  formatLabel: string;
  activeLabel: string;
  preview: (text: string) => string;
  save: string;
  runNow: string;
}

const defaultLabels: ScheduleEditorLabels = {
  nameLabel: "Schedule name",
  reportLabel: "Report",
  frequencyLabel: "Frequency",
  daily: "Every day",
  weekly: "Weekly",
  dayOfWeekLabel: "Day of week",
  timeLabel: "Time",
  recipientsLabel: "Recipients",
  recipientPlaceholder: "name@example.com",
  addRecipient: "Add",
  removeRecipient: (email) => `Remove ${email}`,
  formatLabel: "Format",
  activeLabel: "Active",
  preview: (text) => `Sends ${text}`,
  save: "Save schedule",
  runNow: "Run now",
};

export interface ScheduleEditorProps {
  value: ScheduleEditorValue;
  onChange: (value: ScheduleEditorValue) => void;
  reportOptions: ScheduleEditorReportOption[];
  onSubmit: () => void;
  /** Preview-send the digest immediately (design MD5 "[Run now]"); omit to hide the action (new schedules). */
  onRunNow?: () => void;
  submitting?: boolean;
  runningNow?: boolean;
  labels?: Partial<ScheduleEditorLabels>;
  className?: string;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The cron-friendly digest schedule editor (M6 §3.3, design MD5) — a friendly cadence UI ("Every
 * Monday 08:00", via `cron.ts`'s `Cadence` ↔ cron bridge) instead of a raw cron field, recipients,
 * format, active toggle, and an optional Run-now preview-send.
 */
export function ScheduleEditor({
  value,
  onChange,
  reportOptions,
  onSubmit,
  onRunNow,
  submitting = false,
  runningNow = false,
  labels: labelsProp,
  className,
}: ScheduleEditorProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [recipientDraft, setRecipientDraft] = React.useState("");

  function patch(partial: Partial<ScheduleEditorValue>) {
    onChange({ ...value, ...partial });
  }

  function addRecipient() {
    const email = recipientDraft.trim();
    if (!email || value.recipients.includes(email)) return;
    patch({ recipients: [...value.recipients, email] });
    setRecipientDraft("");
  }

  function removeRecipient(email: string) {
    patch({ recipients: value.recipients.filter((r) => r !== email) });
  }

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <FormField label={labels.nameLabel}>
        <Input value={value.name} onChange={(e) => patch({ name: e.target.value })} />
      </FormField>

      <FormField label={labels.reportLabel}>
        <Select value={value.reportKey} onValueChange={(reportKey) => patch({ reportKey })}>
          <SelectTrigger aria-label={labels.reportLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {reportOptions.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label={labels.frequencyLabel}>
        <Select
          value={value.cadence.frequency}
          onValueChange={(frequency) =>
            patch({
              cadence: {
                ...value.cadence,
                frequency: frequency as Cadence["frequency"],
                dayOfWeek: frequency === "weekly" ? (value.cadence.dayOfWeek ?? 1) : undefined,
              },
            })
          }
        >
          <SelectTrigger aria-label={labels.frequencyLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">{labels.daily}</SelectItem>
            <SelectItem value="weekly">{labels.weekly}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {value.cadence.frequency === "weekly" && (
        <FormField label={labels.dayOfWeekLabel}>
          <Select
            value={String(value.cadence.dayOfWeek ?? 1)}
            onValueChange={(day) => patch({ cadence: { ...value.cadence, dayOfWeek: Number(day) } })}
          >
            <SelectTrigger aria-label={labels.dayOfWeekLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {weekdayLabel(day)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      <FormField label={labels.timeLabel}>
        <Input
          type="time"
          value={value.cadence.time}
          onChange={(e) => patch({ cadence: { ...value.cadence, time: e.target.value } })}
        />
      </FormField>

      <p className="text-caption text-text-secondary">{labels.preview(describeCadence(value.cadence))}</p>

      <FormField label={labels.recipientsLabel}>
        <div className="flex flex-col gap-2">
          {value.recipients.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {value.recipients.map((email) => (
                <Badge key={email} tone="neutral" className="gap-1.5 py-1 pr-1.5">
                  {email}
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    aria-label={labels.removeRecipient(email)}
                    className="inline-flex items-center rounded-full p-0.5 hover:bg-bg-sunken"
                  >
                    <Icon icon={X} size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder={labels.recipientPlaceholder}
              value={recipientDraft}
              onChange={(e) => setRecipientDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRecipient();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addRecipient}>
              {labels.addRecipient}
            </Button>
          </div>
        </div>
      </FormField>

      <FormField label={labels.formatLabel}>
        <Select value={value.format} onValueChange={(format) => patch({ format: format as ReportExportFormatT })}>
          <SelectTrigger aria-label={labels.formatLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ReportExportFormat).map((format) => (
              <SelectItem key={format} value={format}>
                {format}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <label className="flex items-center gap-2">
        <Switch checked={value.isActive} onCheckedChange={(isActive) => patch({ isActive })} />
        <span className="text-sm text-text-primary">{labels.activeLabel}</span>
      </label>

      <div className="flex gap-2">
        <Button type="submit" loading={submitting}>
          {labels.save}
        </Button>
        {onRunNow && (
          <Button type="button" variant="secondary" onClick={onRunNow} loading={runningNow}>
            {labels.runNow}
          </Button>
        )}
      </div>
    </form>
  );
}
