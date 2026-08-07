import { Logger } from "@nestjs/common";
import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { ServerOptions, Server } from "socket.io";

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * Without it a `server.to(room).emit(...)` only reaches clients connected to *that* process,
 * which breaks the moment `erp-api` runs more than one replica — and breaks unconditionally
 * for `erp-worker`, because `ProductionMonitorWorker` injects `RealtimeGateway` and pushes
 * step-delay / subcontract-overdue events from a pod that has zero connected browsers. With
 * the adapter attached in every role, the worker's emit is published to Redis and fanned out
 * by whichever api pods hold the subscribers.
 *
 * `connect()` must be awaited before `app.listen()`; `close()` is driven from the app's
 * shutdown hooks (see `main.ts`).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /** Opens the pub/sub pair. The sub client must be a duplicate — it enters subscriber mode. */
  async connect(redisUrl: string): Promise<void> {
    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.ping(), subClient.ping()]);

    this.pubClient = pubClient;
    this.subClient = subClient;
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log("socket.io redis adapter connected");
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  /**
   * Nest's `SocketModule` calls this when the app closes, so the pub/sub pair is torn down by
   * the normal shutdown path rather than a `beforeExit` listener (which does not fire reliably
   * while handles are still open). Idempotent — `quit()` on a closed ioredis client is a no-op.
   */
  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
    this.pubClient = undefined;
    this.subClient = undefined;
  }
}
