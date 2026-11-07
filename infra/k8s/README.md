# Production deployment

Kubernetes manifests and the delivery pipeline for `apps/api` + `apps/web`. This closes
**MR-Q3** in [`docs/MONOREPO_SPEC.md`](../../docs/MONOREPO_SPEC.md): infra lives in this repo
so api and web always ship from one commit SHA, which is what keeps the `@erp/contracts`
lockstep guarantee real rather than aspirational.

## Topology

The cluster sits on a private LAN behind a restricted firewall. Nothing reaches it from the
internet directly.

```
browser
  │  https://<your-domain>
  ▼
Nginx Proxy Manager        ← external Tailscale machine, terminates public TLS
  │  http://garment-erp.<tailnet>.ts.net:80
  ▼
Tailscale operator proxy   ← created from annotations on the erp-web Service
  ▼
erp-web pods (nginx)       ← serves the SPA, reverse-proxies /api + /socket.io
  ▼
erp-api Service :3000 ──▶ erp-api pods        (HTTP + Socket.IO, APP_ROLE=api)
                          erp-worker pods     (BullMQ only, APP_ROLE=worker, no Service)
                              │
              erp-postgres / erp-redis / erp-minio (StatefulSets + PVCs)
```

**One hostname, one proxy host.** `apps/web` assumes the API is same-origin — `client.ts`
uses `baseUrl: ""` and `realtime-client.ts` calls bare `io()` — so nginx inside the web pod
proxies `/api` and `/socket.io` to `erp-api` rather than exposing two tailnet devices. That
also means no CORS and one TLS cert.

## Layout

| Path | What |
|---|---|
| `infra/docker/api.Dockerfile` | api image — also runs the worker role and the migration Job |
| `infra/docker/web.Dockerfile` + `web-nginx.conf` | SPA build → nginx-unprivileged :8080 |
| `base/` | Namespace, ServiceAccount, ConfigMap, 3 Deployments, 5 Services, 3 StatefulSets, 2 PDBs |
| `overlays/prod/` | namespace, image pins, Tailscale annotations |
| `jobs/migrate-job.yaml` | per-SHA migration Job — **deliberately outside kustomize** |
| `.github/workflows/deploy.yml` | verify → build → deploy |

## One-time bootstrap

Do these once per cluster, before the first deploy. None of it is automated — all of it is
either a decision or a credential.

1. ~~**Verify the Tailscale operator surface.**~~ **Done — verified 2026-08-08.** The overlay
   annotates the `erp-web` Service with `tailscale.com/expose: "true"` +
   `tailscale.com/hostname: "garment-erp"`. Tested end-to-end against the installed operator
   (**v1.80.3**) with a throwaway Service: proxy created in ~6s, `TailscaleProxyReady=True`,
   device registered under the annotated hostname, HTTP 200 on :80 across the tailnet, and a
   clean teardown on delete. No change needed. Re-check only if the operator is upgraded.

   The tailnet is **`tail0b8c39.ts.net`**, so production resolves to
   **`garment-erp.tail0b8c39.ts.net`**.

