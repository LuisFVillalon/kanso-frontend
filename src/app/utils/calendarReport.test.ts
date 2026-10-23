import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { Habit } from '@/app/types/habit';
import type { MoodCheckin } from '@/app/types/mood';
import {
  analyseCorrelation,
  buildCalendarReport,
  dailyActivity,
  describeCorrelation,
  describeLinkBrief,
  describePeriod,
  elapsedDays,
  formatPeriodLabel,
  moodActivityPoints,
  periodContaining,
  periodLength,
  ranks,
  rhoP,
  shiftPeriod,
  spearman,
  type CorrelationResult,
  type MoodMetric,
} from './calendarReport';
import { toLocalDateStr } from './dateUtils';

beforeAll(() => {
  // Local-day bucketing depends on the zone; pin one with a DST change.
  process.env.TZ = 'America/Los_Angeles';
});

const day = (d: Date) => toLocalDateStr(d);

const task = (overrides: Partial<ActivityTask>): ActivityTask => ({
  id: 1,
  title: 'Task',
  category: null,
  priority: null,
  due_date: null,
  due_time: null,
  estimated_time: null,
  completed: false,
  completed_date: null,
  parent_task_id: null,
  tags: [],
  ...overrides,
});

const emptyActivity = (start: string, end: string): CalendarActivity => ({
  start_date: start,
  end_date: end,
  scheduled_tasks: [],
  completed_tasks: [],
  note_sessions: [],
  habit_completions: [],
});

const habit = (overrides: Partial<Habit>): Habit => ({
  id: 1,
  title: 'Habit',
  current_streak: 0,
  max_streak: 0,
  logged_today: false,
  tags: [],
  ...overrides,
});

describe('periods', () => {
  it('starts weeks on Monday', () => {
    const week = periodContaining('week', new Date(2026, 9, 18)); // Sunday
    expect(day(week.start)).toBe('2026-10-12');
    expect(day(week.end)).toBe('2026-10-18');
  });

  it('covers whole months and years', () => {
    const feb = periodContaining('month', new Date(2028, 1, 10));
    expect([day(feb.start), day(feb.end)]).toEqual(['2028-02-01', '2028-02-29']);
    const year = periodContaining('year', new Date(2028, 5, 1));
    expect([day(year.start), day(year.end)]).toEqual(['2028-01-01', '2028-12-31']);
    expect(periodLength(year)).toBe(366);
  });

  it('shifts across month and year boundaries', () => {
    const jan = periodContaining('month', new Date(2026, 0, 31));
    expect(day(shiftPeriod(jan, -1).start)).toBe('2025-12-01');
    const week = periodContaining('week', new Date(2026, 0, 1));
    expect(day(shiftPeriod(week, 1).start)).toBe('2026-01-05');
    // Seven days across the March DST change still lands on a Monday.
    const dstWeek = periodContaining('week', new Date(2026, 2, 4));
    expect(day(shiftPeriod(dstWeek, 1).start)).toBe('2026-03-09');
  });

  it('labels periods', () => {
    expect(formatPeriodLabel(periodContaining('week', new Date(2026, 9, 14)))).toBe('Oct 12–18, 2026');
    expect(formatPeriodLabel(periodContaining('week', new Date(2026, 8, 30)))).toBe('Sep 28 – Oct 4, 2026');
    expect(formatPeriodLabel(periodContaining('week', new Date(2025, 11, 31)))).toBe('Dec 29, 2025 – Jan 4, 2026');
    expect(formatPeriodLabel(periodContaining('month', new Date(2026, 9, 14)))).toBe('October 2026');
    expect(formatPeriodLabel(periodContaining('year', new Date(2026, 9, 14)))).toBe('2026');
  });

  it('describes periods relative to today', () => {
    const now = new Date(2026, 9, 19);
    const thisMonth = periodContaining('month', now);
    expect(describePeriod(thisMonth, now)).toBe('this month');
    expect(describePeriod(shiftPeriod(thisMonth, -1), now)).toBe('last month');
    expect(describePeriod(shiftPeriod(thisMonth, -2), now)).toBe('August 2026');
  });

  it('counts elapsed days', () => {
    const week = periodContaining('week', new Date(2026, 9, 14));
    expect(elapsedDays(week, new Date(2026, 9, 14, 23, 0))).toBe(3);
    expect(elapsedDays(week, new Date(2026, 10, 1))).toBe(7);
    expect(elapsedDays(week, new Date(2026, 9, 1))).toBe(0);
  });
});

