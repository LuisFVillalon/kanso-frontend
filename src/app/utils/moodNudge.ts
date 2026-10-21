/**
 * When the dashboard's end-of-day mood nudge (components/mood/MoodNudge.tsx)
 * shows, and in which form. Pure, so the rule is testable without a clock.
 */

import type { MoodCheckinSettings, MoodRemind } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * The local day the user is calling it on at `now`, and whether its check-in
 * is due yet: from "Call it a day" (or 30 minutes after it) until midnight.
 * A day that ends past midnight (shutoff at or before the day start) is
 * still called off in the small hours, so until the next day starts it is
 * yesterday's check-in that's due.
 */
export function checkinDayAt(
  now: Date,
  dayStartTime: string,
  shutoffTime: string,
  remind: MoodRemind,
): { day: Date; due: boolean } {
  const start = toMinutes(dayStartTime);
  const shutoff = toMinutes(shutoffTime);
  const delay = remind === 'shutoff+30' ? 30 : 0;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = addDays(now, 0);

  if (shutoff <= start) {
    if (nowMinutes >= start) return { day: today, due: false };
    return { day: addDays(today, -1), due: nowMinutes >= shutoff + delay };
  }
  // A late shutoff plus the delay can't spill into tomorrow: due by 23:59.
  return { day: today, due: nowMinutes >= Math.min(shutoff + delay, MINUTES_PER_DAY - 1) };
}

/**
 * What the user did with the nudge, kept on this device only and only for
 * the day it was about (`date`, "YYYY-MM-DD") — a skip is never stored as a
 * check-in, so it can't skew the reports.
 */
export interface MoodNudgeDismissals {
  date: string;
  /** "Not today": the card gives way to a small "Log today's mood" chip. */
  skipped?: boolean;
  /** "In 1 hour": hidden until this epoch-ms time. */
  snoozedUntil?: number;
  /** The "Logged today" confirmation was closed. */
  dismissed?: boolean;
}

/**
 * - `nudge`: the card with the five faces.
 * - `chip`: a small "Log today's mood" button — after a skip, on rest days
 *   (no nudge, but manual logging still works) and when reminders are off.
 * - `logged`: the day is checked in; a quiet confirmation with Edit.
 * - `hidden`: nothing.
 */
export type MoodNudgeState = 'nudge' | 'chip' | 'logged' | 'hidden';

export interface MoodNudgeInput {
  now: Date;
  settings: MoodCheckinSettings;
  dayStartTime: string;
  shutoffTime: string;
  restDays: number[];
  /** Whether the day checkinDayAt gives for `now` already has a check-in. */
  checkedIn: boolean;
  dismissals: MoodNudgeDismissals | null;
}

export function moodNudgeState(input: MoodNudgeInput): MoodNudgeState {
  const { now, settings, restDays, checkedIn } = input;
  const { day, due } = checkinDayAt(now, input.dayStartTime, input.shutoffTime, settings.remind);
  if (!settings.daily || !due) return 'hidden';

  const dismissals = input.dismissals?.date === toLocalDateStr(day) ? input.dismissals : null;

  if (checkedIn) return dismissals?.dismissed ? 'hidden' : 'logged';
  if (restDays.includes(day.getDay()) || settings.remind === 'off' || dismissals?.skipped) return 'chip';
  if (dismissals?.snoozedUntil && dismissals.snoozedUntil > now.getTime()) return 'hidden';
  return 'nudge';
}
