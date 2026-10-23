/**
 * "Rest days" and daily-window defaults for the Settings → Work day and rest
 * schedule. Cached in localStorage; synced to the backend's `rest_days` /
 * `day_start_time` / `day_windows` profile columns via useProfile.ts.
 */

import type { DayWindow, DayWindows } from '@/app/types/profile';

// Day-of-week indices follow JS Date#getDay() (0 = Sunday … 6 = Saturday).
const DEFAULT_REST_DAYS = [0, 6]; // Sat/Sun
export const DEFAULT_DAY_START = '08:00';
export const DEFAULT_DAY_END = '22:00';

const REST_DAYS_KEY = 'tm_rest_days';
export const DAY_WINDOWS_KEY = 'tm_day_windows';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reads the user's configured rest days from localStorage, falling back to the weekend default. */
export function loadStoredRestDays(): number[] {
  if (typeof window === 'undefined') return DEFAULT_REST_DAYS;
  try {
    const raw = localStorage.getItem(REST_DAYS_KEY);
    if (!raw) return DEFAULT_REST_DAYS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)
      : DEFAULT_REST_DAYS;
  } catch {
    return DEFAULT_REST_DAYS;
  }
}

/** Whether `window` is two "HH:MM" times with the end after the start, as a day's own window must be. */
export function isValidDayWindow({ start, end }: { start?: unknown; end?: unknown }): boolean {
  return typeof start === 'string' && typeof end === 'string' && HH_MM.test(start) && HH_MM.test(end) && end > start;
}

/** The well-formed entries of a `day_windows` value (keys "0".."6"); anything else is dropped. */
export function cleanDayWindows(raw: unknown): DayWindows {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: DayWindows = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(key) || !value || typeof value !== 'object') continue;
    const { start, end } = value as Partial<DayWindow>;
    if (isValidDayWindow({ start, end })) clean[key] = { start: start!, end: end! };
  }
  return clean;
}

/** Reads the cached per-weekday windows from localStorage. */
export function loadStoredDayWindows(): DayWindows {
  if (typeof window === 'undefined') return {};
  try {
    return cleanDayWindows(JSON.parse(localStorage.getItem(DAY_WINDOWS_KEY) ?? 'null'));
  } catch {
    return {};
  }
}

/** The work window on `weekday` (0=Sun..6=Sat): its own if it has one, else the every-day window. */
export function dayWindowOn(weekday: number, dayStartTime: string, shutoffTime: string, dayWindows: DayWindows = {}): DayWindow {
  return dayWindows[String(weekday)] ?? { start: dayStartTime, end: shutoffTime };
}