describe('buildCalendarReport', () => {
  const week = periodContaining('week', new Date(2026, 9, 14)); // Oct 12–18
  const now = new Date(2026, 9, 15, 12, 0);

  it('compares planned and completed tasks', () => {
    const activity = {
      ...emptyActivity('2026-10-12', '2026-10-18'),
      scheduled_tasks: [
        task({ id: 1, due_date: '2026-10-13', completed: true, estimated_time: 2 }),
        task({ id: 2, due_date: '2026-10-14', estimated_time: 1.5 }),
        task({ id: 3, due_date: '2026-10-16' }),
      ],
      completed_tasks: [
        // 7pm Oct 13 local is already Oct 14 in UTC.
        task({ id: 1, completed: true, completed_date: '2026-10-14T02:00:00Z', estimated_time: 2 }),
        task({ id: 4, completed: true, completed_date: '2026-10-15T17:00:00Z', estimated_time: 0.5 }),
      ],
    };
    const report = buildCalendarReport(activity, week, [], now);
    expect(report.tasksPlanned).toBe(3);
    expect(report.plannedCompleted).toBe(1);
    expect(report.completionRate).toBe(33);
    expect(report.tasksCompleted).toBe(2);
    expect(report.completedEstimatedHours).toBe(2.5);
    expect(report.plannedEstimatedHours).toBe(3.5);
    const byDay = Object.fromEntries(report.buckets.map(b => [b.key, b.tasksCompleted]));
    expect(byDay['2026-10-13']).toBe(1);
    expect(byDay['2026-10-15']).toBe(1);
  });

  it('only plans tasks due in the period, even when the activity spans more days', () => {
    const activity = {
      ...emptyActivity('2026-09-21', '2026-10-18'),
      scheduled_tasks: [task({ id: 1, due_date: '2026-09-30', completed: true }), task({ id: 2, due_date: '2026-10-13' })],
      completed_tasks: [task({ id: 1, completed: true, completed_date: '2026-09-30T18:00:00Z' })],
      habit_completions: [{ habit_id: 1, habit_title: 'Read', date: '2026-10-01', estimated_time: null }],
    };
    const report = buildCalendarReport(activity, week, [], now);
    expect([report.tasksPlanned, report.plannedCompleted, report.tasksCompleted, report.habitCheckIns]).toEqual([1, 0, 0, 0]);
    expect(report.activeDays).toBe(0);
  });

  it('has no completion rate when nothing was due', () => {
    const report = buildCalendarReport(emptyActivity('2026-10-12', '2026-10-18'), week, [], now);
    expect(report.completionRate).toBeNull();
    expect(report.busiestDays).toEqual([]);
    expect(report.activeDays).toBe(0);
    expect(report.buckets).toHaveLength(7);
  });

  it('clips note sessions to the period and splits them at local midnight', () => {
    const activity = {
      ...emptyActivity('2026-10-12', '2026-10-18'),
      note_sessions: [
        // Sun Oct 11 11:30pm → Mon Oct 12 12:30am local: only 30m is in the week.
        { id: 1, note_id: 7, note_title: 'Essay', started_at: '2026-10-12T06:30:00Z', ended_at: '2026-10-12T07:30:00Z', duration_seconds: 3600 },
        // Tue Oct 13 11pm → Wed Oct 14 1am local: one hour on each day.
        { id: 2, note_id: 7, note_title: 'Essay', started_at: '2026-10-14T06:00:00Z', ended_at: '2026-10-14T08:00:00Z', duration_seconds: 7200 },
        { id: 3, note_id: 8, note_title: 'Lab', started_at: '2026-10-15T16:00:00Z', ended_at: '2026-10-15T16:20:00Z', duration_seconds: 1200 },
      ],
    };
    const report = buildCalendarReport(activity, week, [], now);
    expect(report.noteSeconds).toBe(1800 + 7200 + 1200);
    expect(report.notesWorkedOn).toBe(2);
    expect(report.topNotes).toEqual([
      { noteId: 7, title: 'Essay', seconds: 9000 },
      { noteId: 8, title: 'Lab', seconds: 1200 },
    ]);
    const byDay = Object.fromEntries(report.buckets.map(b => [b.key, b.noteSeconds]));
    expect(byDay['2026-10-12']).toBe(1800);
    expect(byDay['2026-10-13']).toBe(3600);
    expect(byDay['2026-10-14']).toBe(3600);
  });

  it('counts habit check-ins and keeps streaks from the habit', () => {
    const activity = {
      ...emptyActivity('2026-10-12', '2026-10-18'),
      habit_completions: [
        { habit_id: 1, habit_title: 'Read', date: '2026-10-12', estimated_time: null },
        { habit_id: 1, habit_title: 'Read', date: '2026-10-13', estimated_time: null },
        { habit_id: 9, habit_title: 'Old habit', date: '2026-10-13', estimated_time: null },
      ],
    };
    const habits = [
      habit({ id: 1, title: 'Read', current_streak: 2, max_streak: 10 }),
      habit({ id: 2, title: 'Run', current_streak: 0, max_streak: 4 }),
    ];
    const report = buildCalendarReport(activity, week, habits, now);
    expect(report.habitCheckIns).toBe(3);
    expect(report.habits).toEqual([
      { habitId: 1, title: 'Read', completions: 2, currentStreak: 2, bestStreak: 10 },
      { habitId: 9, title: 'Old habit', completions: 1, currentStreak: null, bestStreak: null },
      { habitId: 2, title: 'Run', completions: 0, currentStreak: 0, bestStreak: 4 },
    ]);
  });

  it('ranks busiest days by completions, then note time', () => {
    const activity = {
      ...emptyActivity('2026-10-12', '2026-10-18'),
      completed_tasks: [
        task({ id: 1, completed: true, completed_date: '2026-10-13T17:00:00Z' }),
        task({ id: 2, completed: true, completed_date: '2026-10-13T18:00:00Z' }),
        task({ id: 3, completed: true, completed_date: '2026-10-14T18:00:00Z' }),
      ],
      habit_completions: [{ habit_id: 1, habit_title: 'Read', date: '2026-10-15', estimated_time: null }],
      note_sessions: [
        { id: 1, note_id: 7, note_title: 'Essay', started_at: '2026-10-15T16:00:00Z', ended_at: '2026-10-15T17:00:00Z', duration_seconds: 3600 },
        { id: 2, note_id: 7, note_title: 'Essay', started_at: '2026-10-16T16:00:00Z', ended_at: '2026-10-16T17:00:00Z', duration_seconds: 3600 },
      ],
    };
    const report = buildCalendarReport(activity, week, [], now);
    expect(report.busiestDays.map(d => d.dateStr)).toEqual(['2026-10-13', '2026-10-15', '2026-10-14']);
    expect(report.activeDays).toBe(4);
  });

  it('marks today and future buckets', () => {
    const report = buildCalendarReport(emptyActivity('2026-10-12', '2026-10-18'), week, [], now);
    expect(report.buckets.find(b => b.isCurrent)?.key).toBe('2026-10-15');
    expect(report.buckets.filter(b => b.isFuture).map(b => b.key)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
  });

  it('buckets a year by month', () => {
    const year = periodContaining('year', new Date(2026, 0, 1));
    const activity = {
      ...emptyActivity('2026-01-01', '2026-12-31'),
      completed_tasks: [
        task({ id: 1, completed: true, completed_date: '2026-03-05T18:00:00Z' }),
        task({ id: 2, completed: true, completed_date: '2026-03-20T18:00:00Z' }),
      ],
      habit_completions: [{ habit_id: 1, habit_title: 'Read', date: '2026-10-01', estimated_time: null }],
    };
    const report = buildCalendarReport(activity, year, [], now);
    expect(report.buckets).toHaveLength(12);
    expect(report.buckets[2]).toMatchObject({ key: '2026-03', tasksCompleted: 2, longLabel: 'March 2026' });
    expect(report.buckets[9]).toMatchObject({ key: '2026-10', habitsCompleted: 1, isCurrent: true });
    expect(report.buckets[10].isFuture).toBe(true);
  });
});

let nextCheckinId = 1;
const moodCheckin = (period_start: string, mood: number): MoodCheckin => ({
  id: nextCheckinId++, period_kind: 'day', period_start, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});

describe('daily activity and mood points', () => {
  const activity: CalendarActivity = {
    ...emptyActivity('2026-09-21', '2026-10-18'),
    completed_tasks: [
      task({ id: 1, completed: true, completed_date: '2026-09-30T18:00:00Z' }),
      task({ id: 2, completed: true, completed_date: '2026-09-30T19:00:00Z' }),
      task({ id: 3, completed: true, completed_date: '2026-10-20T19:00:00Z' }),
    ],
    habit_completions: [{ habit_id: 1, habit_title: 'Read', date: '2026-10-01', estimated_time: null }],
    note_sessions: [
      // Tue Sep 29 11:30pm → Wed Sep 30 12:45am local.
      { id: 1, note_id: 7, note_title: 'Essay', started_at: '2026-09-30T06:30:00Z', ended_at: '2026-09-30T07:45:00Z', duration_seconds: 4500 },
    ],
  };

  it('totals each day of a range, splitting note time at midnight', () => {
    const days = dailyActivity(activity, new Date(2026, 8, 21), new Date(2026, 9, 18));
    expect(days.get('2026-09-30')).toEqual({ dateStr: '2026-09-30', tasksCompleted: 2, habitsCompleted: 0, noteSeconds: 2700 });
    expect(days.get('2026-09-29')?.noteSeconds).toBe(1800);
    expect(days.get('2026-10-01')?.habitsCompleted).toBe(1);
    expect(days.has('2026-10-20')).toBe(false);
  });

  it('keeps one point per checked-in day in range, up to today, with zeros for quiet days', () => {
    const days = dailyActivity(activity, new Date(2026, 8, 21), new Date(2026, 9, 18));
    const byDay = new Map([
      ['2026-09-20', moodCheckin('2026-09-20', 5)],
      ['2026-09-30', moodCheckin('2026-09-30', 4)],
      ['2026-10-02', moodCheckin('2026-10-02', 2)],
      ['2026-10-16', moodCheckin('2026-10-16', 3)],
    ]);
    const now = new Date(2026, 9, 15, 12);
    const points = (metric: MoodMetric) =>
      moodActivityPoints(byDay, days, new Date(2026, 8, 21), new Date(2026, 9, 18), metric, now);
    expect(points('tasks')).toEqual([
      { dateStr: '2026-09-30', mood: 4, value: 2 },
      { dateStr: '2026-10-02', mood: 2, value: 0 },
    ]);
    // Note time is in whole minutes.
    expect(points('notes').map(p => p.value)).toEqual([45, 0]);
  });
});

describe('correlation stats', () => {
  it('ranks with ties sharing their average rank', () => {
    expect(ranks([10, 20, 30])).toEqual([1, 2, 3]);
    expect(ranks([3, 1, 3, 2])).toEqual([3.5, 1, 3.5, 2]);
    expect(ranks([5, 5, 5])).toEqual([2, 2, 2]);
  });

  it('computes Spearman’s rho, including with ties', () => {
    expect(spearman([1, 2, 3, 4], [10, 40, 90, 160])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    // Constant mood: nothing to rank against.
    expect(spearman([1, 2, 3, 4], [3, 3, 3, 3])).toBe(0);
    // Ranks x = [1, 2.5, 2.5, 4] and y = [1.5, 1.5, 3, 4] → r = 3.75 / 4.5.
    expect(spearman([1, 2, 2, 3], [1, 1, 2, 3])).toBeCloseTo(5 / 6, 10);
  });

  it('gives a two-sided p-value by the Fisher z approximation', () => {
    expect(rhoP(0, 30)).toBeCloseTo(1, 5);
    // z = atanh(0.5) · √(27 / 1.06) ≈ 2.772 → p ≈ 0.0056.
    expect(rhoP(0.5, 30)).toBeCloseTo(0.0056, 3);
    expect(rhoP(-0.5, 30)).toBeCloseTo(rhoP(0.5, 30), 10);
    expect(Number.isFinite(rhoP(1, 12))).toBe(true);
  });
});

/** n days where mood follows the metric: values cycle 0–4, mood tracks them (or not, with `noise`). */
const series = (n: number, relation: 'up' | 'down' | 'noise') =>
  Array.from({ length: n }, (_, i) => {
    const value = i % 5;
    const mood = relation === 'up' ? value + 1 : relation === 'down' ? 5 - value : [3, 1, 4, 5, 2, 3, 2, 5, 1, 4, 4, 2, 3, 1, 5][i % 15];
    return { value, mood };
  });

/** Mood follows the metric on all but the first `against` days, which go the other way. */
const mixed = (n: number, against: number) =>
  series(n, 'up').map((p, i) => (i < against ? { value: p.value, mood: 5 - p.value } : p));

describe('analyseCorrelation', () => {
  it('needs 10 days with a check-in', () => {
    expect(analyseCorrelation(series(9, 'up'))).toMatchObject({ n: 9, level: 'insufficient', rho: null });
    expect(analyseCorrelation(series(10, 'up')).level).not.toBe('insufficient');
  });

  it('needs at least 3 distinct metric values', () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({ value: i % 2, mood: (i % 5) + 1 }));
    expect(analyseCorrelation(flat)).toMatchObject({ n: 20, level: 'flat', rho: null });
  });

  it('caps the wording by sample size', () => {
    // A perfect link is only an early sign under 20 days…
    expect(analyseCorrelation(series(15, 'up')).level).toBe('early');
    // …moderate under 30…
    expect(analyseCorrelation(series(25, 'up'))).toMatchObject({ level: 'moderate', rho: 1 });
    // …and strong from 30.
    expect(analyseCorrelation(series(30, 'up')).level).toBe('strong');
    expect(analyseCorrelation(series(30, 'down'))).toMatchObject({ level: 'strong', rho: -1 });
  });

  it('reads weak or likely-chance results as no clear link', () => {
    const result = analyseCorrelation(series(30, 'noise'));
    expect(Math.abs(result.rho!)).toBeLessThan(0.15);
    expect(result.level).toBe('none');
  });

  it('labels slight and moderate links by strength', () => {
    const slight = analyseCorrelation(mixed(160, 60));
    expect(Math.abs(slight.rho!)).toBeGreaterThanOrEqual(0.15);
    expect(Math.abs(slight.rho!)).toBeLessThan(0.3);
    expect(slight.level).toBe('slight');
    const moderate = analyseCorrelation(mixed(100, 30));
    expect(moderate.rho!).toBeGreaterThanOrEqual(0.3);
    expect(moderate.rho!).toBeLessThan(0.5);
    expect(moderate.level).toBe('moderate');
  });

  it('splits days at the median for the "on days you…" comparison', () => {
    const result = analyseCorrelation(series(30, 'up'));
    expect(result.threshold).toBe(2);
    expect(result.highAverage).toBeCloseTo(4);
    expect(result.lowAverage).toBeCloseTo(1.5);
  });

  it('moves the split up when the median is also the minimum', () => {
    const mostlyZero = Array.from({ length: 12 }, (_, i) => ({ value: i < 8 ? 0 : i - 7, mood: i < 8 ? 2 : 4 }));
    const result = analyseCorrelation(mostlyZero);
    expect(result.threshold).toBe(1);
    expect([result.highAverage, result.lowAverage]).toEqual([4, 2]);
  });
});

