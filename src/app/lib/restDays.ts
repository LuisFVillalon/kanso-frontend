/**
 * "Rest days" and daily-window defaults for the Settings → Work day and rest
 * schedule. Cached in localStorage; synced to the backend's `rest_days` /
 * `day_start_time` profile columns via useProfile.ts.
 */

// Day-of-week indices follow JS Date#getDay() (0 = Sunday … 6 = Saturday).
const DEFAULT_REST_DAYS = [0, 6]; // Sat/Sun
export const DEFAULT_DAY_START = '08:00';
export const DEFAULT_DAY_END = '22:00';

const REST_DAYS_KEY = 'tm_rest_days';

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