2. **Give CI a path to the kube-apiserver.** Use the operator's **API-server proxy**. It is
   already enabled on this cluster (`APISERVER_PROXY=true`, i.e. auth mode) and verified
   reachable — `https://tailscale-operator.tail0b8c39.ts.net/version` returns 200 with a
   publicly trusted cert, so the kubeconfig needs **no CA blob and no token**:

   ```yaml
   apiVersion: v1
   kind: Config
   current-context: erp
   clusters:
     - name: erp
       cluster:
         server: https://tailscale-operator.tail0b8c39.ts.net
   contexts:
     - name: erp
       context: { cluster: erp, namespace: erp, user: tailscale }
   users:
     - name: tailscale
       user:
         token: unused   # placeholder — see below, do NOT leave this empty
   ```

   **The placeholder token is required.** The proxy ignores it entirely — auth is the tailnet
   identity — but if `user:` is left empty (`{}`), kubectl decides no credentials are
   configured and falls back to prompting for basic auth. In CI there is no TTY, so the step
   dies with:

   ```
   Please enter Username: error: EOF
   ```

   which looks like an auth rejection but is not one. A genuine authorization failure comes
   back as a clean `403 Forbidden` naming the impersonated user.

   In auth mode the proxy identifies the caller by tailnet identity: the Kubernetes username
   is the node's FQDN, and **the node's tags become its Kubernetes groups**. So the credential
   *is* the `tag:ci` tag on the ephemeral runner node, and a plain network grant is all the
   tailnet policy file needs — no app capability:

   ```json
   "tagOwners": { "tag:ci": ["autogroup:admin"] },

   "grants": [{
     "src": ["tag:ci"],
     "dst": ["tag:k8s-operator"],
     "ip":  ["tcp:443"]
   }]
   ```

   `ci-deployer.yaml` binds the group `tag:ci` directly, which is why nothing more is needed.
   If you would rather not bind a tag-shaped group name, add an impersonate capability and the
   groups it names take precedence over the tag-derived ones — the bindings list `erp-deployers`
   as a second subject for exactly that case:

   ```json
   "app": { "tailscale.com/cap/kubernetes": [
     { "impersonate": { "groups": ["erp-deployers"] } }
   ]}
   ```

   Then apply the in-cluster half **once, with cluster-admin** — it is outside the kustomize
   base so the deploy can never widen its own permissions:

   ```bash
   kubectl apply -f infra/k8s/rbac/ci-deployer.yaml
   ```

   Note that a Role scoped to namespace `erp` is *not* sufficient on its own: the deploy runs
   `kubectl create namespace` and the kustomize base contains a `Namespace` object, both
   cluster-scoped. `ci-deployer.yaml` handles this by pre-creating the namespace and granting
   only `get`/`patch` on that one name, because `create` on namespaces cannot be restricted
   by `resourceNames`. It also grants `pods/exec`, without which the deploy passes rollout and
   then fails on its final smoke-test step.

   Finally, base64 the kubeconfig into the `KUBE_CONFIG` GitHub secret:

   ```bash
   base64 -w0 ci-kubeconfig.yaml | gh secret set KUBE_CONFIG --env production
   ```

3. **Lock down `tag:ci` in the tailnet ACL** so it can reach the apiserver and nothing else,
   and allow the Nginx Proxy Manager node to reach the operator proxy on :80.

4. **Populate the GitHub secrets** (below), then run the workflow once via
   `workflow_dispatch`. The first run creates the namespace, secrets, StatefulSets and PVCs.

