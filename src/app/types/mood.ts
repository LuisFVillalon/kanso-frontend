/**
 * Mood check-ins, backed by the backend's `/get-mood-checkins`,
 * `/save-mood-checkin`, `/del-mood-checkin/{id}` and `/get-mood-tags`
 * endpoints. One check-in per period: the local day itself, the Monday of a
 * Mon–Sun week, or the 1st of a month. Mood data stays out of the Daily Brief
 * and every AI feature.
 */

export type MoodPeriodKind = 'day' | 'week' | 'month';

/** A saved check-in, as the API returns it. Dates are local "YYYY-MM-DD". */
export interface MoodCheckin {
  id: number;
  period_kind: MoodPeriodKind;
  period_start: string;
  /** 1 (Rough) to 5 (Great). */
  mood: number;
  /** Day only: 1 (Drained) to 5 (Charged). */
  energy: number | null;
  /** Day only: 1 (Calm) to 5 (Maxed). */
  stress: number | null;
  /** Week only: 0 too light, 1 about right, 2 too much. */
  workload: number | null;
  /** Week only: the best part of the week. */
  highlight: string | null;
  /** Month only: progress on what matters, 1 none to 5 a lot. */
  progress: number | null;
  /** Month only: the month in one word. */
  word: string | null;
  note: string | null;
  /** Mood tags — their own list, not task tags. */
  tags: string[];
  created_at: string;
  updated_at: string;
}

/**
 * The body of PUT /save-mood-checkin. It replaces the period's whole
 * check-in, so a field left out is cleared; fields from another kind are a 422.
 */
export type MoodCheckinSave = Pick<MoodCheckin, 'period_kind' | 'period_start' | 'mood'> &
  Partial<Pick<MoodCheckin, 'energy' | 'stress' | 'workload' | 'highlight' | 'progress' | 'word' | 'note' | 'tags'>>;

/** GET /get-mood-tags: the built-in list in picker order, then the user's own, most recent first. */
export interface MoodTags {
  defaults: string[];
  custom: string[];
}

/** When the dashboard nudge appears: at "Call it a day", 30 minutes after it, or never. */
export type MoodRemind = 'shutoff' | 'shutoff+30' | 'off';

/** The profile's `mood_checkins` settings, which `/get-profile` returns with defaults filled in. */
export interface MoodCheckinSettings {
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  remind: MoodRemind;
  show_in_reports: boolean;
}

/** Daily on, weekly and monthly opt-in — the same defaults the backend fills in. */
export const DEFAULT_MOOD_SETTINGS: MoodCheckinSettings = {
  daily: true,
  weekly: false,
  monthly: false,
  remind: 'shutoff',
  show_in_reports: true,
};

/** The 5-face scale, index = score - 1. */
export const MOOD_LABELS = ['Rough', 'Low', 'Okay', 'Good', 'Great'] as const;
export const ENERGY_LABELS = ['Drained', 'Low', 'Steady', 'Good', 'Charged'] as const;
export const STRESS_LABELS = ['Calm', 'Mild', 'Some', 'High', 'Maxed'] as const;

export const moodLabel = (mood: number): string => MOOD_LABELS[mood - 1] ?? '';

/** A saved check-in as a save body again — how Undo restores one. */
export const checkinToSave = ({ period_kind, period_start, mood, energy, stress, workload, highlight, progress, word, note, tags }: MoodCheckin): MoodCheckinSave =>
  ({ period_kind, period_start, mood, energy, stress, workload, highlight, progress, word, note, tags });

/** The tag picker's built-in list, used until /get-mood-tags answers (or if it fails). */
export const DEFAULT_MOOD_TAGS = [
  'Slept well', 'Exercised', 'Outdoors', 'Social', 'Focused', 'Busy', 'Tired', 'Anxious', 'Sick', 'Family',
];

// The backend's input bounds (app/schemas/limits.py).
export const MOOD_NOTE_MAX = 280;
export const MOOD_TAG_MAX = 50;
export const MOOD_TAGS_PER_CHECKIN_MAX = 20;
