import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtGuard } from "./auth/jwt.guard.js";
import { PermissionsGuard } from "./auth/permissions.guard.js";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter.js";
import { IdempotencyInterceptor } from "./common/idempotency/idempotency.interceptor.js";
import { IdempotencyModule } from "./common/idempotency/idempotency.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthController } from "./health/health.controller.js";
import { InvoiceController } from "./invoice/invoice.controller.js";
import { PdfModule } from "./pdf/pdf.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { SequenceModule } from "./sequence/sequence.module.js";
import { StorageModule } from "./storage/storage.module.js";

/**
 * Root module. Imports every cross-cutting infra module (Config/Db/Events/Auth are
 * `@Global`) and registers the global providers: the uniform exception filter, the
 * two guards (JwtGuard authenticates, then PermissionsGuard authorizes — order
 * matters), and the idempotency interceptor.
 */
@Module({
  imports: [
    ConfigModule,
    DbModule,
    EventsModule,
    AuthModule,
    AuditModule,
    SequenceModule,
    IdempotencyModule,
    QueueModule,
    StorageModule,
    PdfModule,
    RealtimeModule,
  ],
  controllers: [HealthController, InvoiceController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
