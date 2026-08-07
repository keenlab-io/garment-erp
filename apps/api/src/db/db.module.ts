import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDb } from "@erp/db";
import { DB, DB_CONNECTION } from "./db.tokens.js";
import { UnitOfWork } from "./unit-of-work.service.js";

/**
 * Global persistence module. Owns the single postgres connection pool: the
 * `DB_CONNECTION` provider builds it from validated config, `DB` exposes the
 * drizzle instance that services inject, and the pool is closed on shutdown so
 * `enableShutdownHooks()` drains cleanly.
 *
 * The pool closes in `onApplicationShutdown` (Nest's LAST shutdown phase), not
 * `onModuleDestroy` (its first). `WorkerDrainService` drains the BullMQ workers in
 * that first phase, and a job still running needs its database connection — closing
 * the pool alongside the drain killed in-flight payroll runs on every SIGTERM. See
 * `queue/worker-drain.service.ts` for the full ordering.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_CONNECTION,
      useFactory: (config: ConfigService) =>
        createDb(config.getOrThrow<string>("DATABASE_URL"), {
          max: config.get<number>("DB_POOL_MAX"),
        }),
      inject: [ConfigService],
    },
    {
      provide: DB,
      useFactory: (conn: ReturnType<typeof createDb>) => conn.db,
      inject: [DB_CONNECTION],
    },
    UnitOfWork,
  ],
  exports: [DB, UnitOfWork],
})
export class DbModule implements OnApplicationShutdown {
  constructor(
    @Inject(DB_CONNECTION) private readonly conn: ReturnType<typeof createDb>,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.conn.queryClient.end();
  }
}
