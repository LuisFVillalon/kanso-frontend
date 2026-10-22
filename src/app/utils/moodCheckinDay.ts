/**
 * Which local day a mood check-in is for at a given moment, and whether that
 * day ends a week or month (when the weekly or monthly check-in is offered,
 * see components/mood/PeriodMoodCheckins.tsx). Pure, so the rules are
 * testable without a clock.
 */

import type { MoodPeriodKind } from '@/app/types/mood';
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

/**
 * The local day the user is checking in for at `now`: today, except that a
 * day which ends past midnight (shutoff at or before the day start) is still
 * being called off in the small hours, so until the next day starts it is
 * yesterday's check-in.
 */
export function checkinDayAt(now: Date, dayStartTime: string, shutoffTime: string): Date {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const pastMidnight = endsPastMidnight(dayStartTime, shutoffTime) && nowMinutes < toMinutes(dayStartTime);
  return addDays(now, pastMidnight ? -1 : 0);
}

/**
 * Whether the check-in day (checkinDayAt) has been called off at `now`: past
 * the shutoff time, or, for a day that ends past midnight, in the small hours
 * between the shutoff and the next day's start. A day whose shutoff equals
 * its start never closes.
 */
export function dayCalledOffAt(now: Date, dayStartTime: string, shutoffTime: string): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const shutoff = toMinutes(shutoffTime);
  return endsPastMidnight(dayStartTime, shutoffTime)
    ? nowMinutes >= shutoff && nowMinutes < toMinutes(dayStartTime)
    : nowMinutes >= shutoff;
}

/** The check-ins offered on the last day of their period. */
export type PeriodCheckinKind = Exclude<MoodPeriodKind, 'day'>;

/** The first local day of the Mon–Sun week or the month containing `day` — a check-in's period_start. */
export const periodStartOf = (kind: PeriodCheckinKind, day: Date): Date => periodContaining(kind, day).start;

/** Whether `day` ends its week (a Sunday) or its month (the last day). */
export const endsPeriod = (kind: PeriodCheckinKind, day: Date): boolean =>
  toLocalDateStr(periodContaining(kind, day).end) === toLocalDateStr(day);