5. **Create the MinIO bucket.** `StorageModule` does *not* create it — every document and
   PDF write fails until it exists. Credentials come from `erp-secrets` via `envFrom`, so
   they are never typed on a command line or echoed into a shell history:

   ```bash
   kubectl -n erp run mc-bucket --rm -i --restart=Never --image=minio/mc --overrides='
   {"spec":{"restartPolicy":"Never","containers":[{"name":"mc-bucket","image":"pgsty/mc:RELEASE.2026-09-16T00-00-00Z",
   "envFrom":[{"secretRef":{"name":"erp-secrets"}}],
   "command":["sh","-c","mc alias set s3 http://erp-minio:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" && mc mb -p s3/erp && mc ls s3"]}]}}'
   ```

   Then verify the **app's** credentials work, not just root — `S3_ACCESS_KEY`/`S3_SECRET_KEY`
   must equal `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, because nothing provisions a separate
   MinIO user. If they diverge, the deploy still goes green and every document write fails at
   runtime instead:

   ```bash
   kubectl -n erp run mc-verify --rm -i --restart=Never --image=minio/mc --overrides='
   {"spec":{"restartPolicy":"Never","containers":[{"name":"mc-verify","image":"pgsty/mc:RELEASE.2026-09-16T00-00-00Z",
   "envFrom":[{"secretRef":{"name":"erp-secrets"}}],
   "command":["sh","-c","mc alias set app http://erp-minio:9000 \"$S3_ACCESS_KEY\" \"$S3_SECRET_KEY\" && echo probe | mc pipe app/erp/_probe.txt && mc rm app/erp/_probe.txt && echo APP_CREDS_OK"]}]}}'
   ```

   > The command previously documented here used `"$USER"`/`"$PASS"`, which are undefined
   > inside that pod — it expanded to empty credentials and the alias always failed. It also
   > passed `-it`, which needs a TTY the pod does not have.

6. **Seed the super-admin** (idempotent, but only ever needed once):
   ```bash
   kubectl -n erp exec deploy/erp-api -- node packages/db/dist/seed/seed.js
   ```
   Then change the password immediately — the default is `superadmin` / `changeme`.

   > **Never set `SEED_TEST_DATA` here.** That flag makes this same file additionally create
   > the ten UI-test personas (all sharing the password `changeme`), a sample customer, and
   > `SEED-*` items — fine in dev and CI, a set of weak credentials in production. It is off
   > unless explicitly enabled, so the command above stays bootstrap-only; keep it that way.
   > Deploys never seed at all — `deploy.yml` runs only the migrate Job.

   Note: `onConflictDoNothing` means re-seeding an existing database will *not* reset a
   forgotten password.

7. **Create the Nginx Proxy Manager host** pointing at
   `http://garment-erp.tail0b8c39.ts.net:80`, and **turn on "Websockets Support"** — without
   it the production realtime timeline silently never connects.

   The operator runs with `PROXY_TAGS=tag:k8s`, so the tailnet ACL grant that lets the NPM
   node reach the proxy on :80 must target `tag:k8s`.

## Cloud go-live (multi-tenant + public demo)

`erp-config` runs `DEPLOYMENT_MODE=cloud`: the tenant is resolved from the `Host` header via
`tenant_domain`, `/platform` (control plane + subscription billing) is live, and the public
demo is served on `DEMO_HOST`. Two invariants carry the switch:

- **The api connects as `erp_app`, never the superuser.** A superuser bypasses RLS even under
  `FORCE ROW LEVEL SECURITY`, so tenant isolation only holds when `DATABASE_URL` is the
  NOBYPASSRLS runtime role. The deploy refuses to render secrets without
  `PROD_DB_APP_PASSWORD`; the migrate Job (connected as the owner) applies it to `erp_app`.
- **Every served hostname has a `tenant_domain` row.** Password login on an unmapped host is
  refused. The deploy's "Map the production hostname" step maps `PUBLIC_HOST` to the default
  tenant before any pod rolls; tenants created later get theirs from `POST /platform/tenants`.
  There is no API to add a hostname to an *existing* tenant — that is a manual `INSERT`.

Once per cluster, in this order:

1. **Set `PROD_DB_APP_PASSWORD`** (and, recommended, `PROD_JWT_PLATFORM_SECRET`) in the
   `production` environment *before* merging the cloud switch — the deploy fails fast without
   the former.
2. **Google OAuth client** (Google Cloud Console → Credentials → *Web application*). Authorized
   redirect URI: `https://garment-erp-demo.keenlab.io/api/v1/auth/oidc/google/callback` —
   plus the same path on every tenant host that enables the `auth.google` feature. Scopes
   `openid email profile`; publish the consent screen (guests are external users). Store the
   pair as `PROD_GOOGLE_OAUTH_CLIENT_ID` / `PROD_GOOGLE_OAUTH_CLIENT_SECRET`. Never set
   `GOOGLE_OIDC_BASE_URL` — it is an e2e stub seam.
3. **DNS + Nginx Proxy Manager for the demo host.** `garment-erp-demo.keenlab.io` gets a
   proxy host pointing at the *same* upstream (`http://garment-erp.tail0b8c39.ts.net:80`),
   Websockets Support on, its own TLS cert. NPM must pass the original `Host` (its default) —
   that is what the api resolves the tenant from, and what the OIDC callback URL is built from.
