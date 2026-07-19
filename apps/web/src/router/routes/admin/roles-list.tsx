import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { RoleSummary } from "@erp/contracts";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  GuardedActionDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  textColumn,
  useToast,
} from "@erp/ui";
import type { Permission } from "@erp/contracts";
import { ADMIN_USERS_PATH } from "../../../nav/admin-paths.js";
import { PermissionMatrix } from "../../../iam/components/permission-matrix.js";
import {
  useCloneRoleMutation,
  useCreateRoleMutation,
  useCreateRoleTemplateMutation,
  useDeleteRoleMutation,
  useRoleTemplatesQuery,
  useRolesQuery,
} from "../../../iam/queries.js";

function CreateRoleDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("iam");
  const { toast } = useToast();
  const templates = useRoleTemplatesQuery();
  const createRole = useCreateRoleMutation();
  const createTemplate = useCreateRoleTemplateMutation();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [templateId, setTemplateId] = React.useState<string>("");
  const [codes, setCodes] = React.useState<Permission[]>([]);

  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setTemplateId("");
      setCodes([]);
    }
  }, [open]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.data?.body.find((tpl) => tpl.id === id);
    setCodes(template?.permission_codes ?? []);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createRole.mutate(
      { body: { name, description: description || undefined, permission_codes: codes } },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function handleSaveAsTemplate() {
    const templateName = window.prompt(t("roles.templateNamePrompt"));
    if (!templateName) return;
    createTemplate.mutate(
      { body: { name: templateName, permission_codes: codes } },
      { onSuccess: () => toast({ tone: "success", title: t("roles.saveAsTemplate") }) },
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined} className="w-[min(40rem,calc(100vw-2rem))]">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">
              {t("roles.createDrawerTitle")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("roles.fieldName")} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label={t("roles.fieldDescription")}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <FormField label={t("roles.startFromTemplate")}>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={t("roles.noTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {(templates.data?.body ?? []).map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <PermissionMatrix
              value={codes}
              onChange={setCodes}
              labels={{
                affectsUsers: (count) => t("matrix.affectsUsers", { count }),
                specialGroupCaption: t("matrix.specialGroupCaption"),
                lastPermissionBlocked: t("matrix.lastPermissionBlocked"),
                collapseGroup: (module) => t("matrix.collapseGroup", { module }),
                expandGroup: (module) => t("matrix.expandGroup", { module }),
              }}
            />
            <Button type="button" variant="secondary" onClick={handleSaveAsTemplate} loading={createTemplate.isPending}>
              {t("roles.saveAsTemplate")}
            </Button>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("roles.createCancel")}
            </Button>
            <Button type="submit" loading={createRole.isPending}>
              {t("roles.createSubmit")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export interface CloneRoleTarget {
  id: string;
  name: string;
}

export function CloneRoleDialog({
  role,
  onOpenChange,
}: {
  role: CloneRoleTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("iam");
  const navigate = useNavigate();
  const cloneRole = useCloneRoleMutation();
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    setName(role ? `${role.name} copy` : "");
  }, [role]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!role) return;
    cloneRole.mutate(
      { params: { id: role.id }, body: { name } },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          void navigate({ to: "/admin/roles/$id", params: { id: result.body.role.id } });
        },
      },
    );
  }

  return (
    <Dialog open={role !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-h3 font-semibold text-text-primary">
              {role ? t("roles.cloneDialogTitle", { name: role.name }) : ""}
            </DialogTitle>
          </DialogHeader>
          <FormField label={t("roles.cloneNameLabel")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("roles.cloneCancel")}
            </Button>
            <Button type="submit" loading={cloneRole.isPending}>
              {t("roles.cloneSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The roles list (M1 §4.3): the Data Table organism over `GET /roles`, a "Create role" drawer
 * (matrix + optional template seed + save-as-template), clone, and the guarded delete flow — a 409
 * (role still bound to users) renders as an inline blocker linking to Users rather than a dead end
 * (MD3), instead of a generic mutation failure.
 */
export function RolesListPage() {
  const { t } = useTranslation("iam");
  const navigate = useNavigate();
  const roles = useRolesQuery();
  const deleteRole = useDeleteRoleMutation();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [cloneTarget, setCloneTarget] = React.useState<RoleSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RoleSummary | null>(null);
  const [blockedRole, setBlockedRole] = React.useState<{ name: string; count: number } | null>(null);

  function handleDelete(password?: string) {
    if (!deleteTarget) return;
    deleteRole.mutate(
      { params: { id: deleteTarget.id }, body: { super_admin_password: password ?? "" } },
      {
        onSuccess: () => setDeleteTarget(null),
        onError: (error) => {
          if (error.status === 409) {
            setBlockedRole({ name: deleteTarget.name, count: deleteTarget.user_count });
            setDeleteTarget(null);
          }
        },
      },
    );
  }

  const columns = React.useMemo<ColumnDef<RoleSummary>[]>(
    () => [
      textColumn<RoleSummary>("name", { header: t("roles.columnName"), sortable: true }),
      textColumn<RoleSummary>("permission_count", { header: t("roles.columnPermissions") }),
      textColumn<RoleSummary>("user_count", { header: t("roles.columnUsers") }),
    ],
    [t],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("roles.title")}</h1>
        <Button onClick={() => setCreateOpen(true)}>{t("roles.createRole")}</Button>
      </div>

      {blockedRole && (
        <div className="flex flex-col gap-2 rounded-md border border-warning bg-warning-subtle px-4 py-3 text-sm text-warning-on">
          <p>{t("roles.deleteBlockedBody", { count: blockedRole.count })}</p>
          <Link to={ADMIN_USERS_PATH} className="text-sm font-medium text-text-link">
            {t("roles.goToUsers")}
          </Link>
        </div>
      )}

      <DataTable
        data={roles.data?.body ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={roles.isLoading}
        error={roles.isError ? { message: t("roles.loadError") } : null}
        onRetry={() => roles.refetch()}
        emptyState={{ title: t("roles.empty") }}
        rowActions={(row) => [
          {
            key: "edit",
            label: t("roles.editAction"),
            onClick: () => void navigate({ to: "/admin/roles/$id", params: { id: row.id } }),
          },
          { key: "clone", label: t("roles.cloneAction"), onClick: () => setCloneTarget(row) },
          {
            key: "delete",
            label: t("roles.deleteAction"),
            destructive: true,
            onClick: () => setDeleteTarget(row),
          },
        ]}
      />

      <CreateRoleDrawer open={createOpen} onOpenChange={setCreateOpen} />
      <CloneRoleDialog role={cloneTarget} onOpenChange={(open) => !open && setCloneTarget(null)} />
      <GuardedActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        kind="role-delete"
        subject={deleteTarget?.name ?? ""}
        onConfirm={(result) => handleDelete(result.password)}
        loading={deleteRole.isPending}
      />
    </div>
  );
}
