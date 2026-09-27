import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTenantReadOnly,
  notifyTenantReadOnly,
  onTenantReadOnlyRejection,
  resetTenantReadOnly,
  subscribeTenantReadOnly,
} from "./tenant-status";

describe("tenant-status", () => {
  afterEach(() => {
    resetTenantReadOnly();
  });

  it("starts writable", () => {
    expect(isTenantReadOnly()).toBe(false);
  });

  it("sets the sticky flag and notifies state listeners only on the first rejection", () => {
    const onState = vi.fn();
    const unsubscribe = subscribeTenantReadOnly(onState);

    notifyTenantReadOnly();
    notifyTenantReadOnly();

    expect(isTenantReadOnly()).toBe(true);
    expect(onState).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("notifies rejection listeners on every refused mutation", () => {
    const onRejection = vi.fn();
    const unsubscribe = onTenantReadOnlyRejection(onRejection);

    notifyTenantReadOnly();
    notifyTenantReadOnly();

    expect(onRejection).toHaveBeenCalledTimes(2);
    unsubscribe();
    notifyTenantReadOnly();
    expect(onRejection).toHaveBeenCalledTimes(2);
  });

  it("reset clears the flag and notifies state listeners", () => {
    notifyTenantReadOnly();
    const onState = vi.fn();
    const unsubscribe = subscribeTenantReadOnly(onState);

    resetTenantReadOnly();

    expect(isTenantReadOnly()).toBe(false);
    expect(onState).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
