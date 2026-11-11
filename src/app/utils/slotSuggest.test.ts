import { describe, expect, it } from 'vitest';
import {
  afterWorkHours, freeMinutesOn, freeTime, habitNearestToday, habitTime, habitsToday, planRange, rankSlots, rawGaps, resuggest, slotReason,
  splitFill, spread, suggest, type BusyItem, type HabitInput, type SlotState, type Span, type TaskInput,
} from './slotSuggest';

// The prototype board's sample week. "Now" is Wed Nov 11 2026, 11:20 AM.
const H = (h: number, m = 0) => h * 60 + m;
// Mon–Thu 9 AM – 7 PM, Fri 9 AM – 5 PM, Sat/Sun rest.
const WINDOWS: Record<number, Span> = { 1: [H(9), H(19)], 2: [H(9), H(19)], 3: [H(9), H(19)], 4: [H(9), H(19)], 5: [H(9), H(17)] };
const windowOn = (date: string): Span | null => WINDOWS[new Date(`${date}T12:00`).getDay()] ?? null;
const ev = (date: string, title: string, start: number, end: number, extra: Partial<BusyItem> = {}): BusyItem =>
  ({ date, title, start, end, ...extra });
const EVENTS: BusyItem[] = [
  ev('2026-11-11', 'COMM 103 lecture', H(10), H(11, 15)),
  ev('2026-11-11', 'Study group', H(12), H(13)),
  ev('2026-11-11', 'Shift at the library', H(14), H(17)),
  ev('2026-11-12', 'Team sync', H(9, 30), H(10)),
  ev('2026-11-12', 'Dept all-hands', H(11), H(12), { busy: false }),
  ev('2026-11-12', 'BIO 210 lab', H(13), H(16)),
  ev('2026-11-13', 'Shift at the library', H(9), H(13)),
  ev('2026-11-13', 'Coffee w/ Sam', H(15), H(15, 30), { busy: false }),
  ev('2026-11-16', 'COMM 103 lecture', H(10), H(11, 15)),
  ev('2026-11-16', 'Shift at the library', H(14), H(17)),
  ev('2026-11-17', 'Team sync', H(9, 30), H(10)),
  ev('2026-11-17', 'BIO 210 lecture', H(11), H(12, 15)),
];
const HABITS: HabitInput[] = [
  { id: 1, title: 'Morning run', len: 30, time: null, done: true },
  { id: 2, title: 'Read 20 pages', len: 30, time: null, done: false },
  { id: 3, title: 'Spanish practice', len: 30, time: null, done: false },
];
const TASKS: TaskInput[] = [
  { id: 11, title: 'Lab report draft', len: 120, due: { date: '2026-11-12', min: H(13) }, planned: false },
  { id: 12, title: 'Problem set 6', len: 60, due: { date: '2026-11-13', min: H(17) }, planned: false },
];
const NOW = { date: '2026-11-11', min: H(11, 20) };
const sample = (patch: Partial<SlotState> = {}): SlotState =>
  ({ now: NOW, windowOn, events: EVENTS, habits: HABITS, tasks: TASKS, blocks: [], ...patch });

const at = (s: { date: string; start: number; end: number } | null) => s && `${s.date} ${s.start}-${s.end}`;
const range = (date: string, min: number) => planRange(NOW, date, min)!;

