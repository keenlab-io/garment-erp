# apps/web (@erp/web) production image — a static SPA served by nginx.
#
# Build context is the REPO ROOT, e.g.:
#   docker build -f infra/docker/web.Dockerfile -t erp-web .
#
# The web build is environment-independent (the only `import.meta.env` use is the
# dev-only `VITE_DEV_PERMISSIONS`), so this one image is deployed unchanged to every
# environment — no build args needed.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Prune the monorepo down to just @erp/web and its workspace dependency graph.
# `--docker` splits the pruned output into two directories so the install layer
# (out/json) can be cached independently of source changes (out/full):
#   - out/json: package.json files (this package + its deps) + the pruned lockfile
#   - out/full: the corresponding pruned source tree
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @erp/web --docker

# Install first from the pruned manifests only, so this layer is cache-stable across
# source-only changes. Dev deps are needed here: vite, typescript, and tailwind all run
# as part of `@erp/web`'s build script (`tsc --noEmit && vite build`).
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@erp/web...

# nginx-unprivileged already runs as non-root (uid 101) and listens on 8080 out of the
# box. Alpine is fine here (unlike the api image) — this is a static file server with no
# native deps and no Chromium/puppeteer to worry about.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/web-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
