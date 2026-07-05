import {
  type ArgumentsHost,
  HttpException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ReauthRequiredError,
  StateConflictError,
  UnauthenticatedError,
  ValidationError,
} from "./app-exception.js";

interface Captured {
  status?: number;
  body?: { code: string; message: string; details: unknown[] };
}

/** Minimal ArgumentsHost whose response records the status + JSON body. */
function mockHost(): { host: ArgumentsHost; captured: Captured } {
  const captured: Captured = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured["body"]) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

function run(exception: unknown): Captured {
  const { host, captured } = mockHost();
  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe("AllExceptionsFilter", () => {
  it.each([
    [new ValidationError("bad"), 400, "VALIDATION_ERROR"],
    [new UnauthenticatedError("nope"), 401, "UNAUTHENTICATED"],
    [new ForbiddenError("no"), 403, "FORBIDDEN"],
    [new NotFoundError("gone"), 404, "NOT_FOUND"],
    [new StateConflictError("stale"), 409, "STATE_CONFLICT"],
    [new BusinessRuleError("rule"), 422, "BUSINESS_RULE"],
    [new ReauthRequiredError("reauth"), 401, "REAUTH_REQUIRED"],
  ])("maps %o to the right status + code", (exc, status, code) => {
    const { status: gotStatus, body } = run(exc);
    expect(gotStatus).toBe(status);
    expect(body?.code).toBe(code);
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("details");
  });

  it("passes AppException details through", () => {
    const exc = new ValidationError("bad", [{ field: "name", issue: "required" }]);
    expect(run(exc).body?.details).toEqual([{ field: "name", issue: "required" }]);
  });

  it("serializes a ZodError to 400 with details from issue paths", () => {
    const parsed = z.object({ name: z.string() }).safeParse({ name: 1 });
    expect(parsed.success).toBe(false);
    const { status, body } = run((parsed as { error: ZodError }).error);
    expect(status).toBe(400);
    expect(body?.code).toBe("VALIDATION_ERROR");
    expect(body?.message).toBe("Validation failed");
    expect(body?.details).toEqual([{ field: "name", issue: expect.any(String) }]);
  });

  it("maps a Postgres unique violation (23505) to 409 STATE_CONFLICT", () => {
    const { status, body } = run({ code: "23505" });
    expect(status).toBe(409);
    expect(body?.code).toBe("STATE_CONFLICT");
    expect(body?.message).toBe("Resource already exists");
  });

  it("maps a framework HttpException by its status", () => {
    const { status, body } = run(new NotFoundException("missing"));
    expect(status).toBe(404);
    expect(body?.code).toBe("NOT_FOUND");
  });

  it("falls back to INTERNAL for an unmapped HttpException status", () => {
    const { status, body } = run(new HttpException("teapot", 418));
    expect(status).toBe(418);
    expect(body?.code).toBe("INTERNAL");
  });

  it("scrubs an unknown error to a generic 500 INTERNAL", () => {
    const logSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const { status, body } = run(new Error("internal secret detail"));
    expect(logSpy).toHaveBeenCalledOnce();
    logSpy.mockRestore();
    expect(status).toBe(500);
    expect(body?.code).toBe("INTERNAL");
    expect(body?.message).toBe("Internal server error");
    expect(body?.details).toEqual([]);
  });
});
