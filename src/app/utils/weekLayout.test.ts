import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildWeekEvents,
  layoutDayEvents,
  minutesToTimeStr,
  parseTimeToMinutes,
  snapMinutes,
  startOfWeek,
  TimedEvent,
} from './weekLayout';

// Mon 19 Oct 2026, local midnight.
const weekStart = new Date(2026, 9, 19);

const empty = { scheduledTasks: [], completedTasks: [], noteSessions: [], habitCompletions: [] };

const timedEvent = (key: string, drawStartMin: number, drawEndMin: number): TimedEvent => ({
  key, kind: 'task', title: key, dayIndex: 0,
  startMin: drawStartMin, endMin: drawEndMin, drawStartMin, drawEndMin,
});

describe('week arithmetic', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek(new Date(2026, 9, 21, 15, 30))).toEqual(weekStart); // Wednesday
    expect(startOfWeek(new Date(2026, 9, 25, 23, 59))).toEqual(weekStart); // Sunday
    expect(startOfWeek(weekStart)).toEqual(weekStart);
  });

  it('steps calendar days across month ends', () => {
    expect(addDays(new Date(2026, 9, 31), 1)).toEqual(new Date(2026, 10, 1));
  });

  it('parses, formats and snaps times', () => {
    expect(parseTimeToMinutes('09:30:00')).toBe(570);
    expect(parseTimeToMinutes('9:05')).toBe(545);
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('')).toBeNull();
    expect(minutesToTimeStr(570)).toBe('09:30');
    expect(snapMinutes(589)).toBe(570);
    expect(snapMinutes(589, 15)).toBe(585);
  });
});

