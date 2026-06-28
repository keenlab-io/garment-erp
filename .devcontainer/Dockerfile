# Matches the repo toolchain: Node 22 (CI-pinned) + pnpm 9.15.0 (packageManager field).
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Pin pnpm to the exact version declared in package.json's "packageManager".
# Recent Node no longer bundles Corepack reliably, so install pnpm explicitly.
ARG PNPM_VERSION=9.15.0
RUN npm install -g pnpm@${PNPM_VERSION} \
    && SHELL=bash pnpm setup \
    && echo 'export PNPM_HOME="/home/node/.local/share/pnpm"' >> /home/node/.bashrc

# Postgres client (psql) for poking at the dev DB; handy once db:migrate is real.
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends postgresql-client \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*
