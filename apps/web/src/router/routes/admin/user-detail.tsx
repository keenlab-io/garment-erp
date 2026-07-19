import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { UserStatus } from "@erp/contracts";
import {
  Button,
  Combobox,
  GuardedActionDialog,
  InkChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useToast,
} from "@erp/ui";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { ADMIN_USERS_PATH } from "../../../nav/admin-paths.js";
import {
  useAuditQuery,
  useForceLogoutMutation,
  useRolesQuery,
  useSetUserRolesMutation,
  useSetUserStatusMutation,
  useUserQuery,
} from "../../../iam/queries.js";
import { userStatusToChip } from "../../../iam/status-chips.js";
import { AuditTable } from "../../../iam/components/audit-table.js";
import { SessionList, type SessionRow } from "../../../iam/components/session-list.js";

const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "PENDING", "DISABLED"];

/**
 * The user detail screen (M1 §4.2): roles, sessions, and activity for one user. The contract has no
 * session-list endpoint — `forceLogout` is the only session-revocation primitive — so "sessions"
 * shows the one session fact the API exposes (last sign-in) and its "revoke" opens the same guarded
 * force-logout flow the section header offers.
 */
export function UserDetailPage() {
  const { id } = useParams({ from: "/admin/users/$id" });
  const { t } = useTranslation(["iam", "common"]);
  const { toast } = useToast();
  const dateFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });

  const userQuery = useUserQuery(id);
  const roles = useRolesQuery();
  const audit = useAuditQuery({ entity_type: "user", entity_id: id, limit: 10 });

  const setUserRoles = useSetUserRolesMutation();
  const setUserStatus = useSetUserStatusMutation();
  const forceLogout = useForceLogoutMutation();

  const [roleIds, setRoleIds] = React.useState<string[] | null>(null);
  const [status, setStatus] = React.useState<UserStatus | null>(null);
  const [forceLogoutOpen, setForceLogoutOpen] = React.useState(false);

  const user = userQuery.data?.body.user;
  const effectiveRoleIds = roleIds ?? user?.roles.map((r) => r.id) ?? [];
  const effectiveStatus = status ?? user?.status ?? "ACTIVE";

  const statusLabel = (s: UserStatus) =>
    s === "ACTIVE" ? t("users.statusActive") : s === "PENDING" ? t("users.statusPending") : t("users.statusDisabled");

  const roleOptions = (roles.data?.body ?? []).map((role) => ({ value: role.id, label: role.name }));

  // The contract has no session-list endpoint — this is the one session fact `GET /users/:id`
  // exposes. Its revoke wires to the same force-logout flow the section header offers (there is no
  // per-session revoke primitive to call instead).
  const sessions: SessionRow[] = user?.last_login_at
    ? [{ id: "last-known", createdAt: user.last_login_at, lastActiveAt: user.last_login_at }]
    : [];

  function handleForceLogout() {
    forceLogout.mutate(
      { params: { id }, body: undefined },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("userDetail.forceLogout") });
          setForceLogoutOpen(false);
        },
      },
    );
  }

  if (userQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <p className="text-sm text-danger">{t("userDetail.loadError")}</p>
        <Button variant="secondary" onClick={() => userQuery.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={ADMIN_USERS_PATH} className="text-sm text-text-link">
          ← {t("userDetail.back")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-h1 font-semibold text-text-primary">{user.username}</h1>
          <InkChip status={userStatusToChip(user.status)} label={statusLabel(user.status)} />
        </div>
        <p className="text-sm text-text-secondary">{user.email}</p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="text-body-strong text-text-primary">{t("userDetail.rolesHeading")}</h2>
        <Combobox
          multiple
          aria-label={t("userDetail.rolesHeading")}
          value={effectiveRoleIds}
          onValueChange={setRoleIds}
          options={roleOptions}
          loading={roles.isLoading}
        />
        <div>
          <Button
            onClick={() =>
              setUserRoles.mutate(
                { params: { id }, body: { role_ids: effectiveRoleIds } },
                { onSuccess: () => setRoleIds(null) },
              )
            }
            loading={setUserRoles.isPending}
          >
            {t("userDetail.saveRoles")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="text-body-strong text-text-primary">{t("userDetail.statusHeading")}</h2>
        <Select value={effectiveStatus} onValueChange={(value) => setStatus(value as UserStatus)}>
          <SelectTrigger aria-label={t("userDetail.statusHeading")} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {statusLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <Button
            onClick={() =>
              setUserStatus.mutate(
                { params: { id }, body: { status: effectiveStatus } },
                { onSuccess: () => setStatus(null) },
              )
            }
            loading={setUserStatus.isPending}
          >
            {t("userDetail.saveStatus")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-body-strong text-text-primary">{t("userDetail.sessionsHeading")}</h2>
          <Button variant="destructive" onClick={() => setForceLogoutOpen(true)}>
            {t("userDetail.forceLogout")}
          </Button>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-text-muted">{t("userDetail.noSessions")}</p>
        ) : (
          <SessionList
            sessions={sessions}
            onRevoke={() => setForceLogoutOpen(true)}
            formatDateTime={(iso) => dateFormat.format(new Date(iso))}
          />
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="text-body-strong text-text-primary">{t("userDetail.activityHeading")}</h2>
        <AuditTable
          entries={audit.data?.body.data ?? []}
          isLoading={audit.isLoading}
          error={audit.isError ? { message: t("audit.loadError") } : null}
          onRetry={() => audit.refetch()}
          formatDateTime={(iso) => dateFormat.format(new Date(iso))}
          labels={{
            timeColumn: t("audit.columnTime"),
            actorColumn: t("audit.columnActor"),
            actionColumn: t("audit.columnAction"),
            entityColumn: t("audit.columnEntity"),
            reasonColumn: t("audit.columnReason"),
            expand: t("audit.expand"),
            collapse: t("audit.collapse"),
            system: t("audit.system"),
            empty: t("userDetail.noActivity"),
          }}
          diffLabels={{
            beforeHeading: t("diff.beforeHeading"),
            afterHeading: t("diff.afterHeading"),
            emptyValue: t("diff.emptyValue"),
            noChanges: t("diff.noChanges"),
          }}
        />
      </section>

      <GuardedActionDialog
        open={forceLogoutOpen}
        onOpenChange={setForceLogoutOpen}
        kind="force-logout"
        subject={user.username}
        onConfirm={handleForceLogout}
        loading={forceLogout.isPending}
      />
    </div>
  );
}
