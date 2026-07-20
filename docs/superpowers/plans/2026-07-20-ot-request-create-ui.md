# OT-request Create UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New OT request" Drawer form to the OT approvals page that creates an OT request and submits it into the approval queue in one action.

**Architecture:** A self-contained `CreateOtRequestDrawer` component (its own file) owns the form state, employee lookup, create+submit mutations, validation, and toasts. `OtApprovalsPage` gains a permission-gated trigger button and the `open` state. The submit hook gains cache invalidation so the queue refreshes. No new routes, nav entries, or backend/contract changes.

**Tech Stack:** React 18, TanStack Router + Query, `@ts-rest/react-query` client, `@erp/ui` (Radix-based) components, i18next, Vitest + Testing Library.

## Global Constraints

- **Money & quantity cross the wire as strings** — not relevant here (OT create has no money fields), but never introduce float money/qty.
- **Contracts are the source of truth** — do NOT edit `@erp/contracts`; consume `createOtRequest` / `submitOtRequest` as-is.
- **ESM / NodeNext** — relative imports in `apps/web` source use explicit `.js` extensions (e.g. `../../../hr/queries.js`).
- **Semantic design tokens only** in style strings — no raw hex, no `--ink-*`/`--cyan-*`/`--magenta-*`/`--substrate-*` primitives (ESLint-enforced).
- **`apps/web` never imports `apps/api`** — communicate only through `@erp/contracts`.
- **i18n parity** — every key added to `hrEn` must have a matching `hrTh` key with identical `{{placeholders}}`; enforced by `apps/web/src/i18n/completeness.test.ts` and by typecheck.
- **rate_type valid set** (must match `packages/db/src/seed/seed.ts`): `WEEKDAY_1_5`, `HOLIDAY_1_0`, `HOLIDAY_3_0`. Any other value breaks payroll later.
- **Create permission**: `hr.employee.manage` (from `apps/api/src/hr/hr.controller.ts:201`).
- **Verify before done**: `pnpm --filter @erp/web test`, `pnpm --filter @erp/web typecheck`, `pnpm --filter @erp/web lint` all green.

---

## Task 0: Setup — feature branch

**Files:** none (git only).

- [ ] **Step 1: Branch off main**

We are on `main`; per repo convention, branch before implementing.

Run:
```bash
cd /workspaces/garment-erp
git checkout -b feat/ot-request-create-ui
```

> Note: the working tree already contains the earlier OT drawer bugfix (`ot-approvals.tsx` + `ot-approvals.test.tsx`, uncommitted). Leave those changes in place — this feature builds directly on them. If you want them as a separate commit first, run `git add apps/web/src/router/routes/hr/ot-approvals.tsx apps/web/src/router/routes/hr/ot-approvals.test.tsx && git commit -m "fix(web): OT approvals detail drawer opened on mount"` before Task 1. Otherwise they will be committed alongside Task 3.

---

## Task 1: i18n keys — `otCreate` section (en + th)

**Files:**
- Modify: `apps/web/src/i18n/resources/en.ts` (the `hr` namespace object — add an `otCreate` section as a sibling of `approvals`)
- Modify: `apps/web/src/i18n/resources/th.ts` (same section, translated, identical key set)
- Test: `apps/web/src/i18n/completeness.test.ts` (existing — must stay green)

**Interfaces:**
- Produces: i18n keys under the `hr` namespace consumed by later tasks via `t("otCreate.<key>")`:
  `newButton`, `title`, `fieldEmployee`, `fieldWorkDate`, `fieldStartTime`, `fieldEndTime`, `fieldRateType`, `fieldReason`, `rateWeekday15`, `rateHoliday10`, `rateHoliday30`, `submit`, `cancel`, `submitted`, `createError`, `submitError`, `endBeforeStart`, `employeeRequired`.

- [ ] **Step 1: Add the English keys**

In `apps/web/src/i18n/resources/en.ts`, inside the `hr` namespace object, add this section adjacent to the existing `approvals` section (a new object property — keep the trailing comma conventions of the surrounding file):

```ts
    otCreate: {
      newButton: "New OT request",
      title: "New OT request",
      fieldEmployee: "Employee",
      fieldWorkDate: "Work date",
      fieldStartTime: "Start time",
      fieldEndTime: "End time",
      fieldRateType: "Rate type",
      fieldReason: "Reason",
      rateWeekday15: "Weekday (1.5×)",
      rateHoliday10: "Holiday (1.0×)",
      rateHoliday30: "Holiday (3.0×)",
      submit: "Submit for approval",
      cancel: "Cancel",
      submitted: "OT request submitted for approval.",
      createError: "Couldn't create the OT request. Please try again.",
      submitError: "Request created but couldn't be submitted. Please try again.",
      endBeforeStart: "End time must be after the start time.",
      employeeRequired: "Select an employee.",
    },
```

