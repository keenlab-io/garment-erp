# M2 — HR & Payroll: Design

## Context

M0 shipped the platform infra and M1 the RBAC layer; neither models an employee or
computes pay. M2 builds the workforce domain on top of what exists and adds three
never-before-needed capabilities. What M2 **reuses verbatim** (verified in the codebase):

- `StorageService` (`apps/api/src/storage/`) — `put(key, body, contentType?)`,
  `getSignedUrl(key, expiresInSeconds=900)`, `delete(key)`; keys are caller-formed.
- `PdfService.renderHtml(html) → Buffer` (`apps/api/src/pdf/`) — a single shared Chromium;
  today it runs inline and has **no worker or producer** yet.
- `QueueModule` (`@Global`) + `BaseWorker<T,R>` + pre-registered queues
  `email|line|pdf|mv-refresh|default` + `DEFAULT_JOB_OPTIONS` (5 attempts, exp backoff,
  `removeOnComplete:1000`). No worker subclasses, producers, or repeatable jobs exist yet —
  M2 writes the first ones.
- `SequenceService.next(key)` and the already-seeded `EMPLOYEE` `document_sequence` row.
- `AuthUser { id, isSuperAdmin, permissions }`, `@CurrentUser()`, `assertPermissions`
  (`apps/api/src/auth/`); the 7 `hr.*` codes already in the `@erp/contracts` catalog.
- `UnitOfWork.withTransaction` + `currentExecutor`, `EventBusService` +
  `AuditSubscriber`, `AppException` subclasses, `buildPage`, and the
  `withErrors`/`paginated`/`jobAccepted`/`API_PREFIX` contract helpers.
- `money`/`qty`/`rate`/`auditColumns`/`versionColumn`/`citext` schema helpers
  (`@erp/db/base-columns.ts`).

What is **net-new** (confirmed nothing exists): symmetric encryption + a key env var;
a field-gating/projection helper; BullMQ producers/workers; scheduled-job plumbing; the
`employee`/`hr` schema and the `user.employeeId` FK. This document records how M2 builds
those and the choices behind them. Sources: `docs/BACKEND_SPEC_M1-M6.md` §2 and
`docs/plans/M2-hr-payroll.md`.

## Goals / Non-Goals

**Goals:**

- A complete, auditable HR/payroll backend: employees + org + docs, salary/components, OT,
  cash advances, attendance, payroll runs, e-payslips, and statutory export inputs.
- PII encrypted at rest with server-side-only, audited decryption.
- A payroll engine whose `calculate` is async and whose `breakdown` snapshot is immutable
  once approved, with the net formula correct **to the cent**.
- Reusable primitives (encryption helper, salary-gating projection, first BullMQ
  worker/producer + scheduled-job pattern) that M3–M6 inherit.

**Non-Goals:**

- **No frontend** — `apps/web` HR screens are a separate change.
- **No authoritative tax/SSO computation** — rates/ceilings are configurable and flagged
  non-authoritative (accountant confirmation); exports are *inputs*, not filings.
- **No production KMS** — dev uses an env-var encryption key; KMS is an open question.
- **No new domain beyond §2** — timekeeping devices, leave management, and benefits are out
  of scope.
- **No M1 re-implementation** — M2 assumes M1's users/roles/audit and only adds the FK back
  from `user.employeeId`.

## Decisions

### D1. PII encryption — AES-256-GCM at the service layer

A `common/crypto/` helper (`encrypt(plain) → Buffer`, `decrypt(buf) → string`) uses Node's
built-in `crypto` with AES-256-GCM. The stored `bytea` is `iv‖authTag‖ciphertext`; bank
fields inside `profile jsonb` are stored as base64 ciphertext strings. The 32-byte key
comes from a new `ENCRYPTION_KEY` env var, zod-validated fail-fast at boot (like the JWT
secrets). Encryption/decryption happen **only** in the service layer — the wire and the DB
never see plaintext PII — and each decrypt of a PII field is audited (`AuditService`).

*Alternative considered:* pgcrypto column encryption — rejected; puts the key in the DB and
couples encryption to SQL. *Consequence:* national ID is not queryable/uniquely-indexable
in ciphertext form; if lookup-by-national-ID is ever needed, add a separate blind-index
(HMAC) column — out of scope now.

### D2. Payslip PDF encryption — native `qpdf`

