/**
 * Period math and aggregation behind the /reports page's weekly / monthly /
 * yearly report. Everything works on the browser's local calendar: periods
 * are local days, and UTC completion/session timestamps from
 * GET /get-calendar-activity are placed on the local day they fall in.
 */

import type { CalendarActivity } from '@/app/types/activity';
import type { Habit } from '@/app/types/habit';
import type { MoodCheckin } from '@/app/types/mood';
import { formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';
import { PATTERN_MIN_DAYS } from '@/app/utils/moodReport';

export type ReportPeriodKind = 'week' | 'month' | 'year';

export interface ReportPeriod {
  kind: ReportPeriodKind;
  /** First local day of the period, at local midnight. */
  start: Date;
  /** Last local day of the period (inclusive), at local midnight. */
  end: Date;
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The week (Monday–Sunday), month or year containing `date`. */
export const periodContaining = (kind: ReportPeriodKind, date: Date): ReportPeriod => {
  const day = startOfDay(date);
  if (kind === 'week') {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
    return { kind, start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) };
  }
  if (kind === 'month') {
    return {
      kind,
      start: new Date(day.getFullYear(), day.getMonth(), 1),
      end: new Date(day.getFullYear(), day.getMonth() + 1, 0),
    };
  }
  return { kind, start: new Date(day.getFullYear(), 0, 1), end: new Date(day.getFullYear(), 11, 31) };
};

/** The period `delta` steps before (negative) or after (positive) `period`. */
export const shiftPeriod = (period: ReportPeriod, delta: number): ReportPeriod => {
  const { kind, start } = period;
  if (kind === 'week') return periodContaining(kind, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * delta));
  if (kind === 'month') return periodContaining(kind, new Date(start.getFullYear(), start.getMonth() + delta, 1));
  return periodContaining(kind, new Date(start.getFullYear() + delta, 0, 1));
};

export const isSamePeriod = (a: ReportPeriod, b: ReportPeriod): boolean =>
  a.kind === b.kind && a.start.getTime() === b.start.getTime();

