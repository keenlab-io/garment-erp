import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "./resolve-theme";

describe("resolveInitialTheme", () => {
  it("prefers an explicit stored choice over the system preference", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("follows the system preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
});
