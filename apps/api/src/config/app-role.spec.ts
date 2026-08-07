import { afterEach, describe, expect, it } from "vitest";
import { appRole, httpEnabled, workersEnabled } from "./app-role.js";
import { envSchema } from "./env.schema.js";

const original = process.env.APP_ROLE;

afterEach(() => {
  if (original === undefined) delete process.env.APP_ROLE;
  else process.env.APP_ROLE = original;
});

describe("app-role", () => {
  it("defaults to `all` when APP_ROLE is unset — the historical single-process behaviour", () => {
    delete process.env.APP_ROLE;
    expect(appRole()).toBe("all");
    expect(workersEnabled()).toBe(true);
    expect(httpEnabled()).toBe(true);
  });

  it("treats an empty/whitespace value as unset", () => {
    process.env.APP_ROLE = "   ";
    expect(appRole()).toBe("all");
    expect(workersEnabled()).toBe(true);
  });

  it("disables workers — but not HTTP — in the `api` role", () => {
    process.env.APP_ROLE = "api";
    expect(workersEnabled()).toBe(false);
    expect(httpEnabled()).toBe(true);
  });

  it("keeps workers in the `worker` role (HTTP stays up only to serve health probes)", () => {
    process.env.APP_ROLE = "worker";
    expect(workersEnabled()).toBe(true);
    expect(httpEnabled()).toBe(false);
  });

  // The helper reads process.env before DI exists, so it cannot validate. This is the guard
  // that turns a typo into a boot failure instead of a silent fallback to `all`.
  it("is rejected by the env schema when misspelled", () => {
    const result = envSchema.safeParse({ ...validEnv, APP_ROLE: "worke" });
    expect(result.success).toBe(false);
  });

  it("accepts every role the helper can return", () => {
    for (const role of ["api", "worker", "all"]) {
      expect(envSchema.safeParse({ ...validEnv, APP_ROLE: role }).success).toBe(true);
    }
  });
});

/** Minimum env the schema requires, so the APP_ROLE assertions are the only thing under test. */
const validEnv = {
  DATABASE_URL: "postgres://erp:erp@localhost:5432/erp",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a",
  JWT_REFRESH_SECRET: "b",
  ENCRYPTION_KEY: "0".repeat(64),
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY: "k",
  S3_SECRET_KEY: "s",
  S3_BUCKET: "erp",
};
