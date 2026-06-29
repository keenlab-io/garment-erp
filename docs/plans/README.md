# Backend Build Plans — M0 Foundation + Modules M1–M6

Per-module implementation plans for the garment ERP backend, derived from
[`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) and translated into this
repo's contract-first monorepo patterns (see [`../../CLAUDE.md`](../../CLAUDE.md),
[`../MONOREPO_SPEC.md`](../MONOREPO_SPEC.md)).

## Plan index

| Plan | Scope | Depends on |
|---|---|---|
| [M0 — Shared Foundation](M0-foundation.md) | Persistence (Drizzle), auth, events, audit, sequencing, queues, realtime, storage, PDF, error/idempotency/concurrency conventions | — |
| [M1 — Access & Identity (IAM)](M1-iam.md) | AuthN/RBAC, sessions, instant revocation, audit log, permission import | M0 |
| [M2 — HR & Payroll](M2-hr-payroll.md) | Employees, OT, cash advance, payroll engine, e-payslips | M1, M0 |
| [M3 — Inventory & Costing](M3-inventory.md) | Items, append-only stock ledger, MAV/FIFO/STD costing, BOM, backflush | M1, M0 |
| [M4 — Production Tracking](M4-production.md) | Routing, work orders, step scanning, delay/subcontract, backflush trigger | M3, M2, M0 |
| [M5 — Sales Documents](M5-sales.md) | Quotation→Invoice→Receipt, VAT/WHT, PromptPay, void | M1, M3, M0 |
| [M6 — Reporting & Analytics](M6-reporting.md) | Read-only dashboards, materialized views, scheduled digests | M2–M5, M0 |

## Locked architecture decisions

- **Drizzle ORM** + drizzle-kit; migration SQL committed under `tooling/drizzle/`.
- **Full async stack** stood up in M0: Redis + BullMQ, Socket.IO, MinIO/S3,
  Puppeteer PDF, argon2id, JWT/sessions, in-process domain event bus.
- **Contracts are the single source of truth.** `@erp/contracts` (zod + ts-rest +
  enums + permissions + branded money/qty) is consumed by both `apps/api` and
  `apps/web`; any drift is a compile error. A new framework-agnostic package
  `@erp/db` holds the drizzle schema/client. Neither imports Nest or React.
- **Full ESM (NodeNext).** All relative imports use explicit `.js` extensions.

## The repeatable per-module recipe

Every module M1–M6 is the same four-layer slice; the per-module plans only call
out what is *module-specific*.

1. **Contracts** (`packages/contracts/src/`): `dto/{module}.ts` zod schemas +
   `c.router({...}, { pathPrefix: API_PREFIX })` with responses merged through
   `withErrors(...)`; `paginated(item)` for lists; `moneyString`/`qtyString` for
   money/qty; `jobAccepted` for 202s; `enums/{module}.ts`; append permission codes
   to `permissions/catalog.ts`; register the router in `dto/index.ts`.
2. **DB schema** (`packages/db/src/schema/{module}/*.ts`): drizzle tables
   mirroring the spec DDL, spreading `...auditColumns` (+ `...versionColumn` for
   mutable aggregates), using `money()/qty()/rate()` helpers, FK + indexes per
   spec. Re-export from `schema/index.ts`. `pnpm db:generate`, then hand-edit the
   SQL for anything drizzle-kit can't express (generated columns, materialized
   views, triggers, grants).
3. **Nest module** (`apps/api/src/{module}/`): `{module}.module.ts`,
   `{module}.controller.ts` (`@TsRestHandler`), `*.service.ts` (business rules,
   state-machine guards, money math via `@erp/utils`), data access via the
   injected `DB`/`UnitOfWork`. Emit events via `EventBusService`; authorize each
   ts-rest endpoint with `assertPermissions(user, "...")`; read the caller with
   `@CurrentUser()`. Register in `app.module.ts`.
4. **Tests**: one test per acceptance criterion in the module's spec `§x.8`
   (unit + Testcontainers integration).

Verify after each module: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.

## Recommended build order

**M0 → M1 → M3 → (M2 ∥ M4 ∥ M5) → M6.** M0 is the foundation; M1 unblocks authz;
M3 is the costing core M4/M5 lean on; M2/M4/M5 are largely independent once M1/M3
exist; M6 reads everything.
