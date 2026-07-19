import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { EmployeeStatus, EmploymentType } from "@erp/contracts";
import {
  Button,
  Combobox,
  DataTable,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  InkChip,
  Input,
  MaskedValue,
  MoneyCell,
  PermissionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  textColumn,
  useToast,
} from "@erp/ui";
import type { ChipStatus } from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import {
  useCreateEmployeeMutation,
  useEmployeesQuery,
  usePositionsQuery,
} from "../../../hr/queries.js";

interface EmployeeRow {
  id: string;
  empCode: string;
  name: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  hireDate: string;
  baseSalary: string | undefined;
}

const STATUS_FILTERS: Array<EmployeeStatus | "ALL"> = ["ALL", "PROBATION", "ACTIVE", "RESIGNED", "SUSPENDED"];

const STATUS_CHIP: Record<EmployeeStatus, ChipStatus> = {
  PROBATION: "pending",
  ACTIVE: "approved",
  RESIGNED: "void",
  SUSPENDED: "hold",
};

function CreateEmployeeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const positions = usePositionsQuery();
  const createEmployee = useCreateEmployeeMutation();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [nationalId, setNationalId] = React.useState("");
  const [employmentType, setEmploymentType] = React.useState<EmploymentType>("MONTHLY");
  const [positionId, setPositionId] = React.useState("");
  const [hireDate, setHireDate] = React.useState("");
  const [probationEndDate, setProbationEndDate] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setFirstName("");
      setLastName("");
      setNationalId("");
      setEmploymentType("MONTHLY");
      setPositionId("");
      setHireDate("");
      setProbationEndDate("");
    }
  }, [open]);

  const positionOptions = (positions.data?.body.positions ?? []).map((p) => ({
    value: p.id,
    label: p.title,
  }));

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createEmployee.mutate(
      {
        body: {
          first_name: firstName,
          last_name: lastName,
          national_id: nationalId || undefined,
          employment_type: employmentType,
          position_id: positionId || undefined,
          hire_date: hireDate,
          probation_end_date: probationEndDate || undefined,
          profile: {},
        },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("employees.createEmployee") });
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
              {t("employees.createDrawerTitle")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("employees.fieldFirstName")} required>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </FormField>
            <FormField label={t("employees.fieldLastName")} required>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </FormField>
            <FormField label={t("employees.fieldNationalId")}>
              <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
            </FormField>
            <FormField label={t("employees.fieldEmploymentType")} required>
              <Select value={employmentType} onValueChange={(value) => setEmploymentType(value as EmploymentType)}>
                <SelectTrigger aria-label={t("employees.fieldEmploymentType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">{t("employees.employmentMonthly")}</SelectItem>
                  <SelectItem value="DAILY">{t("employees.employmentDaily")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("employees.fieldPosition")}>
              <Combobox
                value={positionId}
                onValueChange={setPositionId}
                options={positionOptions}
                loading={positions.isLoading}
                aria-label={t("employees.fieldPosition")}
              />
            </FormField>
            <FormField label={t("employees.fieldHireDate")} required>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} required />
            </FormField>
            <FormField label={t("employees.fieldProbationEndDate")}>
              <Input
                type="date"
                value={probationEndDate}
                onChange={(e) => setProbationEndDate(e.target.value)}
              />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("employees.createCancel")}
            </Button>
            <Button type="submit" loading={createEmployee.isPending}>
              {t("employees.createSubmit")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The employees list (M2 §4.1): the Data Table organism over `GET /employees`, a status filter,
 * and a "Create employee" drawer (`hr.employee.manage`-gated). Salary is a masked money column —
 * omitted server-side without `hr.salary.view`, so `MaskedValue` never places a real figure in the
 * DOM for an unauthorized viewer. Row selection navigates to the tabbed employee detail.
 */
export function EmployeesListPage() {
  const { t } = useTranslation("hr");
  const navigate = useNavigate();
  const { density } = useDensity();
  const dateFormat = useDateFormat({ dateStyle: "medium" });

  const [statusFilter, setStatusFilter] = React.useState<EmployeeStatus | "ALL">("ALL");
  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const cursor = cursorStack[cursorStack.length - 1];

  const employees = useEmployeesQuery({
    ...(cursor ? { cursor } : {}),
    ...(statusFilter === "ALL" ? {} : { "filter[status]": statusFilter }),
  });

  React.useEffect(() => {
    setCursorStack([undefined]);
  }, [statusFilter]);

  const rows = React.useMemo<EmployeeRow[]>(
    () =>
      (employees.data?.body.data ?? []).map((e) => ({
        id: e.id,
        empCode: e.emp_code,
        name: `${e.first_name} ${e.last_name}`,
        status: e.status,
        employmentType: e.employment_type,
        hireDate: e.hire_date,
        baseSalary: e.base_salary,
      })),
    [employees.data],
  );

  const statusLabel = React.useCallback(
    (status: EmployeeStatus) =>
      status === "PROBATION"
        ? t("employees.statusProbation")
        : status === "ACTIVE"
          ? t("employees.statusActive")
          : status === "RESIGNED"
            ? t("employees.statusResigned")
            : t("employees.statusSuspended"),
    [t],
  );

  const columns = React.useMemo<ColumnDef<EmployeeRow>[]>(
    () => [
      textColumn<EmployeeRow>("empCode", { header: t("employees.columnCode"), mono: true }),
      textColumn<EmployeeRow>("name", { header: t("employees.columnName") }),
      {
        id: "status",
        header: t("employees.columnStatus"),
        cell: ({ row }) => <InkChip status={STATUS_CHIP[row.original.status]} label={statusLabel(row.original.status)} />,
      },
      textColumn<EmployeeRow>("employmentType", { header: t("employees.columnEmploymentType"), secondary: true }),
      {
        id: "hireDate",
        header: t("employees.columnHireDate"),
        meta: { secondary: true },
        cell: ({ row }) => dateFormat.format(new Date(row.original.hireDate)),
      },
      {
        id: "baseSalary",
        header: t("employees.columnBaseSalary"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <MaskedValue
            permission="hr.salary.view"
            value={row.original.baseSalary ? <MoneyCell value={row.original.baseSalary} /> : "—"}
          />
        ),
      },
    ],
    [t, statusLabel, dateFormat],
  );

  const nextCursor = employees.data?.body.next_cursor ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("employees.title")}</h1>
        <PermissionButton required="hr.employee.manage" onClick={() => setCreateOpen(true)}>
          {t("employees.createEmployee")}
        </PermissionButton>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        density={density}
        isLoading={employees.isLoading}
        error={employees.isError ? { message: t("employees.loadError") } : null}
        onRetry={() => employees.refetch()}
        emptyState={{ title: t("employees.empty") }}
        nextCursor={nextCursor}
        onNextPage={() => {
          if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
        }}
        onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
        rowActions={(row) => [
          {
            key: "view",
            label: t("employees.viewAction"),
            onClick: () => void navigate({ to: "/hr/employees/$id", params: { id: row.id } }),
          },
        ]}
        toolbar={
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EmployeeStatus | "ALL")}>
            <SelectTrigger aria-label={t("employees.filterStatusLabel")} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "ALL" ? t("employees.filterStatusAll") : statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <CreateEmployeeDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
