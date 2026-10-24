import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue, UnrecoverableError } from "bullmq";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authIdentity, demoLead, session, tenant, user, type Db, type Tx } from "@erp/db";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { onCommit } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { PlatformAuditService } from "../platform/platform-audit.service.js";
import { DEFAULT_JOB_OPTIONS, QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";
import { currentTenantId, runWithTenant } from "../tenancy/tenant-context.js";
import {
  DEMO_PURGE_JOB,
  demoPurgeJobId,
  type DemoPurgeJobData,
  type DemoPurgeTrigger,
} from "./demo.constants.js";
import { DEMO_PURGE_DETACHED_FKS, demoPurgePlan } from "./demo-purge-plan.js";
import { DemoStore } from "./demo-store.service.js";

/** What one `demo.purge` run did. */
export interface DemoPurgeResult {
  purged: boolean;
  /** The tenant row was already gone — an idempotent retry or a duplicate trigger. */
  noop?: boolean;
}

/**
 * Sandbox teardown (M10 task 4.3, `demo-sandbox-purge` spec, design D4/D6) — the `demo.purge` job
 * body plus the two producers' shared "mark PURGING and enqueue" step.
 *
 * `runPurge` executes, for the job's tenant (scoped by `withTenantJob`, so every transaction sets
 * `app.tenant_id` and RLS fences each delete to the sandbox):
 *
 * 1. re-read the tenant and **hard-assert `kind = DEMO_SANDBOX`** — otherwise delete nothing, audit
 *    the refusal and fail the job non-retryably. The assertion is repeated inside *every* purge
 *    transaction, so not even a mid-purge anomaly can reach a paying tenant's rows;
 * 2. revoke the remaining sessions (and detach `DEMO_PURGE_DETACHED_FKS` for the tail);
 * 3. delete every business table in reverse-FK order (`demoPurgePlan`), one transaction per table,
 *    opting into migration 0017's append-only escape hatch — honoured only while PURGING;
 * 4. delete the `tenants/{tid}/` S3 prefix;
 * 5. iff the guest opted in, copy `{ email, name, consented_at }` into `demo_lead` and audit the
 *    capture — clearing the consent in the same transaction, so a retry never captures twice;
 * 6. delete `auth_identity`, then the guest `user` rows;
 * 7. delete the `tenant` row and write the completion audit row (trigger and counts, never the
 *    guest email).
 *
 * Every step is idempotent (deletes of absent rows are no-ops), so a retried job resumes wherever
 * the last attempt stopped; a job whose tenant is already gone completes as a no-op.
 */
@Injectable()
export class DemoPurgeService {
  private readonly logger = new Logger(DemoPurgeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
    private readonly storage: StorageService,
    private readonly store: DemoStore,
    @InjectQueue(QUEUES.demo) private readonly queue: Queue,
  ) {}

  /**
   * Flip an ACTIVE sandbox to PURGING (audited) and enqueue `demo.purge` once the surrounding
   * transaction commits — joins the caller's transaction (sign-out request) or opens its own
   * (sweep). Only `DEMO_SANDBOX` rows are ever touched. A sandbox already PURGING is re-enqueued
   * (the purge job id dedupes); any other tenant is left alone. Returns whether it is now PURGING.
   */
  async beginPurge(tenantId: string, trigger: DemoPurgeTrigger): Promise<boolean> {
    return runWithTenant(tenantId, "system", () =>
      this.uow.withTransaction(async (tx) => {
        const flipped = await tx
          .update(tenant)
          .set({ status: "PURGING", updatedAt: new Date(), version: sql`${tenant.version} + 1` })
          .where(
            and(
              eq(tenant.id, tenantId),
              eq(tenant.kind, "DEMO_SANDBOX"),
              eq(tenant.status, "ACTIVE"),
            ),
          )
          .returning({ id: tenant.id });
        if (flipped.length > 0) {
          await this.audit.append({
            action: "UPDATE",
            entityType: "tenant",
            entityId: tenantId,
            tenantId,
            before: { status: "ACTIVE" },
            after: { status: "PURGING", trigger },
            reason: "demo sandbox purge",
          });
        } else {
          const [current] = await tx
            .select({ kind: tenant.kind, status: tenant.status })
            .from(tenant)
            .where(eq(tenant.id, tenantId))
            .limit(1);
          if (current?.kind !== "DEMO_SANDBOX" || current.status !== "PURGING") return false;
        }
        onCommit(() => this.enqueue(tenantId, trigger));
        return true;
      }),
    );
  }

  /**
   * Enqueue `demo.purge` under its deduplicating job id. A queued/running job absorbs the trigger;
   * a finished or dead-lettered one is replaced, so the purge stays resumable.
   */
  async enqueue(tenantId: string, trigger: DemoPurgeTrigger): Promise<void> {
    const jobId = demoPurgeJobId(tenantId);
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== "completed" && state !== "failed" && state !== "unknown") return;
      await existing.remove();
    }
    await this.queue.add(DEMO_PURGE_JOB, { tenantId, trigger } satisfies DemoPurgeJobData, {
      ...DEFAULT_JOB_OPTIONS,
      jobId,
    });
  }

  /** Whether a purge job for `tenantId` is queued or running (the sweep's stuck-purge check). */
  async hasLiveJob(tenantId: string): Promise<boolean> {
    const job = await this.queue.getJob(demoPurgeJobId(tenantId));
    if (!job) return false;
    const state = await job.getState();
    return state !== "completed" && state !== "failed" && state !== "unknown";
  }

  /** The `demo.purge` job body (runs inside `withTenantJob`). */
  async runPurge(trigger: DemoPurgeTrigger = "RETRY"): Promise<DemoPurgeResult> {
    const tenantId = currentTenantId();
    if (tenantId === null) throw new BusinessRuleError("demo.purge requires a tenant scope");

    const [current] = await this.db
      .select({ kind: tenant.kind, status: tenant.status })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    if (!current) return { purged: true, noop: true };
    if (current.kind !== "DEMO_SANDBOX") await this.refuse(tenantId, current.kind);
    if (current.status !== "PURGING") {
      // Only a sandbox someone marked PURGING is torn down (and 0017's escape hatch needs it).
      this.logger.warn(`not purging demo tenant ${tenantId} in status ${current.status}`);
      return { purged: false };
    }

    await this.audit.append({
      action: "DELETE",
      entityType: "tenant",
      entityId: tenantId,
      tenantId,
      after: { phase: "PURGE_STARTED", trigger },
    });

    // 2. Revoke what is left of the guest's sessions; detach the tail's FKs into the bulk phase.
    await this.inPurgeTx(tenantId, async (tx) => {
      await tx
        .update(session)
        .set({ revokedAt: new Date() })
        .where(and(eq(session.tenantId, tenantId), isNull(session.revokedAt)));
      for (const fk of DEMO_PURGE_DETACHED_FKS) {
        await tx.execute(
          sql`update ${sql.identifier(fk.table)} set ${sql.identifier(fk.column)} = null
              where tenant_id = ${tenantId} and ${sql.identifier(fk.column)} is not null`,
        );
      }
    });

    // 3. Business rows, children first.
    const plan = demoPurgePlan();
    const rows: Record<string, number> = {};
    for (const t of plan.bulk) {
      rows[t.name] = await this.inPurgeTx(tenantId, (tx) => deleteCount(tx, t.table, t.tenantId, tenantId));
    }

    // 4. Stored objects under `tenants/{tid}/`.
    const objects = await this.storage.deleteTenantObjects();

    // 5. PDPA lead capture — only with explicit consent, before the identity/user rows go.
    const leadCaptured = await this.inPurgeTx(tenantId, (tx) => this.captureLead(tx, tenantId));

    // 6. Identity → guest user.
    for (const t of plan.tail) {
      rows[t.name] = await this.inPurgeTx(tenantId, (tx) => deleteCount(tx, t.table, t.tenantId, tenantId));
    }

    // 7. The tenant row itself, with the completion audit in the same transaction.
    await this.inPurgeTx(tenantId, async (tx) => {
      await tx
        .delete(tenant)
        .where(
          and(eq(tenant.id, tenantId), eq(tenant.kind, "DEMO_SANDBOX"), eq(tenant.status, "PURGING")),
        );
      await this.audit.append({
        action: "DELETE",
        entityType: "tenant",
        entityId: tenantId,
        tenantId,
        after: { phase: "PURGE_COMPLETED", trigger, rows, objects, lead_captured: leadCaptured },
      });
    });
    await this.store.clearActivity(tenantId).catch((err: unknown) => {
      this.logger.warn(`could not clear demo activity for ${tenantId}: ${String(err)}`);
    });
    return { purged: true };
  }

  /**
   * One purge transaction: re-assert the sandbox kind under the transaction, then opt into the
   * append-only escape hatch for this tenant. A tenant row already gone (a racing completion) is
   * tolerated — the deletes then match nothing.
   */
  private inPurgeTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.uow.withTransaction(async (tx) => {
      const [row] = await tx
        .select({ kind: tenant.kind })
        .from(tenant)
        .where(eq(tenant.id, tenantId))
        .limit(1);
      if (row && row.kind !== "DEMO_SANDBOX") await this.refuse(tenantId, row.kind);
      await tx.execute(sql`select set_config('app.purge_tenant_id', ${tenantId}, true)`);
      return fn(tx);
    });
  }

  /** Copy the opted-in guest into `demo_lead` (once) and audit it; `false` without consent. */
  private async captureLead(tx: Tx, tenantId: string): Promise<boolean> {
    const [t] = await tx
      .select({ consentedAt: tenant.demoLeadConsentedAt, name: tenant.demoGuestName })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    if (!t?.consentedAt) return false;

    const [guest] = await tx
      .select({ email: authIdentity.email })
      .from(authIdentity)
      .where(and(eq(authIdentity.tenantId, tenantId), eq(authIdentity.provider, "GOOGLE")))
      .limit(1);
    const email = guest?.email ?? (await this.guestUserEmail(tx, tenantId));
    if (email) {
      const [lead] = await tx
        .insert(demoLead)
        .values({ email, name: t.name?.trim() || email, consentedAt: t.consentedAt })
        .returning({ id: demoLead.id });
      await this.audit.append({
        action: "CREATE",
        entityType: "demo_lead",
        entityId: lead?.id ?? null,
        tenantId,
        reason: "demo lead captured with consent",
        after: { consented_at: t.consentedAt.toISOString() },
      });
    }
    // Consent is spent either way — a retry must never capture a second lead.
    await tx.update(tenant).set({ demoLeadConsentedAt: null }).where(eq(tenant.id, tenantId));
    return email !== null;
  }

  private async guestUserEmail(tx: Tx, tenantId: string): Promise<string | null> {
    const [u] = await tx
      .select({ email: user.email })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.isSuperAdmin, true)))
      .limit(1);
    return u?.email ?? null;
  }

  /** Never purge a non-sandbox: audit the refusal and fail the job without retries. */
  private async refuse(tenantId: string, kind: string): Promise<never> {
    // Its own transaction: the refusal must be recorded even though the purge tx rolls back.
    await runWithTenant(tenantId, "system", () =>
      this.uow.withTransaction(() =>
        this.audit.append({
          action: "DELETE",
          entityType: "tenant",
          entityId: tenantId,
          tenantId,
          reason: "demo purge refused: tenant is not a DEMO_SANDBOX",
          after: { phase: "PURGE_REFUSED", kind },
        }),
      ),
    ).catch((err: unknown) => this.logger.error(`could not audit purge refusal: ${String(err)}`));
    throw new UnrecoverableError(`Refusing to purge tenant ${tenantId}: kind is ${kind}`);
  }
}

async function deleteCount(
  tx: Tx,
  table: Parameters<Tx["delete"]>[0],
  tenantColumn: Parameters<typeof eq>[0],
  tenantId: string,
): Promise<number> {
  const result = await tx.delete(table).where(eq(tenantColumn, tenantId));
  // postgres-js reports the affected row count as `count`.
  return (result as unknown as { count?: number }).count ?? 0;
}