- [ ] **Step 2: Add the Thai keys**

In `apps/web/src/i18n/resources/th.ts`, inside the `hr` namespace object, add the matching section (identical keys, same order):

```ts
    otCreate: {
      newButton: "สร้างคำขอ OT",
      title: "คำขอ OT ใหม่",
      fieldEmployee: "พนักงาน",
      fieldWorkDate: "วันที่ทำงาน",
      fieldStartTime: "เวลาเริ่ม",
      fieldEndTime: "เวลาสิ้นสุด",
      fieldRateType: "ประเภทอัตรา",
      fieldReason: "เหตุผล",
      rateWeekday15: "วันธรรมดา (1.5×)",
      rateHoliday10: "วันหยุด (1.0×)",
      rateHoliday30: "วันหยุด (3.0×)",
      submit: "ส่งเพื่ออนุมัติ",
      cancel: "ยกเลิก",
      submitted: "ส่งคำขอ OT เพื่ออนุมัติแล้ว",
      createError: "ไม่สามารถสร้างคำขอ OT ได้ กรุณาลองอีกครั้ง",
      submitError: "สร้างคำขอแล้วแต่ส่งไม่สำเร็จ กรุณาลองอีกครั้ง",
      endBeforeStart: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
      employeeRequired: "กรุณาเลือกพนักงาน",
    },
```

- [ ] **Step 3: Verify parity + typecheck**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web test -- --run src/i18n/completeness.test.ts
pnpm --filter @erp/web typecheck
```
Expected: completeness test PASS (en/th key sets identical, no blank values, placeholders match); typecheck PASS (the `HrKey` mapped type now includes `otCreate.*`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/resources/en.ts apps/web/src/i18n/resources/th.ts
git commit -m "feat(web): add otCreate i18n keys for OT request form"
```

---

## Task 2: `CreateOtRequestDrawer` component + submit-hook invalidation

**Files:**
- Modify: `apps/web/src/hr/queries.ts:171-173` (add invalidation to `useSubmitOtRequestMutation`)
- Create: `apps/web/src/router/routes/hr/ot-request-create-drawer.tsx`
- Test: `apps/web/src/router/routes/hr/ot-request-create-drawer.test.tsx`

**Interfaces:**
- Consumes: `t("otCreate.*")` keys from Task 1; `useCreateOtRequestMutation`, `useSubmitOtRequestMutation`, `useEmployeesQuery` from `../../../hr/queries.js`; `hrKeys.otRequestsAll` from the same module.
- Produces:
  ```ts
  export function CreateOtRequestDrawer(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }): React.ReactElement;
  ```

- [ ] **Step 1: Add queue invalidation to the submit hook**

In `apps/web/src/hr/queries.ts`, replace the current bare `useSubmitOtRequestMutation` (lines 171-173):

```ts
export function useSubmitOtRequestMutation() {
  return api.hr.submitOtRequest.useMutation();
}
```

with (mirrors `useApproveOtRequestMutation` directly below it — `useQueryClient` is already imported at the top of the file):

```ts
export function useSubmitOtRequestMutation() {
  const queryClient = useQueryClient();
  return api.hr.submitOtRequest.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hrKeys.otRequestsAll() });
    },
  });
}
```

- [ ] **Step 2: Write the failing tests for the drawer**

Create `apps/web/src/router/routes/hr/ot-request-create-drawer.test.tsx`:

