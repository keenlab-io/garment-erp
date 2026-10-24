import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { session, tenant, type Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import type { DemoPurgeTrigger } from "./demo.constants.js";
import { DemoPurgeService } from "./demo-purge.service.js";
import { DemoStore } from "./demo-store.service.js";

/** What the sweep knows about one ACTIVE sandbox. */
export interface SandboxActivity {
  createdAt: Date;
  /** Newest session issued for the tenant (any state), if any. */
  lastSessionAt: Date | null;
  /** Sessions neither revoked nor expired. */
  liveSessions: number;
  /** Last authenticated request seen by `DemoActivityInterceptor` (Redis), if any. */
  lastActivityAt: Date | null;
}

/**
 * Whether an ACTIVE sandbox is due for purging, and why (`demo-sandbox-purge` spec, design D4):
 * every session revoked/expired → `SESSIONS_ENDED`; else no sign of life (provisioning, a new
 * session, or a request) within the idle window → `IDLE`; else `null` — an engaged guest is never
 * cut off (design OQ2: idle-only, no maximum age).
 */
export function idlePurgeReason(
  a: SandboxActivity,
  now: Date,
  idleMs: number,
): Extract<DemoPurgeTrigger, "IDLE" | "SESSIONS_ENDED"> | null {
  if (a.liveSessions === 0) return "SESSIONS_ENDED";
  const lastSeen = Math.max(
    a.createdAt.getTime(),
    a.lastSessionAt?.getTime() ?? 0,
    a.lastActivityAt?.getTime() ?? 0,
  );
  return now.getTime() - lastSeen > idleMs ? "IDLE" : null;
}

export interface DemoSweepResult {
  checked: number;
  purging: number;
  requeued: number;
  failed: number;
}

/**
 * The `demo.idle-sweep` backstop (M10 task 4.5, design D4) — most guests close the tab instead of
 * signing out, so this is what bounds every sandbox's lifetime. Each tick walks the
 * `DEMO_SANDBOX` tenants: an ACTIVE one past its idle window (or with no live session) is flipped
 * to PURGING and its purge enqueued; a PURGING one with no queued/running purge job (a crash, a
 * dead-lettered run) is re-enqueued. Runs unscoped (a `PLATFORM_JOBS` tick over the exempt
 * `tenant` table) and enters each sandbox's tenant scope only to read its RLS-bound sessions.
 * Per-tenant failures are counted and skipped, so one bad sandbox never stalls the rest.
 */
@Injectable()
export class DemoSweepService {
  private readonly logger = new Logger(DemoSweepService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly purge: DemoPurgeService,
    private readonly store: DemoStore,
    private readonly config: ConfigService,
  ) {}

  async sweep(now = new Date()): Promise<DemoSweepResult> {
    const idleMs = (this.config.get<number>("DEMO_SANDBOX_IDLE_MINUTES") ?? 60) * 60_000;
    const sandboxes = await this.db
      .select({ id: tenant.id, status: tenant.status, createdAt: tenant.createdAt })
      .from(tenant)
      .where(and(eq(tenant.kind, "DEMO_SANDBOX"), inArray(tenant.status, ["ACTIVE", "PURGING"])));

    const result: DemoSweepResult = { checked: sandboxes.length, purging: 0, requeued: 0, failed: 0 };
    for (const sandbox of sandboxes) {
      try {
        if (sandbox.status === "PURGING") {
          if (!(await this.purge.hasLiveJob(sandbox.id))) {
            await this.purge.enqueue(sandbox.id, "RETRY");
            result.requeued += 1;
          }
          continue;
        }
        const activity = await this.activityOf(sandbox.id, sandbox.createdAt, now);
        const reason = idlePurgeReason(activity, now, idleMs);
        if (reason && (await this.purge.beginPurge(sandbox.id, reason))) result.purging += 1;
      } catch (err) {
        result.failed += 1;
        this.logger.warn(`demo sweep failed for tenant ${sandbox.id}: ${String(err)}`);
      }
    }
    return result;
  }

  private async activityOf(tenantId: string, createdAt: Date, now: Date): Promise<SandboxActivity> {
    const [sessions] = await runWithTenant(tenantId, "system", () =>
      this.uow.withTransaction((tx) =>
        tx
          .select({
            lastSessionAt: max(session.createdAt),
            live: sql<number>`count(*) filter (where ${session.revokedAt} is null and ${session.expiresAt} > ${now.toISOString()}::timestamptz)`,
          })
          .from(session)
          .where(eq(session.tenantId, tenantId)),
      ),
    );
    return {
      createdAt,
      lastSessionAt: sessions?.lastSessionAt ?? null,
      liveSessions: Number(sessions?.live ?? 0),
      lastActivityAt: await this.store.lastActivity(tenantId),
    };
  }
}
