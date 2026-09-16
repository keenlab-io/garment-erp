import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { Department, Position } from "@erp/contracts";
import {
  Button,
  Combobox,
  ConfirmDialog,
  DataTable,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  PermissionButton,
  textColumn,
  usePermissions,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import {
  useCreateDepartmentMutation,
  useCreatePositionMutation,
  useDeleteDepartmentMutation,
  useDeletePositionMutation,
  useDepartmentsQuery,
  usePositionsQuery,
  useUpdateDepartmentMutation,
  useUpdatePositionMutation,
} from "../../../hr/queries.js";

interface PositionRow {
  id: string;
  title: string;
  departmentName: string;
  jobDescription: string;
}

interface DepartmentRow {
  id: string;
  name: string;
  parentName: string;
}

function CreatePositionDrawer({
  open,
  onOpenChange,
  onCreateDepartmentInstead,
  editing = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDepartmentInstead: () => void;
  editing?: Position | null;
}) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const departments = useDepartmentsQuery();
  const createPosition = useCreatePositionMutation();
  const updatePosition = useUpdatePositionMutation();

  const [title, setTitle] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [jobDescription, setJobDescription] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDepartmentId(editing?.department_id ?? "");
      setJobDescription(editing?.job_description ?? "");
    }
  }, [open, editing]);

  const departmentList = departments.data?.body.departments ?? [];
  const departmentOptions = departmentList.map((d) => ({ value: d.id, label: d.name }));
  const noDepartments = !editing && !departments.isLoading && departmentList.length === 0;
  const mutation = editing ? updatePosition : createPosition;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!departmentId) return;
    if (editing) {
      updatePosition.mutate(
        {
          params: { id: editing.id },
          body: { title, department_id: departmentId, job_description: jobDescription || null },
        },
        {
          onSuccess: () => {
            toast({ tone: "success", title: t("org.positionUpdated") });
            onOpenChange(false);
          },
        },
      );
      return;
    }
    createPosition.mutate(
      {
        body: {
          title,
          department_id: departmentId,
          job_description: jobDescription || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("org.positionCreated") });
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">
              {editing ? t("org.positionEditDrawerTitle") : t("org.positionDrawerTitle")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("org.fieldTitle")} required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </FormField>
            <FormField label={t("org.fieldDepartment")} required>
              <Combobox
                value={departmentId}
                onValueChange={setDepartmentId}
                options={departmentOptions}
                loading={departments.isLoading}
                aria-label={t("org.fieldDepartment")}
              />
            </FormField>
            {noDepartments && (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-sunken p-3">
                <p className="text-sm leading-relaxed text-text-secondary">{t("org.noDepartmentsHint")}</p>
                <Button type="button" variant="ghost" onClick={onCreateDepartmentInstead}>
                  {t("org.createDepartmentFirst")}
                </Button>
              </div>
            )}
            <FormField label={t("org.fieldJobDescription")}>
              <Input value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("org.createCancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!departmentId}>
              {editing ? t("org.saveChanges") : t("org.createPosition")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function CreateDepartmentDrawer({
  open,
  onOpenChange,
  editing = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Department | null;
}) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const departments = useDepartmentsQuery();
  const createDepartment = useCreateDepartmentMutation();
  const updateDepartment = useUpdateDepartmentMutation();

  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setParentId(editing?.parent_id ?? "");
    }
  }, [open, editing]);

  const departmentOptions = (departments.data?.body.departments ?? [])
    .filter((d) => d.id !== editing?.id)
    .map((d) => ({ value: d.id, label: d.name }));
  const mutation = editing ? updateDepartment : createDepartment;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (editing) {
      updateDepartment.mutate(
        { params: { id: editing.id }, body: { name, parent_id: parentId || null } },
        {
          onSuccess: () => {
            toast({ tone: "success", title: t("org.departmentUpdated") });
            onOpenChange(false);
          },
        },
      );
      return;
    }
    createDepartment.mutate(
      {
        body: {
          name,
          parent_id: parentId || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("org.departmentCreated") });
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">
              {editing ? t("org.departmentEditDrawerTitle") : t("org.departmentDrawerTitle")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("org.fieldName")} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label={t("org.fieldParent")}>
              <Combobox
                value={parentId}
                onValueChange={setParentId}
                options={departmentOptions}
                loading={departments.isLoading}
                aria-label={t("org.fieldParent")}
              />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("org.createCancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {editing ? t("org.saveChanges") : t("org.createDepartment")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Org structure (M2 §4): two stacked Data Tables over `GET /departments` and `GET /positions`
 * (neither cursor-paginated — the org tree is small), each with a `hr.employee.manage`-gated
 * create drawer. A position can never be created without a department: the position drawer's
 * department field shows a first-run hint + "Create a department first" shortcut into the
 * department drawer whenever the department list resolves empty, and its submit stays disabled
 * until a department is chosen.
 */
export function OrgStructurePage() {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const { has } = usePermissions();
  const { density } = useDensity();
  const canManage = has("hr.employee.manage");

  const positions = usePositionsQuery();
  const departments = useDepartmentsQuery();
  const deletePosition = useDeletePositionMutation();
  const deleteDepartment = useDeleteDepartmentMutation();

  const [positionDrawerOpen, setPositionDrawerOpen] = React.useState(false);
  const [departmentDrawerOpen, setDepartmentDrawerOpen] = React.useState(false);
  const [editingPosition, setEditingPosition] = React.useState<Position | null>(null);
  const [editingDepartment, setEditingDepartment] = React.useState<Department | null>(null);
  const [deletePositionTarget, setDeletePositionTarget] = React.useState<Position | null>(null);
  const [deleteDepartmentTarget, setDeleteDepartmentTarget] = React.useState<Department | null>(null);
  const [deletePositionError, setDeletePositionError] = React.useState<string | null>(null);
  const [deleteDepartmentError, setDeleteDepartmentError] = React.useState<string | null>(null);

  const departmentList = departments.data?.body.departments ?? [];
  const positionList = positions.data?.body.positions ?? [];
  const hasDepartments = departmentList.length > 0;

  function handleDeletePosition() {
    if (!deletePositionTarget) return;
    deletePosition.mutate(
      { params: { id: deletePositionTarget.id } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("org.positionDeleted") });
          setDeletePositionTarget(null);
          setDeletePositionError(null);
        },
        onError: (error) => {
          setDeletePositionError(error.status === 409 ? error.body.message : t("org.deleteGenericError"));
        },
      },
    );
  }

  function handleDeleteDepartment() {
    if (!deleteDepartmentTarget) return;
    deleteDepartment.mutate(
      { params: { id: deleteDepartmentTarget.id } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("org.departmentDeleted") });
          setDeleteDepartmentTarget(null);
          setDeleteDepartmentError(null);
        },
        onError: (error) => {
          setDeleteDepartmentError(error.status === 409 ? error.body.message : t("org.deleteGenericError"));
        },
      },
    );
  }

  const departmentNameById = React.useMemo(
    () => new Map(departmentList.map((d) => [d.id, d.name])),
    [departmentList],
  );

  const positionRows = React.useMemo<PositionRow[]>(
    () =>
      (positions.data?.body.positions ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        departmentName: departmentNameById.get(p.department_id) ?? "—",
        jobDescription: p.job_description ?? "—",
      })),
    [positions.data, departmentNameById],
  );

  const departmentRows = React.useMemo<DepartmentRow[]>(
    () =>
      departmentList.map((d) => ({
        id: d.id,
        name: d.name,
        parentName: d.parent_id ? (departmentNameById.get(d.parent_id) ?? "—") : "—",
      })),
    [departmentList, departmentNameById],
  );

  const positionColumns = React.useMemo<ColumnDef<PositionRow>[]>(
    () => [
      textColumn<PositionRow>("title", { header: t("org.columnTitle") }),
      textColumn<PositionRow>("departmentName", { header: t("org.columnDepartment") }),
      textColumn<PositionRow>("jobDescription", {
        header: t("org.columnJobDescription"),
        secondary: true,
      }),
    ],
    [t],
  );

  const departmentColumns = React.useMemo<ColumnDef<DepartmentRow>[]>(
    () => [
      textColumn<DepartmentRow>("name", { header: t("org.columnName") }),
      textColumn<DepartmentRow>("parentName", { header: t("org.columnParent"), secondary: true }),
    ],
    [t],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-h2 font-semibold text-text-primary">
            {t("org.positionsTitle")}
          </h2>
          <PermissionButton required="hr.employee.manage" onClick={() => setPositionDrawerOpen(true)}>
            {t("org.createPosition")}
          </PermissionButton>
        </div>

        <DataTable
          data={positionRows}
          columns={positionColumns}
          getRowId={(row) => row.id}
          tableId="hr-org-positions"
          density={density}
          isLoading={positions.isLoading}
          error={positions.isError ? { message: t("org.positionsLoadError") } : null}
          onRetry={() => positions.refetch()}
          emptyState={{
            title: t("org.positionsEmpty"),
            description: hasDepartments ? undefined : t("org.positionsEmptyNeedsDepartment"),
          }}
          rowActions={
            canManage
              ? (row) => [
                  {
                    key: "edit",
                    label: t("org.editAction"),
                    onClick: () => setEditingPosition(positionList.find((p) => p.id === row.id) ?? null),
                  },
                  {
                    key: "delete",
                    label: t("org.deleteAction"),
                    destructive: true,
                    onClick: () => {
                      setDeletePositionError(null);
                      setDeletePositionTarget(positionList.find((p) => p.id === row.id) ?? null);
                    },
                  },
                ]
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-h2 font-semibold text-text-primary">
            {t("org.departmentsTitle")}
          </h2>
          <PermissionButton
            required="hr.employee.manage"
            onClick={() => setDepartmentDrawerOpen(true)}
          >
            {t("org.createDepartment")}
          </PermissionButton>
        </div>

        <DataTable
          data={departmentRows}
          columns={departmentColumns}
          getRowId={(row) => row.id}
          tableId="hr-org-departments"
          density={density}
          isLoading={departments.isLoading}
          error={departments.isError ? { message: t("org.departmentsLoadError") } : null}
          onRetry={() => departments.refetch()}
          emptyState={{ title: t("org.departmentsEmpty") }}
          rowActions={
            canManage
              ? (row) => [
                  {
                    key: "edit",
                    label: t("org.editAction"),
                    onClick: () => setEditingDepartment(departmentList.find((d) => d.id === row.id) ?? null),
                  },
                  {
                    key: "delete",
                    label: t("org.deleteAction"),
                    destructive: true,
                    onClick: () => {
                      setDeleteDepartmentError(null);
                      setDeleteDepartmentTarget(departmentList.find((d) => d.id === row.id) ?? null);
                    },
                  },
                ]
              : undefined
          }
        />
      </div>

      <CreatePositionDrawer
        open={positionDrawerOpen || editingPosition !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPositionDrawerOpen(false);
            setEditingPosition(null);
          }
        }}
        editing={editingPosition}
        onCreateDepartmentInstead={() => {
          setPositionDrawerOpen(false);
          setDepartmentDrawerOpen(true);
        }}
      />
      <CreateDepartmentDrawer
        open={departmentDrawerOpen || editingDepartment !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDepartmentDrawerOpen(false);
            setEditingDepartment(null);
          }
        }}
        editing={editingDepartment}
      />

      <ConfirmDialog
        open={deletePositionTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeletePositionTarget(null);
            setDeletePositionError(null);
          }
        }}
        title={t("org.deletePositionTitle")}
        consequence={
          <div className="flex flex-col gap-2">
            <p>{t("org.deletePositionConsequence", { title: deletePositionTarget?.title ?? "" })}</p>
            {deletePositionError && <p className="text-sm text-danger">{deletePositionError}</p>}
          </div>
        }
        destructive
        confirmLabel={t("org.deleteAction")}
        cancelLabel={t("org.createCancel")}
        onConfirm={() => handleDeletePosition()}
        loading={deletePosition.isPending}
      />

      <ConfirmDialog
        open={deleteDepartmentTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteDepartmentTarget(null);
            setDeleteDepartmentError(null);
          }
        }}
        title={t("org.deleteDepartmentTitle")}
        consequence={
          <div className="flex flex-col gap-2">
            <p>{t("org.deleteDepartmentConsequence", { name: deleteDepartmentTarget?.name ?? "" })}</p>
            {deleteDepartmentError && <p className="text-sm text-danger">{deleteDepartmentError}</p>}
          </div>
        }
        destructive
        confirmLabel={t("org.deleteAction")}
        cancelLabel={t("org.createCancel")}
        onConfirm={() => handleDeleteDepartment()}
        loading={deleteDepartment.isPending}
      />
    </div>
  );
}
