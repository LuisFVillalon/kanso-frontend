import { describe, expect, it, vi } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';

vi.mock('@/app/lib/backend-api', () => ({ fetchCalendarActivity: vi.fn() }));

import { buildSlotState } from '@/app/hooks/useSlotPlanner';
import { fitsToday, freeTimeToday, hoursMinutes, nextFreeAfterToday, nextWorkStart } from './freeTimeToday';

// The board's sample day: Wed Nov 11 2026, 2:40 PM, work window 9 AM–8 PM.
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 14, 40);
const PROFILE = { dayStartTime: '09:00', shutoffTime: '20:00', restDays: [0, 6] };

const ev = (title: string, start: string, end: string, extra: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: title.length, occurrence_date: TODAY, title, description: null, tags: [], all_day: false,
  date: TODAY, end_date: TODAY, start_time: start, end_time: end, starts_at: '', ends_at: '', time_zone: 'UTC',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false, ...extra,
});
const block = (id: number, start: string, end: string, extra: Partial<WorkBlock> = {}): WorkBlock => ({
  id, task_id: null, habit_id: null, title: '', tags: [], date: TODAY, start_time: start, end_time: end,
  time_zone: 'UTC', starts_at: '', ends_at: '', ...extra,
});
const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null, tags: [],
  created_date: '2026-11-01', completed_date: null, estimated_time: 0.5, ...extra,
});
const habit = (id: number, extra: Partial<Habit> = {}): Habit => ({
  id, title: `Habit ${id}`, current_streak: 0, max_streak: 0, logged_today: false, tags: [], estimated_time: 0.5, ...extra,
});

const EVENTS = [
  ev('Morning lecture', '10:00:00', '11:00:00'), // already past
  ev('Office hours', '15:00:00', '15:30:00'),
  ev('Career fair', '00:00:00', '23:59:00', { all_day: true }),
  ev('Declined sync', '18:00:00', '19:00:00', { busy: false }),
];
const BLOCKS = [
  block(1, '16:00', '18:00', { task_id: 7 }),
  block(2, '19:00', '19:30', { habit_id: 3 }),
];

const stateWith = ({ now = NOW, events = EVENTS, workBlocks = BLOCKS, tasks = [] as Task[], habits = [] as Habit[], profile = PROFILE } = {}) =>
  buildSlotState({ now, profile: profile as never, tasks, habits, events, workBlocks });

describe('freeTimeToday', () => {
  it('sums the free gaps from now to the end of the work window', () => {
    const ft = freeTimeToday(stateWith(), TODAY)!;
    // From 2:45 (now on the 15-minute grid): 2:45–3:00, 3:30–4:00, 6:00–7:00, 7:30–8:00.
    expect(ft.gaps).toEqual([[885, 900], [930, 960], [1080, 1140], [1170, 1200]]);
    expect(ft.free).toBe(135);
    expect(hoursMinutes(ft.free)).toBe('2h 15m');
    expect(ft.from).toBe(885);
    expect(ft.window).toEqual([540, 1200]);
    expect(ft.ended).toBe(false);
  });

  it('splits the rest of the day into work blocks, events and habit holds', () => {
    const ft = freeTimeToday(stateWith(), TODAY)!;
    expect(ft.totals).toEqual({ block: 120, event: 30, habit: 30 });
    expect(ft.busy.map(p => p.kind)).toEqual(['event', 'block', 'habit']);
  });

  it('gives no time to all-day events or ones shown as free', () => {
    const ft = freeTimeToday(stateWith({ events: [EVENTS[2], EVENTS[3]], workBlocks: [] }), TODAY)!;
    expect(ft.free).toBe(1200 - 885);
    expect(ft.totals.event).toBe(0);
  });

  it("doesn't take time for habits with no hold today", () => {
    const ft = freeTimeToday(stateWith({ habits: [habit(9, { planned_time: '17:00' })], workBlocks: [] }), TODAY)!;
    expect(ft.totals.habit).toBe(0);
    expect(ft.free).toBe(1200 - 885 - 30);
  });

  it('is null on a rest day', () => {
    const saturday = new Date(2026, 10, 14, 11, 0);
    expect(freeTimeToday(stateWith({ now: saturday }), '2026-11-14')).toBeNull();
  });

  it('is 0 after shutoff', () => {
    const late = new Date(2026, 10, 11, 20, 30);
    const ft = freeTimeToday(stateWith({ now: late }), TODAY)!;
    expect(ft.ended).toBe(true);
    expect(ft.free).toBe(0);
    expect(ft.busy).toEqual([]);
  });

  it('starts at the window when now is before it', () => {
    const early = new Date(2026, 10, 11, 7, 0);
    const ft = freeTimeToday(stateWith({ now: early, events: [], workBlocks: [] }), TODAY)!;
    expect(ft.from).toBe(540);
    expect(ft.free).toBe(660);
  });
});

describe('nextWorkStart / nextFreeAfterToday', () => {
  it('skips rest days', () => {
    const friday = new Date(2026, 10, 13, 21, 0);
    expect(nextWorkStart(stateWith({ now: friday }), '2026-11-13')).toEqual({ date: '2026-11-16', start: 540 });
  });

  it('finds the first free gap after today', () => {
    expect(nextFreeAfterToday(stateWith(), TODAY)).toEqual({ date: '2026-11-12', start: 540 });
  });
});

describe('fitsToday', () => {
  const tasks = [
    task(1, 'Lab report', { due_date: '2026-11-13' }),
    task(2, 'Slipped essay', { due_date: '2026-11-09' }),
    task(3, 'Quiz prep', { due_date: '2026-11-12' }),
    task(7, 'Already planned', { due_date: '2026-11-11' }),
    task(8, 'Done', { due_date: '2026-11-11', completed: true }),
    task(9, 'Far away', { due_date: '2027-02-01' }),
    task(10, 'No due date'),
  ];
  const fits = (list = tasks, max?: number) => {
    const S = stateWith({ tasks: list, events: [], workBlocks: BLOCKS });
    return fitsToday(S, list, BLOCKS, TODAY, max);
  };

  it('puts slipped tasks first, then by due date', () => {
    expect(fits(tasks, 5).map(f => f.task.title)).toEqual(['Slipped essay', 'Quiz prep', 'Lab report']);
  });

  it('skips tasks that already have a work block today', () => {
    expect(fits(tasks, 5).map(f => f.task.id)).not.toContain(7);
  });

  it('offers at most 2 by default', () => {
    expect(fits()).toHaveLength(2);
  });

  it("places each in a slot today that doesn't overlap the one before", () => {
    const [a, b] = fits();
    expect(a.slot.date).toBe(TODAY);
    expect(b.slot.date).toBe(TODAY);
    expect(a.slot.start < b.slot.end && b.slot.start < a.slot.end).toBe(false);
    expect(a.slot.end - a.slot.start).toBe(30);
  });

  it('leaves out tasks that no longer fit today', () => {
    const big = [task(1, 'Huge', { due_date: '2026-11-12', estimated_time: 6 })];
    expect(fits(big)).toEqual([]);
  });
});
