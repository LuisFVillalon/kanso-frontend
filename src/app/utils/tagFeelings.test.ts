import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import {
  analyseTagFeelings,
  analyseTagKinds,
  chanceOf,
  defaultKindTag,
  describeKind,
  describeKindFeeling,
  describeTagFeeling,
  feelingWord,
  kindLineText,
  kindSides,
  kindTags,
  tagKindCounts,
  type KindCounts,
  formatAverage,
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

  it('puts your usual at the other days’ level when every day off has the tag', () => {
    const days = [...repeat(5, () => row(4, { tags: ['tag:1'] })), ...repeat(2, () => row(2, { tags: ['tag:1'], off: true })), ...repeat(5, () => row(3))];
    const cmp = tagOf(analyseTagFeelings(days, TAGS, 'p'), 'CS 460').feel.mood;
    expect(cmp.gap).toBeCloseTo(1);
    expect(formatAverage(cmp.other)).toBe('3.0');
  });

  it('shows the tag days it compares, so the bar sits above the usual on a clear better mood', () => {
    // Every day off has the tag, so its days off are left out of the bar too.
    const days = [...repeat(5, () => row(4, { tags: ['tag:1'] })), ...repeat(10, () => row(1, { tags: ['tag:1'], off: true })), ...repeat(10, () => row(3))];
    const a = analyseTagFeelings(days, TAGS, 'p');
    const cmp = tagOf(a, 'CS 460').feel.mood;
    expect(cmp).toMatchObject({ verdict: 'clear', good: true, avg: 4, other: 3, n: 5, nOther: 10 });
    expect(describeTagFeeling('CS 460', 'mood', cmp)).toBe(
      'Mood averaged 4.0 (Good) on your 5 days with “CS 460”; your usual on 10 other days was 3.0. That’s a clear difference: better mood.',
    );
    expect(summarizeTagFeelings(a, 'in October')).toContain('on “CS 460” days (5), better mood than usual (4.0 vs 3.0)');
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

describe('analyseTagKinds', () => {
  const counts = (perDay: Partial<KindCounts>[]): Map<string, Map<string, KindCounts>> =>
    new Map(perDay.map((c, i) => [`2026-02-${String(i + 1).padStart(3, '0')}`, new Map([['tag:1', { tasks: 0, notes: 0, habits: 0, events: 0, ...c }]])]));
  const days = (moods: number[], stress?: number[]): TagDay[] => moods.map((m, i) => ({
    day: `2026-02-${String(i + 1).padStart(3, '0')}`, mood: m, energy: m, stress: stress ? stress[i] : 3, off: false, tags: new Set(),
  }));

  it('splits each kind at “did it at least once” and says what went with doing more', () => {
    // Ten days with a task are stressed; ten without are calm. Notes are every other day and change nothing.
    const c = counts(Array.from({ length: 20 }, (_, i) => ({ tasks: i < 10 ? 1 : 0, notes: i % 2 })));
    const d = days(Array(20).fill(3), Array.from({ length: 20 }, (_, i) => (i < 10 ? 5 : 1)));
    const [tasks, notes, habits, events] = analyseTagKinds(d, c, 'tag:1', 'p');
    expect(tasks).toMatchObject({ kind: 'tasks', none: false, threshold: 1, moreDays: 10, lessDays: 10 });
    expect(tasks.feel!.stress).toMatchObject({ verdict: 'clear', good: false, avg: 5, other: 1 });
    expect(tasks.feel!.mood.verdict).toBe('same');
    expect(kindLineText(describeKind(tasks, 'COMM 103', 'this month'))).toBe('Doing more COMM 103 tasks is linked to more stress');
    expect(describeKind(notes, 'COMM 103', 'this month')).toEqual({ tone: 'same', text: 'No clear difference' });
    expect(habits.none).toBe(true);
    expect(describeKind(habits, 'COMM 103', 'this month')).toEqual({ tone: 'none', text: 'No COMM 103 habits this month' });
    expect(describeKind(events, 'COMM 103', 'in 2026').tone).toBe('none');
    expect(kindSides(tasks, 'COMM 103')).toEqual(['Days you finished a COMM 103 task', 'Days you didn’t']);
    expect(kindSides(tasks, null)).toEqual(['Days you finished a task', 'Days you didn’t']);
    expect(describeKindFeeling(tasks, 'stress', 'COMM 103')).toBe(
      'Stress: usually Maxed on the 10 days you finished a COMM 103 task, usually Calm on the other 10 days. That’s a clear difference: on those days you were more stressed.',
    );
  });

  it('names every clear feeling, with the verb for the kind', () => {
    const c = counts(Array.from({ length: 20 }, (_, i) => ({ notes: i < 10 ? 1 : 0 })));
    const d = days(Array.from({ length: 20 }, (_, i) => (i < 10 ? 1 : 5)), Array(20).fill(3));
    const notes = analyseTagKinds(d, c, 'tag:1', 'p')[1];
    const line = describeKind(notes, 'Work', 'this year');
    expect(line).toMatchObject({ tone: 'clear', lead: 'Editing more Work notes is linked to' });
    expect(kindLineText(line)).toBe('Editing more Work notes is linked to a lower mood and less energy');
    expect(line.tone === 'clear' && line.effects.map(e => e.good)).toEqual([false, false]);
  });

  it('raises the split past the lowest count, so a habit done daily compares 2+ days with fewer', () => {
    const c = counts(Array.from({ length: 20 }, (_, i) => ({ habits: i < 12 ? 2 : 1, events: 1 })));
    const d = days(Array(20).fill(3));
    const [, , habits, events] = analyseTagKinds(d, c, 'tag:1', 'p');
    expect(habits).toMatchObject({ threshold: 2, moreDays: 12, lessDays: 8 });
    expect(kindSides(habits, 'Health')).toEqual(['Days you checked off 2 or more Health habits', 'Days with fewer']);
    // An event every day: nothing to compare with.
    expect(events).toMatchObject({ moreDays: 20, lessDays: 0 });
    expect(describeKind(events, 'Health', 'this month')).toEqual({ tone: 'thin', text: 'Too few days to tell' });
    expect(kindSides({ ...events, threshold: 1 }, 'ART 157')).toEqual(['Days with an ART 157 event', 'Days without one']);
  });

  it('never states a difference under 5 days a side or under half a step', () => {
    const few = analyseTagKinds(days([1, 1, 1, 1, 5, 5, 5, 5, 5, 5]), counts(Array.from({ length: 10 }, (_, i) => ({ tasks: i < 4 ? 1 : 0 }))), 'tag:1', 'p')[0];
    expect(few.feel!.mood.verdict).toBe('thin');
    const small = analyseTagKinds(
      days(Array.from({ length: 40 }, (_, i) => (i < 20 ? (i % 5 ? 3 : 4) : 3))),
      counts(Array.from({ length: 40 }, (_, i) => ({ tasks: i < 20 ? 1 : 0 }))),
      'tag:1', 'p',
    )[0];
    expect(small.feel!.mood.verdict).toBe('same');
  });

  it('opens on the first tag with a clear difference', () => {
    const tags = [{ tag: { key: 'tag:1', name: 'A', color: null }, days: 9 }, { tag: { key: 'tag:2', name: 'B', color: null }, days: 5 }];
    const clear = { kind: 'tasks', none: false, threshold: 1, moreDays: 5, lessDays: 5, feel: { mood: { verdict: 'clear' }, energy: { verdict: 'same' }, stress: { verdict: 'same' } } };
    expect(defaultKindTag(tags, key => (key === 'tag:2' ? [clear] : []) as never)).toBe('tag:2');
    expect(defaultKindTag(tags, () => [])).toBe('tag:1');
    expect(defaultKindTag([], () => [])).toBeNull();
  });

  it('lists tags on any kind of activity, on the most days first', () => {
    const c = new Map([
      ['2026-02-001', new Map([['tag:1', { tasks: 0, notes: 0, habits: 1, events: 0 }], ['tag:2', { tasks: 0, notes: 0, habits: 0, events: 1 }]])],
      ['2026-02-002', new Map([['tag:2', { tasks: 1, notes: 0, habits: 0, events: 0 }]])],
    ]);
    expect(kindTags(days([3, 3]), c, TAGS).map(t => [t.tag.name, t.days])).toEqual([['Work', 2], ['CS 460', 1]]);
  });
});

describe('check-in words', () => {
  it('reads an average as the word it rounds to', () => {
    expect(feelingWord('mood', 3.9)).toBe('Good');
    expect(feelingWord('stress', 2.2)).toBe('Mild');
    expect(feelingWord('energy', 0.4)).toBe('Drained');
  });
});