`PdfService.renderHtml()` emits an **unencrypted** buffer, so password protection is
net-new. M2 pipes the buffer through `qpdf --encrypt <userpw> <ownerpw> 256` via the
`node-qpdf2` wrapper, then `StorageService.put(pdf_key, encrypted)`. `qpdf` is added as an
apt package to `.devcontainer/Dockerfile` (alongside the Chromium libs M0 already added)
and noted for the production image. The per-employee open password defaults to the
national ID (configurable, per spec §2.5). Download returns a `getSignedUrl` 302 to the
already-password-protected object.

*Alternative considered:* `muhammara` (npm, native build) — avoids a system binary but is a
heavier native module; the user chose the qpdf binary. *Consequence:* the API image needs
`qpdf` present; the e-payslip worker will fail fast if it's missing.

### D3. Payroll parameters — effective-dated DB config tables

Rather than env constants, tax/SSO/OT/advance parameters live in admin-editable,
effective-dated tables: `tax_bracket` (progressive bands), `sso_config` (rate + wage
ceiling), `ot_rate` (multiplier per `rate_type`, e.g. `WEEKDAY_1_5`, `HOLIDAY_3_0`), and
`advance_policy` (ceiling as % of base or by tenure). The engine selects the
current-effective rows at calculation time and snapshots the resolved values into
`payslip.breakdown`. All are flagged **non-authoritative**.

*Alternative considered:* app config/env — simplest but not runtime-editable; rejected as
less faithful to "configurable." *Consequence:* the payroll engine reads config in the same
transaction/period context so a mid-period rate change does not retroactively alter an
already-CALCULATED run.

### D4. Async payroll `calculate` — BullMQ job, idempotent on `run_id`

