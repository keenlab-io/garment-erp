# Kubernetes deployment + GitHub CI/CD — design

**Date:** 2026-08-07
**Status:** implemented (branch `feat/k8s-deploy-cicd`)
**Resolves:** MR-Q3 in [`docs/MONOREPO_SPEC.md`](../../MONOREPO_SPEC.md)

## Problem

`apps/api` and `apps/web` had no container images and no deploy path — CI stopped at
`lint / typecheck / test / build`. MR-Q3 had deferred k8s/IaC to "a separate repo", which
conflicts with the repo's own contract-lockstep goal: api and web must deploy from the same
commit SHA, and nothing structural enforces that across two repos.

The target cluster is on a private LAN behind a restricted firewall, with no inbound
internet. A Tailscale operator in the cluster puts Services on the tailnet; an external
Tailscale machine running Nginx Proxy Manager (NPM) maps public domains to them and
terminates TLS. Cluster nodes do have outbound HTTPS.

## Decisions

| Area | Decision | Rejected alternatives |
|---|---|---|
| Delivery | Push-based: GitHub-hosted runner joins the tailnet as an **ephemeral** node, then `kubectl` over it | GitOps (Argo/Flux) — extra component to operate; self-hosted ARC runners — a fleet to own |
| Registry | GHCR, pulled directly by nodes | Tailscale-routed pulls; a LAN registry |
| Manifests | Kustomize `base/` + `overlays/prod/` | Helm (no multi-cluster need); duplicated per-env YAML |
| Stateful deps | In-cluster StatefulSets + PVCs | External/managed |
| Environments | Production only, shaped so `staging` is a directory copy | staging + prod up front |
| Secrets | GitHub secrets rendered into a k8s Secret at deploy time | sealed-secrets/SOPS (a controller + key management); manual |
| API scaling | Socket.IO Redis adapter + a separate worker Deployment | ship 1 replica and document it |

## Architecture

### Routing — one hostname

`apps/web` assumes the API is same-origin: `src/api/client.ts` uses `baseUrl: ""` and
`src/realtime/realtime-client.ts` calls bare `io()`. nginx **inside the web pod** therefore
reverse-proxies `/api` and `/socket.io` to the `erp-api` Service, so exactly one Service is
exposed to the tailnet and NPM has one proxy host.

Rejected: splitting paths across two tailnet devices at NPM (moves load-bearing routing —
WebSocket upgrade, buffering, timeouts — outside the repo and outside CI, with no PR trail);
and setting a `baseUrl` in the web client (reintroduces CORS and makes the web image
environment-specific, where today it is environment-free — the only `import.meta.env` use is
a dev-only `VITE_DEV_PERMISSIONS`).

### Images

**api** — `node:22-bookworm-slim`, built via `turbo prune @erp/api --docker` so the install
layer stays cache-stable. Debian over Alpine because glibc is the tested path for both
Chromium and native `argon2`. Distro `chromium` with `PUPPETEER_SKIP_DOWNLOAD=1` +
`PUPPETEER_EXECUTABLE_PATH` rather than the bundled Chrome-for-Testing (apt manages the
shared-lib deps and patches with the base image; this app's usage is just
`setContent` + `pdf()`). `fonts-thai-tlwg` is mandatory — invoices and payslips render Thai.
`tini` is PID 1 because Chromium spawns a renderer tree node will not reap, and it forwards
SIGTERM so `enableShutdownHooks()` runs.

The image preserves the **pnpm workspace layout** and explicitly copies `tooling/drizzle`,
because `packages/db/src/migrate.ts` resolves migrations as `../../../tooling/drizzle`
relative to itself. This is also why `pnpm deploy` is not used — it re-homes workspace
packages under `node_modules/` and would break that path. A happy consequence: `packages/db`
already compiles to `dist/migrate.js`, so migrations run with plain `node`, no `tsx`, and no
separate migration image.

**web** — build stage → `nginxinc/nginx-unprivileged:1.27-alpine` on :8080.

### Worker split

`APP_ROLE: z.enum(["api","worker","all"]).default("all")` in `env.schema.ts`. A pre-DI helper
(`config/app-role.ts`) gates `@Processor` providers in the five feature modules — it reads
`process.env` directly because module `providers` arrays evaluate at import time, before
ConfigModule validation exists; the zod entry is what turns a typo into a boot failure.
Queues are registered by a `@Global` `QueueModule`, so the api role keeps *enqueuing* with
zero processors present.

The Redis adapter is attached in **every** role — `ProductionMonitorWorker` injects
`RealtimeGateway` and emits from a pod with no connected browsers, so without it those events
vanish. The web client is pinned to `transports: ["websocket"]`: Socket.IO's default
polling→upgrade handshake needs sticky sessions, and nothing in
NPM → Tailscale → 2×nginx → ClusterIP provides them.

### Shutdown ordering (a bug found during implementation)

`@nestjs/bullmq` closes its workers in `onApplicationShutdown` — Nest's **last** phase — but
`DbModule` ended the pg pool and `PdfService` closed Chromium in `onModuleDestroy`, its
**first**. Every SIGTERM therefore yanked the database connection and the browser out from
under any in-flight payroll run or PDF render. Nest also runs hooks concurrently within a
phase (`Promise.all`), so reordering providers cannot fix it.

The fix makes the order explicit: a new `WorkerDrainService` closes all workers in
`onModuleDestroy` (phase 1), and the pool, Chromium and the Redis pub/sub clients moved to
`onApplicationShutdown` (phase 3). The explorer's later `close()` is then a no-op.
`erp-worker` gets a 120s grace period to match.

A second latent issue surfaced here: `apps/api` declared `socket.io: ^4.8.1` while
`@nestjs/platform-socket.io` pins an exact `4.8.1`, so two copies resolved. Pinned to match —
one Server class at runtime and a smaller image.

### Migrations

A per-SHA Job running the same image, applied and awaited **before** any Deployment changes.
`backoffLimit: 0` — a failed migration aborts the deploy while old pods keep serving. The
name carries the SHA because Job pod templates are immutable.

Rejected: an initContainer (runs per replica and on every reschedule → concurrent migrators
racing one database) and migrating from the runner (would require exposing Postgres on the
tailnet, and runs a checkout that may drift from the image).

**Consequence, now a standing rule:** migrations must be backward-compatible
(expand → contract), because old pods run against the new schema during the rollout window.
It is also what makes `rollout undo` safe, since undo does not revert schema.

## Verification performed

Docker is unavailable in the devcontainer, so images were not built locally — the CI `build`
job is their first execution. What *was* verified: full `turbo lint typecheck build`; api
suite 174 passed / 41 skipped; web suite 522 passed; `kustomize build` of the prod overlay
(16 resources, correct annotations); and a live test that `kustomize edit set image` against
the `ghcr.io/OWNER/...` placeholder really rewrites all three app containers to digests.

## Known gaps

No PVC backups (single volumes; local-path storage means a lost node is data loss);
single-node MinIO; `ENCRYPTION_KEY` rotation unsupported; NPM is a manually-configured SPOF
outside CI; `@erp/e2e` still not in the pipeline; image platform pinned to `linux/amd64`
pending confirmation of node architecture.

Out of scope: staging overlay, NetworkPolicies, HPA, observability, Turbo remote cache
(MR-Q1 stays open), multi-arch images, sealed-secrets.
