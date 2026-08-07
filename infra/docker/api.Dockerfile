# syntax=docker/dockerfile:1.7
#
# @erp/api production image. Build context is the REPO ROOT:
#   docker build -f infra/docker/api.Dockerfile -t erp-api .
#
# The same image runs both k8s Deployments — `erp-api` (HTTP + Socket.IO) and `erp-worker`
# (BullMQ processing) — selected at runtime by APP_ROLE, and it is also the image the
# migration Job runs (`node packages/db/dist/migrate.js`). One build, one commit, one schema.
#
# Two invariants this file must preserve:
#   1. The pnpm WORKSPACE LAYOUT (/app/apps/api, /app/packages/*, /app/tooling/drizzle).
#      `packages/db/src/migrate.ts` resolves its migrations as `../../../tooling/drizzle`
#      relative to its own file, so `packages/db/dist/migrate.js` only finds them when the
#      tree is shaped like the repo. This is why we do NOT use `pnpm deploy`, which re-homes
#      workspace packages under node_modules/ and would break that path.
#   2. Full ESM + NodeNext resolution — nothing here rewrites specifiers, so the compiled
#      output must be run by node exactly as tsc emitted it.

# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
# Pin pnpm to the repo's `packageManager` field; corepack is no longer bundled with Node.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
# Never download Chrome-for-Testing in ANY stage: ~170MB and the runtime uses Debian's
# chromium instead (see the runtime stage for the rationale and the fallback).
# NOTE: puppeteer v24 reads PUPPETEER_SKIP_DOWNLOAD; the older
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD name is no longer honoured.
ENV PUPPETEER_SKIP_DOWNLOAD=1
WORKDIR /app

# ---------------------------------------------------------------------------------------
# Prune the monorepo to just @erp/api and its workspace dependencies. `--docker` splits the
# result into out/json (package.json files + a pruned lockfile — a cache-stable install
# layer) and out/full (sources), so editing a .ts file does not invalidate `pnpm install`.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @erp/api --docker

# ---------------------------------------------------------------------------------------
FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# Dev dependencies are required here: @nestjs/cli drives `nest build`, tsc builds the
# workspace packages.
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
# turbo's `build` task has dependsOn ["^build"], so @erp/contracts, @erp/utils and @erp/db
# are compiled to dist/ before `nest build` runs for the api.
RUN pnpm exec turbo run build --filter=@erp/api...

# ---------------------------------------------------------------------------------------
# Production dependency tree only — resolved separately so dev deps (nest CLI, vitest,
# typescript, testcontainers…) never reach the runtime image.
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    # PdfService launches this binary instead of a puppeteer-managed download.
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Debian, not Alpine: glibc is the tested path for both Chromium and the native `argon2`
# addon — musl is where puppeteer breakage traditionally lives.
#
# Distro chromium rather than puppeteer's bundled Chrome-for-Testing: apt pulls its own
# shared-library deps and keeps it patched with the base image, and this app's usage is
# trivial (setContent + pdf()/screenshot() in PdfService), so version skew is low risk.
# FALLBACK if a render regresses after a base-image bump: drop PUPPETEER_SKIP_DOWNLOAD and
# PUPPETEER_EXECUTABLE_PATH here and add `RUN npx puppeteer browsers install chrome`.
#
# fonts-thai-tlwg is NOT optional — invoices and payslips render Thai text, and Chromium
# would otherwise emit tofu boxes into customer-facing PDFs.
#
# tini is PID 1: Chromium spawns a renderer process tree whose zombies node will not reap,
# and tini forwards SIGTERM so Nest's enableShutdownHooks() actually runs on pod eviction.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      tini \
      ca-certificates \
      fonts-thai-tlwg \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Production node_modules (including the workspace symlink structure), then the compiled
# output layered over the package.json-only skeleton that `pnpm install` left behind.
COPY --from=prod-deps --chown=node:node /app ./
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=node:node /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder --chown=node:node /app/packages/db/dist ./packages/db/dist
# Invariant 1: turbo prune does not carry this — `tooling/` is not a workspace package —
# but packages/db/dist/migrate.js resolves migrations relative to it.
COPY --chown=node:node tooling/drizzle ./tooling/drizzle

# uid 1000, matching runAsUser in the k8s pod securityContext. The pod also runs with
# readOnlyRootFilesystem, with emptyDir mounts supplying /tmp and /dev/shm.
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