`POST /payroll-runs/{id}/calculate` enqueues a job (the repo's first producer) and returns
202 `{ job_id }`. The worker builds one `payslip` per active employee, computing the net
formula and snapshotting every input into `breakdown`. The job return value is retrievable
by `job_id` (`removeOnComplete:1000`), backing the 202-poll pattern. The worker is
**idempotent on `run_id`** (upsert on `unique(run_id, employee_id)`) so a re-enqueue does
not double-post. Recalculation is allowed only while the run is DRAFT/CALCULATED; APPROVED
runs are frozen.

### D5. e-Payslip generation — the `pdf` worker

Payslip PDFs are produced by a `@Processor('pdf')` worker extending `BaseWorker`: render
(D2) → encrypt → store → set `payslip.pdf_key` → emit `PayslipGenerated`. Generation is
triggered per-employee after a run is calculated/approved. The worker is idempotent on
`payslip.id`.

### D6. Probation-alert scheduling — a BullMQ repeatable job

No cron/scheduler exists today. M2 adds a daily **BullMQ repeatable job** (upserted at
module init) that scans for employees whose `probation_end_date` falls within N days and
emits `ProbationEnding` (async notification consumers). This avoids adding
`@nestjs/schedule` and reuses the existing queue infra. N is configurable.

*Alternative considered:* `@nestjs/schedule` `@Cron` — simpler decorator, but adds a
dependency and a second scheduling mechanism; the BullMQ approach keeps one job system.

### D7. Salary field gating — a projection helper, omit not null

A reusable helper in `common/` takes `AuthUser` + a record and **deletes** monetary keys
(base salary, components, gross/net, breakdown) when
`!user.isSuperAdmin && !user.permissions.has('hr.salary.view')` — omitted entirely, never
nulled-then-shown (spec §2.8). Contract response schemas model salary fields as **optional**
so the gated shape still validates. Handlers read the user via `@CurrentUser()`.

### D8. `emp_code` format — adjust the seeded sequence

The seeded `EMPLOYEE` `document_sequence` row is `EXT{yyyy}{seq:0000}` (year-embedded), but
the spec's `emp_code` is `EXT0001` (no year). M2 updates that seed row to
`includeYear:false`, `format:"{prefix}{seq:0000}"`.

### D9. `user.employeeId` FK — M2's migration

M1 adds `user.employeeId` as a bare nullable column (no FK, since `employee` didn't exist).
M2's migration creates `employee` and adds the FK constraint `user.employeeId →
employee(id)`.

### D10. M1 dependency & sequencing

M2 depends on M1: role/permission enforcement for the `hr.*` gates, the audit query,
`is_super_admin` for cash-advance approval, and the `user.employeeId` column. M1 is an
un-applied proposal. The M2 **proposal** is authored now; **implementation** must land after
M1 (or coordinate the shared `platform/users.ts` edit). Recorded so `/opsx:apply` sequences
correctly.

### D11. OT hourly rate

`hourly_rate` derives from the employee's current `base_salary` and an hours basis by
`employment_type` (MONTHLY → salary ÷ standard monthly hours; DAILY → daily rate ÷ standard
daily hours). The `rate_multiplier` is resolved from the current-effective `ot_rate` row for
the request's `rate_type`. The standard-hours basis is a configurable constant (open
question).

## Risks / Trade-offs

- **[Encryption key management is dev-grade]** — an env-var key with no rotation. →
  Accepted for dev; production KMS + envelope encryption + rotation is Open Question 1. The
  helper API is shaped so only its internals change.
- **[qpdf as a system dependency]** — the API image must ship `qpdf`, or the e-payslip
  worker fails. → Added to the devcontainer/Dockerfile and asserted at worker startup;
  mirrors the existing Chromium footprint.
- **[Net-formula rounding]** — money is `numeric(18,4)` strings; rounding must be half-up at
  the cent and applied consistently. → Use the `@erp/utils` decimal helpers throughout;
  acceptance tests assert the net **to the cent**; `breakdown` stores each line so totals
  are reproducible.
- **[Advance auto-deduction concurrency]** — approving a run mutates `cash_advance.outstanding`
  while advances may change elsewhere. → The pull-in and decrement run in the same
  transaction as approval, with the run's optimistic `version`; double-approve → 409.
- **[Immutable breakdown vs. recalculation]** — recalculating after config changes could
  drift from an approved snapshot. → Recalc is blocked once APPROVED; the snapshot is the
  source of truth for an approved run.
- **[First scheduled/queue plumbing]** — no precedent to copy, so mistakes (missed
  idempotency, repeatable-job duplication) are easy. → Workers idempotent on their natural
  key; the repeatable job is upserted (not re-added) at init; documented as the pattern for
  M3–M6.
- **[Permission-code gaps]** — several management endpoints have no dedicated catalog code.
  → Default to `hr.employee.manage` / `hr.payroll.approve`; adding finer codes is Open
  Question 3.

## Migration Plan

Additive, pre-release. **Sequenced after M1.**

1. **Contracts**: `enums/hr.ts`; `dto/hr.ts` (`hrContract`) with salary fields optional;
   register `hr` on the root `contract`. Keep build/typecheck/lint green.
2. **DB**: `schema/hr/*` (13 spec tables) + 4 config tables; add the `user.employeeId` FK;
   HR enums + parity; adjust the EMPLOYEE seed; seed default config rows; `pnpm db:generate`
   → `pnpm db:migrate && pnpm db:seed`.
3. **Infra**: `common/crypto/` + `ENCRYPTION_KEY` (env schema + compose/devcontainer);
   `common/` salary-gating helper; `qpdf` in the Dockerfile + `node-qpdf2`; BullMQ
   producer/worker + repeatable-job plumbing.
4. **API**: build `apps/api/src/hr/` services, controllers, and workers; wire into
   `app.module.ts`.
5. **Tests**: the §2.8 acceptance criteria + PII round-trip.

Acceptance: `pnpm build && typecheck && lint && test` green; employee→salary→OT→attendance→
payroll calculate→approve→payslip flow driven end-to-end; PII ciphertext at rest.

**Rollback**: additive tables only — revert the branch or drop `schema/hr/*` and the FK.

## Open Questions

1. **Production key management** — replace the env-var `ENCRYPTION_KEY` with a KMS/envelope
   scheme and key rotation before production; define re-encryption on rotation.
2. **PND.1 / SSO file formats** — the exact Revenue-Department/SSO layouts are
   non-authoritative here; confirm the target formats (and whether e-filing XML is needed)
   with an accountant before finalizing the exporters.
3. **Permission-code granularity** — adopt finer `hr.*` codes (`hr.payroll.manage`,
   `hr.attendance.import`, `hr.ot.manage`, `hr.cashadvance.manage`) or keep management
   actions under `hr.employee.manage` / `hr.payroll.approve`? Assumed the latter for now.
4. **Standard-hours basis** — the monthly/daily hours divisor for the OT hourly rate
   (e.g. 30 days × 8h, or 26 × 8) — confirm the company standard; modeled as config.
