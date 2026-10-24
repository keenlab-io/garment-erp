import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@erp/db";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import type { DemoPurgeService } from "./demo-purge.service.js";
import type { DemoStore } from "./demo-store.service.js";
import { DemoSweepService, idlePurgeReason, type SandboxActivity } from "./demo-sweep.service.js";

// M10 task 4.5 (`demo-sandbox-purge` "Idle and session-expiry backstop sweep").

const NOW = new Date("2026-10-24T12:00:00Z");
const IDLE_MS = 60 * 60_000;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const IDLE_ID = uuid(1);
const STUCK_ID = uuid(2);
const RUNNING_ID = uuid(3);
const BAD_ID = uuid(4);
const GOOD_ID = uuid(5);
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const activity = (over: Partial<SandboxActivity> = {}): SandboxActivity => ({
  createdAt: ago(180),
  lastSessionAt: ago(180),
  liveSessions: 1,
  lastActivityAt: null,
  ...over,
});

describe("idlePurgeReason", () => {
  it("purges a closed tab once the idle window passes with no activity", () => {
    expect(idlePurgeReason(activity(), NOW, IDLE_MS)).toBe("IDLE");
  });

  it("leaves a guest with recent request activity alone", () => {
    expect(idlePurgeReason(activity({ lastActivityAt: ago(5) }), NOW, IDLE_MS)).toBeNull();
  });

  it("leaves a freshly provisioned sandbox alone", () => {
    expect(
      idlePurgeReason(activity({ createdAt: ago(2), lastSessionAt: ago(2) }), NOW, IDLE_MS),
    ).toBeNull();
  });

  it("purges when every session is revoked or expired, however recent", () => {
    expect(
      idlePurgeReason(activity({ liveSessions: 0, lastActivityAt: ago(1) }), NOW, IDLE_MS),
    ).toBe("SESSIONS_ENDED");
  });
});

describe("DemoSweepService.sweep", () => {
  function setup(rows: { id: string; status: string; createdAt: Date }[], live: Record<string, boolean>) {
    const db = { select: () => ({ from: () => ({ where: async () => rows }) }) } as unknown as Db;
    const sessionRow = { lastSessionAt: ago(180), live: 1 };
    const uow = {
      withTransaction: (fn: (tx: unknown) => unknown) =>
        fn({ select: () => ({ from: () => ({ where: async () => [sessionRow] }) }) }),
    } as unknown as UnitOfWork;
    const purge = {
      hasLiveJob: vi.fn(async (id: string) => live[id] ?? false),
      enqueue: vi.fn(async () => undefined),
      beginPurge: vi.fn(async () => true),
    };
    const store = { lastActivity: async () => null } as unknown as DemoStore;
    const config = { get: () => 60 } as unknown as ConfigService;
    const service = new DemoSweepService(db, uow, purge as unknown as DemoPurgeService, store, config);
    return { service, purge };
  }

  it("marks idle sandboxes PURGING and re-enqueues stuck purges only", async () => {
    const { service, purge } = setup(
      [
        { id: IDLE_ID, status: "ACTIVE", createdAt: ago(300) },
        { id: STUCK_ID, status: "PURGING", createdAt: ago(300) },
        { id: RUNNING_ID, status: "PURGING", createdAt: ago(300) },
      ],
      { [RUNNING_ID]: true },
    );
    await expect(service.sweep(NOW)).resolves.toEqual({
      checked: 3,
      purging: 1,
      requeued: 1,
      failed: 0,
    });
    expect(purge.beginPurge).toHaveBeenCalledWith(IDLE_ID, "IDLE");
    expect(purge.enqueue).toHaveBeenCalledTimes(1);
    expect(purge.enqueue).toHaveBeenCalledWith(STUCK_ID, "RETRY");
  });

  it("counts a failing sandbox and carries on", async () => {
    const { service, purge } = setup(
      [
        { id: BAD_ID, status: "ACTIVE", createdAt: ago(300) },
        { id: GOOD_ID, status: "ACTIVE", createdAt: ago(300) },
      ],
      {},
    );
    purge.beginPurge.mockRejectedValueOnce(new Error("boom"));
    const result = await service.sweep(NOW);
    expect(result).toMatchObject({ checked: 2, purging: 1, failed: 1 });
  });
});
