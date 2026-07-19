import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Permission } from "@erp/contracts";
import { Badge, Button, ConfirmDialog, GuardedActionDialog, Skeleton, useToast } from "@erp/ui";
import { ADMIN_ROLES_PATH, ADMIN_USERS_PATH } from "../../../nav/admin-paths.js";
import {
  useDeleteRoleMutation,
  useRoleQuery,
  useRolesQuery,
  useUpdateRoleMutation,
} from "../../../iam/queries.js";
import { PermissionMatrix } from "../../../iam/components/permission-matrix.js";
import { CloneRoleDialog } from "./roles-list.js";

/**
 * The role editor (M1 §4.3, MD2/MD3): the permission matrix pre-filled from the role's saved grants,
 * a save confirmation stating how many active users are affected, clone, and the guarded delete flow
 * (409 renders as an inline "N users still use this role" blocker linking to Users, not a dead end).
 */
export function RoleDetailPage() {
  const { id } = useParams({ from: "/admin/roles/$id" });
  const { t } = useTranslation(["iam", "common"]);
  const { toast } = useToast();

  const roleQuery = useRoleQuery(id);
  const summaries = useRolesQuery();
  const updateRole = useUpdateRoleMutation();
  const deleteRole = useDeleteRoleMutation();

  const [codes, setCodes] = React.useState<Permission[] | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = React.useState(false);
  const [cloneOpen, setCloneOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [blockedCount, setBlockedCount] = React.useState<number | null>(null);

  const role = roleQuery.data?.body.role;
  const summary = summaries.data?.body.find((r) => r.id === id);
  const effectiveCodes = codes ?? role?.permission_codes ?? [];

  function handleSave() {
    if (!role) return;
    updateRole.mutate(
      { params: { id: role.id }, body: { permission_codes: effectiveCodes } },
      {
        onSuccess: () => {
          setCodes(null);
          setSaveConfirmOpen(false);
        },
      },
    );
  }

  function handleDelete(password?: string) {
    if (!role) return;
    deleteRole.mutate(
      { params: { id: role.id }, body: { super_admin_password: password ?? "" } },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          toast({ tone: "success", title: t("roles.deleteAction") });
        },
        onError: (error) => {
          if (error.status === 409) {
            setBlockedCount(summary?.user_count ?? 0);
            setDeleteOpen(false);
          }
        },
      },
    );
  }

  if (roleQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (roleQuery.isError || !role) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-danger">{t("roleDetail.loadError")}</p>
        <Button variant="secondary" onClick={() => roleQuery.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={ADMIN_ROLES_PATH} className="text-sm text-text-link">
          ← {t("roleDetail.back")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-h1 font-semibold text-text-primary">{role.name}</h1>
          {role.is_system && <Badge tone="accent">{t("roleDetail.systemRoleBadge")}</Badge>}
        </div>
        {role.description && <p className="text-sm text-text-secondary">{role.description}</p>}
      </div>

      {blockedCount !== null && (
        <div className="flex flex-col gap-2 rounded-md border border-warning bg-warning-subtle px-4 py-3 text-sm text-warning-on">
          <p>{t("roles.deleteBlockedBody", { count: blockedCount })}</p>
          <Link to={ADMIN_USERS_PATH} className="text-sm font-medium text-text-link">
            {t("roles.goToUsers")}
          </Link>
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-body-strong text-text-primary">{t("roleDetail.permissionsHeading")}</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCloneOpen(true)}>
              {t("roleDetail.cloneAction")}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={role.is_system}>
              {t("roleDetail.deleteAction")}
            </Button>
          </div>
        </div>

        <PermissionMatrix
          value={effectiveCodes}
          onChange={setCodes}
          isSystemRole={role.is_system}
          initialValue={role.permission_codes}
          affectedUserCount={summary?.user_count}
          labels={{
            affectsUsers: (count) => t("matrix.affectsUsers", { count }),
            specialGroupCaption: t("matrix.specialGroupCaption"),
            lastPermissionBlocked: t("matrix.lastPermissionBlocked"),
            collapseGroup: (module) => t("matrix.collapseGroup", { module }),
            expandGroup: (module) => t("matrix.expandGroup", { module }),
          }}
        />

        <div>
          <Button onClick={() => setSaveConfirmOpen(true)} disabled={codes === null}>
            {t("roleDetail.saveChanges")}
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={saveConfirmOpen}
        onOpenChange={setSaveConfirmOpen}
        title={t("roleDetail.saveConfirmTitle")}
        consequence={t("roleDetail.saveConfirmBody", { count: summary?.user_count ?? 0 })}
        onConfirm={handleSave}
        loading={updateRole.isPending}
      />

      <CloneRoleDialog role={cloneOpen ? role : null} onOpenChange={(open) => !open && setCloneOpen(false)} />

      <GuardedActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        kind="role-delete"
        subject={role.name}
        onConfirm={(result) => handleDelete(result.password)}
        loading={deleteRole.isPending}
      />
    </div>
  );
}
