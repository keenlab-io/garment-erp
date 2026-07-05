import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { validateEnv } from "./env.schema.js";

/**
 * Global configuration. `NestConfigModule.forRoot({ isGlobal: true })` exposes
 * `ConfigService` everywhere, and the `validate` hook runs `envSchema` at boot so
 * the process refuses to start on invalid env.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