describe('suggest: soonest, one per day, avoid the due day', () => {
  it('ranks days before the due date first, one per day', () => {
    const { slots } = suggest(sample(), 60, range('2026-11-16', H(10)));
    expect(slots.map(at)).toEqual(['2026-11-11 1020-1080', '2026-11-12 720-780', '2026-11-13 780-840']);
  });

  it('brings in the due day, then a second slot on a used day, when too few days come before it', () => {
    const { slots } = suggest(sample(), 60, range('2026-11-12', H(17)));
    expect(slots.map(at)).toEqual(['2026-11-11 780-840', '2026-11-12 720-780', '2026-11-11 1020-1080']);
  });

  it('offers only today when the task is due today', () => {
    const { slots, days } = suggest(sample(), 60, range('2026-11-11', H(19)));
    expect(slots.map(at)).toEqual(['2026-11-11 780-840', '2026-11-11 1020-1080']);
    // 1:00–2:00 PM and 5:00–6:00 PM are left once the habits hold 6:00–7:00 PM.
    expect(freeMinutesOn(days, '2026-11-11')).toBe(150);
  });

  it('leaves a declined or "show as free" event and all-day events free', () => {
    const gaps = rawGaps(sample(), '2026-11-12');
    expect(gaps).toEqual([[H(9), H(9, 30)], [H(10), H(13)], [H(16), H(19)]]);
    const allDay = rawGaps(sample({ events: [ev('2026-11-12', 'Holiday', 0, 1440, { allDay: true })] }), '2026-11-12');
    expect(allDay).toEqual([[H(9), H(19)]]);
  });

  it('holds tasks due sooner in their soonest gap and habits at the end of the day', () => {
    const days = freeTime(sample(), '2026-11-12', { date: '2026-11-13', min: 0 });
    expect(days[1].gaps).toEqual([[H(9), H(9, 30)], [H(12), H(13)], [H(16), H(17, 30)]]);
  });

  it('does not hold a task that already has a kept block', () => {
    const planned = sample({ tasks: TASKS.map(t => ({ ...t, planned: true })) });
    const days = freeTime(planned, '2026-11-12', { date: '2026-11-13', min: 0 });
    expect(days[1].gaps).toEqual([[H(9), H(9, 30)], [H(10), H(13)], [H(16), H(17, 30)]]);
  });

  it('treats kept work blocks as busy', () => {
    const { slots } = suggest(sample({ blocks: [{ date: '2026-11-11', start: H(17), end: H(18), taskId: 99 }] }), 60, range('2026-11-16', H(10)));
    expect(slots[0].date).toBe('2026-11-12');
  });

  it('has nothing on rest days, before the window opens or with no window at all', () => {
    expect(rawGaps(sample(), '2026-11-14')).toEqual([]);
    expect(rawGaps(sample({ windowOn: () => null }), '2026-11-11')).toEqual([]);
    expect(suggest(sample({ windowOn: () => null }), 60, range('2026-11-16', H(10))).slots).toEqual([]);
  });

  it('cuts the deadline day at the due time', () => {
    const days = freeTime(sample({ tasks: [], habits: [] }), '2026-11-16', { date: '2026-11-16', min: H(10) });
    expect(days[days.length - 1].gaps).toEqual([[H(9), H(10)]]);
  });

  it('holds a habit at its usual time each day', () => {
    const habits = HABITS.map(h => (h.id === 3 ? { ...h, time: H(13) } : h));
    const days = freeTime(sample({ habits, tasks: [] }), '2026-11-12', { date: '2026-11-13', min: 0 });
    expect(days[1].gaps.some(([s, e]) => s < H(13, 30) && e > H(13))).toBe(false);
  });
});

describe('planRange', () => {
  it('covers the next 7 days without a due date', () => {
    expect(planRange(NOW, null, null)).toEqual({ until: '2026-11-17', due: { date: '2026-11-18', min: 0 }, hasDue: false });
  });

  it('caps the range at 14 days and uses the end of the day for a due date with no time', () => {
    expect(planRange(NOW, '2026-12-31', null)).toEqual({ until: '2026-11-24', due: { date: '2026-12-31', min: 1440 }, hasDue: true });
  });

  it('is null past the deadline', () => {
    expect(planRange(NOW, '2026-11-11', H(11))).toBeNull();
    expect(planRange(NOW, '2026-11-10', null)).toBeNull();
  });
});

describe('rankSlots', () => {
  it('labels nothing and keeps date order for an all-due-day list', () => {
    const c = [{ date: 'b', start: 5, end: 6, gap: 1 }, { date: 'b', start: 1, end: 2, gap: 1 }];
    expect(rankSlots(c, { date: 'b', min: 0 }).map(x => x.start)).toEqual([1, 5]);
  });
});

describe('spread (linked tasks)', () => {
  it('places each after the previous one, on a later day when one fits, before the parent is due', () => {
    const out = spread(sample(), [{ key: 'a', len: 60 }, { key: 'b', len: 30 }, { key: 'c', len: 60 }], range('2026-11-17', H(23, 59)));
    expect(out.map(x => at(x.slot))).toEqual(['2026-11-11 1020-1080', '2026-11-12 540-570', '2026-11-13 780-840']);
  });

  it('gives null when nothing fits', () => {
    const out = spread(sample(), [{ key: 'a', len: 600 }], range('2026-11-12', H(10)));
    expect(out[0].slot).toBeNull();
  });
});

