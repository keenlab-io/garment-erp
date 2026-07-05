import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { API_PREFIX } from "@erp/contracts";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // Drain the DB pool, Redis connection, and puppeteer browser on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT") ?? 3000;
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}${API_PREFIX}`);
}

void bootstrap();
