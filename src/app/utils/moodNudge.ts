/**
 * When the dashboard's end-of-day mood nudge (components/mood/MoodNudge.tsx)
 * shows, and in which form — for the day, and for the week or month that
 * day ends. Pure, so the rule is testable without a clock.
 */

import type { MoodCheckinSettings, MoodPeriodKind, MoodRemind } from '@/app/types/mood';
import { periodContaining } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/** Whether the day is called off after midnight: shutoff at or before the day start. */
export const endsPastMidnight = (dayStartTime: string, shutoffTime: string): boolean =>
  toMinutes(shutoffTime) <= toMinutes(dayStartTime);

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

  if (endsPastMidnight(dayStartTime, shutoffTime)) {
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
  /** "Skip" in a week or month check-in: its strip gives way to a chip. */
  periodsSkipped?: PeriodCheckinKind[];
}

const dismissalsFor = (dismissals: MoodNudgeDismissals | null, day: Date) =>
  dismissals?.date === toLocalDateStr(day) ? dismissals : null;

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

  const dismissals = dismissalsFor(input.dismissals, day);

  if (checkedIn) return 'logged';
  if (restDays.includes(day.getDay()) || settings.remind === 'off' || dismissals?.skipped) return 'chip';
  if (dismissals?.snoozedUntil && dismissals.snoozedUntil > now.getTime()) return 'hidden';
  return 'nudge';
}

/** The check-ins the nudge adds on the last day of their period. */
export type PeriodCheckinKind = Exclude<MoodPeriodKind, 'day'>;

/** The first local day of the Mon–Sun week or the month containing `day` — a check-in's period_start. */
export const periodStartOf = (kind: PeriodCheckinKind, day: Date): Date => periodContaining(kind, day).start;

/** Whether `day` ends its week (a Sunday) or its month (the last day). */
export const endsPeriod = (kind: PeriodCheckinKind, day: Date): boolean =>
  toLocalDateStr(periodContaining(kind, day).end) === toLocalDateStr(day);

/**
 * Whether the one-time "Turn on weekly/monthly check-ins" hint was used up:
 * `firstShown` is the day it first showed. It stays for the rest of that
 * day, then never comes back.
 */
export const optInHintSeen = (firstShown: string | undefined, day: Date): boolean =>
  firstShown != null && firstShown !== toLocalDateStr(day);

/**
 * - `strip`: a "Weekly check-in · Start" row on the nudge card.
 * - `chip`: a small "Log this week" button — on rest days, when reminders
 *   are off and after a skip.
 * - `logged`: the period is checked in; a quiet line with Edit.
 * - `hint`: the check-in is turned off; a one-time "Turn on weekly check-ins"
 *   line on the day's nudge card.
 * - `hidden`: nothing.
 */
export type PeriodNudgeState = 'strip' | 'chip' | 'logged' | 'hint' | 'hidden';

export interface PeriodNudgeInput extends MoodNudgeInput {
  kind: PeriodCheckinKind;
  /** Whether the period the day ends already has its check-in. */
  periodCheckedIn: boolean;
  /** Whether the one-time opt-in hint was used up (see optInHintSeen). */
  hintSeen: boolean;
}

/**
 * The week or month check-in, bundled into the day's nudge on the day that
 * ends its period: Sunday for the Mon–Sun week, the last day for the month.
 * It follows the day's timing, rest days, reminders and dismissals, so it
 * never nudges on a rest day either.
 */
export function periodNudgeState(input: PeriodNudgeInput): PeriodNudgeState {
  const { now, settings, kind, restDays } = input;
  const { day, due } = checkinDayAt(now, input.dayStartTime, input.shutoffTime, settings.remind);
  if (!due || !endsPeriod(kind, day)) return 'hidden';

  if (!(kind === 'week' ? settings.weekly : settings.monthly)) {
    return !input.hintSeen && moodNudgeState(input) === 'nudge' ? 'hint' : 'hidden';
  }

  const dismissals = dismissalsFor(input.dismissals, day);
  if (input.periodCheckedIn) return 'logged';
  if (restDays.includes(day.getDay()) || settings.remind === 'off' || dismissals?.skipped || dismissals?.periodsSkipped?.includes(kind)) {
    return 'chip';
  }
  if (dismissals?.snoozedUntil && dismissals.snoozedUntil > now.getTime()) return 'hidden';
  return 'strip';
}
