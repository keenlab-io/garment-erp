import { afterEach, describe, expect, it } from "vitest";
import { isDemoMode, parseOidcFragment, setDemoMode } from "./demo-mode";

describe("demo mode", () => {
  afterEach(() => setDemoMode(false));

  it("round-trips the flag", () => {
    expect(isDemoMode()).toBe(false);
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
    setDemoMode(false);
    expect(isDemoMode()).toBe(false);
  });

  it("parses the callback fragment", () => {
    expect(parseOidcFragment("#access_token=a&refresh_token=r&expires_in=900&return_to=%2Fsales&demo=1")).toEqual({
      accessToken: "a",
      refreshToken: "r",
      returnTo: "/sales",
      demo: true,
    });
  });

  it("rejects incomplete fragments and off-site return paths", () => {
    expect(parseOidcFragment("")).toBeNull();
    expect(parseOidcFragment("#access_token=a")).toBeNull();
    expect(parseOidcFragment("#access_token=a&refresh_token=r&return_to=%2F%2Fevil.com")?.returnTo).toBe("/");
    expect(parseOidcFragment("#access_token=a&refresh_token=r&return_to=https%3A%2F%2Fevil.com")?.returnTo).toBe("/");
  });
});
