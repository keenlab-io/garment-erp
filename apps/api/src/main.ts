import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { API_PREFIX } from "@erp/contracts";
import { AppModule } from "./app.module.js";
import { appRole } from "./config/app-role.js";
import { RedisIoAdapter } from "./realtime/redis-io.adapter.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Keep bracketed query keys LITERAL. The contracts declare filter params as the exact strings
  // `filter[status]`, `filter[employee_id]`, … and validate against those keys. Express's default
  // "extended" parser (qs) turns `?filter[status]=X` into `{ filter: { status: "X" } }`, so the
  // literal key was never present and every such filter was silently dropped — the request
  // succeeded while quietly returning unfiltered data. That is how a RECONCILED OT request kept
  // blocking payroll. "simple" (Node's querystring) leaves the key alone.
  app.set("query parser", "simple");

  app.enableCors();
  // Drain the DB pool, Redis connection, and puppeteer browser on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // Socket.IO over Redis pub/sub, in EVERY role. `erp-api` needs it to broadcast across
  // replicas; `erp-worker` needs it because its monitor sweep emits step-delay events from a
  // pod with no connected browsers. Must be attached before `listen()` creates the server.
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connect(config.getOrThrow<string>("REDIS_URL"));
  app.useWebSocketAdapter(ioAdapter);

  const port = config.get<number>("PORT") ?? 3000;
  // The worker role listens too — it serves nothing but `/api/v1/health`, which is what the
  // kubelet probes. No Service selects those pods, so they take no user traffic.
  await app.listen(port);
  console.log(
    `[api] role=${appRole()} listening on http://localhost:${port}${API_PREFIX}`,
  );
}

void bootstrap();
