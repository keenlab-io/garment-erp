import { describe, it, expect, beforeEach } from "vitest";
import {
  PLATFORM_REFRESH_TOKEN_STORAGE_KEY,
  clearPlatformTokens,
  getPlatformAccessToken,
  getPlatformRefreshToken,
  setPlatformTokens,
} from "./platform-token-store";

describe("platform token store", () => {
  beforeEach(() => clearPlatformTokens());

  it("keeps the access token in memory and the refresh token in sessionStorage only", () => {
    setPlatformTokens({ accessToken: "a", refreshToken: "r" });
    expect(getPlatformAccessToken()).toBe("a");
    expect(sessionStorage.getItem(PLATFORM_REFRESH_TOKEN_STORAGE_KEY)).toBe("r");
    expect(localStorage.getItem("erp.refresh_token")).toBeNull();
  });

  it("clears both", () => {
    setPlatformTokens({ accessToken: "a", refreshToken: "r" });
    clearPlatformTokens();
    expect(getPlatformAccessToken()).toBeNull();
    expect(getPlatformRefreshToken()).toBeNull();
  });
});
