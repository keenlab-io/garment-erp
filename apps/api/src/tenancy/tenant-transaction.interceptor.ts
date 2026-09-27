import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { from, lastValueFrom, type Observable } from "rxjs";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { SKIP_TENANT_TRANSACTION_KEY } from "./skip-tenant-transaction.decorator.js";
import { currentTenantId } from "./tenant-context.js";

/**
 * Wraps every tenant-scoped request in one transaction (M7 design D3). `SET LOCAL
 * app.tenant_id` only lives inside a transaction, and `currentExecutor(db)` falls back to the
 * raw pool outside one — so without this, most GET handlers would query unscoped. Registered
 * globally ahead of `IdempotencyInterceptor`, so the idempotency lookup/store rides the same
 * transaction; nested `withTransaction` calls in services join it, and `onCommit` hooks keep
 * their after-commit semantics.
 *
 * Passes through when no tenant is in scope (platform routes, unknown hosts), for `@Public()`
 * routes (login/refresh/health manage their own short transactions), and for handlers marked
 * `@SkipTenantTransaction()`.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly uow: UnitOfWork,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http" || currentTenantId() === null) return next.handle();

    const targets = [context.getHandler(), context.getClass()];
    const passThrough =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_TRANSACTION_KEY, targets);
    if (passThrough) return next.handle();

    return from(
      this.uow.withTransaction(() => lastValueFrom(next.handle(), { defaultValue: undefined })),
    );
  }
}
