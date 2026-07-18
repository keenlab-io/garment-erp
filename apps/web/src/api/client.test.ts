import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { clearTokens, setTokens } from "./token-store";
import { onUnauthorized } from "./auth-events";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: (input: string, init: RequestInit | undefined) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(handler(url, init));
    }),
  );
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
    onUnauthorized(null);
  });

  it("attaches no Authorization header when signed out", async () => {
    let seenAuth: string | null = null;
    stubFetch((_url, init) => {
      seenAuth = new Headers(init?.headers).get("authorization");
      return jsonResponse({ status: "ok", uptime: 1 });
    });

    await api.health.check.query();

    expect(seenAuth).toBe("");
  });

  it("attaches a Bearer token from the token store once signed in", async () => {
    setTokens({ accessToken: "abc123", refreshToken: "refresh" });
    let seenAuth: string | null = null;
    stubFetch((_url, init) => {
      seenAuth = new Headers(init?.headers).get("authorization");
      return jsonResponse({ status: "ok", uptime: 1 });
    });

    await api.health.check.query();

    expect(seenAuth).toBe("Bearer abc123");
  });

  it("notifies unauthorized on a 401 UNAUTHENTICATED response", async () => {
    stubFetch(() => jsonResponse({ code: "UNAUTHENTICATED", message: "no token", details: [] }, 401));
    const handler = vi.fn();
    onUnauthorized(handler);

    await api.iam.listRoles.query().catch(() => {});

    expect(handler).toHaveBeenCalledWith("UNAUTHENTICATED");
  });

  it("notifies unauthorized on a 401 REAUTH_REQUIRED response", async () => {
    stubFetch(() =>
      jsonResponse({ code: "REAUTH_REQUIRED", message: "permissions changed", details: [] }, 401),
    );
    const handler = vi.fn();
    onUnauthorized(handler);

    await api.iam.listRoles.query().catch(() => {});

    expect(handler).toHaveBeenCalledWith("REAUTH_REQUIRED");
  });

  it("does not notify unauthorized for a failed login attempt", async () => {
    stubFetch(() =>
      jsonResponse({ code: "UNAUTHENTICATED", message: "bad credentials", details: [] }, 401),
    );
    const handler = vi.fn();
    onUnauthorized(handler);

    await api.iam.login.mutation({ body: { username: "u", password: "wrong" } }).catch(() => {});

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not notify unauthorized on an unrelated 403", async () => {
    stubFetch(() => jsonResponse({ code: "FORBIDDEN", message: "nope", details: [] }, 403));
    const handler = vi.fn();
    onUnauthorized(handler);

    await api.iam.listRoles.query().catch(() => {});

    expect(handler).not.toHaveBeenCalled();
  });
});
