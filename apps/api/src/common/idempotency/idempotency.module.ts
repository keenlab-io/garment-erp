import { Global, Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service.js";

/**
 * Global idempotency module. Provides `IdempotencyService`; the
 * `IdempotencyInterceptor` is registered globally as `APP_INTERCEPTOR` in
 * `app.module`.
 */
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
