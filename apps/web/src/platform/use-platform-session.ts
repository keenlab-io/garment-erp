import * as React from "react";
import {
  getPlatformAccessToken,
  getPlatformTokensVersion,
  subscribePlatformTokens,
} from "./platform-token-store.js";

/** Whether a platform_admin access token is held; re-renders when it is set or cleared. */
export function usePlatformSignedIn(): boolean {
  React.useSyncExternalStore(subscribePlatformTokens, getPlatformTokensVersion);
  return getPlatformAccessToken() !== null;
}
