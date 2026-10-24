import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { currentTenant } from "../tenancy/tenant-context.js";
import { DemoGuardService } from "./demo-guard.service.js";
import { DemoStore } from "./demo-store.service.js";

/** At most one activity write per sandbox per this many ms (per process). */
export const DEMO_ACTIVITY_THROTTLE_MS = 60_000;

/**
 * Stamps "this sandbox is in use" for the idle sweep (M10 task 4.5, design D4): on every
 * authenticated (`tid`-scoped) HTTP request whose tenant is a `DEMO_SANDBOX`, record the time in
 * Redis — throttled per process to one write a minute per sandbox. Sessions alone cannot show
 * activity (refresh never touches the session row), and an engaged guest must never be swept.
 * Best-effort: a Redis hiccup never fails the request; the sweep then falls back to the newest
 * session's issue time.
 */
@Injectable()
export class DemoActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DemoActivityInterceptor.name);
  private readonly lastWrite = new Map<string, number>();

  constructor(
    private readonly guard: DemoGuardService,
    private readonly store: DemoStore,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const scope = currentTenant();
    if (context.getType() === "http" && scope?.source === "jwt") {
      await this.touch(scope.tenantId).catch((err: unknown) => {
        this.logger.warn(`could not record demo activity: ${String(err)}`);
      });
    }
    return next.handle();
  }

  private async touch(tenantId: string, now = Date.now()): Promise<void> {
    const last = this.lastWrite.get(tenantId);
    if (last !== undefined && now - last < DEMO_ACTIVITY_THROTTLE_MS) return;
    if ((await this.guard.kindOf(tenantId, now)) !== "DEMO_SANDBOX") return;
    if (this.lastWrite.size > 10_000) this.lastWrite.clear();
    this.lastWrite.set(tenantId, now);
    await this.store.touchActivity(tenantId, new Date(now));
  }
}