describe('buildWeekEvents', () => {
  it('places a timed task at its due time, sized by its estimate in hours', () => {
    const { timed, allDay } = buildWeekEvents({
      ...empty, weekStart,
      scheduledTasks: [{ id: 1, title: 'Essay', due_date: '2026-10-21', due_time: '14:00:00', estimated_time: 1.5, completed: false }],
    });
    expect(allDay).toEqual([]);
    expect(timed).toMatchObject([{ kind: 'task', taskId: 1, dayIndex: 2, startMin: 840, endMin: 930, drawStartMin: 840, drawEndMin: 930 }]);
  });

  it('gives an unestimated task the default height and clamps long tasks to midnight', () => {
    const { timed } = buildWeekEvents({
      ...empty, weekStart,
      scheduledTasks: [
        { id: 1, title: 'A', due_date: '2026-10-19', due_time: '08:00', estimated_time: null, completed: false },
        { id: 2, title: 'B', due_date: '2026-10-19', due_time: '23:00', estimated_time: 3, completed: false },
      ],
    });
    expect(timed.find(e => e.taskId === 1)).toMatchObject({ startMin: 480, endMin: 510 });
    expect(timed.find(e => e.taskId === 2)).toMatchObject({ startMin: 1380, endMin: 1440 });
  });

  it('puts tasks with a date but no time in the all-day row and skips other weeks', () => {
    const { timed, allDay } = buildWeekEvents({
      ...empty, weekStart,
      scheduledTasks: [
        { id: 1, title: 'Anytime', due_date: '2026-10-25', due_time: null, estimated_time: 2, completed: true },
        { id: 2, title: 'Next week', due_date: '2026-10-26', due_time: '09:00', estimated_time: 1, completed: false },
        { id: 3, title: 'Undated', due_date: null, due_time: null, estimated_time: 1, completed: false },
      ],
    });
    expect(timed).toEqual([]);
    expect(allDay).toEqual([{ key: 'task-1', kind: 'task', title: 'Anytime', dayIndex: 6, taskId: 1, completed: true }]);
  });

  it('marks completions at their local completion instant', () => {
    const at = new Date(2026, 9, 20, 16, 45);
    const { timed } = buildWeekEvents({
      ...empty, weekStart,
      completedTasks: [
        { id: 7, title: 'Done', completed_date: at.toISOString() },
        { id: 8, title: 'Legacy', completed_date: null },
      ],
    });
    expect(timed).toMatchObject([{ kind: 'completed', taskId: 7, dayIndex: 1, startMin: 1005, drawStartMin: 1005, drawEndMin: 1035 }]);
  });

  it('keeps a completion marker inside the day when it lands just before midnight', () => {
    const { timed } = buildWeekEvents({
      ...empty, weekStart,
      completedTasks: [{ id: 7, title: 'Late', completed_date: new Date(2026, 9, 19, 23, 50).toISOString() }],
    });
    expect(timed[0]).toMatchObject({ startMin: 1430, drawStartMin: 1410, drawEndMin: 1440 });
  });

  it('splits a note session that runs past midnight across both days', () => {
    const { timed } = buildWeekEvents({
      ...empty, weekStart,
      noteSessions: [{
        id: 3, note_id: 9, note_title: 'Lecture', duration_seconds: 5400,
        started_at: new Date(2026, 9, 21, 23, 30).toISOString(),
        ended_at: new Date(2026, 9, 22, 1, 0).toISOString(),
      }],
    });
    expect(timed).toMatchObject([
      { kind: 'note', noteId: 9, dayIndex: 2, startMin: 1410, endMin: 1440 },
      { kind: 'note', noteId: 9, dayIndex: 3, startMin: 0, endMin: 60 },
    ]);
  });

  it('pads a short session to the minimum drawn height and drops one ending at midnight from the next day', () => {
    const { timed } = buildWeekEvents({
      ...empty, weekStart,
      noteSessions: [
        {
          id: 1, note_id: 1, note_title: '', duration_seconds: 120,
          started_at: new Date(2026, 9, 19, 10, 0).toISOString(),
          ended_at: new Date(2026, 9, 19, 10, 2).toISOString(),
        },
        {
          id: 2, note_id: 2, note_title: 'Late', duration_seconds: 1800,
          started_at: new Date(2026, 9, 19, 23, 30).toISOString(),
          ended_at: new Date(2026, 9, 20, 0, 0).toISOString(),
        },
      ],
    });
    expect(timed).toMatchObject([
      { title: 'Untitled note', dayIndex: 0, startMin: 600, endMin: 602, drawStartMin: 600, drawEndMin: 620 },
      { title: 'Late', dayIndex: 0, startMin: 1410, endMin: 1440 },
    ]);
    expect(timed).toHaveLength(2);
  });

  it('puts habit completions in the all-day row of their date', () => {
    const { allDay } = buildWeekEvents({
      ...empty, weekStart,
      habitCompletions: [
        { habit_id: 4, habit_title: 'Run', date: '2026-10-23', estimated_time: null },
        { habit_id: 4, habit_title: 'Run', date: '2026-10-18', estimated_time: null },
      ],
    });
    expect(allDay).toEqual([{ key: 'habit-4-2026-10-23', kind: 'habit', title: 'Run', dayIndex: 4, habitId: 4 }]);
  });
});

describe('layoutDayEvents', () => {
  it('leaves non-overlapping blocks full width', () => {
    const laid = layoutDayEvents([timedEvent('a', 60, 120), timedEvent('b', 120, 180)]);
    expect(laid.map(e => [e.key, e.column, e.columns])).toEqual([['a', 0, 1], ['b', 0, 1]]);
  });

  it('splits overlapping blocks into columns shared across the cluster', () => {
    const laid = layoutDayEvents([
      timedEvent('long', 60, 240),
      timedEvent('mid', 90, 150),
      timedEvent('late', 160, 200),
      timedEvent('after', 300, 330),
    ]);
    const byKey = Object.fromEntries(laid.map(e => [e.key, [e.column, e.columns]]));
    expect(byKey).toEqual({ long: [0, 2], mid: [1, 2], late: [1, 2], after: [0, 1] });
  });
});
