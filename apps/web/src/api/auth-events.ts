import type { ErrorCode } from "@erp/contracts";

/** The only two error codes that mean "this session is dead" rather than "this request failed". */
export type UnauthorizedReason = Extract<ErrorCode, "UNAUTHENTICATED" | "REAUTH_REQUIRED">;

type Listener = (reason: UnauthorizedReason) => void;

let listener: Listener | null = null;

/**
 * Registers the single handler for a session-ending 401 (M1 §2.2). The api client's fetcher calls
 * it from outside the React tree, so the handler is wired imperatively (main.tsx) rather than via
 * context. Pass `null` to unregister.
 */
export function onUnauthorized(handler: Listener | null): void {
  listener = handler;
}

/** Invoked by the api client's fetcher when a response is a session-ending 401. */
export function notifyUnauthorized(reason: UnauthorizedReason): void {
  listener?.(reason);
}
