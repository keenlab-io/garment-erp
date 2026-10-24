import { describe, expect, it } from "vitest";
import { readCookie } from "./oidc.controller.js";

describe("readCookie", () => {
  it("finds a named cookie among several and URL-decodes it", () => {
    expect(readCookie("a=1; erp_oidc_flow=x%2Ey; b=2", "erp_oidc_flow")).toBe("x.y");
  });

  it("returns undefined when absent or the header is missing", () => {
    expect(readCookie("a=1", "erp_oidc_flow")).toBeUndefined();
    expect(readCookie(undefined, "erp_oidc_flow")).toBeUndefined();
  });
});
