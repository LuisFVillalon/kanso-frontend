import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { Habit } from '@/app/types/habit';
import {
  buildCalendarReport,
  describePeriod,
  elapsedDays,
  formatPeriodLabel,
  periodContaining,
  periodLength,
  shiftPeriod,
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
