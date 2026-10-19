// Preset task-duration estimates. Values are hours, matching the
// `estimated_time` field stored on tasks.
export interface DurationPreset {
  label: string;
  hours: number;
}

export const DURATION_PRESETS: DurationPreset[] = [
  { label: '5 min', hours: 5 / 60 },
  { label: '15 min', hours: 15 / 60 },
  { label: '30 min', hours: 30 / 60 },
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '3 hours', hours: 3 },
];

// Tolerates values the backend may have rounded (e.g. 0.08 for 5 min).
const MATCH_TOLERANCE = 0.01;

/** Returns the preset matching a stored estimate, or null for none / no estimate. */
export function findDurationPreset(hours: number | null | undefined): DurationPreset | null {
  if (hours == null || hours <= 0) return null;
  return DURATION_PRESETS.find(p => Math.abs(p.hours - hours) < MATCH_TOLERANCE) ?? null;
}

/**
 * Parses custom-duration text as hours. Empty text means "no estimate" (null);
 * anything that isn't a positive number is invalid.
 */
export function parseCustomHours(
  text: string,
): { ok: true; hours: number | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, hours: null };
  if (!/^\d*\.?\d+$|^\d+\.$/.test(trimmed)) return { ok: false, error: 'Enter a number of hours, like 1.5' };
  const hours = Number(trimmed);
  if (hours <= 0) return { ok: false, error: 'Duration must be greater than 0' };
  return { ok: true, hours };
}
