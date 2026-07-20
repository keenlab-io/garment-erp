# OT-request create UI — design

**Date:** 2026-07-20
**Status:** Approved (ready for implementation plan)
**Area:** `apps/web` (HR / M2)

## Problem

The app can approve overtime (OT) requests but has no way to **create** one. The OT
approvals page (`apps/web/src/router/routes/hr/ot-approvals.tsx`) lists only
`SUBMITTED` requests and lets an approver approve them. The create/submit path exists
at the contract and hook level — `createOtRequest`, `submitOtRequest`
(`packages/contracts/src/dto/hr.ts`), `useCreateOtRequestMutation`,
`useSubmitOtRequestMutation` (`apps/web/src/hr/queries.ts`) — but **no UI consumes it**,
so nothing can put a request into the queue except direct API calls.

This change adds a create-OT-request UI.

## Decisions (locked)

1. **Placement** — a "New OT request" button on the existing OT approvals page opens a
   right-side **Drawer** create form (mirrors `CreateEmployeeDrawer` in
   `employees-list.tsx`). No new route or nav entry.
2. **Save action** — the form **creates a DRAFT then immediately submits it** in one
   action, so the request lands in the approvals queue. (There is no DRAFT-management UI,
   so a saved-but-unsubmitted draft would be stranded — hence no "save draft" option.)
3. **rate_type** — a `Select` hardcoded to the configured seed set
   (`WEEKDAY_1_5`, `HOLIDAY_1_0`, `HOLIDAY_3_0`) with friendly labels. `create` does not
   validate `rate_type`, but payroll (`payroll-config.service.ts#otMultiplier`) throws
   `NotFoundError` if the value has no configured multiplier — so the form must only offer
   valid keys. A data-driven dropdown (new list-rates endpoint) is a deliberate
   non-goal here.
4. **Drawer lives in its own file** (`ot-request-create-drawer.tsx`), not inlined, for
   isolation and testability.

### Accepted trade-off

The approvals route is gated on `hr.ot.approve`; creating needs `hr.employee.manage`
(`apps/api/src/hr/hr.controller.ts:201`). So the button is only reachable by users who can
see the queue (`hr.ot.approve`) **and** shows only if they also hold `hr.employee.manage` —
in practice managers and super-admins. If create-only roles (e.g. line supervisors) need
access later, a dedicated `/hr/ot-requests/new` route is the follow-up. Accepted for now.

## Non-goals

- No DRAFT list/edit/management screen.
- No new contract or backend endpoints (rate list, etc.).
- No new route or sidebar nav entry.
- No cross-midnight OT windows (the model is one `work_date` + two `HH:mm` times).

## Components & files

| File | Change |
|---|---|
| `apps/web/src/router/routes/hr/ot-request-create-drawer.tsx` | **New** — `CreateOtRequestDrawer` component. |
| `apps/web/src/router/routes/hr/ot-approvals.tsx` | **Edit** — gated "New OT request" button + `createOpen` state; render the drawer. |
| `apps/web/src/hr/queries.ts` | **Edit** — add `hrKeys.otRequestsAll()` invalidation to `useSubmitOtRequestMutation` (consistent with approve/reconcile hooks) so the queue refreshes after submit. |
| `apps/web/src/i18n/resources/en.ts` + `th.ts` | **Edit** — new `otCreate` key section (en/th parity). |
| `apps/web/src/router/routes/hr/ot-request-create-drawer.test.tsx` | **New** — component tests. |

### `CreateOtRequestDrawer` — interface

```ts
interface CreateOtRequestDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Self-contained: owns its field state, employee query, create/submit mutations, validation,
toasts. Depends only on `@erp/ui`, the HR query hooks, and i18n. The parent
(`OtApprovalsPage`) owns only the `open` boolean and the trigger button.

## Form fields

Native `required` validation inside a `<form onSubmit>` (the app-wide convention — no form
library, no field-level errors except where noted).

| Field | Control | Contract shape | Notes |
|---|---|---|---|
| Employee | `Combobox` | `employee_id: uuid` | options from `useEmployeesQuery({ limit: 100 })` → `.body.data`; label `first_name last_name`. Required. |
| Work date | `Input type="date"` | `work_date` `YYYY-MM-DD` | native date input emits the exact format. Required. |
| Start time | `Input type="time"` | `start_time` `HH:mm` | Required. |
| End time | `Input type="time"` | `end_time` `HH:mm` | Required. |
| Rate type | `Select` | `rate_type` string | `WEEKDAY_1_5` / `HOLIDAY_1_0` / `HOLIDAY_3_0`. Required. |
| Reason | `Input` | `reason?` string | optional → `reason.trim() || undefined`. |

**Cross-field guard:** if `end_time <= start_time`, show a `FormField` error on the end-time
field and block submit (prevents zero/negative OT hours; native HTML can't express
cross-field rules). String comparison of `HH:mm` is ordering-correct.

## Data flow

Submit chains create → submit:

```
onSubmit(e):
  e.preventDefault()
  if (end <= start) { set field error; return }
  createOt.mutate({ body: { employee_id, work_date, start_time, end_time, rate_type, reason } }, {
    onSuccess: (res) => submitOt.mutate(
      { params: { id: res.body.ot_request.id }, body: undefined },
      { onSuccess: () => { toast({tone:"success", title: t("otCreate.submitted")});
                           onOpenChange(false); resetFields() },
        onError:   () => toast({tone:"danger", title: t("otCreate.submitError")}) },  // draft stranded
    ),
    onError: () => toast({tone:"danger", title: t("otCreate.createError")}),
  })