4. **Deploy** (merge, or `workflow_dispatch`) and re-run the deploy if secrets changed after.
5. **Seed the control plane + demo template** — idempotent; creates the plans if missing, the
   first platform admin, the `demo-template` tenant and the `DEMO_POOL` row for `DEMO_HOST`
   (already in `erp-config`, so the pod has it). Pass the admin credentials inline so they never
   default to `changeme`, and keep the leading space so the shell skips history:

   ```bash
    kubectl -n erp exec deploy/erp-api -- env \
     SEED_PLATFORM_ADMIN_EMAIL='ops@keenlab.io' \
     SEED_PLATFORM_ADMIN_PASSWORD="$(openssl rand -base64 24)" \
     node packages/db/dist/seed/seed.js
   ```

   Record the generated password first (or substitute your own). Re-seeding never resets an
   existing admin's password (`onConflictDoNothing`).
6. **Verify.**
   - `https://garment-erp.keenlab.io/login` shows the default tenant's branding and existing
     users can sign in.
   - `https://garment-erp.keenlab.io/platform` accepts the platform admin.
   - `https://garment-erp-demo.keenlab.io/api/v1/demo/status` reports enabled; drive
     `https://garment-erp-demo.keenlab.io/demo` through a real Google sign-in (M10 task 8.3).
     Guests should be linked to `/demo` — `/` on the demo host redirects to `/login`.
   - Check `req.ip` is the client, not nginx — the per-IP signup limit keys on it. After that
     demo signup, `kubectl -n erp exec sts/erp-redis -- redis-cli --scan --pattern 'demo:rl:ip:*'`
     must show your public IP. A 10.x/100.x address means `TRUST_PROXY_HOPS` does not match
     the X-Forwarded-For chain (NPM → in-pod nginx = 2), and every guest shares one limit.

**Rollback.** The demo alone: `DELETE FROM tenant_domain WHERE resolution_mode='DEMO_POOL'`
and the idle sweep purges live sandboxes. All of cloud mode: set `DEPLOYMENT_MODE` back to
`self-hosted` and redeploy — the `tenant_domain` rows are inert there.

**Known cloud gaps.** Presigned download URLs (tenant PDPA export, documents) are signed for
the in-cluster `S3_ENDPOINT` (`http://erp-minio:9000`), which a browser cannot reach — exports
complete but their download link does not open outside the cluster. Needs a public MinIO
endpoint or an api-side download proxy.

### GitHub secrets

| Secret | Purpose |
|---|---|
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | Tailscale OAuth client for the ephemeral CI node |
| `KUBE_CONFIG` | base64 kubeconfig pointing at the apiserver over the tailnet |
| `GHCR_PULL_TOKEN` | PAT with `read:packages`, used for the in-cluster pull secret |
| `PROD_POSTGRES_PASSWORD` | bootstrap superuser `erp` — Postgres itself and `DATABASE_OWNER_URL` (migrate + seed only) |
| `PROD_DB_APP_PASSWORD` | **required** — runtime role `erp_app` (`DATABASE_URL`); the migrate Job sets it on the role. URL-safe characters only (e.g. `openssl rand -hex 24`) — it is embedded in a URL unescaped |
| `PROD_JWT_PLATFORM_SECRET` | optional, recommended — signs platform-admin tokens; unset falls back to `JWT_ACCESS_SECRET` (audience-separated) |
| `PROD_GOOGLE_OAUTH_CLIENT_ID`, `PROD_GOOGLE_OAUTH_CLIENT_SECRET` | optional — Google sign-in; both unset switches the public demo's sign-in off |
| `PROD_JWT_ACCESS_SECRET`, `PROD_JWT_REFRESH_SECRET` | token signing |
| `PROD_ENCRYPTION_KEY` | 64 hex chars — PII (national ID) encryption |
| `PROD_S3_ACCESS_KEY`, `PROD_S3_SECRET_KEY` | app credentials for MinIO |
| `PROD_MINIO_ROOT_USER`, `PROD_MINIO_ROOT_PASSWORD` | MinIO root |
| `PROD_SMTP_USER`, `PROD_SMTP_PASS` | optional; mail degrades to in-app alerts without them |

