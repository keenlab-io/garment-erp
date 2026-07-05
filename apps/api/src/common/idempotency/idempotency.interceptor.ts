import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, of } from "rxjs";
import { switchMap } from "rxjs/operators";
import type { AuthUser } from "../../auth/auth-user.js";
import { IdempotencyService } from "./idempotency.service.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * At-most-once mutations (M0 idempotency spec). For a mutating request that carries
 * an `Idempotency-Key` header and an authenticated user: an exact replay returns
 * the stored response (marked with `X-Idempotent-Replay`) without re-running the
 * handler; a first use runs the handler and persists its response. Requests without
 * the header, or without a user, pass through untouched.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly service: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const key = req.headers["idempotency-key"];
    const user = req.user;

    if (!MUTATING.has(req.method.toUpperCase()) || typeof key !== "string" || !key || !user) {
      return next.handle();
    }

    const requestHash = this.service.hashRequest(req.body);
    const stored = await this.service.lookup(key, user.id, requestHash);
    const res = context.switchToHttp().getResponse<Response>();

    if (stored) {
      res.status(stored.status).setHeader("X-Idempotent-Replay", "true");
      return of(stored.body);
    }

    return next.handle().pipe(
      switchMap(async (body) => {
        await this.service.store(key, user.id, requestHash, {
          status: res.statusCode,
          body,
        });
        return body;
      }),
    );
  }
}
