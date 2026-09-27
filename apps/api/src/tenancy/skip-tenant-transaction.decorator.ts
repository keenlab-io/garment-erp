import { SetMetadata } from "@nestjs/common";

export const SKIP_TENANT_TRANSACTION_KEY = "skipTenantTransaction";

/**
 * Opts a controller (or handler) out of the per-request tenant transaction (M7 design OQ1) —
 * for streaming / long-lived responses where holding a transaction across a slow client is
 * worse than short per-repository transactions. The tenant context itself still applies: every
 * `withTransaction` the handler opens sets `app.tenant_id`. On ts-rest controllers apply it at
 * the CLASS level — the Reflector cannot see method-level metadata there (M0 design D7).
 */
export const SkipTenantTransaction = () => SetMetadata(SKIP_TENANT_TRANSACTION_KEY, true);
