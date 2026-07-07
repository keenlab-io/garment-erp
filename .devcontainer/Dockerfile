# Matches the repo toolchain: Node 22 (CI-pinned) + pnpm 9.15.0 (packageManager field).
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Pin pnpm to the exact version declared in package.json's "packageManager".
# Recent Node no longer bundles Corepack reliably, so install pnpm explicitly.
#
# The content-addressable store lives at /home/node/.pnpm-store (its own named
# volume) — NOT under ~/.local, so the volume mount can't shadow ~/.local and
# leave it root-owned (which would break tools like the Claude Code installer
# that need ~/.local/state). PNPM_HOME (global bin) stays at its default under
# ~/.local/share/pnpm, created node-owned at runtime since no volume mounts there.
ARG PNPM_VERSION=9.15.0
ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PNPM_STORE=/home/node/.pnpm-store
# ~/.local/bin is where the Claude Code native installer drops the `claude` binary.
ENV PATH=/home/node/.local/bin:$PNPM_HOME:$PATH
RUN npm install -g pnpm@${PNPM_VERSION} \
    && mkdir -p "$PNPM_STORE" \
    && printf 'store-dir=%s\n' "$PNPM_STORE" > /home/node/.npmrc \
    && chown -R node:node "$PNPM_STORE" /home/node/.npmrc \
    && { echo 'export PNPM_HOME="/home/node/.local/share/pnpm"'; \
         echo 'export PATH="/home/node/.local/bin:$PNPM_HOME:$PATH"'; } >> /home/node/.bashrc

# Postgres client (psql) for poking at the dev DB, plus the shared libraries
# Puppeteer's bundled Chromium links against at runtime (the PDF module). Puppeteer
# downloads Chromium itself on install; these are only its system dependencies.
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 \
        libasound2 libpangocairo-1.0-0 libxkbcommon0 libxcomposite1 \
        libxdamage1 libxfixes3 libxrandr2 libgtk-3-0 libxshmfence1 \
        fonts-liberation \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Bake Claude Code into the image (installed as `node` → ~/.local/bin/claude) so
# it survives rebuilds and is on PATH. Update later from inside with `claude update`.
# Pre-create ~/.claude node-owned so the `claude-home` named volume (see
# docker-compose.yml) inherits node ownership on first mount instead of the
# default root:root — otherwise the `node` user couldn't write its own sessions.
USER node
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && mkdir -p /home/node/.claude
USER root
