/**
 * Period math and aggregation behind the /reports page's weekly / monthly /
 * yearly report. Everything works on the browser's local calendar: periods
 * are local days, and UTC completion/session timestamps from
 * GET /get-calendar-activity are placed on the local day they fall in.
 */

import type { CalendarActivity } from '@/app/types/activity';
import type { Habit } from '@/app/types/habit';
import { toLocalDateStr } from '@/app/utils/dateUtils';

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
export const addSecondsByLocalDay = (startMs: number, endMs: number, into: Map<string, number>) => {
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
// The activities Mood › Patterns compares with how you felt (utils/patterns.ts).

export type MoodMetric = 'tasks' | 'notes' | 'habits';

export const MOOD_METRICS: MoodMetric[] = ['tasks', 'notes', 'habits'];

/** A day's value for a metric: tasks completed, whole minutes in notes, or habit check-ins. */
export const metricValue = (day: DayActivity | undefined, metric: MoodMetric): number => {
  if (!day) return 0;
  if (metric === 'tasks') return day.tasksCompleted;
  if (metric === 'notes') return Math.round(day.noteSeconds / 60);
  return day.habitsCompleted;
};
