/**
 * Which local day a mood check-in is for at a given moment, and whether that
 * day ends a week or month (when the weekly or monthly check-in is offered,
 * see components/mood/PeriodMoodCheckins.tsx). Pure, so the rules are
 * testable without a clock.
 */

import { dayWindowOn } from '@/app/lib/restDays';
import type { MoodPeriodKind } from '@/app/types/mood';
import type { DayWindows } from '@/app/types/profile';
import { periodContaining } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';

const toMinutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/** Whether the day is called off after midnight: shutoff at or before the day start. */
export const endsPastMidnight = (dayStartTime: string, shutoffTime: string): boolean =>
  toMinutes(shutoffTime) <= toMinutes(dayStartTime);

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const sameDay = (a: Date, b: Date) => toLocalDateStr(a) === toLocalDateStr(b);

/**
 * The local day the user is checking in for at `now`: today, except that a
 * day which ends past midnight (shutoff at or before the day start) is still
 * being called off in the small hours, so until the next day starts it is
 * yesterday's check-in. Each day uses its own window from `dayWindows`, or
 * the every-day dayStartTime / shutoffTime.
 */
export function checkinDayAt(now: Date, dayStartTime: string, shutoffTime: string, dayWindows: DayWindows = {}): Date {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const yesterday = dayWindowOn(addDays(now, -1).getDay(), dayStartTime, shutoffTime, dayWindows);
  const today = dayWindowOn(now.getDay(), dayStartTime, shutoffTime, dayWindows);
  const pastMidnight = endsPastMidnight(yesterday.start, yesterday.end) && nowMinutes < toMinutes(today.start);
  return addDays(now, pastMidnight ? -1 : 0);
}

/**
 * Whether the check-in day (checkinDayAt) has been called off at `now`: past
 * its shutoff time, or, for yesterday's day that ended past midnight, past
 * that shutoff in the small hours before today starts. A day whose shutoff
 * equals its start never closes.
 */
export function dayCalledOffAt(now: Date, dayStartTime: string, shutoffTime: string, dayWindows: DayWindows = {}): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const day = checkinDayAt(now, dayStartTime, shutoffTime, dayWindows);
  const { start, end } = dayWindowOn(day.getDay(), dayStartTime, shutoffTime, dayWindows);
  if (!sameDay(day, now)) return nowMinutes >= toMinutes(end);
  return !endsPastMidnight(start, end) && nowMinutes >= toMinutes(end);
}

/** The check-ins offered on the last day of their period. */
export type PeriodCheckinKind = Exclude<MoodPeriodKind, 'day'>;

/** The first local day of the Mon–Sun week or the month containing `day` — a check-in's period_start. */
export const periodStartOf = (kind: PeriodCheckinKind, day: Date): Date => periodContaining(kind, day).start;

/** Whether `day` ends its week (a Sunday) or its month (the last day). */
export const endsPeriod = (kind: PeriodCheckinKind, day: Date): boolean =>
  toLocalDateStr(periodContaining(kind, day).end) === toLocalDateStr(day);
