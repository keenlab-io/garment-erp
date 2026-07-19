import * as React from "react";
import type { ScanAction } from "@erp/contracts";

export interface QueuedScan {
  /** Generated once at enqueue time and never reissued on retry — the idempotency key a submit
   * handler forwards to the backend so a reconnect sync never double-posts the same scan. */
  id: string;
  stepId: string;
  action: ScanAction;
  queuedAt: string;
}

const DEFAULT_STORAGE_KEY = "erp.production.offline-scan-queue";

function readQueue(storageKey: string): QueuedScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(storageKey: string, queue: QueuedScan[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(queue));
  } catch {
    /* storage unavailable — the in-memory queue still drives this session */
  }
}

function isOnlineNow(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export interface UseOfflineScanQueueOptions {
  storageKey?: string;
  /** Submits one queued scan. Reject to stop the sync loop — the remaining queue (including this
   * scan) stays persisted for the next reconnect or enqueue to retry. */
  submit: (scan: QueuedScan) => Promise<void>;
}

export interface OfflineScanQueueApi {
  queue: QueuedScan[];
  isOnline: boolean;
  syncing: boolean;
  /** Queues a scan locally; if online, a sync starts immediately. */
  enqueue: (stepId: string, action: ScanAction) => void;
  /** Drains the queue front-to-back via `submit`, stopping on the first failure or on going offline. */
  sync: () => Promise<void>;
}

/**
 * The kiosk's offline scan queue (M4 §3.4, design MD3) — the offline capability M0 deferred to M4.
 * Scans always enqueue locally first (localStorage, so a reload doesn't lose them), then sync
 * front-to-back whenever the browser is online, so the operator never has to think about
 * connectivity. Dedupe-on-replay is the caller's `submit`'s job: each `QueuedScan.id` is stable
 * across retries, so a submit that forwards it as an idempotency key never double-posts.
 */
export function useOfflineScanQueue({
  storageKey = DEFAULT_STORAGE_KEY,
  submit,
}: UseOfflineScanQueueOptions): OfflineScanQueueApi {
  const [queue, setQueue] = React.useState<QueuedScan[]>(() => readQueue(storageKey));
  const [isOnline, setIsOnline] = React.useState(isOnlineNow);
  const [syncing, setSyncing] = React.useState(false);

  // The source of truth for the sync loop — updated synchronously alongside `setQueue` so a scan
  // enqueued and immediately synced (the common path) is visible to `sync()` without waiting for a
  // re-render to land first (`setState` updates aren't synchronous).
  const queueRef = React.useRef(queue);
  const syncingRef = React.useRef(false);
  const submitRef = React.useRef(submit);
  submitRef.current = submit;

  const updateQueue = React.useCallback(
    (next: QueuedScan[]) => {
      queueRef.current = next;
      setQueue(next);
      writeQueue(storageKey, next);
    },
    [storageKey],
  );

  const sync = React.useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      for (;;) {
        const next = queueRef.current[0];
        if (!next || !isOnlineNow()) break;
        try {
          await submitRef.current(next);
        } catch {
          break; // network drop or a rejected submit — retry on the next sync
        }
        updateQueue(queueRef.current.filter((scan) => scan.id !== next.id));
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [updateQueue]);

  React.useEffect(() => {
    function goOnline() {
      setIsOnline(true);
      void sync();
    }
    function goOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [sync]);

  const enqueue = React.useCallback(
    (stepId: string, action: ScanAction) => {
      const scan: QueuedScan = { id: crypto.randomUUID(), stepId, action, queuedAt: new Date().toISOString() };
      updateQueue([...queueRef.current, scan]);
      if (isOnlineNow()) void sync();
    },
    [sync, updateQueue],
  );

  return { queue, isOnline, syncing, enqueue, sync };
}
