# garment-erp

Integrated **Manufacturing & Sales ERP** for Thai garment / custom-apparel factories — HR &
payroll, inventory & costing, shop-floor production tracking, sales & tax documents, and
reporting — sold as a **multi-tenant SaaS** (with a self-hosted single-tenant option) and
demonstrated through a **public, disposable demo** tenant.

A **pnpm + Turborepo monorepo**: TypeScript end to end, with one contract package
(`@erp/contracts`) as the source of truth for every API shape, so a backend/frontend mismatch
is a compile error in the same change.

| | |
|---|---|
| Architecture spec | [`docs/MONOREPO_SPEC.md`](docs/MONOREPO_SPEC.md) · decisions: [`docs/MONOREPO_IMPLEMENTATION_PLAN.md`](docs/MONOREPO_IMPLEMENTATION_PLAN.md) |
| Domain spec | `docs/ERP_Implementation_Spec_v1.0.docx` · backend: [`docs/BACKEND_SPEC_M1-M6.md`](docs/BACKEND_SPEC_M1-M6.md) · UX: [`docs/UX_UI_SPEC_M1-M6.md`](docs/UX_UI_SPEC_M1-M6.md) |
| Design system | [`docs/PartA_Direction_Tokens_LOCKED.md`](docs/PartA_Direction_Tokens_LOCKED.md) · visual reference: [`docs/wireframes/`](docs/wireframes/) |
| Go-to-market | [`docs/Garment_ERP_Go_To_Market_Plain_Language.md`](docs/Garment_ERP_Go_To_Market_Plain_Language.md) |
| Requirements (living) | [`openspec/specs/`](openspec/specs/) (one capability per folder) · in-flight changes: [`openspec/changes/`](openspec/changes/) |
| Staff guides | [`docs/admin/`](docs/admin/README.md) — tenant administration, platform operations (web: `/guides/admin/`) |
| Customer user guide | [`docs/user-guide/`](docs/user-guide/index.md) (web: `/guides/user/`, linked from the account menu) |
| Contributor / agent guide | [`CLAUDE.md`](CLAUDE.md) |

---

## 1. Project status

All planned milestones are implemented and merged to `main`:

| Milestone | Scope | Spec |
|---|---|---|
| **M0** Foundation | monorepo, `@erp/db`, API infra (UoW/tx, errors, auth, events, audit, sequences, idempotency, queue, storage, PDF, realtime), design tokens, `@erp/ui`, app shell | archived |
| **M1** Admin & Access (IAM) | users, roles, permission matrix + CSV import, audit log, force-logout | archived |
| **M2** HR & Payroll | employees (PII-encrypted), org structure, attendance, OT, cash advance, payroll run, e-payslip, PND.1 / SSO exports | archived |
| **M3** Inventory & Costing | items/SKUs, goods receipt + landed cost, issue, stock count & adjustment, stock ledger, barcodes | archived |
| **M4** Production | work orders, BOM, routings, shop-floor **scan kiosk** (offline queue), realtime timeline, delay detection, WIP, subcontracting, backflush | archived |
| **M5** Sales | customers, quotations, invoices (VAT/WHT), payments & receipts, PromptPay, document templates/PDF, void, aging/overdue, e-Tax | archived |
| **M6** Reporting | dashboards (inventory/sales/cost/profit/tax), report catalog, export, schedules, materialized views | archived |
| **M7** Tenancy core | `tenant_id` + Postgres **RLS** on every business table, `tid` JWT claim, hostname → tenant resolution | `openspec/changes/m7-tenancy-core` |
| **M8** Tenant control plane | `platform_admin` principal + `/platform` console, provisioning, plans/entitlements, seat cap, feature flags, audited support impersonation, PDPA export/purge | `openspec/changes/m8-tenant-control-plane` |
| **M9** Subscription billing | subscriptions, SINV invoices + PDF, mark-paid, dunning → grace → `READ_ONLY`, tax-benefit quotes | `openspec/changes/m9-subscription-billing` |
| **M10** Public demo | Google OIDC sign-in, per-guest `DEMO_SANDBOX` tenant seeded with a Thai factory, outbound-side-effect guardrails, purge on sign-out + idle sweep | `openspec/changes/m10-public-demo` |

M7–M10 are implemented but their OpenSpec changes are not yet archived/synced into
`openspec/specs/`.

