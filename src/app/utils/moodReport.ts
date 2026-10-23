/**
 * The mood side of the calendar report: which days of check-ins a period
 * needs, and the averages, counts and rolling lines drawn from them. Only
 * daily check-ins feed these numbers, and a day without one is left out —
 * never counted as neutral. Weekly and monthly check-ins are shown beside
 * them, never mixed in.
 */

import type { MoodCheckin } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { ReportPeriod } from '@/app/utils/calendarReport';

export type MoodSeries = 'mood' | 'energy' | 'stress';

/** The month chart's rolling average: 7 days, drawn once at least 3 of them have a check-in. */
export const ROLLING_WINDOW = 7;
export const ROLLING_MIN = 3;
/** On the year chart, a month with fewer days than this for a series is drawn faded. */
export const YEAR_FADE_DAYS = 8;
/** Under this many check-ins the report says patterns need more days — more than a week has, so only Month and Year show them. */
export const PATTERN_MIN_DAYS = 10;

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Every local "YYYY-MM-DD" from `start` to `end`, inclusive. */
const eachDay = (start: Date, end: Date): string[] => {
  const days: string[] = [];
  for (let d = startOfDay(start); d <= end; d = addDays(d, 1)) days.push(toLocalDateStr(d));
  return days;
};

/**
 * The check-ins a period's report fetches: a month plus the 6 days before it (so its rolling average is whole from
 * the 1st) and the rest of its last Mon–Sun week (so a weekly check-in
 * running into the next month sees all its days), or just the week or year.
 */
export const moodFetchRange = (period: ReportPeriod): { start: Date; end: Date } => {
  if (period.kind === 'month') {
    return { start: addDays(period.start, -(ROLLING_WINDOW - 1)), end: addDays(period.end, (7 - period.end.getDay()) % 7) };
  }
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

/** Tags on fewer days than this are left off the Tags & mood card. */
export const TAG_MIN_DAYS = 3;

export interface TagMood {
  tag: string;
  /** Logged days carrying the tag. */
  days: number;
  average: number;
}

/**
 * Average mood on the days over [start, end], up to today, that carry each
 * mood tag — tags used on at least `minDays` days, best average first. Only
 * means and day counts: with this many tags any "significant" claim would
 * be noise.
 */
export const moodByTag = (
  byDay: Map<string, MoodCheckin>,
  start: Date,
  end: Date,
  now: Date = new Date(),
  minDays = TAG_MIN_DAYS,
): TagMood[] => {
  const today = startOfDay(now);
  const tags = new Map<string, { days: number; total: number }>();
  for (const day of eachDay(start, end < today ? end : today)) {
    const checkin = byDay.get(day);
    if (!checkin) continue;
    for (const tag of new Set(checkin.tags)) {
      const entry = tags.get(tag) ?? { days: 0, total: 0 };
      entry.days++;
      entry.total += checkin.mood;
      tags.set(tag, entry);
    }
  }
  return [...tags]
    .filter(([, t]) => t.days >= minDays)
    .map(([tag, t]) => ({ tag, days: t.days, average: t.total / t.days }))
    .sort((a, b) => b.average - a.average || b.days - a.days || a.tag.localeCompare(b.tag));
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

/** The weekly check-ins whose Mon–Sun week overlaps [start, end], oldest first. */
export const weekCheckinsIn = (checkins: MoodCheckin[], start: Date, end: Date): MoodCheckin[] => {
  const startStr = toLocalDateStr(addDays(start, -6));
  const endStr = toLocalDateStr(end);
  return checkins
    .filter(c => c.period_kind === 'week' && c.period_start >= startStr && c.period_start <= endStr)
    .sort((a, b) => a.period_start.localeCompare(b.period_start));
};

/** Monthly check-ins by their month, "YYYY-MM". */
export const indexMonthCheckins = (checkins: MoodCheckin[]): Map<string, MoodCheckin> =>
  new Map(checkins.filter(c => c.period_kind === 'month').map(c => [c.period_start.slice(0, 7), c]));

/**
 * Whether the report has a check-in to show: a daily one in the period, a
 * weekly one overlapping the period or, in the Year view, a monthly one.
 */
export const hasMoodCheckins = (period: ReportPeriod, byDay: Map<string, MoodCheckin>, checkins: MoodCheckin[]): boolean => {
  if (summarizeMood(byDay, period.start, period.end).logged > 0) return true;
  if (period.kind !== 'year') return weekCheckinsIn(checkins, period.start, period.end).length > 0;
  const year = `${period.start.getFullYear()}-`;
  return checkins.some(c => c.period_kind === 'month' && c.period_start.startsWith(year));
};
