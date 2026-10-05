import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { strToU8, zipSync, type Zippable } from "fflate";
import { tenant, type Db } from "@erp/db";
import type { TenantExportStatus, TenantExportStatusResult } from "@erp/contracts";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";
import { currentTenantId, runWithTenant } from "../tenancy/tenant-context.js";
import type { TenantJobData } from "../tenancy/with-tenant-job.js";
import { PlatformAuditService } from "./platform-audit.service.js";
import { tenantTablesInFkOrder } from "./tenant-tables.js";

/** `tenant`-queue job names (M8 design D9). */
export const TENANT_EXPORT_JOB = "tenant.export";
export const TENANT_PURGE_JOB = "tenant.purge";

/** Where export archives land, relative to the tenant prefix: `tenants/{tid}/exports/{ts}.zip`. */
const EXPORTS_DIR = "exports/";

/** Credentials never leave the database, not even in the tenant's own export. */
const REDACTED_COLUMN = /password|secret|token/i;

/** Who asked for an export — recorded on the platform audit row. */
export type ExportRequester = { platformAdminId: string } | { userId: string };

/** BullMQ job state → the contract's export status (DONE only once the archive is stored). */
function toExportStatus(state: string): TenantExportStatus {
  switch (state) {
    case "completed":
      return "DONE";
    case "failed":
      return "FAILED";
    case "active":
      return "RUNNING";
    default:
      return "PENDING";
  }
}

