import { afterEach, describe, expect, it, vi } from "vitest";
import { onUnauthorized, notifyUnauthorized } from "./auth-events";

describe("auth-events", () => {
  afterEach(() => {
    onUnauthorized(null);
  });

  it("invokes the registered handler with the reason", () => {
    const handler = vi.fn();
    onUnauthorized(handler);

    notifyUnauthorized("REAUTH_REQUIRED");

    expect(handler).toHaveBeenCalledWith("REAUTH_REQUIRED");
  });

  it("is a no-op when no handler is registered", () => {
    expect(() => notifyUnauthorized("UNAUTHENTICATED")).not.toThrow();
  });

  it("stops calling a handler once unregistered", () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    onUnauthorized(null);

    notifyUnauthorized("UNAUTHENTICATED");

    expect(handler).not.toHaveBeenCalled();
  });
});
