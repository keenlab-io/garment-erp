import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { UserStatus } from "@erp/contracts";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { useCreateUserMutation, useRolesQuery, useUsersQuery } from "../../../iam/queries.js";
import { userStatusToChip } from "../../../iam/status-chips.js";

interface UserRow {
  id: string;
  username: string;
  email: string;
  status: UserStatus;
  roles: string;
  lastLoginAt: string | null;
}

const STATUS_FILTERS: Array<UserStatus | "ALL"> = ["ALL", "ACTIVE", "PENDING", "DISABLED"];

function CreateUserDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("iam");
  const { toast } = useToast();
  const roles = useRolesQuery();
  const createUser = useCreateUserMutation();

  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [tempPassword, setTempPassword] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setUsername("");
      setEmail("");
      setRoleIds([]);
      setTempPassword("");
    }
  }, [open]);

  const roleOptions = (roles.data?.body ?? []).map((role) => ({ value: role.id, label: role.name }));

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createUser.mutate(
      { body: { username, email, role_ids: roleIds, temp_password: tempPassword } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("users.createUser") });
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
              {t("users.createDrawerTitle")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("users.fieldUsername")} required>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </FormField>
            <FormField label={t("users.fieldEmail")} required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </FormField>
            <FormField label={t("users.fieldRoles")}>
              <Combobox
                multiple
                value={roleIds}
                onValueChange={setRoleIds}
                options={roleOptions}
                loading={roles.isLoading}
              />
            </FormField>
            <FormField label={t("users.fieldTempPassword")} required>
              <Input
                type="password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                required
              />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("users.createCancel")}
            </Button>
            <Button type="submit" loading={createUser.isPending}>
              {t("users.createSubmit")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The users-admin list (M1 §4.2): the Data Table organism over `GET /users`, a status filter, and a
 * "Create user" drawer. Row selection navigates to the user detail screen, which owns roles/sessions/
 * activity and the guarded force-logout action.
 */
export function UsersListPage() {
  const { t } = useTranslation("iam");
  const navigate = useNavigate();
  const { density } = useDensity();
  const dateFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });

  const [statusFilter, setStatusFilter] = React.useState<UserStatus | "ALL">("ALL");
  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const cursor = cursorStack[cursorStack.length - 1];

  const users = useUsersQuery({
    ...(cursor ? { cursor } : {}),
    ...(statusFilter === "ALL" ? {} : { "filter[status]": statusFilter }),
  });

  React.useEffect(() => {
    setCursorStack([undefined]);
  }, [statusFilter]);

  const rows = React.useMemo<UserRow[]>(
    () =>
      (users.data?.body.data ?? []).map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        roles: user.roles.map((r) => r.name).join(", ") || "—",
        lastLoginAt: user.last_login_at,
      })),
    [users.data],
  );

  const statusLabel = React.useCallback(
    (status: UserStatus) =>
      status === "ACTIVE"
        ? t("users.statusActive")
        : status === "PENDING"
          ? t("users.statusPending")
          : t("users.statusDisabled"),
    [t],
  );

  const columns = React.useMemo<ColumnDef<UserRow>[]>(
    () => [
      textColumn<UserRow>("username", { header: t("users.columnUsername"), sortable: true, mono: true }),
      textColumn<UserRow>("email", { header: t("users.columnEmail") }),
      {
        id: "status",
        header: t("users.columnStatus"),
        cell: ({ row }) => (
          <InkChip status={userStatusToChip(row.original.status)} label={statusLabel(row.original.status)} />
        ),
      },
      textColumn<UserRow>("roles", { header: t("users.columnRoles"), secondary: true }),
      {
        id: "lastLoginAt",
        header: t("users.columnLastLogin"),
        meta: { secondary: true },
        cell: ({ row }) =>
          row.original.lastLoginAt ? dateFormat.format(new Date(row.original.lastLoginAt)) : t("users.never"),
      },
    ],
    [t, statusLabel, dateFormat],
  );

  const nextCursor = users.data?.body.next_cursor ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("users.title")}</h1>
        <Button onClick={() => setCreateOpen(true)}>{t("users.createUser")}</Button>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        density={density}
        isLoading={users.isLoading}
        error={users.isError ? { message: t("users.loadError") } : null}
        onRetry={() => users.refetch()}
        emptyState={{ title: t("users.empty") }}
        nextCursor={nextCursor}
        onNextPage={() => {
          if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
        }}
        onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
        rowActions={(row) => [
          {
            key: "view",
            label: t("users.viewAction"),
            onClick: () => void navigate({ to: "/admin/users/$id", params: { id: row.id } }),
          },
        ]}
        toolbar={
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as UserStatus | "ALL")}
          >
            <SelectTrigger aria-label={t("users.filterStatusLabel")} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "ALL" ? t("users.filterStatusAll") : statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <CreateUserDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