describe('habitsToday', () => {
  it('puts each open habit in the first free gap after now', () => {
    const out = habitsToday(sample());
    expect(out.map(h => [h.habit.id, h.slot?.[0]])).toEqual([[2, H(11, 30)], [3, H(13)]]);
  });

  it('keeps a habit at its usual time', () => {
    const habits = HABITS.map(h => (h.id === 2 ? { ...h, time: H(18) } : h));
    const out = habitsToday(sample({ habits }));
    expect(out[0]).toMatchObject({ slot: [H(18), H(18, 30)], fixed: true });
  });

  it("keeps a usual time out of the gap given to a habit listed before it", () => {
    const habits: HabitInput[] = [
      { id: 3, title: 'Spanish practice', len: 30, time: null, done: false },
      { id: 2, title: 'Read 20 pages', len: 30, time: H(9), done: false },
    ];
    const out = habitsToday(sample({ now: { date: '2026-11-11', min: H(8, 50) }, events: [], tasks: [], habits }));
    expect(out.map(h => [h.habit.id, h.slot, h.fixed])).toEqual([[3, [H(9, 30), H(10)], false], [2, [H(9), H(9, 30)], true]]);
  });

  it('moves a habit whose usual time has passed to the first free gap after now', () => {
    const habits: HabitInput[] = [{ id: 2, title: 'Read 20 pages', len: 30, time: H(9), done: false }];
    const out = habitsToday(sample({ now: { date: '2026-11-11', min: H(14) }, events: [], tasks: [], habits }));
    expect(out[0]).toMatchObject({ slot: [H(14), H(14, 30)], fixed: false });
  });

  it('keeps a usual time before the work window', () => {
    const habits: HabitInput[] = [{ id: 2, title: 'Read 20 pages', len: 30, time: H(6, 30), done: false }];
    const out = habitsToday(sample({ now: { date: '2026-11-11', min: H(6) }, events: [], tasks: [], habits }));
    expect(out[0]).toMatchObject({ slot: [H(6, 30), H(7)], fixed: true });
  });

  it('keeps a usual time that has started but not ended', () => {
    const habits: HabitInput[] = [{ id: 2, title: 'Read 20 pages', len: 30, time: H(9), done: false }];
    const out = habitsToday(sample({ now: { date: '2026-11-11', min: H(9, 10) }, events: [], tasks: [], habits }));
    expect(out[0]).toMatchObject({ slot: [H(9), H(9, 30)], fixed: true });
  });

  it('keeps a usual time on a rest day', () => {
    const habits: HabitInput[] = [{ id: 2, title: 'Read 20 pages', len: 30, time: H(10), done: false }];
    const out = habitsToday(sample({ now: { date: '2026-11-14', min: H(8) }, events: [], tasks: [], habits }));
    expect(out[0]).toMatchObject({ slot: [H(10), H(10, 30)], fixed: true });
  });

  it('moves a habit whose usual time an event takes', () => {
    const habits: HabitInput[] = [{ id: 2, title: 'Read 20 pages', len: 30, time: H(12), done: false }];
    const out = habitsToday(sample({ habits, tasks: [] }));
    expect(out[0]).toMatchObject({ slot: [H(11, 30), H(12)], fixed: false });
  });
});

describe('habitNearestToday (an event took its usual time)', () => {
  const spanish: HabitInput = { id: 3, title: 'Spanish practice', len: 30, time: H(15), done: false };
  const at10 = { date: '2026-11-11', min: H(10) };
  const office = [ev('2026-11-11', 'Office hours', H(15), H(16))];

  it('offers the free time nearest the usual time, not the first free time after now', () => {
    expect(habitNearestToday(sample({ now: at10, events: office, tasks: [], habits: [spanish] }), 3, H(15))).toEqual([H(14, 30), H(15)]);
  });

  it('leaves the other habits their times, earlier on ties', () => {
    const read: HabitInput = { id: 2, title: 'Read 20 pages', len: 30, time: H(14, 30), done: false };
    expect(habitNearestToday(sample({ now: at10, events: office, tasks: [], habits: [read, spanish] }), 3, H(15))).toEqual([H(14), H(14, 30)]);
  });

  it('is null when nothing fits today', () => {
    const allDay = [ev('2026-11-11', 'Conference', H(9), H(19))];
    expect(habitNearestToday(sample({ now: at10, events: allDay, tasks: [], habits: [spanish] }), 3, H(15))).toBeNull();
  });
});

