import type { Queue } from "bullmq";
import { describe, expect, it } from "vitest";
import { DemoStore, hashEmail } from "./demo-store.service.js";

// M10 task 4.2 — Redis INCR+TTL rate counters (email only ever as a hash) and activity stamps.

function setup() {
  const data = new Map<string, number | string>();
  const ttls = new Map<string, number>();
  const redis = {
    incr: async (k: string) => {
      const n = Number(data.get(k) ?? 0) + 1;
      data.set(k, n);
      return n;
    },
    decr: async (k: string) => {
      const n = Number(data.get(k) ?? 0) - 1;
      data.set(k, n);
      return n;
    },
    expire: async (k: string, s: number) => {
      ttls.set(k, s);
      return 1;
    },
    set: async (k: string, v: string, _mode: string, s: number) => {
      data.set(k, v);
      ttls.set(k, s);
      return "OK";
    },
    get: async (k: string) => (data.has(k) ? String(data.get(k)) : null),
    del: async (k: string) => (data.delete(k) ? 1 : 0),
  };
  const queue = { client: Promise.resolve(redis) } as unknown as Queue;
  return { store: new DemoStore(queue), data, ttls };
}

describe("DemoStore", () => {
  it("counts per IP (hourly) and per hashed email (daily), arming the TTL once", async () => {
    const { store, data, ttls } = setup();
    await store.takeSignupSlot("1.2.3.4", "Guest@Gmail.com");
    const slot = await store.takeSignupSlot("1.2.3.4", "guest@gmail.com");
    expect(slot).toMatchObject({ ipCount: 2, emailCount: 2 });
    expect(ttls.get("demo:rl:ip:1.2.3.4")).toBe(3_600);
    expect(ttls.get(`demo:rl:email:${hashEmail("guest@gmail.com")}`)).toBe(86_400);
    expect([...data.keys()].join(" ")).not.toContain("gmail");

    await store.releaseSignupSlot(slot);
    expect(data.get("demo:rl:ip:1.2.3.4")).toBe(1);
  });

  it("skips the IP counter when the client IP is unknown", async () => {
    const { store } = setup();
    await expect(store.takeSignupSlot(null, "a@b.c")).resolves.toMatchObject({ ipKey: null, ipCount: 0 });
  });

  it("round-trips the last-activity stamp", async () => {
    const { store } = setup();
    const tid = "00000000-0000-4000-8000-000000000001";
    await expect(store.lastActivity(tid)).resolves.toBeNull();
    const at = new Date("2026-10-24T10:00:00Z");
    await store.touchActivity(tid, at);
    await expect(store.lastActivity(tid)).resolves.toEqual(at);
    await store.clearActivity(tid);
    await expect(store.lastActivity(tid)).resolves.toBeNull();
  });
});
