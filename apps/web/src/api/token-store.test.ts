import { afterEach, describe, expect, it } from "vitest";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./token-store";

describe("token-store", () => {
  afterEach(() => {
    clearTokens();
    localStorage.clear();
  });

  it("starts with no tokens", () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("holds the pair set via setTokens", () => {
    setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    expect(getAccessToken()).toBe("access-1");
    expect(getRefreshToken()).toBe("refresh-1");
  });

  it("clears both tokens via clearTokens", () => {
    setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("persists the refresh token to localStorage so it survives a reload", () => {
    setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe("refresh-1");
  });

  it("keeps the access token out of localStorage", () => {
    setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).not.toContain("access-1");
    // Only the one refresh-token key is written.
    expect(Object.keys(localStorage)).toEqual([REFRESH_TOKEN_STORAGE_KEY]);
  });

  it("reads a persisted refresh token when memory is empty (simulating a fresh page load)", () => {
    // A prior session left this behind; module memory is empty on a fresh boot.
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "persisted-refresh");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBe("persisted-refresh");
  });

  it("removes the persisted refresh token on clearTokens", () => {
    setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    clearTokens();
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
