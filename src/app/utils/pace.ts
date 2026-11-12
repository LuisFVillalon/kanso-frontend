/**
 * The Reports Overview's Pace card: a period's running totals against the
 * period before, compared at the same point. Mid-week that is last week's
 * same weekday, mid-month the same day of last month (clamped to its last
 * day, so Mar 31 compares with Feb 28), and mid-year the same date last year
 * (Feb 29 compares with Feb 28). A finished period compares whole totals.
 *
 * Every metric is a per-local-day series: tasks completed, habit check-ins,
 * time in notes, and time in busy events before now,
 * overlaps counted once (see buildEventTimeSeries). Time is in seconds.
 */

import type { CalendarActivity } from '@/app/types/activity';
import { dailyActivity, periodLength, shiftPeriod, type ReportPeriod } from '@/app/utils/calendarReport';
import { formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import { buildEventTimeSeries } from '@/app/utils/eventTime';

export type PaceMetric = 'tasks' | 'habits' | 'notes' | 'events';

export const PACE_METRICS: readonly PaceMetric[] = ['tasks', 'habits', 'notes', 'events'];

/** Whether a metric counts things (tasks, check-ins) or time, in seconds. */
export const isTimeMetric = (metric: PaceMetric): boolean => metric === 'notes' || metric === 'events';

type DayValues = Record<PaceMetric, number>;

const zero = (): DayValues => ({ tasks: 0, habits: 0, notes: 0, events: 0 });

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

/**
 * Each metric's value on every day of the period, in order. Events count
 * only their minutes before `now`, so time still booked never adds up.
 */
export const paceDays = (
  activity: CalendarActivity,
  period: ReportPeriod,
  workDays: WorkDaySettings,
  now: Date,
): DayValues[] => {
  const days = dailyActivity(activity, period.start, period.end);
  const events = buildEventTimeSeries(activity, period.start, period.end, workDays, false, now);
  return Array.from({ length: periodLength(period) }, (_, i) => {
    const dateStr = toLocalDateStr(addDays(period.start, i));
    const d = days.get(dateStr);
    const e = events.buckets.get(dateStr);
    const values = zero();
    if (d) {
      values.tasks = d.tasksCompleted;
      values.habits = d.habitsCompleted;
      values.notes = d.noteSeconds;
    }
    if (e) values.events = (e.inWindow.past + e.outside.past) * 60;
    return values;
  });
};

export interface PacePoint {
  /** Days of the period counted, from its first: the whole period once it's over. */
  days: number;
  /** The previous period's same point, in its own days. */
  previousDays: number;
  /** The previous period's day the comparison runs to. */
  previousDate: Date;
  /** Whether the period is over, so whole totals are compared and no today marker is drawn. */
  finished: boolean;
}

/**
 * How far into `period` today is, and the same point in the period before.
 * A period that hasn't started counts no days.
 */
export const pacePoint = (period: ReportPeriod, now: Date): PacePoint => {
  const previous = shiftPeriod(period, -1);
  const length = periodLength(period);
  const today = startOfDay(now);
  if (today > period.end) {
    return { days: length, previousDays: periodLength(previous), previousDate: previous.end, finished: true };
  }
  const days = today < period.start ? 0 : daysBetween(period.start, today) + 1;
  let previousDate: Date;
  if (period.kind === 'week') {
    previousDate = addDays(today, -7);
  } else {
    // A month's or year's previous period starts a month or a year earlier; keep the day, clamped to that month.
    const year = period.kind === 'year' ? today.getFullYear() - 1 : previous.start.getFullYear();
    const month = period.kind === 'year' ? today.getMonth() : previous.start.getMonth();
    previousDate = new Date(year, month, Math.min(today.getDate(), daysInMonth(year, month)));
  }
  const previousDays = days === 0 ? 0 : daysBetween(previous.start, previousDate) + 1;
  return { days, previousDays, previousDate, finished: false };
};

/** Running totals of `values` per day. */
const runningTotals = (values: number[]): number[] => {
  let run = 0;
  return values.map(v => (run += v));
};

/**
 * The chart's points for a period: one per day for a week or month, one per
 * month's end for a year. Only the first `days` days count; for a year the
 * month holding the last counted day ends at that day's total, and later
 * months are left off.
 */
const chartPoints = (period: ReportPeriod, running: number[], days: number): number[] => {
  if (period.kind !== 'year') return running.slice(0, days);
  const points: number[] = [];
  const year = period.start.getFullYear();
  let dayIndex = 0;
  for (let month = 0; month < 12 && dayIndex < days; month++) {
    dayIndex = Math.min(dayIndex + daysInMonth(year, month), days);
    points.push(running[dayIndex - 1]);
  }
  return points;
};

/** Seconds rounded to whole minutes, as the card shows them; counts stay as they are. */
export const roundPace = (metric: PaceMetric, value: number): number =>
  (isTimeMetric(metric) ? Math.round(value / 60) * 60 : Math.round(value));

export type DeltaDirection = 'up' | 'down' | 'equal';

export interface PaceDelta {
  direction: DeltaDirection;
  /** The size of the difference, rounded as the values are shown. */
  amount: number;
}

/** The difference between this period and the last, both rounded as they are shown first. */
export const paceDelta = (metric: PaceMetric, current: number, previous: number): PaceDelta => {
  const diff = roundPace(metric, current) - roundPace(metric, previous);
  return { direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'equal', amount: Math.abs(diff) };
};

/** "12", or "2h 30m" of time ("0m" for none). */
export const formatPace = (metric: PaceMetric, value: number): string => {
  const rounded = roundPace(metric, value);
  if (!isTimeMetric(metric)) return String(rounded);
  return rounded < 60 ? '0m' : formatDurationShort(rounded);
};

export interface PaceSeries {
  /** This period's total up to its point. */
  current: number;
  /** The previous period's total up to the same point. */
  previous: number;
  /** The previous period's whole total. */
  previousTotal: number;
  /** This period's chart points, up to today. */
  currentPoints: number[];
  /** The previous period's chart points, across the whole period. */
  previousPoints: number[];
  /** The previous period's running total per day, for the sr-only table. */
  previousRunning: number[];
  /** This period's running total per day, up to its point. */
  currentRunning: number[];
}

export interface Pace extends PacePoint {
  period: ReportPeriod;
  previousPeriod: ReportPeriod;
  /** Whether the previous period has anything in any metric; without it nothing is compared. */
  hasPrevious: boolean;
  /** Whether this period has anything in any metric up to its point. */
  hasCurrent: boolean;
  metrics: Record<PaceMetric, PaceSeries>;
}

/**
 * The Pace card's numbers for `period` against the period before it.
 * `previousActivity` is null while it loads or when it failed, which reads
 * as a previous period with nothing in it.
 */
export const buildPace = (
  activity: CalendarActivity,
  previousActivity: CalendarActivity | null,
  period: ReportPeriod,
  workDays: WorkDaySettings,
  now: Date,
): Pace => {
  const previousPeriod = shiftPeriod(period, -1);
  const point = pacePoint(period, now);
  const curDays = paceDays(activity, period, workDays, now);
  const prevDays = previousActivity ? paceDays(previousActivity, previousPeriod, workDays, now) : [];

  const metrics = {} as Record<PaceMetric, PaceSeries>;
  for (const metric of PACE_METRICS) {
    const curRunning = runningTotals(curDays.map(d => d[metric])).slice(0, point.days);
    const prevRunning = runningTotals(prevDays.map(d => d[metric]));
    metrics[metric] = {
      current: curRunning[point.days - 1] ?? 0,
      previous: prevRunning[point.previousDays - 1] ?? 0,
      previousTotal: prevRunning[prevRunning.length - 1] ?? 0,
      currentPoints: chartPoints(period, curRunning, point.days),
      previousPoints: previousActivity ? chartPoints(previousPeriod, prevRunning, prevRunning.length) : [],
      previousRunning: prevRunning,
      currentRunning: curRunning,
    };
  }
  return {
    ...point,
    period,
    previousPeriod,
    hasPrevious: PACE_METRICS.some(m => metrics[m].previousTotal > 0),
    hasCurrent: PACE_METRICS.some(m => metrics[m].current > 0),
    metrics,
  };
};

/** "1st", "2nd", "11th", "23rd". */
export const ordinal = (n: number): string => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};
