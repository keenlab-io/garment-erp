import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDb } from "@erp/db";
import { DB, DB_CONNECTION } from "./db.tokens.js";
import { UnitOfWork } from "./unit-of-work.service.js";

/**
 * Global persistence module. Owns the single postgres connection pool: the
 * `DB_CONNECTION` provider builds it from validated config, `DB` exposes the
 * drizzle instance that services inject, and `onModuleDestroy` closes the pool on
 * shutdown so `enableShutdownHooks()` drains cleanly.
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
export class DbModule implements OnModuleDestroy {
  constructor(
    @Inject(DB_CONNECTION) private readonly conn: ReturnType<typeof createDb>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.conn.queryClient.end();
  }
}
