/**
 * Friendly cadence ↔ cron bridge (M6 §3.3, design MD5) — the schedule editor shows "Every Monday
 * 08:00", never a raw cron field; this module is the pure conversion the component renders through.
 * Only the daily/weekly-at-a-fixed-time shape this editor exposes round-trips; a schedule stored
 * with a more complex cron (`cadenceFromCron` returns `undefined`) falls outside the friendly UI.
 */

export type CadenceFrequency = "daily" | "weekly";

export interface Cadence {
  frequency: CadenceFrequency;
  /** 0 (Sunday) – 6 (Saturday); required when `frequency` is `"weekly"`. */
  dayOfWeek?: number;
  /** 24-hour `"HH:mm"`. */
  time: string;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek] ?? "";
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = time.split(":");
  return { hour: Number(hourStr ?? 0), minute: Number(minuteStr ?? 0) };
}

/** Build a 5-field cron expression (`m h * * dow`) from a friendly cadence. */
export function cronFromCadence(cadence: Cadence): string {
  const { hour, minute } = parseTime(cadence.time);
  const dow = cadence.frequency === "weekly" ? String(cadence.dayOfWeek ?? 0) : "*";
  return `${minute} ${hour} * * ${dow}`;
}

/** Parse a 5-field cron expression into a friendly cadence, or `undefined` when it isn't a plain
 * daily/weekly-at-a-fixed-time shape (day-of-month/month restrictions, step values, lists, …). */
export function cadenceFromCron(cron: string): Cadence | undefined {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return undefined;
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
  if (dom !== "*" || month !== "*") return undefined;
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return undefined;
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  if (dow === "*") return { frequency: "daily", time };
  if (/^[0-6]$/.test(dow)) return { frequency: "weekly", dayOfWeek: Number(dow), time };
  return undefined;
}

/** Human-friendly cadence description, e.g. `"Every Monday 08:00"` or `"Every day 08:00"`. */
export function describeCadence(cadence: Cadence): string {
  const day = cadence.frequency === "weekly" ? weekdayLabel(cadence.dayOfWeek ?? 0) : "day";
  return `Every ${day} ${cadence.time}`;
}