```

- Submit button: `loading={createOt.isPending || submitOt.isPending}`.
- Queue refresh: `useSubmitOtRequestMutation` invalidates `hrKeys.otRequestsAll()` on success;
  the approvals query (`filter[status]=SUBMITTED`) refetches and shows the new request.
- Fields reset on close (via `useEffect(..., [open])`, matching `CreateEmployeeDrawer`).

## Permissions / gating

The "New OT request" button renders only when the user can create — `hr.employee.manage`
(or super-admin). Gate it with the existing session hook:
`const { hasPermission } = useSession()` → `hasPermission("hr.employee.manage")`
(`apps/web/src/session/session-context.tsx:57`; super-admins bypass the set, mirroring the
backend `assertPermissions`). The button is **absent** (not merely disabled) when unpermitted.
The drawer form itself is unconditional — only its trigger is gated.

## i18n

New `otCreate` section added to **both** `hrEn` and `hrTh` with identical key sets and
identical `{{placeholder}}` tokens (enforced by `apps/web/src/i18n/completeness.test.ts` and
by typecheck via the `HrKey`/mapped-type parity). Keys (English shown; Thai translated):

```
otCreate: {
  newButton:      "New OT request",
  title:          "New OT request",
  fieldEmployee:  "Employee",
  fieldWorkDate:  "Work date",
  fieldStartTime: "Start time",
  fieldEndTime:   "End time",
  fieldRateType:  "Rate type",
  fieldReason:    "Reason",
  rateWeekday15:  "Weekday (1.5×)",
  rateHoliday10:  "Holiday (1.0×)",
  rateHoliday30:  "Holiday (3.0×)",
  submit:         "Submit for approval",
  cancel:         "Cancel",
  submitted:      "OT request submitted for approval.",
  createError:    "Couldn't create the OT request. Please try again.",
  submitError:    "Request created but couldn't be submitted. Please try again.",
  endBeforeStart: "End time must be after the start time.",
}
```

## Testing

New `ot-request-create-drawer.test.tsx` following the `stubFetch` pattern in
`report-schedules.test.tsx` / `ot-approvals.test.tsx`. The drawer is tested **in isolation**
(rendered with `open={true}` — no session gating needed) under `QueryClientProvider` +
`ToastProvider` + `I18nextProvider`:

1. **Happy path** — fill employee/date/times/rate, click Submit → asserts a `POST /ot-requests`
   fires **then** a `POST /ot-requests/:id/submit` fires (order + params), success toast shows,
   `onOpenChange(false)` is called.
2. **Create failure** — `POST /ot-requests` → 4xx/5xx → danger toast, no submit call.
3. **Validation** — `end_time <= start_time` → inline error shown, **no** network request fired.

Button-gating is covered in `ot-approvals.test.tsx`: rendered inside a `SessionProvider`
(from `session-context`) with a permitted user, the "New OT request" button is present; with a
user lacking `hr.employee.manage`, it is absent. (The existing `ot-approvals.test.tsx` mocks
`useDensity`; it will add a `SessionProvider` wrapper for these cases.)

Verification gates (all must pass): `pnpm --filter @erp/web test`, `typecheck`, `lint`, and the
existing `completeness.test.ts` (en/th parity).

## Rollout / risk

- Low blast radius: one new component, a button + state on one page, one hook tweak, i18n keys.
- The `useSubmitOtRequestMutation` invalidation change also benefits any future submit caller.
- Main residual risk is the hardcoded rate list drifting from `ot_rate` config; acceptable and
  noted as a future data-driven enhancement.