/** One table row as a JSONL line: credentials dropped, bigints as strings. */
function toJsonLine(row: Record<string, unknown>): string {
  const kept = Object.fromEntries(Object.entries(row).filter(([k]) => !REDACTED_COLUMN.test(k)));
  return JSON.stringify(kept, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

/** The tenant the current job/request runs as — the export and purge only ever act on it. */
function scopedTenant(): string {
  const tenantId = currentTenantId();
  if (tenantId === null) throw new BusinessRuleError("Tenant data jobs require a tenant scope");
  return tenantId;
}

/**
 * Per-tenant PDPA export and purge (M8 design D9) — one worker family on the `tenant` queue.
 *
 * - **Export**: `requestExport` enqueues `tenant.export` (platform admin, or the tenant's own
 *   super-admin — and allowed while READ_ONLY, design D6). `runExport` walks every tenant table
 *   parents-first, writing one JSONL file per table plus every stored object under the tenant's
 *   prefix into `tenants/{tid}/exports/{ts}.zip`; `exportStatus` presigns it once DONE for
 *   `TENANT_EXPORT_URL_TTL_MINUTES`.
 * - **Purge**: `requestPurge` requires SUSPENDED + the tenant's slug typed as confirmation, flips
 *   the tenant to PURGING and enqueues `tenant.purge`. `runPurge` deletes the tenant's rows in
 *   reverse-FK order (one transaction per table, opting into migration 0017's append-only escape
 *   hatch), then the `tenants/{tid}/` prefix, then the tenant row. Every step is idempotent, so a
 *   retried job resumes where it stopped; `platform_audit_log` records start and completion and
 *   is the one thing that survives.
 *
 * Both job bodies run inside `withTenantJob` (BaseWorker), so they act only on the payload's
 * tenant: every transaction sets `app.tenant_id` and RLS fences the deletes.
 */
@Injectable()
export class TenantDataService {
  private readonly logger = new Logger(TenantDataService.name);
  private readonly urlTtlSeconds: number;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUES.tenant) private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.urlTtlSeconds = (config.get<number>("TENANT_EXPORT_URL_TTL_MINUTES") ?? 60) * 60;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  /** Queue a PDPA export of `tenantId`; 404 for an unknown tenant, 409 once it is purging. */
  async requestExport(tenantId: string, by: ExportRequester): Promise<{ job_id: string }> {
    const status = await this.statusOf(tenantId);
    if (status === null) throw new NotFoundError("Tenant not found");
    if (status === "PURGING") throw new StateConflictError("Tenant is being purged");

    const job = await this.queue.add(TENANT_EXPORT_JOB, { tenantId } satisfies TenantJobData);
    const jobId = String(job.id ?? "");
    await this.audit.append({
      action: "CREATE",
      entityType: "tenant_export",
      tenantId,
      platformAdminId: "platformAdminId" in by ? by.platformAdminId : null,
      after: { job_id: jobId, ...("userId" in by ? { requested_by_user_id: by.userId } : {}) },
    });
    return { job_id: jobId };
  }

  /**
   * `{ status, file_url? }` of `tenantId`'s export job; a presigned URL only once DONE. A job of
   * another tenant (or not an export) is indistinguishable from a missing one — 404.
   */
  async exportStatus(tenantId: string, jobId: string): Promise<TenantExportStatusResult> {
    const job = await this.queue.getJob(jobId);
    const owner = (job?.data as Partial<TenantJobData> | undefined)?.tenantId;
    if (!job || job.name !== TENANT_EXPORT_JOB || owner !== tenantId) {
      throw new NotFoundError(`Export job not found: ${jobId}`);
    }
    const status = toExportStatus(await job.getState());
    const key = (job.returnvalue as { key?: string } | undefined)?.key;
    if (status === "DONE" && key) {
      // The platform path has no tenant in scope; presign inside the owning tenant's prefix.
      const fileUrl = await runWithTenant(tenantId, "system", () =>
        this.storage.getSignedUrl(key, this.urlTtlSeconds),
      );
      return { status, file_url: fileUrl };
    }
    return { status };
  }

  /** The `tenant.export` job body: archive every table + stored object; returns the object key. */
  async runExport(): Promise<{ key: string }> {
    const tenantId = scopedTenant();
    const files: Zippable = {};
    const counts: Record<string, number> = {};

    // One transaction, so every table is read under the same tenant GUC.
    await this.uow.withTransaction(async (tx) => {
      for (const t of tenantTablesInFkOrder()) {
        const rows = (await tx
          .select()
          .from(t.table)
          .where(eq(t.tenantId, tenantId))) as Record<string, unknown>[];
        counts[t.name] = rows.length;
        files[`tables/${t.name}.jsonl`] = strToU8(rows.map((r) => `${toJsonLine(r)}\n`).join(""));
      }
    });

    const objects = (await this.storage.listTenantObjects()).filter(
      (key) => !key.startsWith(EXPORTS_DIR),
    );
    for (const key of objects) {
      files[`objects/${key}`] = new Uint8Array(await this.storage.get(key));
    }

    const exportedAt = new Date();
    files["manifest.json"] = strToU8(
      JSON.stringify(
        { tenant_id: tenantId, exported_at: exportedAt.toISOString(), tables: counts, objects },
        null,
        2,
      ),
    );
    const key = `${EXPORTS_DIR}${exportedAt.toISOString().replace(/[:.]/g, "-")}.zip`;
    await this.storage.put(key, Buffer.from(zipSync(files, { level: 6 })), "application/zip");
    return { key };
  }

  // ── Purge ───────────────────────────────────────────────────────────────────

  /**
   * Gate and queue an irreversible purge (spec "Purge is gated, queued, ordered, and terminal"):
   * the tenant must be SUSPENDED (409 otherwise, no status change) and `confirm` must equal its
   * slug (422). Flips it to PURGING and enqueues `tenant.purge` in the same transaction, so a
   * failed enqueue leaves the tenant SUSPENDED. Re-calling on a PURGING tenant re-queues a
   * finished or failed job — the purge is resumable.
   */
  async requestPurge(
    tenantId: string,
    confirm: string,
    platformAdminId: string,
  ): Promise<{ job_id: string }> {
    return this.uow.withTransaction(async (tx) => {
      const [current] = await tx
        .select({ status: tenant.status, slug: tenant.slug })
        .from(tenant)
        .where(eq(tenant.id, tenantId))
        .for("update")
        .limit(1);
      if (!current) throw new NotFoundError("Tenant not found");
      if (current.status !== "SUSPENDED" && current.status !== "PURGING") {
        throw new StateConflictError("Only a SUSPENDED tenant can be purged", [
          { field: "status", issue: `tenant is ${current.status}` },
        ]);
      }
      if (confirm.trim().toLowerCase() !== current.slug.toLowerCase()) {
        throw new BusinessRuleError("Confirmation does not match the tenant slug", [
          { field: "confirm", issue: "must equal the tenant slug" },
        ]);
      }

      if (current.status === "SUSPENDED") {
        await tx
          .update(tenant)
          .set({ status: "PURGING", updatedAt: new Date(), version: sql`${tenant.version} + 1` })
          .where(eq(tenant.id, tenantId));
        await this.audit.append({
          action: "UPDATE",
          entityType: "tenant",
          entityId: tenantId,
          tenantId,
          platformAdminId,
          before: { status: "SUSPENDED" },
          after: { status: "PURGING" },
          reason: "purge requested",
        });
      }
      return { job_id: await this.enqueuePurge(tenantId) };
    });
  }

  /** The `tenant.purge` job body. A no-op once the tenant row is gone (an idempotent retry). */
  async runPurge(): Promise<{ purged: boolean }> {
    const tenantId = scopedTenant();
    const status = await this.statusOf(tenantId);
    if (status === null) return { purged: true };
    if (status !== "PURGING") {
      // Never purge a tenant that is not PURGING — e.g. an enqueue whose transaction rolled back.
      this.logger.warn(`refusing to purge tenant ${tenantId} in status ${status}`);
      return { purged: false };
    }
    await this.audit.append({
      action: "DELETE",
      entityType: "tenant",
      entityId: tenantId,
      tenantId,
      after: { phase: "PURGE_STARTED" },
    });

    const counts: Record<string, number> = {};
    for (const t of [...tenantTablesInFkOrder()].reverse()) {
      counts[t.name] = await this.uow.withTransaction(async (tx) => {
        // Opt in to migration 0017's append-only escape hatch (audit_log, stock_movement,
        // production_scan) — honoured only for this tenant, and only while it is PURGING.
        await tx.execute(sql`select set_config('app.purge_tenant_id', ${tenantId}, true)`);
        const result = await tx.delete(t.table).where(eq(t.tenantId, tenantId));
        // postgres-js reports the affected row count as `count`.
        return (result as unknown as { count?: number }).count ?? 0;
      });
    }
    const objects = await this.storage.deleteTenantObjects();

    await this.uow.withTransaction(async (tx) => {
      await tx.delete(tenant).where(and(eq(tenant.id, tenantId), eq(tenant.status, "PURGING")));
      await this.audit.append({
        action: "DELETE",
        entityType: "tenant",
        entityId: tenantId,
        tenantId,
        after: { phase: "PURGE_COMPLETED", rows: counts, objects },
      });
    });
    return { purged: true };
  }

  /** Enqueue (or re-queue a finished/failed) `tenant.purge` under a stable per-tenant job id. */
  private async enqueuePurge(tenantId: string): Promise<string> {
    const jobId = `${TENANT_PURGE_JOB}.${tenantId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== "completed" && state !== "failed") return jobId;
      await existing.remove();
    }
    await this.queue.add(TENANT_PURGE_JOB, { tenantId } satisfies TenantJobData, { jobId });
    return jobId;
  }

  private async statusOf(tenantId: string) {
    const [row] = await this.db
      .select({ status: tenant.status })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    return row?.status ?? null;
  }
}