describe('describeCorrelation', () => {
  const describeSeries = (metric: MoodMetric, points: { value: number; mood: number }[], scope = 'this month') =>
    describeCorrelation(metric, analyseCorrelation(points), scope);

  it('asks for more days below 10 check-ins', () => {
    expect(describeSeries('tasks', series(5, 'up'))).toBe(
      'Check in on a few more days to see how your tasks and your mood connect. You have 5 days with a check-in this month, and about 10 are needed.',
    );
  });

  it('says when the metric barely varied', () => {
    const flat = Array.from({ length: 12 }, (_, i) => ({ value: 0, mood: (i % 5) + 1 }));
    expect(describeSeries('notes', flat)).toBe('Your time in notes was about the same every day this month, so there’s nothing to compare with your mood yet.');
  });

  it('compares the two halves when there is no clear link', () => {
    // Every metric value gets moods 2 and 4 equally often.
    const unrelated = Array.from({ length: 30 }, (_, i) => ({ value: i % 5, mood: 2 + 2 * (i % 2) }));
    expect(describeSeries('habits', unrelated)).toBe(
      'This month, your mood was about the same on days you checked off 2 or more habits as on other days, so habits don’t seem to affect how you feel.',
    );
    // A gap in the split that the ranks don't back up isn't called the same.
    expect(describeSeries('habits', series(30, 'noise'))).toBe(
      'This month, you sometimes felt better on days you checked off 2 or more habits, but not often enough to count as a pattern. For now, habits don’t seem to affect how you feel.',
    );
  });

  it('reads as no clear link when the split goes against the ranks', () => {
    const humped = [
      ...Array.from({ length: 24 }, () => ({ value: 0, mood: 1 })),
      ...Array.from({ length: 32 }, () => ({ value: 1, mood: 5 })),
      ...Array.from({ length: 64 }, () => ({ value: 2, mood: 3 })),
    ];
    const result = analyseCorrelation(humped);
    expect(result.rho!).toBeGreaterThanOrEqual(0.15);
    expect(result.p!).toBeLessThanOrEqual(0.1);
    expect(result.level).toBe('none');
    expect(describeCorrelation('tasks', result, 'this year')).toBe(
      'This year, your mood was about the same on days you completed 2 or more tasks as on other days, so tasks don’t seem to affect how you feel.',
    );
  });

  it('hedges an early sign', () => {
    expect(describeSeries('habits', series(15, 'up'))).toBe(
      'This month, you seemed to feel better on days you checked off 2 or more habits. It’s based on only 15 days, so it could be chance — check back in a few weeks.',
    );
  });

  it('calls a link under 30 days a hint, and never strong', () => {
    expect(describeSeries('tasks', series(25, 'down'), 'in September 2026')).toBe(
      'In September 2026, you tended to feel worse on days you completed 2 or more tasks. It may be worth noticing how those days leave you feeling. This is based on only 25 days, so take it as a hint.',
    );
  });

  it('says how sure a slight or moderate link over 30 days is', () => {
    expect(describeSeries('tasks', mixed(160, 60), 'in 2026')).toBe(
      'In 2026, you felt slightly better on days you completed 2 or more tasks. It was a small but steady difference across 160 days, so getting things done may be good for your mood.',
    );
    expect(describeSeries('habits', mixed(100, 30), 'in 2026')).toBe(
      'In 2026, you tended to feel better on days you checked off 2 or more habits. It showed up across 100 days, so keeping up your habits may be good for your mood.',
    );
  });

  it('calls it a clear pattern only for a strong link over 30 days or more', () => {
    const notes = series(30, 'up').map(p => ({ ...p, value: p.value * 20 }));
    expect(describeSeries('notes', notes, 'in 2026')).toBe(
      'In 2026, you usually felt better on days you spent 40m or more in notes. It was a clear pattern across 30 days, so time in your notes may be good for your mood.',
    );
  });

  it('never claims a cause', () => {
    const banned = /\b(because|causes?|caused|makes you|made you|boosts?|you should)\b/i;
    const results: CorrelationResult[] = [];
    for (const n of [5, 12, 15, 25, 30, 60, 160]) {
      for (const relation of ['up', 'down', 'noise'] as const) results.push(analyseCorrelation(series(n, relation)));
    }
    results.push(analyseCorrelation(Array.from({ length: 12 }, () => ({ value: 1, mood: 3 }))));
    results.push(analyseCorrelation(mixed(160, 60)), analyseCorrelation(mixed(100, 30)));
    results.push(analyseCorrelation(Array.from({ length: 30 }, (_, i) => ({ value: i % 5, mood: 2 + 2 * (i % 2) }))));
    expect(new Set(results.map(r => r.level))).toEqual(new Set(['insufficient', 'flat', 'none', 'early', 'slight', 'moderate', 'strong']));
    for (const result of results) {
      for (const metric of ['tasks', 'notes', 'habits'] as const) {
        for (const scope of ['this week', 'in 2026', 'in October 2026']) {
          const text = describeCorrelation(metric, result, scope);
          expect(text).not.toMatch(banned);
          // Everyday words, in one to three short sentences.
          expect(text).not.toMatch(/correlat|significan|median|average|rho|ρ|statistic|link strength/i);
          expect(text.split(/[.!?](?:\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

describe('describeLinkBrief', () => {
  it('names the link with its direction', () => {
    expect(describeLinkBrief('tasks', analyseCorrelation(series(30, 'up')), 'this month')).toBe(
      'Strong link: better mood on days with more tasks completed this month',
    );
    expect(describeLinkBrief('notes', analyseCorrelation(series(15, 'down')), 'in 2026')).toBe(
      'Early sign: worse mood on days with more time in notes in 2026',
    );
  });
});
