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
       user: {}
   ```

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

5. **Create the MinIO bucket.** `StorageModule` does *not* create it:
   ```bash
   kubectl -n erp run mc --rm -it --restart=Never --image=minio/mc -- \
     sh -c 'mc alias set s3 http://erp-minio:9000 "$USER" "$PASS" && mc mb -p s3/erp'
   ```

6. **Seed the super-admin** (idempotent, but only ever needed once):
   ```bash
   kubectl -n erp exec deploy/erp-api -- node packages/db/dist/seed/seed.js
   ```
   Then change the password immediately — the default is `superadmin` / `changeme`.
   Note: `onConflictDoNothing` means re-seeding an existing database will *not* reset a
   forgotten password.

7. **Create the Nginx Proxy Manager host** pointing at
   `http://garment-erp.tail0b8c39.ts.net:80`, and **turn on "Websockets Support"** — without
   it the production realtime timeline silently never connects.

   The operator runs with `PROXY_TAGS=tag:k8s`, so the tailnet ACL grant that lets the NPM
   node reach the proxy on :80 must target `tag:k8s`.

### GitHub secrets

| Secret | Purpose |
|---|---|
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | Tailscale OAuth client for the ephemeral CI node |
| `KUBE_CONFIG` | base64 kubeconfig pointing at the apiserver over the tailnet |
| `GHCR_PULL_TOKEN` | PAT with `read:packages`, used for the in-cluster pull secret |
| `PROD_POSTGRES_PASSWORD` | single source for the DB password and `DATABASE_URL` |
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
