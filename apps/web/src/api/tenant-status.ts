type Listener = () => void;

let readOnly = false;
// Fire on every change of the sticky flag (drives the persistent banner via useSyncExternalStore).
const stateListeners = new Set<Listener>();
// Fire on every refused mutation, even once the flag is already set (drives the per-attempt toast).
const rejectionListeners = new Set<Listener>();

/**
 * Whether the signed-in tenant has been observed as `READ_ONLY` (M7 §14.3). There is no endpoint
 * that reports tenant status to the web — the api's `TenantStatusGuard` answers a mutation with
 * 403 `TENANT_READ_ONLY` — so the flag is learned from the first refused write and stays set for
 * the rest of the session. Module state (like `auth-events`) because the api client's fetcher sits
 * outside the React tree.
 */
export function isTenantReadOnly(): boolean {
  return readOnly;
}

/** Subscribe to flag changes. Returns the unsubscribe function (the `useSyncExternalStore` shape). */
export function subscribeTenantReadOnly(listener: Listener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Subscribe to each refused mutation. Returns the unsubscribe function. */
export function onTenantReadOnlyRejection(listener: Listener): () => void {
  rejectionListeners.add(listener);
  return () => {
    rejectionListeners.delete(listener);
  };
}

/** Invoked by the api client's fetcher when a response is 403 `TENANT_READ_ONLY`. */
export function notifyTenantReadOnly(): void {
  if (!readOnly) {
    readOnly = true;
    stateListeners.forEach((listener) => listener());
  }
  rejectionListeners.forEach((listener) => listener());
}

/** Clears the flag — on sign-out, so it never leaks into the next session. */
export function resetTenantReadOnly(): void {
  if (!readOnly) return;
  readOnly = false;
  stateListeners.forEach((listener) => listener());
}
