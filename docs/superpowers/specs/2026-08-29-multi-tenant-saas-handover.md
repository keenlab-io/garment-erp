# Handover: Multi-tenant SaaS conversion (m7 → m10)

Routing document for the four OpenSpec changes under `openspec/changes/`:
`m7-tenancy-core`, `m8-tenant-control-plane`, `m9-subscription-billing`,
`m10-public-demo`. The specs are the contract; this document says **who implements
which part and in what order**, per `.claude/skills/model-routing`.

The design work was done by Fable following a brainstorming session; the design
decisions live in each change's `design.md` and are not restated here.

## Objective

Turn a single-tenant ERP (44 business tables, 6 modules, 12 migrations) into a
multi-tenant cloud service priced per `docs/Garment_ERP_Go_To_Market_Plain_Language.md`,
without forking the self-hosted product, and with a public Google-login demo at
`garment-erp-demo.keenlab.io`.

Done means: every business table carries `tenant_id` behind a forced RLS policy; a
tenant cannot observe another tenant through any endpoint, document number, presigned
URL, socket room, or materialized view; `DEPLOYMENT_MODE=self-hosted` still runs the
same build as one tenant; and the three verification layers in `m7` §15 are green.

## Routing

**Resolve the 20 open questions first.** Each `design.md` ends with 5. A Sonnet handover
must contain zero open design decisions — anything unresolved either gets answered in
the plan or its task moves to Opus. `m10` Open Question 5 (the `SECURITY DEFINER`
identity lookup vs exempting `auth_identity` from RLS) is security-relevant and should be
settled before any m10 code is written.

| Work | Target | Why |
|---|---|---|
| m7 §1–3 — contracts, `tenantColumn` across 44 tables, `0012_tenancy.sql` | **Opus** | Hand-authored migration with a backfill, role split, and policy creation. Failure mode is silent cross-tenant leakage or unrecoverable data state. |
| m7 §4–7 — tenancy module, `TenantTransactionInterceptor`, `tenantContext` ALS, auth changes, infra seams | **Opus** | Transaction/ALS semantics across HTTP, BullMQ workers, and Socket.IO. Subtle, and the spec deliberately leaves the guard/interceptor ordering to the implementer. |
| m7 §8–13 — per-module `tenant_id` sweeps (iam, hr, inventory, production, sales, reporting) | **Sonnet** | Mechanical and repetitive once §1–7 establish the pattern; the parity test and RLS catch mistakes cheaply. Do **not** start before §4–7 land. |
| m7 §14 — web session/tenant plumbing | **Sonnet** | Pattern-following against an existing shell. |
| m7 §15 — `tenancy.parity.spec.ts` | **Sonnet** | Fully specified. |
| m7 §15 — `pg_policies` test + cross-tenant Playwright suite | **Opus** | Adversarial: its value is entirely in the attacks nobody thought to write down. |
| m8 — provisioning, plans, features, lifecycle, export | **Sonnet** | Well-specified CRUD over a settled data model. |
| m8 — seat counting, `TenantStateGuard` READ_ONLY, support impersonation | **Opus** | Authorization-adjacent; a wrong seat predicate is a revenue bug and a wrong READ_ONLY allowlist locks a factory out mid-shift. |
| m9 — subscription CRUD, invoice issue/mark-paid, quoting | **Sonnet** | Deterministic arithmetic with worked examples in the spec. |
| m9 — the dunning sweep | **Opus** | Idempotent, clock-driven, owns all lifecycle transitions; double-issuing invoices is customer-visible. |
| m10 — OIDC callback, sandbox provisioning, purge worker, all guardrails | **Opus** | Security-critical. A demo tenant that can send real email or mint a PromptPay QR crediting the real account is a live incident, not a bug. |
| m10 — Thai demo seed dataset, guest web surface | **Sonnet** | Content and UI against a specified shape. |

## Sequencing

`m7 §1–7` → `m7 §8–15` (parallelizable per module) → `m8` → `m9` and `m10` in parallel.
`m10` depends on `m8`'s provisioning engine; `m9` depends on `m8`'s plan/lifecycle model.

## Context an implementer will not have

- The repo is **full ESM**, `module: NodeNext` — relative imports need explicit `.js`
  extensions, including in `apps/api`.
- `typecheck` is `tsc --noEmit`, never `tsc --build --noEmit` (TS6310 on composite refs).
- After a config change, stale incremental builds are common: `find . -name '*.tsbuildinfo' -delete`.
- `drizzle.config.ts` points at **compiled** `dist/schema/index.js`, so `db:generate` runs
  `tsc --build` first — and drizzle-kit cannot generate `0012` at all (backfill, roles,
  policies, MV rebuild are hand-authored).
- `packages/db` must not import `@erp/contracts`; enums are duplicated and held in lockstep
  by `apps/api/src/enums.parity.spec.ts`. New tenancy enums follow that rule.
- `sso_config` is the Thai **Social Security Office** config, not single sign-on.
- The `erp_owner` / `erp_app` role split is load-bearing: table owners and superusers
  bypass RLS silently, so a deployment that runs as the owner passes every test while
  isolating nothing. Dev and CI must also connect as `erp_app`.

## Constraints & non-goals

- `apps/web` and `apps/api` never import each other; contracts are the only channel.
- Money and quantity cross the wire as strings; arithmetic via `@erp/utils` decimal helpers.
- `tenant_id` is never accepted from a request body, query, or header — only from the
  signed `tid` claim or, pre-login, from hostname resolution.
- No payment gateway (m9 non-goal). No per-tenant encryption keys — `ENCRYPTION_KEY`
  stays global and this is a recorded limitation, not an oversight.
- Multi-site is a pricing tier over `warehouse`/`department` inside one tenant, never a
  second tenant.

## Verification

Per change, per task section: `pnpm build && pnpm typecheck && pnpm lint`.

The three layers that make the isolation claim true, all in m7 §15:
1. `apps/api/src/tenancy.parity.spec.ts` — build-failing static check that every table is
   either `TENANT_EXEMPT` or has `tenantId`. Prove it fails by adding a tenant-less dummy
   table, then remove it.
2. A `pg_policies` integration test — RLS enabled, forced, and a `tenant_isolation` policy
   on every non-exempt table.
3. `e2e/tests/tenancy.spec.ts` — authenticated as tenant B, attack every list endpoint,
   document id, presigned URL, and socket room belonging to tenant A.

Isolation is not "done" until all three are green and (2) has been run against a database
where the app connects as `erp_app`, not as the owner.
