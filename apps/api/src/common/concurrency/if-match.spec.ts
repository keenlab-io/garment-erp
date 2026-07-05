import { describe, expect, it } from "vitest";
import { StateConflictError } from "../errors/app-exception.js";
import { assertVersion, parseIfMatch } from "./if-match.js";

describe("parseIfMatch", () => {
  it("returns null when the header is absent", () => {
    expect(parseIfMatch(undefined)).toBeNull();
  });

  it("parses a bare integer version", () => {
    expect(parseIfMatch("3")).toBe(3);
  });

  it("tolerates the quoted ETag form", () => {
    expect(parseIfMatch('"7"')).toBe(7);
  });

  it("throws StateConflictError on a non-integer value", () => {
    expect(() => parseIfMatch("abc")).toThrow(StateConflictError);
    expect(() => parseIfMatch("1.5")).toThrow(StateConflictError);
  });
});

describe("assertVersion", () => {
  it("passes when the versions match", () => {
    expect(() => assertVersion(4, 4)).not.toThrow();
  });

  it("throws StateConflictError on a stale version", () => {
    expect(() => assertVersion(5, 4)).toThrow(StateConflictError);
  });
});