```tsx
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { CreateOtRequestDrawer } from "./ot-request-create-drawer";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return (await handler(url, init)) ?? jsonResponse({}, 404);
    }),
  );
}

const EMPLOYEE = { id: "22222222-2222-2222-2222-222222222222", first_name: "Somchai", last_name: "Jaidee" };
const DRAFT = {
  id: "11111111-1111-1111-1111-111111111111",
  employee_id: EMPLOYEE.id,
  work_date: "2026-07-20",
  start_time: "18:00",
  end_time: "20:00",
  reason: null,
  rate_type: "WEEKDAY_1_5",
  approved_hours: null,
  status: "DRAFT",
  approver_id: null,
  version: 0,
};

function renderDrawer(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CreateOtRequestDrawer open onOpenChange={onOpenChange} />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { onOpenChange };
}

async function pickEmployee(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox"));
  await user.type(screen.getByRole("textbox"), "som");
  await user.click(await screen.findByRole("option", { name: "Somchai Jaidee" }));
}

describe("CreateOtRequestDrawer", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates then submits an OT request, toasts, and closes", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (url.endsWith("/ot-requests") && method === "POST") {
        calls.push("create");
        return jsonResponse({ ot_request: DRAFT }, 201);
      }
      if (url.includes("/ot-requests/") && url.endsWith("/submit") && method === "POST") {
        calls.push("submit");
        return jsonResponse({ ot_request: { ...DRAFT, status: "SUBMITTED" } });
      }
      return undefined;
    });

    const user = userEvent.setup();
    const { onOpenChange } = renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText("Work date"), "2026-07-20");
    await user.type(screen.getByLabelText("Start time"), "18:00");
    await user.type(screen.getByLabelText("End time"), "20:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(calls).toEqual(["create", "submit"]));
    expect(await screen.findByText("OT request submitted for approval.")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a create error and does not submit when create fails", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (url.endsWith("/ot-requests") && method === "POST") {
        calls.push("create");
        return jsonResponse({ code: "INTERNAL", message: "boom", details: {} }, 500);
      }
      if (url.endsWith("/submit") && method === "POST") {
        calls.push("submit");
        return jsonResponse({ ot_request: DRAFT });
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText("Work date"), "2026-07-20");
    await user.type(screen.getByLabelText("Start time"), "18:00");
    await user.type(screen.getByLabelText("End time"), "20:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    expect(await screen.findByText("Couldn't create the OT request. Please try again.")).toBeInTheDocument();
    expect(calls).toEqual(["create"]);
  });

  it("blocks submit with a validation error when end is not after start", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (method === "POST") {
        calls.push("post");
        return jsonResponse({ ot_request: DRAFT }, 201);
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText("Work date"), "2026-07-20");
    await user.type(screen.getByLabelText("Start time"), "20:00");
    await user.type(screen.getByLabelText("End time"), "18:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    expect(await screen.findByText("End time must be after the start time.")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web test -- --run src/router/routes/hr/ot-request-create-drawer.test.tsx
```
Expected: FAIL — `CreateOtRequestDrawer` does not exist yet (import/resolve error).

- [ ] **Step 4: Implement the component**

Create `apps/web/src/router/routes/hr/ot-request-create-drawer.tsx`:

```tsx
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Combobox,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@erp/ui";
import {
  useCreateOtRequestMutation,
  useEmployeesQuery,
  useSubmitOtRequestMutation,
} from "../../../hr/queries.js";

/** Valid OT rate keys — must match the `ot_rate` config seed (packages/db seed). */
const RATE_TYPES = ["WEEKDAY_1_5", "HOLIDAY_1_0", "HOLIDAY_3_0"] as const;

/**
 * Create-OT-request form (M2 §4.3): a drawer that creates a DRAFT then immediately submits it into
 * the approval queue. There is no draft-management UI, so create and submit are one action. Gated
 * upstream by the `hr.employee.manage` PermissionButton that opens it.
 */
export function CreateOtRequestDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const employees = useEmployeesQuery({ limit: 100 });
  const createOt = useCreateOtRequestMutation();
  const submitOt = useSubmitOtRequestMutation();

  const [employeeId, setEmployeeId] = React.useState("");
  const [workDate, setWorkDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [rateType, setRateType] = React.useState<string>("WEEKDAY_1_5");
  const [reason, setReason] = React.useState("");
  const [employeeError, setEmployeeError] = React.useState<string | null>(null);
  const [timeError, setTimeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEmployeeId("");
      setWorkDate("");
      setStartTime("");
      setEndTime("");
      setRateType("WEEKDAY_1_5");
      setReason("");
      setEmployeeError(null);
      setTimeError(null);
    }
  }, [open]);

  const employeeOptions = (employees.data?.body.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.first_name} ${e.last_name}`,
  }));

  const rateLabel: Record<(typeof RATE_TYPES)[number], string> = {
    WEEKDAY_1_5: t("otCreate.rateWeekday15"),
    HOLIDAY_1_0: t("otCreate.rateHoliday10"),
    HOLIDAY_3_0: t("otCreate.rateHoliday30"),
  };

  const pending = createOt.isPending || submitOt.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    let invalid = false;
    if (!employeeId) {
      setEmployeeError(t("otCreate.employeeRequired"));
      invalid = true;
    } else {
      setEmployeeError(null);
    }
    if (startTime && endTime && endTime <= startTime) {
      setTimeError(t("otCreate.endBeforeStart"));
      invalid = true;
    } else {
      setTimeError(null);
    }
    if (invalid) return;

    let created;
    try {
      created = await createOt.mutateAsync({
        body: {
          employee_id: employeeId,
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          rate_type: rateType,
          reason: reason.trim() || undefined,
        },
      });
    } catch {
      toast({ tone: "danger", title: t("otCreate.createError") });
      return;
    }

    try {
      await submitOt.mutateAsync({ params: { id: created.body.ot_request.id }, body: undefined });
    } catch {
      toast({ tone: "danger", title: t("otCreate.submitError") });
      return;
    }

    toast({ tone: "success", title: t("otCreate.submitted") });
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">
              {t("otCreate.title")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("otCreate.fieldEmployee")} required error={employeeError ?? undefined}>
              <Combobox
                value={employeeId}
                onValueChange={setEmployeeId}
                options={employeeOptions}
                loading={employees.isLoading}
                aria-label={t("otCreate.fieldEmployee")}
              />
            </FormField>
            <FormField label={t("otCreate.fieldWorkDate")} required>
              <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
            </FormField>
            <FormField label={t("otCreate.fieldStartTime")} required>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </FormField>
            <FormField label={t("otCreate.fieldEndTime")} required error={timeError ?? undefined}>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </FormField>
            <FormField label={t("otCreate.fieldRateType")} required>
              <Select value={rateType} onValueChange={setRateType}>
                <SelectTrigger aria-label={t("otCreate.fieldRateType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rateLabel[rt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("otCreate.fieldReason")}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("otCreate.cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("otCreate.submit")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web test -- --run src/router/routes/hr/ot-request-create-drawer.test.tsx
```
Expected: PASS (3 tests). If the create-error test's toast wording differs, align the stubbed error body — the ts-rest client rejects on non-2xx, driving the outer `catch`.

- [ ] **Step 6: Typecheck + lint the new file**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web typecheck
pnpm --filter @erp/web lint
```
Expected: PASS. If typecheck flags `created.body.ot_request` as a union (multiple success statuses), narrow with `if (created.status !== 201) { toast danger createError; return; }` before reading `created.body.ot_request.id`. (The analogous `createQuotation` in `sales/document-editor.tsx:127` reads `.body.quotation` directly, so direct access is expected to typecheck.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hr/queries.ts apps/web/src/router/routes/hr/ot-request-create-drawer.tsx apps/web/src/router/routes/hr/ot-request-create-drawer.test.tsx
git commit -m "feat(web): OT request create drawer (create + submit)"
```

---

## Task 3: Wire the drawer into `OtApprovalsPage`

**Files:**
- Modify: `apps/web/src/router/routes/hr/ot-approvals.tsx`
- Modify: `apps/web/src/router/routes/hr/ot-approvals.test.tsx`

**Interfaces:**
- Consumes: `CreateOtRequestDrawer` from `./ot-request-create-drawer.js`; `PermissionButton` from `@erp/ui`; `t("otCreate.newButton")` from Task 1.

- [ ] **Step 1: Write the failing integration test**

The existing `ot-approvals.test.tsx` renders `OtApprovalsPage` without a session provider. After this task the page uses `PermissionButton`, which calls `usePermissions()` — so `renderPage` must wrap in `SessionProvider` (it provides `PermissionsProvider`). Update the test file:

Add imports near the top:
```tsx
import { within } from "@testing-library/react";
import { SessionProvider } from "../../../session/session-context";
import type { AuthUser } from "../../../session/dev-user";
```
(`within` joins the existing `@testing-library/react` import — either add it to that import or import separately as shown.)

Add a permitted user constant (a super admin bypasses all permission checks):
```tsx
const MANAGER: AuthUser = {
  id: "u1",
  name: "Manager",
  email: "m@example.com",
  isSuperAdmin: true,
  permissions: [],
};
```

Replace the existing `renderPage` body's provider tree so `SessionProvider` wraps the page:
```tsx
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider initialUser={MANAGER}>
          <ToastProvider>
            <OtApprovalsPage />
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}
```

Add a new test inside the `describe("OtApprovalsPage", ...)` block:
```tsx
  it("opens the create drawer from the 'New OT request' button", async () => {
    stubHappyPath();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "New OT request" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("New OT request")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web test -- --run src/router/routes/hr/ot-approvals.test.tsx
```
Expected: FAIL — the new test can't find a "New OT request" button (button not added yet). The two pre-existing tests may also error now that `renderPage` wraps `SessionProvider` but the page doesn't yet consume it — that's fine; they go green in Step 4.

- [ ] **Step 3: Add the button, state, and drawer to the page**

In `apps/web/src/router/routes/hr/ot-approvals.tsx`:

(a) Extend the `@erp/ui` import to include `PermissionButton` (keep the others), and import the drawer. The import block becomes:
```tsx
import {
  Button,
  DataTable,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  InkChip,
  PermissionButton,
  statusColumn,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useApproveOtRequestMutation, useEmployeesQuery, useOtRequestsQuery } from "../../../hr/queries.js";
import { otRequestStatusToChip } from "../../../hr/chip-status.js";
import { CreateOtRequestDrawer } from "./ot-request-create-drawer.js";
```

(b) Add create-drawer state next to the existing `detailId` state:
```tsx
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
```

(c) Replace the page header `<h1>` (currently the first child of the outer `<div>`) with a header row that carries the gated button:
```tsx
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("approvals.otTitle")}</h1>
        <PermissionButton required="hr.employee.manage" onClick={() => setCreateOpen(true)}>
          {t("otCreate.newButton")}
        </PermissionButton>
      </div>
```

(d) Render the create drawer — add it just before the closing `</div>` of the page (after the existing detail `<Drawer>…</Drawer>`):
```tsx
      <CreateOtRequestDrawer open={createOpen} onOpenChange={setCreateOpen} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web test -- --run src/router/routes/hr/ot-approvals.test.tsx
```
Expected: PASS — all tests (drawer-closed-on-mount, view roundtrip, and the new create-button test).

- [ ] **Step 5: Typecheck + lint**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web typecheck
pnpm --filter @erp/web lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/router/routes/hr/ot-approvals.tsx apps/web/src/router/routes/hr/ot-approvals.test.tsx
git commit -m "feat(web): add New OT request button to OT approvals page"
```

---

## Task 4: Full verification & drive the flow

**Files:** none (verification only).

- [ ] **Step 1: Run the full web suite + typecheck + lint**

Run:
```bash
cd /workspaces/garment-erp
pnpm --filter @erp/web test -- --run
pnpm --filter @erp/web typecheck
pnpm --filter @erp/web lint
```
Expected: all green (including `i18n/completeness.test.ts`). Investigate and fix any regression before proceeding — do not claim done on a red suite.

- [ ] **Step 2: Drive the real flow (verify skill)**

The dev stack is running (api :3000, web :5173). Open the app, navigate to **HR → OT approvals** as a user with `hr.employee.manage` (dev super-admin by default), click **New OT request**, fill the form (employee, work date, 18:00–20:00, Weekday 1.5×), submit, and confirm: success toast appears, drawer closes, and the new `SUBMITTED` request shows in the queue. Also confirm the `end ≤ start` inline error blocks submit. Use the `verify` skill / driving the browser rather than trusting tests alone.

- [ ] **Step 3: Final review + branch handoff**

Run `git log --oneline main..HEAD` to confirm the commits, then use `superpowers:finishing-a-development-branch` to decide merge/PR. Do not push or open a PR unless the user asks.

---

## Self-review notes (author)

- **Spec coverage:** placement (Task 3), create+submit one action (Task 2 handleSubmit), hardcoded rate dropdown (Task 2 `RATE_TYPES`), separate file (Task 2), invalidation (Task 2 Step 1), gating via `hr.employee.manage` (Task 3 `PermissionButton`), i18n en/th parity (Task 1), all four test cases (Tasks 2–3), verification gates (Task 4).
- **Gating refinement vs spec:** the spec said the button is "absent when unpermitted." The established convention for in-context action buttons is `PermissionButton` (disabled + "Requires hr.employee.manage" tooltip), matching `employees-list.tsx`'s create button and the "Absent vs disabled" design rule (absent is for nav entries; disabled-with-tooltip for in-context actions). Task 3 follows the convention. Flag to reviewer.
- **Key names:** `otCreate.*` used identically across Tasks 1–3; `hrKeys.otRequestsAll` matches `queries.ts`. `CreateOtRequestDrawer` prop names (`open`, `onOpenChange`) consistent across component and both test files.