Secrets are re-rendered on every deploy, so rotating one takes effect on the next run.
Running pods keep the old values until they restart — rotation means *update the secret, then
re-run the deploy*.

## Deploying

Push to `main`, or run the **Deploy** workflow manually. The pipeline is:

1. `verify` — the full CI suite (on `main` the affected-filter is bypassed; it would diff main
   against itself and select nothing).
2. `build` — Buildx → GHCR, tagged `sha-<commit>` and `latest`.
3. `deploy` — join the tailnet → resolve tags to **digests** → render secrets → run the
   migration Job and wait → `kubectl apply` → `rollout status` (api, worker, web) → health
   smoke through the real nginx path.

Deploys are serialized by a `concurrency` group and pinned by digest, so a moved tag cannot
change what is running.

### Migrations

The Job runs the **same image** being deployed, before any Deployment is touched. If it
fails, the deploy aborts and the old pods keep serving.

> **Migrations must be backward-compatible (expand → contract).** Between the Job completing
> and the rollout finishing, old code runs against the new schema. Add columns/tables in one
> release; drop them in a later one.

`rollout undo` does not revert a migration — the expand→contract rule is what makes rollback
safe.

### Rollback

The deploy job rolls back automatically on failure. Manually:

```bash
kubectl -n erp rollout undo deploy/erp-api deploy/erp-worker deploy/erp-web
```

If the tailnet drops mid-deploy, just re-run the workflow at the same SHA — every step is
idempotent (secrets re-apply, the migration Job is a no-op once complete, `apply` is
declarative).

## Operating notes

- **`erp-api` scales; `erp-worker` does not.** Socket.IO broadcasts cross replicas via the
  Redis adapter, and the web client is pinned to the `websocket` transport because nothing in
  the chain provides sticky sessions for the polling handshake. `erp-worker` stays at 1
  replica — BullMQ would distribute jobs correctly at higher counts, but nothing needs it yet.
- **Shutdown ordering is deliberate.** `WorkerDrainService` closes BullMQ workers in
  `onModuleDestroy`; the DB pool, Chromium and the Redis pub/sub clients close in
  `onApplicationShutdown`. Reversing that kills in-flight payroll runs. `erp-worker` gets a
  120s grace period to match.
- **Redis runs with `--appendonly yes`** because the BullMQ queues live there. Turning AOF
  off silently drops queued payroll and report jobs on restart.

## Known gaps

These are stated, not solved:

- **No PVC backups.** Postgres, the Redis AOF and MinIO each sit on a single volume. A
  `pg_dump` CronJob to MinIO plus an off-cluster copy is the minimum follow-up.
  (Corrected 2026-08-08: this previously claimed "with local-path storage, losing a node is
  data loss". The target cluster has no local-path StorageClass — the PVCs inherit the
  default **`rook-ceph-block`**, replicated Ceph RBD with a `host` failure domain, so node
  loss is *not* data loss. Replication still is not backup, so the gap stands.)
- **MinIO is single-node** — no erasure coding, no replication, and it holds every generated
  document.
- **`ENCRYPTION_KEY` rotation is unsupported.** Changing it orphans existing encrypted PII;
  it would need a re-encryption migration.
- **Nginx Proxy Manager is a manually-configured SPOF** outside CI. Its WebSocket toggle and
  timeouts are checklist items, not code.
- **`@erp/e2e` is not in the pipeline.** The gate is lint/typecheck/unit/integration plus a
  health smoke — not a browser test against production.
- **Image platform is pinned to `linux/amd64`** (`PLATFORM` in `deploy.yml`). Confirmed
  2026-08-08: all 34 nodes report `architecture: amd64`.

Out of scope for now: staging overlay, NetworkPolicies, HPA, observability, Turbo remote
cache (MR-Q1 stays open), multi-arch images, sealed-secrets/SOPS.
