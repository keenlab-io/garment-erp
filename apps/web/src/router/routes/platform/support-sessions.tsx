import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { SupportSessionRow } from "@erp/contracts";
import { DataTable, textColumn, useToast } from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { useRevokeSupportSessionMutation, useSupportSessionsQuery } from "../../../platform/queries.js";
import { PlatformLayout } from "./platform-layout.js";

/** The support-sessions ledger (M8 §7.1): every session with its reason and scope, and "End session" for live ones. */
export function PlatformSupportSessionsPage() {
  const { t } = useTranslation("platform");
  const { toast } = useToast();
  const { density } = useDensity();
  const dateFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });
  const revoke = useRevokeSupportSessionMutation();

  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const sessions = useSupportSessionsQuery(cursor ? { cursor } : {});
  const rows = React.useMemo(() => sessions.data?.body.data ?? [], [sessions.data]);

  const isLive = (row: SupportSessionRow) =>
    !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();

  const stateOf = React.useCallback(
    (row: SupportSessionRow) =>
      row.revoked_at
        ? t("sessions.stateEnded")
        : new Date(row.expires_at).getTime() <= Date.now()
          ? t("sessions.stateExpired")
          : t("sessions.stateActive"),
    [t],
  );

  const columns = React.useMemo<ColumnDef<SupportSessionRow>[]>(
    () => [
      textColumn<SupportSessionRow>("tenant_id", { header: t("sessions.columnTenant"), mono: true }),
      textColumn<SupportSessionRow>("reason", { header: t("sessions.columnReason") }),
      textColumn<SupportSessionRow>("scope", { header: t("sessions.columnScope"), secondary: true }),
      {
        id: "expires",
        header: t("sessions.columnExpires"),
        cell: ({ row }) => dateFormat.format(new Date(row.original.expires_at)),
      },
      { id: "state", header: t("sessions.columnState"), cell: ({ row }) => stateOf(row.original) },
    ],
    [t, dateFormat, stateOf],
  );

  const nextCursor = sessions.data?.body.next_cursor ?? null;

  return (
    <PlatformLayout>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("sessions.title")}</h1>
        {revoke.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("sessions.endError")}
          </p>
        )}
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          density={density}
          isLoading={sessions.isLoading}
          error={sessions.isError ? { message: t("sessions.loadError") } : null}
          onRetry={() => sessions.refetch()}
          emptyState={{ title: t("sessions.empty") }}
          nextCursor={nextCursor}
          onNextPage={() => {
            if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
          }}
          onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
          rowActions={(row) =>
            isLive(row)
              ? [
                  {
                    key: "end",
                    label: t("sessions.end"),
                    onClick: () =>
                      revoke.mutate(
                        { params: { id: row.id } },
                        { onSuccess: () => toast({ tone: "success", title: t("sessions.ended") }) },
                      ),
                  },
                ]
              : []
          }
        />
      </div>
    </PlatformLayout>
  );
}
