import { afterEach, describe, expect, it } from "vitest";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./token-store";

describe("token-store", () => {
  afterEach(() => {
    clearTokens();
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
});
