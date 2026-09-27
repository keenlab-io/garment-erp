import { Global, Module } from "@nestjs/common";
import { TenantContextController } from "./tenant-context.controller.js";
import { TenantResolutionService } from "./tenant-resolution.service.js";

/**
 * Global tenancy core (M7 §4). Provides hostname resolution and the public
 * `GET /public/tenant-context` endpoint. `app.module.ts` registers the rest globally: the
 * `TenantResolutionMiddleware` on every route, `TenantStatusGuard` (`APP_GUARD`), and
 * `TenantTransactionInterceptor` (`APP_INTERCEPTOR`). The ALS helpers (`tenantContext`,
 * `currentTenantId`, `runWithTenant`) and `withTenantJob` are plain functions — import them
 * directly.
 */
@Global()
@Module({
  controllers: [TenantContextController],
  providers: [TenantResolutionService],
  exports: [TenantResolutionService],
})
export class TenancyModule {}
