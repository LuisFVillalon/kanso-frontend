import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import {
  analyseTagFeelings,
  chanceOf,
  describeTagFeeling,
  isDayOff,
  summarizeTagFeelings,
  tagDayRows,
  tagsByDay,
  timelineFeeling,
  type FeelingTag,
  type TagDay,
} from './tagFeelings';

beforeAll(() => {
  // Local-day math depends on the zone; pin one with a DST change.
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
const tagOf = (analysis: ReturnType<typeof analyseTagFeelings>, name: string) => analysis.tags.find(t => t.tag.name === name)!;

describe('tagsByDay', () => {
  it('tags a day by the tasks completed and notes edited on it, not habits or tasks due', () => {
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
    });
    expect(tags.get('tag:2')).toEqual({ key: 'tag:2', name: 'Work', color: '#64748b' });
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

describe('analyseTagFeelings', () => {
  it('says nothing until the tag and the other days both have 5 days', () => {
    const four = analyseTagFeelings([...repeat(4, () => row(1, { tags: ['tag:1'] })), ...repeat(10, () => row(5))], TAGS, 'p');
    const cmp = tagOf(four, 'CS 460').feel.mood;
    expect(cmp.verdict).toBe('thin');
    expect(cmp.p).toBeNull();
    expect(describeTagFeeling('CS 460', 'mood', cmp)).toBe('“CS 460” is on only 4 days with mood logged. Too few days to tell: it needs 5 on each side.');

    const five = analyseTagFeelings([...repeat(5, () => row(1, { tags: ['tag:1'] })), ...repeat(10, () => row(5))], TAGS, 'p');
    expect(tagOf(five, 'CS 460').feel.mood.verdict).toBe('clear');
  });

  it('calls a tag on almost every day too few to tell, for want of other days', () => {
    const a = analyseTagFeelings([...repeat(20, () => row(2, { tags: ['tag:1'] })), ...repeat(4, () => row(5))], TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp.verdict).toBe('thin');
    expect(describeTagFeeling('CS 460', 'mood', cmp)).toContain('is on almost every day, so there are only 4 days without it to compare with');
  });

  it('never calls a gap under half a step a difference, however many days', () => {
    // Tag days average 3.4, other days 3.0, on 40 days each: certain, but small.
    const tagged = () => [row(4, { tags: ['tag:1'] }), row(4, { tags: ['tag:1'] }), row(3, { tags: ['tag:1'] }), row(3, { tags: ['tag:1'] }), row(3, { tags: ['tag:1'] })];
    const a = analyseTagFeelings([...Array.from({ length: 8 }, tagged).flat(), ...repeat(40, () => row(3))], TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp.gap).toBeCloseTo(0.4);
    expect(cmp.p!).toBeLessThan(0.001);
    expect(cmp.verdict).toBe('same');
    expect(describeTagFeeling('CS 460', 'mood', cmp)).toContain('A little higher, but not by enough to tell from chance.');
  });

  it('never calls a big gap a difference when shuffled days give it easily', () => {
    const a = analyseTagFeelings([
      ...[5, 5, 1, 4, 3].map(m => row(m, { tags: ['tag:1'] })),
      ...[3, 1, 5, 2, 4].map(m => row(m)),
    ], TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp.gap).toBeCloseTo(0.6);
    expect(cmp.p!).toBeGreaterThan(0.3);
    expect(cmp.verdict).toBe('same');
  });

  it('calls a clear difference and says which way, easier or harder', () => {
    const a = analyseTagFeelings([
      ...repeat(10, () => row(2, { tags: ['tag:2'], stress: 4 })),
      ...repeat(10, () => row(4, { stress: 2 })),
    ], TAGS, 'p');
    const t = tagOf(a, 'Work');
    expect(t.feel.mood).toMatchObject({ verdict: 'clear', good: false, avg: 2, other: 4 });
    expect(t.feel.stress).toMatchObject({ verdict: 'clear', good: false });
    expect(describeTagFeeling('Work', 'mood', t.feel.mood)).toBe(
      'Mood averaged 2.0 (Low) on your 10 days with “Work”; your usual on 10 other days was 4.0. That’s a clear difference: lower mood.',
    );
    expect(describeTagFeeling('Work', 'stress', t.feel.stress)).toContain('clear difference: more stress.');
    expect(timelineFeeling(t)).toBe('mood');
    expect(summarizeTagFeelings(a, 'in October')).toBe(
      'Clearest in October: on “Work” days (10), lower mood than usual (2.0 vs 4.0); on “Work” days (10), less energy than usual (2.0 vs 4.0).',
    );
  });

  it('opens the timeline on the biggest clear difference', () => {
    const a = analyseTagFeelings([
      ...repeat(10, () => row(3, { tags: ['tag:2'], energy: 1, stress: 3 })),
      ...repeat(10, () => row(3, { energy: 4, stress: 3 })),
    ], TAGS, 'p');
    expect(timelineFeeling(tagOf(a, 'Work'))).toBe('energy');
  });

  it('compares work days with work days and days off with days off', () => {
    // Days off are good days whatever the tag; the tag is mostly on days off.
    const days = [
      ...repeat(6, () => row(5, { tags: ['tag:3'], off: true })),
      ...repeat(6, () => row(5, { off: true })),
      ...repeat(6, () => row(3, { tags: ['tag:3'] })),
      ...repeat(12, () => row(3)),
    ];
    const cmp = tagOf(analyseTagFeelings(days, TAGS, 'p'), 'Health').feel.mood;
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
    const cmp = tagOf(analyseTagFeelings(days, TAGS, 'p'), 'Health').feel.mood;
    expect(cmp.verdict).toBe('same');
    expect(cmp.mixWarn).toBe(true);
    expect(describeTagFeeling('Health', 'mood', cmp)).toContain('(Mixing work days and days off would have made it look like 4.6 vs 3.4.)');
  });

  it('leaves out a kind of day the tag never shares with other days', () => {
    // Every day off has the tag, so only work days can be compared.
    const days = [...repeat(8, () => row(5, { tags: ['tag:1'], off: true })), ...repeat(3, () => row(3, { tags: ['tag:1'] })), ...repeat(10, () => row(3))];
    const cmp = tagOf(analyseTagFeelings(days, TAGS, 'p'), 'CS 460').feel.mood;
    expect(cmp).toMatchObject({ n: 3, nOther: 10, nAll: 11, verdict: 'thin' });
    expect(describeTagFeeling('CS 460', 'mood', cmp)).toContain('too few of them line up with other days of the same kind (work day or day off)');
  });

  it('splits the chance bar across the tags compared for a feeling', () => {
    const days = [
      ...repeat(6, () => row(4, { tags: ['tag:1', 'tag:2'] })),
      ...repeat(6, () => row(4, { tags: ['tag:3'] })),
      ...repeat(10, () => row(3)),
    ];
    const a = analyseTagFeelings(days, TAGS, 'p');
    expect(a.tags.map(t => t.feel.mood.k)).toEqual([3, 3, 3]);
  });

  it('skips an energy or stress left blank and still compares mood', () => {
    const a = analyseTagFeelings([
      ...repeat(6, () => row(2, { tags: ['tag:1'], energy: null })),
      ...repeat(6, () => row(4, { energy: null })),
    ], TAGS, 'p');
    const t = tagOf(a, 'CS 460');
    expect(t.feel.energy).toMatchObject({ verdict: 'thin', avg: null, nAll: 0 });
    expect(t.feel.mood.verdict).toBe('clear');
    expect(summarizeTagFeelings(a, 'in 2026')).toContain('lower mood');
  });

  it('gives the same verdict every time for the same days', () => {
    const days = [
      ...[5, 4, 4, 3, 5, 4].map(m => row(m, { tags: ['tag:1'] })),
      ...[3, 4, 2, 3, 3, 4, 2, 3].map(m => row(m)),
    ];
    const one = tagOf(analyseTagFeelings(days, TAGS, '2026'), 'CS 460').feel.mood;
    const two = tagOf(analyseTagFeelings(days, TAGS, '2026'), 'CS 460').feel.mood;
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

  it('gives an empty summary when no tag has enough days', () => {
    const a = analyseTagFeelings(repeat(3, () => row(3, { tags: ['tag:1'] })), TAGS, 'p');
    expect(summarizeTagFeelings(a, 'this week')).toBe('');
  });
});
