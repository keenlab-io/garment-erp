import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from "./queue.constants.js";

/**
 * Global BullMQ queue module. The connection is parsed from `REDIS_URL` into plain
 * ioredis options with `maxRetriesPerRequest: null` — BullMQ requires this or
 * workers fail obscurely (M0 design Risks). Registers the platform queues;
 * `BullModule` is re-exported so feature modules can inject queues and register
 * workers.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>("REDIS_URL"));
        return {
          connection: {
            host: url.hostname,
            port: url.port ? Number(url.port) : 6379,
            username: url.username || undefined,
            password: url.password || undefined,
            db:
              url.pathname && url.pathname !== "/"
                ? Number(url.pathname.slice(1))
                : undefined,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        };
      },
    }),
    ...QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  exports: [BullModule],
})
export class QueueModule {}
