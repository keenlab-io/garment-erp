import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreSession } from "./restore-session";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  clearTokens,
  getAccessToken,
  getRefreshToken,
} from "../api/token-store";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(byPath: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const match = Object.entries(byPath).find(([path]) => url.includes(path));
      return Promise.resolve(match ? match[1]() : jsonResponse({}, 404));
    }),
  );
}

const ME_BODY = {
  user: {
    id: "u1",
    username: "alice",
    email: "alice@example.com",
    status: "ACTIVE",
    is_super_admin: false,
    employee_id: null,
  },
  roles: [],
  permissions: ["iam.user.manage"],
};

/** Simulate a fresh page load with a session left behind by a prior login: refresh token in
 *  localStorage, nothing in module memory. */
function seedPersistedRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
}

describe("restoreSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
    localStorage.clear();
  });

  it("returns null and stays signed out when no refresh token is persisted", async () => {
    const user = await restoreSession();
    expect(user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("silently refreshes and returns the identity when a refresh token is persisted", async () => {
    seedPersistedRefreshToken("persisted-refresh");
    stubFetch({
      "/auth/refresh": () =>
        jsonResponse({ access_token: "fresh-access", refresh_token: "rotated-refresh", expires_in: 900 }),
      "/auth/me": () => jsonResponse(ME_BODY),
    });

    const user = await restoreSession();

    expect(user).toEqual({
      id: "u1",
      name: "alice",
      email: "alice@example.com",
      isSuperAdmin: false,
      permissions: ["iam.user.manage"],
    });
    // The fresh access token is now in memory and the rotated refresh token is persisted.
    expect(getAccessToken()).toBe("fresh-access");
    expect(getRefreshToken()).toBe("rotated-refresh");
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe("rotated-refresh");
  });

  it("clears the stale token and returns null when the refresh token is rejected", async () => {
    seedPersistedRefreshToken("expired-refresh");
    stubFetch({
      "/auth/refresh": () =>
        jsonResponse({ code: "UNAUTHENTICATED", message: "expired", details: [] }, 401),
    });

    const user = await restoreSession();

    expect(user).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("clears tokens and returns null when /auth/me fails after a successful refresh", async () => {
    seedPersistedRefreshToken("persisted-refresh");
    stubFetch({
      "/auth/refresh": () =>
        jsonResponse({ access_token: "fresh-access", refresh_token: "rotated-refresh", expires_in: 900 }),
      "/auth/me": () =>
        jsonResponse({ code: "UNAUTHENTICATED", message: "nope", details: [] }, 401),
    });

    const user = await restoreSession();

    expect(user).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