describe('freeTime habit holds', () => {
  it('holds a usual time and the end of the day for a habit without one, whatever their order', () => {
    const habits: HabitInput[] = [
      { id: 3, title: 'Spanish practice', len: 30, time: null, done: false },
      { id: 2, title: 'Read 20 pages', len: 30, time: H(18, 30), done: false },
    ];
    const days = freeTime(sample({ events: [], tasks: [], habits }), '2026-11-12', { date: '2026-11-13', min: 0 });
    expect(days.find(d => d.date === '2026-11-12')!.gaps).toEqual([[H(9), H(18)]]);
  });
});

describe('habitTime (usual time for a new habit)', () => {
  it("leaves out the times other habits hold", () => {
    const habits: HabitInput[] = [{ id: 2, title: 'Read 20 pages', len: 30, time: H(9), done: false }];
    const { picks } = habitTime(sample({ habits }), 30);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every(p => p.end <= H(9) || p.start >= H(9, 30))).toBe(true);
  });


  it('picks the starts free on the most of the next 5 work days, 2 hours apart', () => {
    const { picks } = habitTime(sample(), 30);
    expect(picks.map(p => [p.start, p.free, p.of])).toEqual([[H(9), 4, 5], [H(12, 30), 4, 5], [H(16), 4, 5]]);
    expect(picks[0].clash).toEqual(['2026-11-13']);
  });

  it('offers nothing without work days', () => {
    expect(habitTime(sample({ windowOn: () => null }), 30).picks).toEqual([]);
  });
});

describe('resuggest', () => {
  it('offers the free slot nearest the original: same day first', () => {
    const advisor = ev('2026-11-12', 'Advisor meeting', H(12), H(12, 30));
    const out = resuggest(sample({ events: [...EVENTS, advisor] }), 60, range('2026-11-16', H(10)), { date: '2026-11-12', start: H(12) });
    expect(out.map(at)).toEqual(['2026-11-12 960-1020', '2026-11-13 780-840', '2026-11-11 1020-1080']);
  });
});

describe('no fit', () => {
  it('splits a task across the soonest gaps of 30 minutes or more', () => {
    const r = range('2026-11-12', H(10));
    const { slots, days } = suggest(sample(), 120, r);
    expect(slots).toEqual([]);
    expect(splitFill(days, 120)).toEqual([
      { date: '2026-11-11', start: H(11, 30), end: H(12) },
      { date: '2026-11-11', start: H(13), end: H(14) },
      { date: '2026-11-11', start: H(17), end: H(17, 30) },
    ]);
    expect(splitFill(days, 600)).toBeNull();
  });

  it('offers the time right after the work window', () => {
    expect(afterWorkHours(sample(), 120, range('2026-11-12', H(10)))).toEqual({ date: '2026-11-11', start: H(19), end: H(21) });
    // Too late for today before midnight: the next work day.
    expect(afterWorkHours(sample(), 360, range('2026-11-13', H(10)))).toBeNull();
  });
});

describe('slotReason', () => {
  const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const S = sample();
  it('names the event before or after it', () => {
    expect(slotReason({ date: '2026-11-11', start: H(17), end: H(18), gap: 60 }, S, null, clock)).toBe('right after Shift at the library');
    expect(slotReason({ date: '2026-11-12', start: H(12), end: H(13), gap: 60 }, S, null, clock)).toBe('right before BIO 210 lab');
    expect(slotReason({ date: '2026-11-11', start: H(13), end: H(14), gap: 60 }, S, null, clock)).toBe('between Study group and Shift at the library');
  });
  it('falls back to the due day, the work day edges and the gap', () => {
    expect(slotReason({ date: '2026-11-17', start: H(13), end: H(14), gap: 60 }, S, { date: '2026-11-17', min: 0 }, clock)).toBe("the day it's due");
    expect(slotReason({ date: '2026-11-18', start: H(9), end: H(10), gap: 60 }, S, null, clock)).toBe('start of your work day');
    expect(slotReason({ date: '2026-11-18', start: H(18), end: H(19), gap: 60 }, S, null, clock)).toBe('end of your work day');
    expect(slotReason({ date: '2026-11-18', start: H(12), end: H(13), gap: 120 }, S, null, clock)).toBe('free until 14:00');
  });
});