**In progress (branch `chore/cloud-deploy-readiness`):** switching production from
`DEPLOYMENT_MODE=self-hosted` to `cloud` — the api connects as the RLS-bound `erp_app` role,
the deploy maps the production hostname in `tenant_domain`, `TRUST_PROXY_HOPS`, and the demo
host. See [`infra/k8s/README.md` §Cloud go-live](infra/k8s/README.md#cloud-go-live-multi-tenant--public-demo).

---

## 2. Architecture

### Repository layout

```
apps/
  api/              NestJS modular monolith — implements the @erp/contracts router (@ts-rest/nest)
  web/              Vite + React SPA — TanStack Router/Query, consumes the same contract (typed client)
packages/
  contracts/        ★ source of truth: zod schemas + ts-rest contracts + enums + permission catalog
  db/               drizzle schema, Postgres client, migrations (drizzle/), seed (incl. demo factory)
  utils/            framework-agnostic helpers (decimal.js money/qty)
  design-tokens/    Style Dictionary "Ink & Substrate" tokens → tokens.css + Tailwind v4 preset
  ui/               owned React component layer (Radix + Tailwind, shadcn-style) + Storybook workbench
  config/           shared tsconfig + ESLint preset (dependency-boundary rules)
e2e/                Playwright browser tests (app + Storybook)
infra/
  docker-compose.yml   dev Postgres 16 / Redis 7 / MinIO
  postgres/init/       creates the erp_app runtime role (dev)
  docker/              api + web Dockerfiles, web nginx config
  k8s/                 kustomize base + prod overlay, migrate Job, CI RBAC  → infra/k8s/README.md
openspec/           specs (current truth) + changes (proposal/design/tasks per milestone)
docs/               specs, plans, testing catalog, UAT pack, wireframes; also the @erp/docs
                    workspace: admin/ (staff guides) + user-guide/ → HTML at /guides/
scripts/auto-issue/ headless issue → PR agent runner
.devcontainer/      dev container (sibling Postgres/Redis/MinIO services)
```

### System design

```
            browser (SPA)
               │ same origin: /api/v1/*  +  /socket.io
               ▼
        nginx (web image) ──────────────┐
               │                        │
               ▼                        ▼
     erp-api  (APP_ROLE=api)     erp-worker (APP_ROLE=worker)
     HTTP + Socket.IO             BullMQ processors: payroll, PDFs, report exports/schedules,
     JwtGuard / PlatformJwtGuard  sweeps (overdue, production monitor, billing dunning,
     tenant resolution + RLS tx   demo purge/idle), tenant export/purge
               │                        │
               ├──── Postgres 16 (RLS, erp_app role) ────┤
               ├──── Redis 7 (BullMQ queues, Socket.IO adapter, AOF on) ────┤
               └──── MinIO / S3 (documents, PDFs, exports under tenants/{tid}/) ────┘
```

- **One image, two roles.** `apps/api` runs as `api` (HTTP + realtime), `worker` (queues and
  sweeps only), or `all` (dev default). The same image runs the migration Job.
- **Contract-first.** Every endpoint is declared in `packages/contracts` (prefix `/api/v1`) and
  implemented in `apps/api`; `apps/web` calls it through a generated-by-types ts-rest client.
- **Multi-tenancy (M7).** Every business table carries `tenant_id` with `FORCE ROW LEVEL
  SECURITY`. Each request/job runs in a transaction that sets the `app.tenant_id` GUC; the api
  connects as `erp_app` (NOBYPASSRLS). The tenant is resolved from the `Host` header via
  `tenant_domain` in `DEPLOYMENT_MODE=cloud`; in `self-hosted` every host maps to the single
  `default` tenant.
- **Two principals.** Tenant users (`user`, JWT `{sub,sid,pv,tid}`) and platform operators
  (`platform_admin`, separate JWT audience, `/platform/*`). Support impersonation is
  time-boxed, reason-tagged and audited in both ledgers.
- **Commercial layer.** Plans `WORKSHOP / FACTORY / MULTISITE / SELFHOSTED` (8/20/40/20 seats;
  scan-only floor accounts are free), module entitlements, `tenant_feature` overrides,
  subscriptions with dunning that drops an unpaid tenant to `READ_ONLY`.
- **Cross-cutting API infra** (inherited by every module, never re-implemented): `UnitOfWork`
  + `currentExecutor(db)`, `AppException` → uniform `{code,message,details}` errors,
  in-handler `assertPermissions`, `If-Match` optimistic concurrency, cursor pagination,
  idempotency keys, domain events (in-tx / after-commit), append-only audit, race-safe
  `SequenceService` document numbers. Details in [`CLAUDE.md`](CLAUDE.md).
- **Frontend.** App shell driven by one nav registry (`apps/web/src/nav/registry.ts`) →
  routes, sidebar, mobile tab bar, command palette (⌘K), all permission/entitlement-filtered.
  Theme (light/dark), density (incl. `touch` for kiosks) and locale (`th` default, `en`) are
  attributes on `<html>`. Components come only from `@erp/ui`, styled only via semantic tokens.

### Non-negotiable conventions (ESLint-enforced, fail CI)

1. `apps/web` and `apps/api` never import each other — only via `@erp/contracts`.
2. `@erp/contracts` stays framework-agnostic (`zod`, `@ts-rest/core`, `@erp/utils` only).
3. Money and quantities cross the wire as **strings** (`moneyString`/`qtyString`); arithmetic
   with `decimal.js` helpers from `@erp/utils`. Never floats.
4. Contract change first, then api, then web — in one change.
5. Full ESM (`NodeNext`): relative imports use explicit `.js` extensions.
6. UI styles use semantic tokens only — raw hex / primitive token vars and `antd` are banned.

---

## 3. Local development

### Prerequisites

- Node ≥ 22, pnpm 9 (`npm i -g pnpm@9` — recent Node no longer bundles Corepack)
- Docker (for Postgres / Redis / MinIO), or use the dev container (`.devcontainer/`), which
  provides them as sibling services

### Bring-up

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d --wait   # Postgres :5432, Redis :6379, MinIO :9000 (console :9001)
pnpm build                                                # dev does NOT build workspace deps first
pnpm db:migrate
SEED_TEST_DATA=1 pnpm db:seed                             # optional flag: test personas + sample master data
pnpm dev                                                  # api :3000 + web :5173 (proxies /api and /socket.io)
```

The api fail-fasts on bad env (`apps/api/src/config/env.schema.ts`). Minimum `apps/api/.env`
for local self-hosted mode (mirrors `.github/workflows/e2e.yml`):

```dotenv
DATABASE_URL=postgres://erp_app:erp_app@localhost:5432/erp     # RLS-bound runtime role
DATABASE_OWNER_URL=postgres://erp:erp@localhost:5432/erp       # migrations + seed (superuser)
DEPLOYMENT_MODE=self-hosted
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=erp-dev
S3_FORCE_PATH_STYLE=true
JWT_ACCESS_SECRET=dev-access-secret
JWT_REFRESH_SECRET=dev-refresh-secret
ENCRYPTION_KEY=<64 hex chars>                                   # AES-256-GCM key for PII
```

Inside the dev container use the service hostnames instead of `localhost`.

**Seeded logins** (dev defaults — never use in production):

| Who | Where | Credentials |
|---|---|---|
| Tenant super-admin | `/login` (tenant `default`) | `superadmin` / `changeme` |
| Platform admin (cloud mode) | `/platform/login` | `platform-admin@erp.local` / `changeme` (`SEED_PLATFORM_ADMIN_*`) |
| Test personas (`SEED_TEST_DATA=1`) | `/login` | username = persona key (e.g. `salesSupervisor`) / `changeme` |

Health: `GET http://localhost:3000/api/v1/health`.

### Common commands

```bash
pnpm build | typecheck | lint | test     # turbo, cached, dependency-ordered
pnpm db:generate                         # drizzle migration from schema changes
pnpm db:migrate | db:seed | db:studio
pnpm --filter @erp/ui storybook          # component workbench :6006
pnpm --filter @erp/docs build            # re-render guides (then http://localhost:5173/guides/)
pnpm --filter @erp/api test:integration  # Testcontainers Postgres (needs Docker)
pnpm --filter <workspace> add <pkg>
```

Before claiming a change done: `pnpm build && pnpm typecheck && pnpm lint` (and `pnpm test`).
If `tsc` emits too few files after a config change: `find . -name '*.tsbuildinfo' -delete` and
remove the `dist/` dirs.

---

## 4. Development workflow

1. **Spec** — a change starts as an OpenSpec change in `openspec/changes/<name>/`
   (`proposal.md`, `design.md`, `specs/` deltas, `tasks.md`). The `openspec` CLI is not
   installed in the dev container; artifacts are hand-authored in the archived format.
2. **Issues** — tasks are broken into GitHub issues, ordered contracts → db → api → web →
   tests. Each issue must be **CI-green on its own** (e.g. a schema change ships with its
   migration and grants in the same issue).
3. **Implement** — on a feature branch off `main` (`feat|fix|test|chore(<scope>): … (#issue)`).
   Issues can be worked manually or by the headless agent runner
   [`scripts/auto-issue/`](scripts/auto-issue/README.md) (picks the next open issue, plans,
   implements, tests, opens a PR).
4. **PR** — CI (`ci.yml`) + E2E (`e2e.yml`) run; merge to `main`.
5. **Deploy** — merging to `main` triggers `deploy.yml` (see §7).
6. **Archive** — when a milestone completes, archive its change and sync the deltas into
   `openspec/specs/`.

Gotcha worth remembering: new tables need **explicit `GRANT`s to `erp_app`** in the migration
(migrations run as superuser, so default privileges never fire). Integration tests miss it; e2e
catches it.

---

## 5. Testing

### Automated

| Layer | Where | Run | In CI |
|---|---|---|---|
| Unit (api, web, ui, utils, contracts, db, tokens) | `*.spec.ts` / `*.test.tsx` beside the code (Vitest; RTL + jsdom for React) | `pnpm test` | `ci.yml` › verify (affected-only on PRs, full on `main`) |
| Parity guards | `apps/api/src/*.parity.spec.ts` (enums, permissions, tenancy tables ↔ contracts/db) | `pnpm test` | verify |
| Integration | `apps/api/test/integration/*.int.spec.ts` — Testcontainers Postgres with real migrations (RLS, sequences, audit, tenancy, billing, demo purge) | `pnpm --filter @erp/api test:integration` | `ci.yml` › integration |
| Manifests | kustomize render of `infra/k8s/overlays/prod` | `kubectl kustomize infra/k8s/overlays/prod` | `ci.yml` › manifests |
| Browser e2e | [`e2e/`](e2e/README.md) — Playwright: all-routes smoke, per-module golden paths (TC-*), UAT journeys J2/J3, permissions, shell, tenancy, Storybook component cases; `demo.spec.ts` needs a cloud stack + stub IdP | `pnpm --filter @erp/e2e test` (stack must be running, seeded with `SEED_TEST_DATA=1`) | `e2e.yml` — reports pass/fail, **not a required check and does not gate deploys** |

### Manual functional tests (engineering / QA)

[`docs/testing/UI_TEST_PLAN.md`](docs/testing/UI_TEST_PLAN.md) is the catalog: personas,
coverage matrix, and per-module cases in [`docs/testing/test-cases/`](docs/testing/test-cases/)
(`TC-XC-*`, `TC-INV-*`, `TC-PROD-*`, `TC-SALES-*`, `TC-HR-*`, `TC-RPT-*`, `TC-ADMIN-*`,
`TC-CMP-*`). One catalog, two executors: Playwright for deterministic regression, and
**Claude for Chrome** for exploratory runs — follow
[`docs/testing/claude-chrome-runbook.md`](docs/testing/claude-chrome-runbook.md) and feed it
one test-case file. Every persona is a real login (`VITE_DEV_PERMISSIONS` is not a login bypass).

### UAT (business acceptance)

[`docs/uat/`](docs/uat/README.md) is written for business users, not engineers
(Thai + English acceptance packs as `.docx`). Procedure, per
[`docs/uat/UAT_PLAN.md`](docs/uat/UAT_PLAN.md):

1. Bring up an environment and verify super-admin login (engineers follow the testing Quickstart).
2. **UAT-ADMIN-02** — super-admin provisions the 8 business roles (Owner/GM, Accountant, Sales,
   Warehouse, Production lead, Floor operator, HR officer, IT) and their users. The production
   seed creates no test users.
3. Create master data per the plan's test-data prerequisites.
4. Run journeys **J1** order-to-cash, **J2** hire-to-payslip, **J3** procure-to-stock, each in
   one uninterrupted session; then module scripts `01-inventory` … `06-admin`.
5. Record each result in [`sign-off/traceability-matrix.md`](docs/uat/sign-off/traceability-matrix.md)
   (not-UI-testable criteria are flagged there, not faked); log defects with the severity scale.
6. Roll up into [`sign-off/acceptance-certificate.md`](docs/uat/sign-off/acceptance-certificate.md)
   and sign — the artifact of record. Exit criteria are in the plan.

Failed UAT scenarios become `docs/testing/` cases (and Playwright specs) for regression.

---

## 6. CI/CD

| Workflow | Trigger | What |
|---|---|---|
| `ci.yml` | PRs; called by `deploy.yml` | `verify` (lint, typecheck, unit test, build — `--filter=...[origin/main]` on PRs, whole repo on `main`), `integration` (Testcontainers), `manifests` (kustomize render) |
| `e2e.yml` | PRs, push to `main`, manual | compose stack → migrate + seed → built api + Vite web + Storybook → Playwright; uploads report/traces |
| `deploy.yml` | push to `main`, manual | `verify` (= ci.yml) → `build` (Buildx → GHCR `erp-api`/`erp-web`, `sha-<commit>`, amd64) → `deploy` |

The `deploy` job: preflight the GHCR pull token → resolve tags to **digests** → join the tailnet
as an ephemeral `tag:ci` node → render `erp-secrets` from GitHub secrets → apply prerequisites
(StatefulSets, ConfigMap) → run the per-SHA **migration Job** (abort before touching pods on
failure) → map the production hostname in `tenant_domain` → `kubectl apply` → wait for rollouts
→ in-cluster health smoke + public-ingress smoke → **automatic rollback** on failure. Deploys
are serialized (`concurrency: deploy-production`).

Migrations must be **expand → contract** (old pods run against the new schema during rollout;
`rollout undo` does not revert a migration).

---

## 7. Deployment

Full runbook, secrets table and one-time bootstrap: **[`infra/k8s/README.md`](infra/k8s/README.md)**.

**Topology.** Private-LAN Kubernetes cluster, no inbound internet. Public TLS terminates at an
external Nginx Proxy Manager (on the tailnet, WebSockets on) → Tailscale operator proxy →
`erp-web` (nginx: SPA + reverse proxy for `/api` and `/socket.io`) → `erp-api` (scalable) /
`erp-worker` (1 replica) → `erp-postgres`, `erp-redis` (AOF), `erp-minio` StatefulSets on
`rook-ceph-block` PVCs. Hosts: `garment-erp.keenlab.io` (app), `garment-erp-demo.keenlab.io`
(public demo).

**Routine deploy:** merge to `main` (or run *Deploy* via `workflow_dispatch`; re-running at the
same SHA is idempotent and is the recovery path). Secret rotation = update the GitHub secret,
then re-run the deploy.

**Manual rollback:** `kubectl -n erp rollout undo deploy/erp-api deploy/erp-worker deploy/erp-web`.

**One-time bootstrap (per cluster):** CI RBAC (`infra/k8s/rbac/ci-deployer.yaml`, cluster-admin),
kubeconfig via the Tailscale API-server proxy, tailnet ACLs, GitHub `production` secrets
(incl. `PROD_DB_APP_PASSWORD`, optional `PROD_JWT_PLATFORM_SECRET`, `PROD_GOOGLE_OAUTH_*`),
create the MinIO bucket and verify app credentials, seed once, configure NPM hosts.

**Known gaps:** no PVC backups (Ceph replication ≠ backup), single-node MinIO, no
`ENCRYPTION_KEY` rotation, NPM is a hand-configured SPOF, e2e not on the deploy gate, presigned
S3 URLs point at the in-cluster endpoint (exports complete but download links don't open
externally).

---

## 8. Running the demo

### Hosted public demo (M10)

Guests open **`https://garment-erp-demo.keenlab.io/demo`**, sign in with Google, accept the
deletion notice (optional PDPA lead opt-in), and land as super-admin of their own
`DEMO_SANDBOX` tenant: a pre-seeded Thai custom-apparel factory (customers, SKUs, work orders
mid-production with scan history and a delayed step, a completed payroll run, invoices from
draft to overdue). The 15-minute pitch path is **order tracking → job costing → LINE order
update**.

- Guardrails (server-side): mail and LINE are sunk, e-Tax is refused, PromptPay QR is dummied,
  PDFs are watermarked **DEMO**.
- Lifecycle: "End demo" purges the sandbox (rows, S3 prefix, identity, user); an idle sweep
  (`DEMO_SANDBOX_IDLE_MINUTES`, default 60) catches closed tabs. Capacity/abuse limits:
  `DEMO_MAX_CONCURRENT_SANDBOXES` (25), `DEMO_SIGNUP_RATE_PER_IP` / `_PER_EMAIL`.
- Platform admins curate the dataset via the `demo-template` tenant; the dataset itself is the
  script `packages/db/src/seed/demo/seed-demo-tenant.ts`.
- Switch off: `DELETE FROM tenant_domain WHERE resolution_mode='DEMO_POOL'` (live sandboxes are
  swept), or leave `PROD_GOOGLE_OAUTH_*` unset.

### Demo locally

- **Self-hosted walkthrough:** the §3 bring-up with `SEED_TEST_DATA=1` gives personas plus
  sample sales/inventory/production master data — enough for a guided tour as `superadmin`.
- **Full M10 flow:** run the api with `DEPLOYMENT_MODE=cloud`, `DEMO_HOST=<host the browser
  uses>`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, and seed with `DEMO_HOST` set (creates the
  `DEMO_POOL` mapping + `demo-template` tenant). Without a real Google client, use the stub IdP
  from `e2e/fixtures/stub-idp.ts` via `GOOGLE_OIDC_BASE_URL` (test-only seam — never in
  production); `e2e/tests/demo.spec.ts`'s header documents the exact stack.

---

## 9. New tenant setup (cloud mode)

Step-by-step staff procedures: [`docs/admin/`](docs/admin/README.md) (also served at
`/guides/admin/`); customer user guide: [`docs/user-guide/`](docs/user-guide/index.md) (`/guides/user/`).

Tenants are created by a **platform admin**, never self-service (self-signup is enabled only
for the demo pool).

1. **Platform admin exists.** Created by the seed — in production pass
   `SEED_PLATFORM_ADMIN_EMAIL` / `SEED_PLATFORM_ADMIN_PASSWORD` inline (see infra README
   *Cloud go-live* step 5). Sign in at `https://<app-host>/platform/login`.
2. **DNS / proxy.** Point the tenant's hostname (e.g. `acme.keenlab.io`) at the same Nginx
   Proxy Manager upstream with WebSockets on and its own TLS cert; NPM must pass the original
   `Host` header.
3. **Provision.** Platform console → *Tenants* → *Provision tenant* (or
   `POST /api/v1/platform/tenants`) with `name`, `slug` (DNS label), `domain` (the hostname),
   `plan_id`, `admin_email`, `admin_name`. In one transaction this creates the tenant, its
   `tenant_domain` row, Thai-default config (SSO/tax brackets/advance policy/document
   templates), document sequences, the subscription hook, and the first **tenant
   super-admin**. The **temporary password is shown exactly once** — hand it over securely.
   Known gap: the plans endpoints (`/platform/plans`) are declared in the contract but not
   implemented, so the console Plan dropdown is empty and UI-provisioned tenants get
   `WORKSHOP`; set another plan via the API/SQL (see the Platform Operations Guide).
4. **Entitlements.** Set feature overrides under the tenant
   (`/platform/tenants/:id/features`); plan changes and extra seats currently need SQL. Module access and the seat cap
   are enforced server-side; scan-only floor users don't count toward seats.
5. **Billing.** Create/confirm the subscription and issue the first SINV invoice from the
   console; mark paid on receipt. Unpaid renewals dun through grace (`BILLING_GRACE_DAYS`) to
   `READ_ONLY`.
6. **Tenant onboarding (tenant super-admin).** Log in at `https://<tenant-host>/login` (there is
   no change-password or reset flow yet — the temporary password stays in use), then create roles + users (Admin → Roles / Users, or permission CSV import),
   set up company document templates, warehouses, UoMs, items, employees and payroll config —
   the same steps as UAT-ADMIN-02 and the UAT test-data prerequisites.
7. **Verify** login on the tenant host and that unentitled modules are absent from the nav.

Notes: there is no API to add a hostname to an *existing* tenant (manual `INSERT INTO
tenant_domain`). Support access to a tenant is through a time-boxed support session
(`/platform/support-sessions`), audited in both the platform and tenant ledgers. Tenant PDPA
export / purge are platform actions.

**Self-hosted customers** (`DEPLOYMENT_MODE=self-hosted`, `SELFHOSTED` plan) need none of this:
the single `default` tenant is created at boot/seed, and onboarding starts at step 6.
