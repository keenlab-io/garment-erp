import * as React from "react";
import { useTranslation } from "react-i18next";
import { FormField, Input } from "@erp/ui";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { useAuditQuery } from "../../../iam/queries.js";
import { AuditTable } from "../../../iam/components/audit-table.js";

/** Converts a `<input type="date">` value to the start/end-of-day ISO instant `AuditQuery` expects. */
function toIsoBound(date: string, endOfDay: boolean): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
}

/**
 * The audit log viewer (M1 §4.4, MD4): filters over `GET /audit` plus the shared `AuditTable` —
 * immutable, no row actions, rows expand to the before/after diff. Filters are plain controlled
 * inputs; the screen owns cursor pagination the same way the other list screens do.
 */
export function AuditLogPage() {
  const { t } = useTranslation("iam");
  const dateFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });

  const [entityType, setEntityType] = React.useState("");
  const [actor, setActor] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];

  const filters = {
    ...(entityType ? { entity_type: entityType } : {}),
    ...(actor ? { actor } : {}),
    ...(toIsoBound(from, false) ? { from: toIsoBound(from, false) } : {}),
    ...(toIsoBound(to, true) ? { to: toIsoBound(to, true) } : {}),
    ...(cursor ? { cursor } : {}),
  };

  const audit = useAuditQuery(filters);

  React.useEffect(() => {
    setCursorStack([undefined]);
  }, [entityType, actor, from, to]);

  const nextCursor = audit.data?.body.next_cursor ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("audit.title")}</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FormField label={t("audit.filterEntityType")}>
          <Input
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder={t("audit.filterEntityTypePlaceholder")}
          />
        </FormField>
        <FormField label={t("audit.filterActor")}>
          <Input value={actor} onChange={(e) => setActor(e.target.value)} />
        </FormField>
        <FormField label={t("audit.filterFrom")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t("audit.filterTo")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>

      <AuditTable
        entries={audit.data?.body.data ?? []}
        isLoading={audit.isLoading}
        error={audit.isError ? { message: t("audit.loadError") } : null}
        onRetry={() => audit.refetch()}
        formatDateTime={(iso) => dateFormat.format(new Date(iso))}
        nextCursor={nextCursor}
        onNextPage={() => {
          if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
        }}
        onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
        labels={{
          timeColumn: t("audit.columnTime"),
          actorColumn: t("audit.columnActor"),
          actionColumn: t("audit.columnAction"),
          entityColumn: t("audit.columnEntity"),
          reasonColumn: t("audit.columnReason"),
          expand: t("audit.expand"),
          collapse: t("audit.collapse"),
          system: t("audit.system"),
          empty: t("audit.empty"),
          errorTitle: t("audit.loadError"),
          previousPage: t("audit.previousPage"),
          nextPage: t("audit.nextPage"),
        }}
        diffLabels={{
          beforeHeading: t("diff.beforeHeading"),
          afterHeading: t("diff.afterHeading"),
          emptyValue: t("diff.emptyValue"),
          noChanges: t("diff.noChanges"),
        }}
      />
    </div>
  );
}
