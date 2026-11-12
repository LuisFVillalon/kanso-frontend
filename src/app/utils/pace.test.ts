import { describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import { periodContaining, shiftPeriod } from '@/app/utils/calendarReport';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import { buildPace, formatPace, ordinal, paceDelta, pacePoint, roundPace } from './pace';

vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

const workDays: WorkDaySettings = { restDays: [0, 6], dayStartTime: '09:00', shutoffTime: '17:00', dayWindows: {} };

const activity = (parts: Partial<CalendarActivity> = {}): CalendarActivity => ({
  start_date: '2026-01-01', end_date: '2026-12-31',
  scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [], events: [],
  ...parts,
});

const task = (id: number, completed: Date): ActivityTask => ({
  id, title: `Task ${id}`, category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
  completed: true, completed_date: completed.toISOString(), parent_task_id: null, tags: [],
});

const habit = (date: string) => ({ habit_id: 1, habit_title: 'Run', date, estimated_time: null });

const session = (id: number, start: Date, minutes: number) => ({
  id, note_id: 1, note_title: 'Notes', started_at: start.toISOString(),
  ended_at: new Date(start.getTime() + minutes * 60000).toISOString(), duration_seconds: minutes * 60,
});

const event = (id: number, start: Date, end: Date): EventOccurrence => {
  const date = start.toISOString().slice(0, 10);
  return {
    event_id: id, occurrence_date: date, title: `Event ${id}`, description: null, tags: [], all_day: false,
    date, end_date: date, start_time: null, end_time: null,
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    time_zone: 'America/Los_Angeles', repeat_days: [], repeat_interval: 1, reminder_minutes: null,
    edited: false, past: false, archived: false,
  };
};

const day = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('pacePoint', () => {
  it('compares a week with last week’s same weekday', () => {
    const now = day(2026, 11, 11, 17);
    const point = pacePoint(periodContaining('week', now), now);
    expect(point).toMatchObject({ days: 3, previousDays: 3, finished: false });
    expect(iso(point.previousDate)).toBe('2026-11-04');
  });

  it('compares a month with the same day of last month', () => {
    const now = day(2026, 11, 11);
    const point = pacePoint(periodContaining('month', now), now);
    expect(point).toMatchObject({ days: 11, previousDays: 11 });
    expect(iso(point.previousDate)).toBe('2026-10-11');
  });

  it('clamps to last month’s last day: Oct 31 against Sep 30, Mar 31 against Feb 28', () => {
    const oct = day(2026, 10, 31);
    expect(pacePoint(periodContaining('month', oct), oct)).toMatchObject({ days: 31, previousDays: 30 });
    const mar = day(2026, 3, 31);
    const point = pacePoint(periodContaining('month', mar), mar);
    expect(point).toMatchObject({ days: 31, previousDays: 28 });
    expect(iso(point.previousDate)).toBe('2026-02-28');
  });

  it('compares a year with the same date last year, Feb 29 with Feb 28', () => {
    const nov = day(2026, 11, 11);
    const point = pacePoint(periodContaining('year', nov), nov);
    expect(point).toMatchObject({ days: 315, previousDays: 315 });
    expect(iso(point.previousDate)).toBe('2025-11-11');

    const leap = day(2028, 2, 29);
    const leapPoint = pacePoint(periodContaining('year', leap), leap);
    expect(leapPoint).toMatchObject({ days: 60, previousDays: 59 });
    expect(iso(leapPoint.previousDate)).toBe('2027-02-28');
  });

  it('compares a finished period whole', () => {
    const now = day(2026, 11, 11);
    expect(pacePoint(shiftPeriod(periodContaining('week', now), -1), now))
      .toMatchObject({ days: 7, previousDays: 7, finished: true });
    // November has 30 days and October 31.
    expect(pacePoint(shiftPeriod(periodContaining('month', now), -1), now))
      .toMatchObject({ days: 31, previousDays: 30, finished: true });
  });
});

describe('buildPace', () => {
  const now = day(2026, 11, 11, 17);
  const week = periodContaining('week', now);

  it('runs this week to today against last week to the same weekday', () => {
    const cur = activity({
      completed_tasks: [task(1, day(2026, 11, 9, 10)), task(2, day(2026, 11, 11, 9))],
      habit_completions: [habit('2026-11-10')],
      note_sessions: [session(1, day(2026, 11, 10, 8), 45)],
    });
    const prev = activity({
      // Wednesday's task counts; Thursday's is past the same point.
      completed_tasks: [task(3, day(2026, 11, 4, 12)), task(4, day(2026, 11, 5, 12))],
      habit_completions: [habit('2026-11-02'), habit('2026-11-03')],
    });
    const pace = buildPace(cur, prev, week, workDays, now);
    expect(pace.hasPrevious).toBe(true);
    expect(pace.hasCurrent).toBe(true);
    expect(pace.metrics.tasks).toMatchObject({ current: 2, previous: 1, previousTotal: 2 });
    expect(pace.metrics.habits).toMatchObject({ current: 1, previous: 2 });
    expect(pace.metrics.notes.current).toBe(45 * 60);
    expect(pace.metrics.tasks.currentPoints).toEqual([1, 1, 2]);
    expect(pace.metrics.tasks.previousPoints).toEqual([0, 0, 1, 2, 2, 2, 2]);
  });

  it('compares a finished week’s whole total', () => {
    const last = shiftPeriod(week, -1);
    const cur = activity({ completed_tasks: [task(1, day(2026, 11, 2, 9)), task(2, day(2026, 11, 8, 9))] });
    const prev = activity({ completed_tasks: [task(3, day(2026, 10, 31, 9))] });
    const pace = buildPace(cur, prev, last, workDays, now);
    expect(pace.finished).toBe(true);
    expect(pace.metrics.tasks).toMatchObject({ current: 2, previous: 1 });
    expect(pace.metrics.tasks.currentPoints).toHaveLength(7);
  });

  it('counts events only up to now, and overlapping ones once', () => {
    const cur = activity({
      events: [
        // Monday 9–12 and 10–1 overlap: 4h.
        event(1, day(2026, 11, 9, 9), day(2026, 11, 9, 12)),
        event(2, day(2026, 11, 9, 10), day(2026, 11, 9, 13)),
        // Wednesday 4–6 PM is half over at 5.
        event(3, day(2026, 11, 11, 16), day(2026, 11, 11, 18)),
        // Thursday hasn't happened yet.
        event(4, day(2026, 11, 12, 9), day(2026, 11, 12, 12)),
      ],
    });
    const pace = buildPace(cur, null, week, workDays, now);
    expect(pace.metrics.events.current).toBe(5 * 3600);
    expect(pace.metrics.events.currentPoints).toEqual([4 * 3600, 4 * 3600, 5 * 3600]);
  });

  it('has nothing to compare with when last period is empty', () => {
    const cur = activity({ completed_tasks: [task(1, day(2026, 11, 9, 10))] });
    const pace = buildPace(cur, activity(), week, workDays, now);
    expect(pace.hasPrevious).toBe(false);
    expect(pace.hasCurrent).toBe(true);
    expect(buildPace(activity(), activity(), week, workDays, now).hasCurrent).toBe(false);
  });

  it('gives a year one point per month, the current month at today’s total', () => {
    const year = periodContaining('year', now);
    const cur = activity({ completed_tasks: [task(1, day(2026, 1, 15, 10)), task(2, day(2026, 11, 2, 10)), task(3, day(2026, 11, 10, 10))] });
    const prev = activity({ completed_tasks: [task(4, day(2025, 11, 5, 10)), task(5, day(2025, 11, 20, 10))] });
    const pace = buildPace(cur, prev, year, workDays, now);
    expect(pace.metrics.tasks.currentPoints).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3]);
    expect(pace.metrics.tasks.previousPoints).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2]);
    // Last year's Nov 20 is past the same point.
    expect(pace.metrics.tasks).toMatchObject({ current: 3, previous: 1 });
  });
});

describe('deltas and formats', () => {
  it('rounds time to whole minutes before comparing', () => {
    expect(roundPace('notes', 89)).toBe(60);
    expect(paceDelta('notes', 125, 100)).toEqual({ direction: 'equal', amount: 0 });
    expect(paceDelta('events', 2 * 3600, 3600 + 20)).toEqual({ direction: 'up', amount: 3600 });
    expect(paceDelta('tasks', 3, 5)).toEqual({ direction: 'down', amount: 2 });
    expect(paceDelta('habits', 4, 4)).toEqual({ direction: 'equal', amount: 0 });
  });

  it('shows counts as whole numbers and time like the stat tiles', () => {
    expect(formatPace('tasks', 12)).toBe('12');
    expect(formatPace('notes', 0)).toBe('0m');
    expect(formatPace('notes', 20)).toBe('0m');
    expect(formatPace('notes', 9000)).toBe('2h 30m');
    expect(formatPace('events', 3600)).toBe('1h');
  });

  it('names days of the month', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
  });
});
