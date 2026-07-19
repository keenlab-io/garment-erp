import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOfflineScanQueue } from "./offline-scan-queue";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

afterEach(() => {
  window.localStorage.clear();
  setOnline(true);
});

describe("useOfflineScanQueue", () => {
  it("enqueues a scan and syncs it immediately while online", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOfflineScanQueue({ storageKey: "test-1", submit }));

    act(() => result.current.enqueue("step-1", "START"));

    await waitFor(() => expect(result.current.queue).toHaveLength(0));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ stepId: "step-1", action: "START" }));
  });

  it("queues locally without syncing while offline", async () => {
    setOnline(false);
    const submit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOfflineScanQueue({ storageKey: "test-2", submit }));

    act(() => result.current.enqueue("step-1", "START"));

    expect(result.current.queue).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
    expect(result.current.isOnline).toBe(false);
  });

  it("syncs the queued scan once back online", async () => {
    setOnline(false);
    const submit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOfflineScanQueue({ storageKey: "test-3", submit }));
    act(() => result.current.enqueue("step-1", "START"));
    expect(result.current.queue).toHaveLength(1);

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(result.current.queue).toHaveLength(0));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("keeps a scan queued (for retry) when submit rejects", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useOfflineScanQueue({ storageKey: "test-4", submit }));

    act(() => result.current.enqueue("step-1", "START"));

    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.queue).toHaveLength(1);
  });

  it("persists the queue to localStorage across hook instances", async () => {
    setOnline(false);
    const submit = vi.fn().mockResolvedValue(undefined);
    const first = renderHook(() => useOfflineScanQueue({ storageKey: "test-5", submit }));
    act(() => first.result.current.enqueue("step-1", "FINISH"));
    expect(first.result.current.queue).toHaveLength(1);

    const second = renderHook(() => useOfflineScanQueue({ storageKey: "test-5", submit }));
    expect(second.result.current.queue).toHaveLength(1);
    expect(second.result.current.queue[0]).toMatchObject({ stepId: "step-1", action: "FINISH" });
  });
});
