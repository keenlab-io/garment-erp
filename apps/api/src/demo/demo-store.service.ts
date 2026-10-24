import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { QUEUES } from "../queue/queue.constants.js";

const ONE_HOUR_S = 3_600;
const ONE_DAY_S = 86_400;

/** The slice of the ioredis client the demo store uses. */
export interface DemoRedis {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

/** The two sandbox-creation counters an attempt holds (released if provisioning fails). */
export interface DemoSignupSlot {
  ipKey: string | null;
  emailKey: string;
  ipCount: number;
  emailCount: number;
}

/**
 * The demo module's small Redis footprint (M10 §4), on the `demo` queue's own ioredis connection
 * (no second client to configure):
 *
 * - **Signup rate counters** — `INCR` + TTL per source IP (hourly) and per email (daily). The email
 *   is stored only as a SHA-256 hash, so Redis never holds guest PII (design D6).
 * - **Last-activity stamps** — `demo:activity:{tid}`, touched by `DemoActivityInterceptor` on a
 *   sandbox's authenticated requests and read by the idle sweep. Expires on its own after a day.
 */
@Injectable()
export class DemoStore {
  constructor(@InjectQueue(QUEUES.demo) private readonly queue: Queue) {}

  /** Count one sandbox-creation attempt against `ip` (may be unknown) and `email`. */
  async takeSignupSlot(ip: string | null, email: string): Promise<DemoSignupSlot> {
    const redis = await this.redis();
    const emailKey = `demo:rl:email:${hashEmail(email)}`;
    const ipKey = ip ? `demo:rl:ip:${ip}` : null;
    const emailCount = await incrWithTtl(redis, emailKey, ONE_DAY_S);
    const ipCount = ipKey ? await incrWithTtl(redis, ipKey, ONE_HOUR_S) : 0;
    return { ipKey, emailKey, ipCount, emailCount };
  }

  /** Give back an attempt that created nothing (refused, at the cap, or rolled back). */
  async releaseSignupSlot(slot: DemoSignupSlot): Promise<void> {
    const redis = await this.redis();
    await redis.decr(slot.emailKey);
    if (slot.ipKey) await redis.decr(slot.ipKey);
  }

  async touchActivity(tenantId: string, at: Date): Promise<void> {
    await (await this.redis()).set(activityKey(tenantId), String(at.getTime()), "EX", ONE_DAY_S);
  }

  async lastActivity(tenantId: string): Promise<Date | null> {
    const raw = await (await this.redis()).get(activityKey(tenantId));
    const ms = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  async clearActivity(tenantId: string): Promise<void> {
    await (await this.redis()).del(activityKey(tenantId));
  }

  private async redis(): Promise<DemoRedis> {
    return (await this.queue.client) as unknown as DemoRedis;
  }
}

const activityKey = (tenantId: string) => `demo:activity:${tenantId}`;

/** Lower-cased SHA-256 of the email: the counter key, never the address itself. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** `INCR`, arming the TTL on the first hit of the window. */
async function incrWithTtl(redis: DemoRedis, key: string, ttlSeconds: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  return count;
}