/** "Oct 13–19, 2026" / "Dec 29, 2025 – Jan 4, 2026" · "October 2026" · "2026". */
export const formatPeriodLabel = (period: ReportPeriod): string => {
  const { kind, start, end } = period;
  if (kind === 'year') return String(start.getFullYear());
  if (kind === 'month') return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (start.getFullYear() !== end.getFullYear()) {
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = start.getMonth() === end.getMonth()
    ? String(end.getDate())
    : ` ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const sep = start.getMonth() === end.getMonth() ? '–' : ' –';
  return `${startLabel}${sep}${endLabel}, ${end.getFullYear()}`;
};

/** "this week" / "last month" / "2024" — how the UI names a period relative to today. */
export const describePeriod = (period: ReportPeriod, now: Date = new Date()): string => {
  const current = periodContaining(period.kind, now);
  if (isSamePeriod(period, current)) return `this ${period.kind}`;
  if (isSamePeriod(period, shiftPeriod(current, -1))) return `last ${period.kind}`;
  return formatPeriodLabel(period);
};

const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

/** Number of local days in the period. */
export const periodLength = (period: ReportPeriod): number => daysBetween(period.start, period.end) + 1;

/** Days of the period up to and including today — the whole period once it's over, 0 if it hasn't started. */
export const elapsedDays = (period: ReportPeriod, now: Date = new Date()): number => {
  const today = startOfDay(now);
  if (today < period.start) return 0;
  if (today > period.end) return periodLength(period);
  return daysBetween(period.start, today) + 1;
};

// ── Aggregation ──────────────────────────────────────────────────────────────

export interface DayActivity {
  dateStr: string;
  tasksCompleted: number;
  habitsCompleted: number;
  noteSeconds: number;
}

export interface ReportBucket extends DayActivity {
  /** A day's "YYYY-MM-DD", or a month's "YYYY-MM" in a year report. */
  key: string;
  /** Short axis label: weekday letter, day of month, or month initial. */
  label: string;
  /** Full label for tooltips and screen readers. */
  longLabel: string;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface NoteTime {
  noteId: number;
  title: string;
  seconds: number;
}

export interface HabitReportRow {
  habitId: number;
  title: string;
  completions: number;
  /** From the habit itself — null for a habit that has since been archived or deleted. */
  currentStreak: number | null;
  bestStreak: number | null;
}

export interface CalendarReport {
  /** Tasks due in the period. */
  tasksPlanned: number;
  /** Of those, how many are now complete. */
  plannedCompleted: number;
  /** plannedCompleted / tasksPlanned as a whole percentage; null when nothing was due. */
  completionRate: number | null;
  /** Tasks marked complete during the period, whatever their due date. */
  tasksCompleted: number;
  /** Summed estimated_time of the tasks completed during the period. */
  completedEstimatedHours: number;
  /** Summed estimated_time of the tasks counted in tasksPlanned. */
  plannedEstimatedHours: number;
  /** Time in note editing sessions, clipped to the period. */
  noteSeconds: number;
  /** Distinct notes with time in the period. */
  notesWorkedOn: number;
  topNotes: NoteTime[];
  habitCheckIns: number;
  habits: HabitReportRow[];
  /** Days with any completion or note time, busiest first (at most 3). */
  busiestDays: DayActivity[];
  /** Days with any completion or note time. */
  activeDays: number;
  /** Per-day buckets for a week or month, per-month for a year. */
  buckets: ReportBucket[];
}

const TOP_NOTES = 5;
const BUSIEST_DAYS = 3;

/**
 * Splits [startMs, endMs) at local midnights and credits each piece's
 * seconds to its local day — a session that runs past midnight counts
 * toward both days.
 */
const addSecondsByLocalDay = (startMs: number, endMs: number, into: Map<string, number>) => {
  let cursor = startMs;
  while (cursor < endMs) {
    const day = new Date(cursor);
    const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    const pieceEnd = Math.min(endMs, nextMidnight);
    const key = toLocalDateStr(day);
    into.set(key, (into.get(key) ?? 0) + (pieceEnd - cursor) / 1000);
    cursor = pieceEnd;
  }
};

// Busiest = most things finished (tasks + habit check-ins); time in notes
// breaks ties, and alone still puts a day on the list.
const busierFirst = (a: DayActivity, b: DayActivity): number =>
  (b.tasksCompleted + b.habitsCompleted) - (a.tasksCompleted + a.habitsCompleted)
  || b.noteSeconds - a.noteSeconds
  || a.dateStr.localeCompare(b.dateStr);

const isActive = (d: DayActivity): boolean => d.tasksCompleted > 0 || d.habitsCompleted > 0 || d.noteSeconds > 0;

const buildBuckets = (period: ReportPeriod, days: Map<string, DayActivity>, now: Date): ReportBucket[] => {
  const todayStr = toLocalDateStr(now);
  const dayOf = (dateStr: string): DayActivity =>
    days.get(dateStr) ?? { dateStr, tasksCompleted: 0, habitsCompleted: 0, noteSeconds: 0 };

  if (period.kind === 'year') {
    const year = period.start.getFullYear();
    const thisMonth = toLocalDateStr(now).slice(0, 7);
    return Array.from({ length: 12 }, (_, month) => {
      const first = new Date(year, month, 1);
      const key = toLocalDateStr(first).slice(0, 7);
      const bucket: ReportBucket = {
        key,
        dateStr: toLocalDateStr(first),
        label: first.toLocaleDateString('en-US', { month: 'narrow' }),
        longLabel: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        tasksCompleted: 0,
        habitsCompleted: 0,
        noteSeconds: 0,
        isCurrent: key === thisMonth,
        isFuture: key > thisMonth,
      };
      for (const d of days.values()) {
        if (!d.dateStr.startsWith(key)) continue;
        bucket.tasksCompleted += d.tasksCompleted;
        bucket.habitsCompleted += d.habitsCompleted;
        bucket.noteSeconds += d.noteSeconds;
      }
      return bucket;
    });
  }

  return Array.from({ length: periodLength(period) }, (_, i) => {
    const date = new Date(period.start.getFullYear(), period.start.getMonth(), period.start.getDate() + i);
    const dateStr = toLocalDateStr(date);
    return {
      ...dayOf(dateStr),
      key: dateStr,
      label: period.kind === 'week'
        ? date.toLocaleDateString('en-US', { weekday: 'narrow' })
        : String(date.getDate()),
      longLabel: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      isCurrent: dateStr === todayStr,
      isFuture: dateStr > todayStr,
    };
  });
};

/**
 * Tasks completed, habit check-ins and note time for each local day from
 * `start` to `end` (inclusive) that has any. Note sessions are clipped to
 * the range and split at midnight.
 */
export const dailyActivity = (activity: CalendarActivity, start: Date, end: Date): Map<string, DayActivity> => {
  const firstDay = toLocalDateStr(start);
  const lastDay = toLocalDateStr(end);
  const inRange = (dateStr: string) => dateStr >= firstDay && dateStr <= lastDay;

  const days = new Map<string, DayActivity>();
  const dayOf = (dateStr: string): DayActivity => {
    let d = days.get(dateStr);
    if (!d) {
      d = { dateStr, tasksCompleted: 0, habitsCompleted: 0, noteSeconds: 0 };
      days.set(dateStr, d);
    }
    return d;
  };

  for (const task of activity.completed_tasks) {
    if (!task.completed_date) continue;
    const dateStr = toLocalDateStr(new Date(task.completed_date));
    if (inRange(dateStr)) dayOf(dateStr).tasksCompleted++;
  }

  const rangeStartMs = startOfDay(start).getTime();
  const rangeEndMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  const secondsByDay = new Map<string, number>();
  for (const session of activity.note_sessions) {
    const startMs = Math.max(new Date(session.started_at).getTime(), rangeStartMs);
    const endMs = Math.min(new Date(session.ended_at).getTime(), rangeEndMs);
    if (endMs > startMs) addSecondsByLocalDay(startMs, endMs, secondsByDay);
  }
  for (const [dateStr, seconds] of secondsByDay) dayOf(dateStr).noteSeconds += seconds;

  for (const completion of activity.habit_completions) {
    if (inRange(completion.date)) dayOf(completion.date).habitsCompleted++;
  }
  return days;
};

/**
 * Summarizes one period's calendar activity. `habits` supplies current and best streaks, which
 * the activity endpoint doesn't carry; every current habit gets a row, even
 * with no check-ins in the period.
 */
export const buildCalendarReport = (
  activity: CalendarActivity,
  period: ReportPeriod,
  habits: Habit[],
  now: Date = new Date(),
): CalendarReport => {
  const firstDay = toLocalDateStr(period.start);
  const lastDay = toLocalDateStr(period.end);
  const inPeriod = (dateStr: string) => dateStr >= firstDay && dateStr <= lastDay;

  const days = dailyActivity(activity, period.start, period.end);

  // The activity passed in may span more than the period, so tasks due outside
  // it are dropped here.
  const planned = activity.scheduled_tasks.filter(t => t.due_date !== null && inPeriod(t.due_date));
  const plannedCompleted = planned.filter(t => t.completed).length;

  let completedEstimatedHours = 0;
  let tasksCompleted = 0;
  for (const task of activity.completed_tasks) {
    if (!task.completed_date) continue;
    const dateStr = toLocalDateStr(new Date(task.completed_date));
    if (!inPeriod(dateStr)) continue;
    tasksCompleted++;
    completedEstimatedHours += task.estimated_time ?? 0;
  }

  // Sessions come back when they merely overlap the period, so only the part
  // inside it counts.
  const periodStartMs = period.start.getTime();
  const { end } = period;
  const periodEndMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  const notes = new Map<number, NoteTime>();
  for (const session of activity.note_sessions) {
    const startMs = Math.max(new Date(session.started_at).getTime(), periodStartMs);
    const endMs = Math.min(new Date(session.ended_at).getTime(), periodEndMs);
    if (endMs <= startMs) continue;
    const note = notes.get(session.note_id) ?? { noteId: session.note_id, title: session.note_title, seconds: 0 };
    note.seconds += (endMs - startMs) / 1000;
    notes.set(session.note_id, note);
  }
  const noteSeconds = [...notes.values()].reduce((sum, n) => sum + n.seconds, 0);

  const habitCounts = new Map<number, { title: string; count: number }>();
  let habitCheckIns = 0;
  for (const completion of activity.habit_completions) {
    if (!inPeriod(completion.date)) continue;
    habitCheckIns++;
    const entry = habitCounts.get(completion.habit_id) ?? { title: completion.habit_title, count: 0 };
    entry.count++;
    habitCounts.set(completion.habit_id, entry);
  }
  const habitRows: HabitReportRow[] = habits.map(h => ({
    habitId: h.id,
    title: h.title,
    completions: habitCounts.get(h.id)?.count ?? 0,
    currentStreak: h.current_streak,
    bestStreak: Math.max(h.max_streak, h.current_streak),
  }));
  for (const [habitId, { title, count }] of habitCounts) {
    if (habits.some(h => h.id === habitId)) continue;
    habitRows.push({ habitId, title, completions: count, currentStreak: null, bestStreak: null });
  }
  habitRows.sort((a, b) => b.completions - a.completions || a.title.localeCompare(b.title));

  const activeDayList = [...days.values()].filter(isActive);

  return {
    tasksPlanned: planned.length,
    plannedCompleted,
    completionRate: planned.length > 0 ? Math.round((plannedCompleted / planned.length) * 100) : null,
    tasksCompleted,
    completedEstimatedHours,
    plannedEstimatedHours: planned.reduce((sum, t) => sum + (t.estimated_time ?? 0), 0),
    noteSeconds,
    notesWorkedOn: notes.size,
    topNotes: [...notes.values()].sort((a, b) => b.seconds - a.seconds).slice(0, TOP_NOTES),
    habitCheckIns,
    habits: habitRows,
    busiestDays: [...activeDayList].sort(busierFirst).slice(0, BUSIEST_DAYS),
    activeDays: activeDayList.length,
    buckets: buildBuckets(period, days, now),
  };
};

// ── Mood & activity ─────────────────────────────────────────────────────────
//
// How mood moves with tasks, note time and habits. One point per day with a
// daily check-in; days without one are left out, never counted as neutral.
// Correlations use Spearman's ρ (mood is ordinal with many ties, task counts
// are skewed), and the wording is capped by sample size so a few weeks of
// data never reads as a firm pattern. Statements describe what moved
// together and never claim a cause.

export type MoodMetric = 'tasks' | 'notes' | 'habits';

export const MOOD_METRICS: MoodMetric[] = ['tasks', 'notes', 'habits'];

/** A day's value for a metric: tasks completed, whole minutes in notes, or habit check-ins. */
export const metricValue = (day: DayActivity | undefined, metric: MoodMetric): number => {
  if (!day) return 0;
  if (metric === 'tasks') return day.tasksCompleted;
  if (metric === 'notes') return Math.round(day.noteSeconds / 60);
  return day.habitsCompleted;
};

export interface MoodPoint {
  dateStr: string;
  mood: number;
  value: number;
}

/** One point per day from `start` to `end` (up to today) with a daily check-in. */
export const moodActivityPoints = (
  byDay: Map<string, MoodCheckin>,
  days: Map<string, DayActivity>,
  start: Date,
  end: Date,
  metric: MoodMetric,
  now: Date = new Date(),
): MoodPoint[] => {
  const firstDay = toLocalDateStr(start);
  const todayStr = toLocalDateStr(now);
  const endStr = toLocalDateStr(end);
  const lastDay = endStr < todayStr ? endStr : todayStr;
  return [...byDay.values()]
    .filter(c => c.period_kind === 'day' && c.period_start >= firstDay && c.period_start <= lastDay)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map(c => ({ dateStr: c.period_start, mood: c.mood, value: metricValue(days.get(c.period_start), metric) }));
};

/** 1-based ranks, ties sharing the average of the ranks they span. */
export const ranks = (values: number[]): number[] => {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
};

const pearson = (x: number[], y: number[]): number => {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sx += (x[i] - mx) ** 2;
    sy += (y[i] - my) ** 2;
  }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : 0;
};

/** Spearman's rank correlation: Pearson's r of the ranks. 0 when either side never changes. */
export const spearman = (x: number[], y: number[]): number => (x.length < 2 ? 0 : pearson(ranks(x), ranks(y)));

// Standard normal CDF (Abramowitz & Stegun 26.2.17, error < 7.5e-8).
const normalCdf = (z: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - tail : tail;
};

/**
 * Two-sided p-value for Spearman's ρ over n points, by the Fisher z
 * approximation with Fieller et al.'s 1.06 variance factor:
 * z = atanh(ρ)·√((n − 3) / 1.06). Needs n > 3.
 */
export const rhoP = (rho: number, n: number): number => {
  const clamped = Math.max(-0.999, Math.min(0.999, rho));
  const z = Math.atanh(clamped) * Math.sqrt((n - 3) / 1.06);
  return 2 * (1 - normalCdf(Math.abs(z)));
};

export type CorrelationLevel = 'insufficient' | 'flat' | 'none' | 'early' | 'slight' | 'moderate' | 'strong';

export const CORRELATION_LABELS: Record<CorrelationLevel, string> = {
  insufficient: 'Not enough data',
  flat: 'Not enough variety',
  none: 'No clear link',
  early: 'Early sign',
  slight: 'Slight link',
  moderate: 'Moderate link',
  strong: 'Strong link',
};

/**
 * Above this p-value, or under MIN_RHO, a result reads as no clear link — as
 * it does when the median split doesn't differ in the same direction as ρ.
 */
export const MAX_P = 0.1;
export const MIN_RHO = 0.15;
/** Under this many days any link is only an "early sign"… */
export const EARLY_SIGN_DAYS = 20;
/** …and under this many nothing is called "strong". */
export const STRONG_MIN_DAYS = 30;

export interface CorrelationResult {
  /** Days with a check-in. */
  n: number;
  level: CorrelationLevel;
  /** Spearman's ρ — null under PATTERN_MIN_DAYS days or when the metric barely varies. */
  rho: number | null;
  p: number | null;
  /** The median split behind "on days you …": days at or above it vs below. */
  threshold: number | null;
  highAverage: number | null;
  lowAverage: number | null;
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

/** Scores how mood moved with a metric across the points and picks its wording level. */
export const analyseCorrelation = (points: Pick<MoodPoint, 'mood' | 'value'>[]): CorrelationResult => {
  const n = points.length;
  const blank = { n, rho: null, p: null, threshold: null, highAverage: null, lowAverage: null };
  if (n < PATTERN_MIN_DAYS) return { ...blank, level: 'insufficient' };
  const xs = points.map(p => p.value);
  if (new Set(xs).size < 3) return { ...blank, level: 'flat' };

  const rho = spearman(xs, points.map(p => p.mood));
  const p = rhoP(rho, n);

  // Median split; when the median is also the minimum, the next value up
  // splits instead, so both sides always have days.
  const sorted = [...xs].sort((a, b) => a - b);
  let threshold = sorted[Math.floor(n / 2)];
  if (threshold === sorted[0]) threshold = sorted.find(v => v > threshold)!;
  const high = points.filter(q => q.value >= threshold).map(q => q.mood);
  const low = points.filter(q => q.value < threshold).map(q => q.mood);
  const highAverage = mean(high);
  const lowAverage = mean(low);
  const splitSign = Math.sign(Math.round(highAverage * 10) - Math.round(lowAverage * 10));

  const strength = Math.abs(rho);
  let level: CorrelationLevel = p > MAX_P || strength < MIN_RHO || splitSign !== Math.sign(rho)
    ? 'none'
    : strength < 0.3 ? 'slight' : strength < 0.5 ? 'moderate' : 'strong';
  if (level !== 'none' && n < EARLY_SIGN_DAYS) level = 'early';
  else if (level === 'strong' && n < STRONG_MIN_DAYS) level = 'moderate';

  return { n, level, rho, p, threshold, highAverage, lowAverage };
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const METRIC_COPY: Record<MoodMetric, {
  /** "Patterns between mood and …" */
  noun: string;
  /** "Your … barely changed" */
  amount: string;
  /** "on days with more …" */
  more: string;
  /** "on days with …" — the low side of the split. */
  less: string;
  /** "On days you …" at or above the split. */
  atLeast: (threshold: number) => string;
}> = {
  tasks: {
    noun: 'tasks',
    amount: 'number of tasks completed',
    more: 'more tasks completed',
    less: 'fewer',
    atLeast: t => (t === 1 ? 'completed at least one task' : `completed ${t} or more tasks`),
  },
  notes: {
    noun: 'note time',
    amount: 'time in notes',
    more: 'more time in notes',
    less: 'less',
    atLeast: t => `spent ${formatDurationShort(t * 60)} or more in notes`,
  },
  habits: {
    noun: 'habits',
    amount: 'number of habit check-ins',
    more: 'more habits checked off',
    less: 'fewer',
    atLeast: t => (t === 1 ? 'checked off at least one habit' : `checked off ${t} or more habits`),
  },
};

/** Gaps in average mood smaller than this read as "about the same". */
const SAME_MOOD_GAP = 0.3;

const TENDED: Record<'slight' | 'moderate' | 'strong', string> = {
  slight: 'slightly tended',
  moderate: 'tended',
  strong: 'consistently tended',
};

/**
 * The plain-language statement under the chart. `scope` names the days it
 * covers ("this month", "in October 2026"). The wording only ever says
 * what moved together, in the past tense — it never names a cause.
 */
export const describeCorrelation = (metric: MoodMetric, result: CorrelationResult, scope: string): string => {
  const copy = METRIC_COPY[metric];
  if (result.level === 'insufficient') {
    return `Patterns between mood and ${copy.noun} show up after about ${PATTERN_MIN_DAYS} days with a check-in — ${result.n} so far ${scope}. Keep logging and this fills in.`;
  }
  if (result.level === 'flat') {
    return `Your ${copy.amount} barely changed from day to day ${scope}, so there’s nothing to compare yet.`;
  }

  const { rho, threshold, highAverage, lowAverage, n } = result;
  const high = highAverage!.toFixed(1);
  const low = lowAverage!.toFixed(1);
  const atLeast = copy.atLeast(threshold!);
  if (result.level === 'none') {
    const gap = Math.abs(highAverage! - lowAverage!);
    return gap < SAME_MOOD_GAP
      ? `No clear link ${scope}: on days you ${atLeast} your mood averaged ${high}, about the same as the ${low} on other days.`
      : `No clear link ${scope}: on days you ${atLeast} your mood averaged ${high}, vs ${low} on other days, but not steadily enough to call it a pattern.`;
  }

  const direction = rho! > 0 ? 'higher' : 'lower';
  const detail = ` On days you ${atLeast} it averaged ${high}, vs ${low} on days with ${copy.less}.`;
  if (result.level === 'early') {
    return `Early sign ${scope}: your mood seemed ${direction} on days with ${copy.more}.${detail} With only ${plural(n, 'day')} this could easily be chance — check back in a few weeks.`;
  }
  const lead = `${scope[0].toUpperCase()}${scope.slice(1)}, your mood ${TENDED[result.level]} to be ${direction} on days with ${copy.more}.`;
  const caveat = n < STRONG_MIN_DAYS ? ` Based on ${plural(n, 'day')}, so treat it as a hint.` : '';
  return lead + detail + caveat;
};
