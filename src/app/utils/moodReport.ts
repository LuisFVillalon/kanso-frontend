/**
 * The mood side of the calendar report: which days of check-ins a period
 * needs, and the averages, counts and rolling lines drawn from them. Only
 * daily check-ins feed these numbers, and a day without one is left out —
 * never counted as neutral.
 */

import type { MoodCheckin } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { ReportPeriod } from '@/app/utils/calendarReport';

export type MoodSeries = 'mood' | 'energy' | 'stress';

/** A week is too short to say much, so the Week report's mood summary covers the 4 weeks to its end. */
export const TRAILING_DAYS = 28;
/** The month chart's rolling average: 7 days, drawn once at least 3 of them have a check-in. */
export const ROLLING_WINDOW = 7;
export const ROLLING_MIN = 3;
/** Under this many check-ins the report says patterns need more days. */
export const PATTERN_MIN_DAYS = 10;

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Every local "YYYY-MM-DD" from `start` to `end`, inclusive. */
const eachDay = (start: Date, end: Date): string[] => {
  const days: string[] = [];
  for (let d = startOfDay(start); d <= end; d = addDays(d, 1)) days.push(toLocalDateStr(d));
  return days;
};

export interface MoodScope {
  start: Date;
  end: Date;
  /** True when a week was widened to the trailing 4 weeks. */
  widened: boolean;
}

/**
 * The days a period's mood summary covers: the period itself, except that a
 * week widens to the 4 weeks ending on its last day — or today, while it's
 * the current week.
 */
export const moodSummaryScope = (period: ReportPeriod, now: Date = new Date()): MoodScope => {
  if (period.kind !== 'week') return { start: period.start, end: period.end, widened: false };
  const today = startOfDay(now);
  const end = today < period.start ? period.start : today < period.end ? today : period.end;
  return { start: addDays(end, -(TRAILING_DAYS - 1)), end, widened: true };
};

/**
 * The check-ins a period's report fetches: the trailing 4 weeks for a week,
 * a month plus the 6 days before it (so its rolling average is whole from
 * the 1st), or the year.
 */
export const moodFetchRange = (period: ReportPeriod, now: Date = new Date()): { start: Date; end: Date } => {
  if (period.kind === 'week') return { start: moodSummaryScope(period, now).start, end: period.end };
  if (period.kind === 'month') return { start: addDays(period.start, -(ROLLING_WINDOW - 1)), end: period.end };
  return { start: period.start, end: period.end };
};

/** Daily check-ins by their local day. */
export const indexDayCheckins = (checkins: MoodCheckin[]): Map<string, MoodCheckin> =>
  new Map(checkins.filter(c => c.period_kind === 'day').map(c => [c.period_start, c]));

export const seriesValue = (checkin: MoodCheckin | undefined | null, series: MoodSeries): number | null =>
  checkin ? checkin[series] : null;

export interface MoodSummary {
  /** Mean mood of the logged days, null when none are. */
  average: number | null;
  /** Days with a daily check-in. */
  logged: number;
  /** Days so far — the whole span once it's over. */
  days: number;
  /** Logged days per mood, Rough (index 0) to Great (index 4). */
  distribution: number[];
}

/** Average mood, logged-day count and mood distribution over [start, end], up to today. */
export const summarizeMood = (
  byDay: Map<string, MoodCheckin>,
  start: Date,
  end: Date,
  now: Date = new Date(),
): MoodSummary => {
  const today = startOfDay(now);
  const days = eachDay(start, end < today ? end : today);
  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  let logged = 0;
  for (const day of days) {
    const checkin = byDay.get(day);
    if (!checkin) continue;
    logged++;
    total += checkin.mood;
    distribution[checkin.mood - 1]++;
  }
  return { average: logged > 0 ? total / logged : null, logged, days: days.length, distribution };
};

/**
 * Each point's average over itself and the `window - 1` before it, skipping
 * gaps; null where fewer than `min` of them have a value.
 */
export const rollingAverage = (
  values: (number | null)[],
  window = ROLLING_WINDOW,
  min = ROLLING_MIN,
): (number | null)[] =>
  values.map((_, i) => {
    const inWindow = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return inWindow.length >= min ? inWindow.reduce((a, b) => a + b, 0) / inWindow.length : null;
  });

/**
 * The month chart's 7-day average for each day of `period`, reaching back
 * into the days before it; null for days after today.
 */
export const periodRollingAverage = (
  period: ReportPeriod,
  byDay: Map<string, MoodCheckin>,
  series: MoodSeries,
  now: Date = new Date(),
): (number | null)[] => {
  const lead = ROLLING_WINDOW - 1;
  const days = eachDay(addDays(period.start, -lead), period.end);
  const todayStr = toLocalDateStr(now);
  const rolling = rollingAverage(days.map(d => seriesValue(byDay.get(d), series)));
  return days.slice(lead).map((d, i) => (d > todayStr ? null : rolling[i + lead]));
};

/** Linear-interpolated quantile of a non-empty list. */
export const quantile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
};

export interface MonthMood {
  /** Days with a value for the series. */
  n: number;
  average: number | null;
  /** The middle half of the month's days: 25th and 75th percentiles. */
  q1: number | null;
  q3: number | null;
}

/** A year chart point: the average of a month's daily values and their interquartile range. */
export const monthMood = (byDay: Map<string, MoodCheckin>, monthKey: string, series: MoodSeries): MonthMood => {
  const values: number[] = [];
  for (const [day, checkin] of byDay) {
    const v = day.startsWith(`${monthKey}-`) ? seriesValue(checkin, series) : null;
    if (v != null) values.push(v);
  }
  if (values.length === 0) return { n: 0, average: null, q1: null, q3: null };
  return {
    n: values.length,
    average: values.reduce((a, b) => a + b, 0) / values.length,
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
  };
};
