import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { API_PREFIX } from "@erp/contracts";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtGuard } from "./auth/jwt.guard.js";
import { PERMISSION_RESOLVER } from "./auth/auth.tokens.js";
import { RolePermissionResolver } from "./iam/role-permission.resolver.js";
import { PermissionsGuard } from "./auth/permissions.guard.js";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter.js";
import { IdempotencyInterceptor } from "./common/idempotency/idempotency.interceptor.js";
import { IdempotencyModule } from "./common/idempotency/idempotency.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthController } from "./health/health.controller.js";
import { HrModule } from "./hr/hr.module.js";
import { IamModule } from "./iam/iam.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { PdfModule } from "./pdf/pdf.module.js";
import { EntitlementsModule } from "./platform/entitlements.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { ProductionModule } from "./production/production.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { ReportingModule } from "./reporting/reporting.module.js";
import { SalesModule } from "./sales/sales.module.js";
import { SequenceModule } from "./sequence/sequence.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { TenancyModule } from "./tenancy/tenancy.module.js";
import { TenantResolutionMiddleware } from "./tenancy/tenant-resolution.middleware.js";
import { TenantStatusGuard } from "./tenancy/tenant-status.guard.js";
import { TenantTransactionInterceptor } from "./tenancy/tenant-transaction.interceptor.js";

/**
 * Root module. Imports every cross-cutting infra module (Config/Db/Events/Auth are
 * `@Global`) and registers the global providers: the uniform exception filter, the
 * guards (JwtGuard authenticates, TenantStatusGuard enforces the tenant lifecycle, then
 * PermissionsGuard authorizes — order matters), and the interceptors (the tenant transaction
 * wraps the idempotency interceptor, so both ride one transaction). Every route except the
 * health probe first passes the hostname `TenantResolutionMiddleware` (M7 design D5).
 */
@Module({
  imports: [
    ConfigModule,
    DbModule,
    TenancyModule,
    EventsModule,
    AuthModule,
    AuditModule,
    // Module entitlements + seat cap (M8 §5) — global, consumed by IAM and every gated module.
    EntitlementsModule,
    // IamModule supplies the real PERMISSION_RESOLVER (RolePermissionResolver). Import order
    // alone is NOT enough to rebind it for the global guard — see the provider below.
    IamModule,
    InventoryModule,
    HrModule,
    ProductionModule,
    SalesModule,
    ReportingModule,
    SequenceModule,
    IdempotencyModule,
    QueueModule,
    StorageModule,
    PdfModule,
    RealtimeModule,
    // The control plane (M7 §6): the full `/platform/*` surface in DEPLOYMENT_MODE=cloud; in
    // self-hosted only the boot-time "ensure the single default tenant" provisioning.
    PlatformModule.forRoot(),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Rebind PERMISSION_RESOLVER in THIS injector, which is the one that instantiates the
    // `APP_GUARD` JwtGuard below.
    //
    // AuthModule is @Global() and binds M0's empty-set DefaultPermissionResolver. IamModule
    // re-provides the token and exports it, but the global binding still won here, so the guard
    // attached an EMPTY permission set to every request. `assertPermissions` reads that set, so
    // every non-super-admin was refused on every permission-checked endpoint in every module —
    // RBAC granted nothing. `/auth/me` masked it by re-deriving permissions from the database,
    // so the UI showed the right modules while the API refused the calls behind them.
    { provide: PERMISSION_RESOLVER, useExisting: RolePermissionResolver },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Registered before IdempotencyInterceptor: outermost, so replay lookups run in-tenant.
    { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      // Health is probed constantly and touches no tenant data — keep it database-free.
      .exclude({ path: `${API_PREFIX.replace(/^\//, "")}/health`, method: RequestMethod.GET })
      .forRoutes("*");
  }
}
