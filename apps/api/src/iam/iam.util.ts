/** Number of failed logins that trips the lockout, and how long it lasts. */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * Parse a JWT-style TTL string (`"15m"`, `"7d"`, `"3600"`, `"90s"`) into whole
 * seconds. Bare numbers are treated as seconds; anything unparseable falls back to
 * 15 minutes. Used to fill the contract's `expires_in` (the access token lifetime).
 */
export function durationToSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) {
    const bare = Number(ttl);
    return Number.isFinite(bare) && bare > 0 ? Math.floor(bare) : 900;
  }
  const value = Number(match[1]);
  switch (match[2] ?? "s") {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86_400;
    default:
      return value;
  }
}

/**
 * Given the current failed-login count *after* an increment, is the account now
 * locked? Trips at `LOCKOUT_THRESHOLD` consecutive failures.
 */
export function shouldLock(failedCount: number): boolean {
  return failedCount >= LOCKOUT_THRESHOLD;
}

/** The `locked_until` timestamp for a lockout starting `now`. */
export function lockoutUntil(now: number): Date {
  return new Date(now + LOCKOUT_MINUTES * 60 * 1000);
}

/**
 * Is the account locked at instant `now`? True while `lockedUntil` is in the
 * future; a null or past timestamp means not locked.
 */
export function isLocked(lockedUntil: Date | null, now: number): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now;
}
