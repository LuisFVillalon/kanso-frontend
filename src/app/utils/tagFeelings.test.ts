import { describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import type { MoodCheckin } from '@/app/types/mood';
import {
  chanceOf,
  compareFeeling,
  eventTagDays,
  feelingWord,
  FEELINGS,
  formatAverage,
  hash,
  isDayOff,
  settleVerdicts,
  tagDayRows,
  tagKindCounts,
  tagsByDay,
  type Feeling,
  type FeelingComparison,
  type FeelingTag,
  type TagDay,
} from './tagFeelings';

// Local-day math depends on the zone; pin one with a DST change.
// Hoisted so fixtures built at load time and in describe blocks see it too.
vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
const work = { id: 2, name: 'Work', color: '#64748b' };
const health = { id: 3, name: 'Health', color: '#3B9A5A' };

const task = (overrides: Partial<ActivityTask>): ActivityTask => ({
  id: 1,
  title: 'Task',
  category: null,
  priority: null,
  due_date: null,
  due_time: null,
  estimated_time: null,
  completed: true,
  completed_date: null,
  parent_task_id: null,
  tags: [],
  ...overrides,
});

const event = (overrides: Partial<EventOccurrence>): EventOccurrence => ({
  event_id: 1, occurrence_date: overrides.date ?? '2026-10-20', title: 'Event', description: null, tags: [],
  all_day: false, date: '2026-10-20', end_date: overrides.date ?? '2026-10-20', start_time: '10:00', end_time: '11:00',
  starts_at: at(Number((overrides.date ?? '2026-10-20').slice(8)), 10), ends_at: at(Number((overrides.date ?? '2026-10-20').slice(8)), 11),
  time_zone: 'America/Los_Angeles', repeat_days: [], repeat_interval: 1, reminder_minutes: null,
  edited: false, past: true, archived: false,
  ...overrides,
});

const activity = (overrides: Partial<CalendarActivity>): CalendarActivity => ({
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  scheduled_tasks: [],
  completed_tasks: [],
  note_sessions: [],
  habit_completions: [],
  ...overrides,
});

// A local time on an October 2026 day, as the UTC string the backend sends.
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

const checkin = (period_start: string, mood: number, energy: number | null = null, stress: number | null = null): MoodCheckin => ({
  id: 1,
  period_kind: 'day',
  period_start,
  mood,
  energy,
  stress,
  workload: null,
  highlight: null,
  progress: null,
  word: null,
  note: null,
  tags: [],
  created_at: `${period_start}T20:00:00Z`,
  updated_at: `${period_start}T20:00:00Z`,
});

const TAGS = new Map<string, FeelingTag>([
  ['tag:1', { key: 'tag:1', name: 'CS 460', color: null }],
  ['tag:2', { key: 'tag:2', name: 'Work', color: null }],
  ['tag:3', { key: 'tag:3', name: 'Health', color: null }],
]);

let dayNo = 0;
/** A check-in day with the same value for all three feelings unless given. */
const row = (mood: number, opts: { tags?: string[]; off?: boolean; energy?: number | null; stress?: number | null } = {}): TagDay => ({
  day: `2026-01-${String(++dayNo).padStart(3, '0')}`,
  mood,
  energy: opts.energy === undefined ? mood : opts.energy,
  stress: opts.stress === undefined ? mood : opts.stress,
  off: opts.off ?? false,
  tags: new Set(opts.tags ?? []),
});
const repeat = (n: number, make: () => TagDay) => Array.from({ length: n }, make);
/** Each tag's days against the rest, the chance bar split across the tags compared for each feeling. */
const compareTags = (days: TagDay[], tags: Map<string, FeelingTag>, seedKey: string) => {
  const keys = [...new Set(days.flatMap(d => [...d.tags]))].filter(key => tags.has(key));
  const out = keys.map(key => {
    const on = days.filter(d => d.tags.has(key));
    const off = days.filter(d => !d.tags.has(key));
    const feel = Object.fromEntries(FEELINGS.map(f => [f, compareFeeling(on, off, f, hash(`${key}|${f}|${seedKey}`))])) as Record<Feeling, FeelingComparison>;
    return { tag: tags.get(key)!, feel };
  });
  for (const f of FEELINGS) settleVerdicts(out.map(t => t.feel[f]));
  return out;
};
const tagOf = (compared: ReturnType<typeof compareTags>, name: string) => compared.find(t => t.tag.name === name)!;

describe('tagsByDay', () => {
  it('tags a day by the tasks completed, notes edited and habits checked off on it, not tasks due', () => {
    const { byDay, tags } = tagsByDay(activity({
      completed_tasks: [
        task({ id: 1, completed_date: at(20), tags: [cs] }),
        // 11:30pm local on the 21st is the 22nd in UTC: it still counts on the 21st.
        task({ id: 2, completed_date: at(21, 23, 30), tags: [work] }),
        task({ id: 3, completed_date: at(10), tags: [cs] }),
      ],
      scheduled_tasks: [task({ id: 4, due_date: '2026-10-23', completed: false, tags: [health] })],
      note_sessions: [
        // Runs past midnight: both days carry the note's tag.
        { id: 1, note_id: 7, note_title: 'Essay', started_at: at(22, 23, 0), ended_at: at(23, 0, 40), duration_seconds: 6000 },
      ],
      notes: [{ id: 7, title: 'Essay', tags: [health] }],
      habit_completions: [{ habit_id: 9, habit_title: 'Run', date: '2026-10-24', estimated_time: null }],
      habits: [{ id: 9, title: 'Run', estimated_time: null, tags: [health] }],
    }), new Date(2026, 9, 19), new Date(2026, 9, 25));
    expect(Object.fromEntries([...byDay].map(([d, s]) => [d, [...s]]))).toEqual({
      '2026-10-20': ['tag:1'],
      '2026-10-21': ['tag:2'],
      '2026-10-22': ['tag:3'],
      '2026-10-23': ['tag:3'],
      '2026-10-24': ['tag:3'],
    });
    expect(tags.get('tag:2')).toEqual({ key: 'tag:2', name: 'Work', color: '#64748b' });
  });

  it('tags a day by its events: every day of an all-day trip, a timed one on its start day, none for one shown as free', () => {
    const { byDay, kinds } = tagsByDay(activity({
      events: [
        event({ event_id: 1, date: '2026-10-20', tags: [cs] }),
        // Declined or "Show as free" in Google: on no day.
        event({ event_id: 2, date: '2026-10-21', tags: [work], busy: false }),
        // A 3-day all-day trip.
        event({ event_id: 3, date: '2026-10-22', end_date: '2026-10-24', all_day: true, start_time: null, end_time: null, starts_at: at(22, 0), ends_at: at(25, 0), tags: [health] }),
        // 11pm to 12:30am: on its start day only.
        event({ event_id: 4, date: '2026-10-21', end_date: '2026-10-22', start_time: '23:00', end_time: '00:30', starts_at: at(21, 23), ends_at: at(22, 0, 30), tags: [cs] }),
        // Archived but past: still counts.
        event({ event_id: 5, date: '2026-10-19', archived: true, tags: [work] }),
      ],
    }), new Date(2026, 9, 19), new Date(2026, 9, 25));
    expect(Object.fromEntries([...byDay].map(([d, s]) => [d, [...s]]))).toEqual({
      '2026-10-19': ['tag:2'],
      '2026-10-20': ['tag:1'],
      '2026-10-21': ['tag:1'],
      '2026-10-22': ['tag:3'],
      '2026-10-23': ['tag:3'],
      '2026-10-24': ['tag:3'],
    });
    expect(kinds.get('2026-10-22')?.get('tag:3')).toEqual({ tasks: 0, notes: 0, habits: 0, events: 1 });
  });
});

describe('eventTagDays', () => {
  it('puts a timed event of 24 hours or more on each day it has time in', () => {
    expect(eventTagDays(event({ date: '2026-10-20', end_date: '2026-10-22', start_time: '09:00', end_time: '00:00', starts_at: at(20, 9), ends_at: at(22, 0) })))
      .toEqual(['2026-10-20', '2026-10-21']);
    expect(eventTagDays(event({ date: '2026-10-20', end_date: '2026-10-22', start_time: '09:00', end_time: '10:00', starts_at: at(20, 9), ends_at: at(22, 10) })))
      .toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
});

describe('tagDayRows', () => {
  it('keeps only days with a check-in, up to today, and marks days off', () => {
    const checkins = new Map([
      ['2026-10-19', checkin('2026-10-19', 4, 3, 2)], // Monday, a rest day here
      ['2026-10-20', checkin('2026-10-20', 3)],
      ['2026-10-24', checkin('2026-10-24', 5)], // Saturday
      ['2026-10-26', checkin('2026-10-26', 2)], // after "today"
    ]);
    const rows = tagDayRows(checkins, new Map([['2026-10-20', new Set(['tag:1'])]]), new Date(2026, 9, 19), new Date(2026, 9, 31), [1], new Date(2026, 9, 25, 9));
    expect(rows.map(r => [r.day, r.off, [...r.tags]])).toEqual([
      ['2026-10-19', true, []],
      ['2026-10-20', false, ['tag:1']],
      ['2026-10-24', true, []],
    ]);
    expect(rows[0]).toMatchObject({ mood: 4, energy: 3, stress: 2 });
  });

  it('always counts Saturday and Sunday as days off', () => {
    expect(isDayOff(new Date(2026, 9, 24), [])).toBe(true);
    expect(isDayOff(new Date(2026, 9, 25), [])).toBe(true);
    expect(isDayOff(new Date(2026, 9, 21), [])).toBe(false);
    expect(isDayOff(new Date(2026, 9, 21), [3])).toBe(true);
  });
});

describe('compareFeeling', () => {
  it('says nothing until the tag and the other days both have 5 days', () => {
    const four = compareTags([...repeat(4, () => row(1, { tags: ['tag:1'] })), ...repeat(10, () => row(5))], TAGS, 'p');
    const cmp = tagOf(four, 'CS 460').feel.mood;
    expect(cmp.verdict).toBe('thin');
    expect(cmp.p).toBeNull();

    const five = compareTags([...repeat(5, () => row(1, { tags: ['tag:1'] })), ...repeat(10, () => row(5))], TAGS, 'p');
    expect(tagOf(five, 'CS 460').feel.mood.verdict).toBe('clear');
  });

  it('calls a tag on almost every day too few to tell, for want of other days', () => {
    const a = compareTags([...repeat(20, () => row(2, { tags: ['tag:1'] })), ...repeat(4, () => row(5))], TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp.verdict).toBe('thin');
  });

  it('never calls a gap under half a step a difference, however many days', () => {
    // Tag days average 3.4, other days 3.0, on 40 days each: certain, but small.
    const tagged = () => [row(4, { tags: ['tag:1'] }), row(4, { tags: ['tag:1'] }), row(3, { tags: ['tag:1'] }), row(3, { tags: ['tag:1'] }), row(3, { tags: ['tag:1'] })];
    const a = compareTags([...Array.from({ length: 8 }, tagged).flat(), ...repeat(40, () => row(3))], TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp.gap).toBeCloseTo(0.4);
    expect(cmp.p!).toBeLessThan(0.001);
    expect(cmp.verdict).toBe('same');
  });

  it('never calls a big gap a difference when shuffled days give it easily', () => {
    const a = compareTags([
      ...[5, 5, 1, 4, 3].map(m => row(m, { tags: ['tag:1'] })),
      ...[3, 1, 5, 2, 4].map(m => row(m)),
    ], TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp.gap).toBeCloseTo(0.6);
    expect(cmp.p!).toBeGreaterThan(0.3);
    expect(cmp.verdict).toBe('same');
  });

  it('calls a clear difference and says which way, easier or harder', () => {
    const a = compareTags([
      ...repeat(10, () => row(2, { tags: ['tag:2'], stress: 4 })),
      ...repeat(10, () => row(4, { stress: 2 })),
    ], TAGS, 'p');
    const t = tagOf(a, 'Work');
    expect(t.feel.mood).toMatchObject({ verdict: 'clear', good: false, avg: 2, other: 4 });
    expect(t.feel.stress).toMatchObject({ verdict: 'clear', good: false });
  });

  it('compares work days with work days and days off with days off', () => {
    // Days off are good days whatever the tag; the tag is mostly on days off.
    const days = [
      ...repeat(6, () => row(5, { tags: ['tag:3'], off: true })),
      ...repeat(6, () => row(5, { off: true })),
      ...repeat(6, () => row(3, { tags: ['tag:3'] })),
      ...repeat(12, () => row(3)),
    ];
    const cmp = tagOf(compareTags(days, TAGS, 'p'), 'Health').feel.mood;
    expect(cmp.gap).toBeCloseTo(0);
    expect(cmp.rawGap).toBeCloseTo(4 - 66 / 18);
    expect(cmp.verdict).toBe('same');
    // Kept apart, "your usual" has the tag days' mix: half days off.
    expect(cmp.other).toBeCloseTo(4);
  });

  it('warns when mixing the two kinds of day would have shown a difference', () => {
    const days = [
      ...repeat(8, () => row(5, { tags: ['tag:3'], off: true })),
      ...repeat(5, () => row(5, { off: true })),
      ...repeat(2, () => row(3, { tags: ['tag:3'] })),
      ...repeat(20, () => row(3)),
    ];
    const cmp = tagOf(compareTags(days, TAGS, 'p'), 'Health').feel.mood;
    expect(cmp.verdict).toBe('same');
    expect(cmp.mixWarn).toBe(true);
  });

  it('leaves out a kind of day the tag never shares with other days', () => {
    // Every day off has the tag, so only work days can be compared.
    const days = [...repeat(8, () => row(5, { tags: ['tag:1'], off: true })), ...repeat(3, () => row(3, { tags: ['tag:1'] })), ...repeat(10, () => row(3))];
    const cmp = tagOf(compareTags(days, TAGS, 'p'), 'CS 460').feel.mood;
    expect(cmp).toMatchObject({ n: 3, nOther: 10, nAll: 11, verdict: 'thin' });
  });

  it('puts your usual at the other days’ level when every day off has the tag', () => {
    const days = [...repeat(5, () => row(4, { tags: ['tag:1'] })), ...repeat(2, () => row(2, { tags: ['tag:1'], off: true })), ...repeat(5, () => row(3))];
    const cmp = tagOf(compareTags(days, TAGS, 'p'), 'CS 460').feel.mood;
    expect(cmp.gap).toBeCloseTo(1);
    expect(formatAverage(cmp.other)).toBe('3.0');
  });

  it('shows the tag days it compares, so the bar sits above the usual on a clear better mood', () => {
    // Every day off has the tag, so its days off are left out of the bar too.
    const days = [...repeat(5, () => row(4, { tags: ['tag:1'] })), ...repeat(10, () => row(1, { tags: ['tag:1'], off: true })), ...repeat(10, () => row(3))];
    const a = compareTags(days, TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp).toMatchObject({ verdict: 'clear', good: true, avg: 4, other: 3, n: 5, nOther: 10 });
  });

  it('splits the chance bar across the tags compared for a feeling', () => {
    const days = [
      ...repeat(6, () => row(4, { tags: ['tag:1', 'tag:2'] })),
      ...repeat(6, () => row(4, { tags: ['tag:3'] })),
      ...repeat(10, () => row(3)),
    ];
    const a = compareTags(days, TAGS, 'p');
    expect(a.map(t => t.feel.mood.k)).toEqual([3, 3, 3]);
  });

  it('skips an energy or stress left blank and still compares mood', () => {
    const a = compareTags([
      ...repeat(6, () => row(2, { tags: ['tag:1'], energy: null })),
      ...repeat(6, () => row(4, { energy: null })),
    ], TAGS, 'p');
    const t = tagOf(a, 'CS 460');
    expect(t.feel.energy).toMatchObject({ verdict: 'thin', avg: null, nAll: 0 });
    expect(t.feel.mood.verdict).toBe('clear');
  });

  it('gives the same verdict every time for the same days', () => {
    const days = [
      ...[5, 4, 4, 3, 5, 4].map(m => row(m, { tags: ['tag:1'] })),
      ...[3, 4, 2, 3, 3, 4, 2, 3].map(m => row(m)),
    ];
    const one = tagOf(compareTags(days, TAGS, '2026'), 'CS 460').feel.mood;
    const two = tagOf(compareTags(days, TAGS, '2026'), 'CS 460').feel.mood;
    expect(one.p).toBe(two.p);
    expect(one.verdict).toBe(two.verdict);
  });
});

describe('chanceOf', () => {
  it('is seeded and reads near 1 when there is no gap', () => {
    const groups = [{ tag: [3, 4, 3, 4, 3], other: [4, 3, 4, 3, 4] }];
    expect(chanceOf(groups, 0, 42)).toBe(1);
    const p = chanceOf([{ tag: [5, 5, 5, 5, 5], other: [1, 2, 1, 2, 1] }], 3.6, 42);
    expect(p).toBe(chanceOf([{ tag: [5, 5, 5, 5, 5], other: [1, 2, 1, 2, 1] }], 3.6, 42));
    // Only 1 of the 252 ways to pick 5 of 10 days gives a gap this big.
    expect(p).toBeLessThan(0.02);
  });
});

describe('tagKindCounts', () => {
  it('counts each tag’s tasks, notes, habits and events per day apart', () => {
    const { byDay, tags } = tagKindCounts(activity({
      completed_tasks: [
        task({ id: 1, completed_date: at(20), tags: [cs] }),
        task({ id: 2, completed_date: at(20, 16), tags: [cs, work] }),
      ],
      note_sessions: [
        // Two sessions on one note in a day count it once; one past midnight counts on both days.
        { id: 1, note_id: 7, note_title: 'Essay', started_at: at(20, 9), ended_at: at(20, 10), duration_seconds: 3600 },
        { id: 2, note_id: 7, note_title: 'Essay', started_at: at(20, 14), ended_at: at(20, 15), duration_seconds: 3600 },
        { id: 3, note_id: 7, note_title: 'Essay', started_at: at(21, 23), ended_at: at(22, 0, 30), duration_seconds: 5400 },
      ],
      notes: [{ id: 7, title: 'Essay', tags: [cs] }],
      habit_completions: [
        { habit_id: 9, habit_title: 'Run', date: '2026-10-20', estimated_time: null },
        { habit_id: 9, habit_title: 'Run', date: '2026-10-26', estimated_time: null },
      ],
      habits: [{ id: 9, title: 'Run', estimated_time: null, tags: [health] }],
      events: [{ event_id: 3, occurrence_date: '2026-10-21', date: '2026-10-21', tags: [cs] } as NonNullable<CalendarActivity['events']>[number]],
    }), new Date(2026, 9, 19), new Date(2026, 9, 25));
    const of = (day: string, key: string) => byDay.get(day)?.get(key);
    expect(of('2026-10-20', 'tag:1')).toEqual({ tasks: 2, notes: 1, habits: 0, events: 0 });
    expect(of('2026-10-20', 'tag:2')).toEqual({ tasks: 1, notes: 0, habits: 0, events: 0 });
    expect(of('2026-10-20', 'tag:3')).toEqual({ tasks: 0, notes: 0, habits: 1, events: 0 });
    expect(of('2026-10-21', 'tag:1')).toEqual({ tasks: 0, notes: 1, habits: 0, events: 1 });
    expect(of('2026-10-22', 'tag:1')).toEqual({ tasks: 0, notes: 1, habits: 0, events: 0 });
    // Outside the range.
    expect(byDay.has('2026-10-26')).toBe(false);
    expect(tags.get('tag:3')?.name).toBe('Health');
  });
});

describe('check-in words', () => {
  it('reads an average as the word it rounds to', () => {
    expect(feelingWord('mood', 3.9)).toBe('Good');
    expect(feelingWord('stress', 2.2)).toBe('Mild');
    expect(feelingWord('energy', 0.4)).toBe('Drained');
  });
});
