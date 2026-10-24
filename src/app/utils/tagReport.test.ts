import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import { periodContaining } from './calendarReport';
import {
  buildTagBreakdown,
  buildTagSeries,
  collectTagItems,
  MAX_TAG_ROWS,
  OTHER_KEY,
  UNTAGGED_KEY,
  type TagItemKind,
} from './tagReport';

beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles';
});

const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
const math = { id: 2, name: 'MATH 254', color: '#7A5AD0' };
const health = { id: 3, name: 'Health', color: '#3B9A5A' };
const all: Record<TagItemKind, boolean> = { task: true, note: true, habit: true };

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
  start_date: '2026-10-19',
  end_date: '2026-10-25',
  scheduled_tasks: [],
  completed_tasks: [],
  note_sessions: [],
  habit_completions: [],
  ...overrides,
});

// Local noon on an October 2026 day, as the UTC string the backend sends.
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

const week = periodContaining('week', new Date(2026, 9, 21));

describe('collectTagItems', () => {
  it('collects completed tasks, clipped note time and habit check-ins in the range', () => {
    const items = collectTagItems(activity({
      completed_tasks: [
        task({ id: 1, title: 'Lab writeup', estimated_time: 2, completed_date: at(20), tags: [cs] }),
        task({ id: 2, title: 'Last week', estimated_time: 5, completed_date: at(18) }),
      ],
      note_sessions: [
        // Starts the evening before the week: only the part from midnight Monday counts.
        { id: 1, note_id: 7, note_title: 'Lecture notes', started_at: at(18, 23, 30), ended_at: at(19, 0, 30), duration_seconds: 3600 },
        { id: 2, note_id: 7, note_title: 'Lecture notes', started_at: at(21, 9), ended_at: at(21, 10), duration_seconds: 3600 },
      ],
      habit_completions: [
        { habit_id: 4, habit_title: 'Run', date: '2026-10-20', estimated_time: 0.5 },
        { habit_id: 4, habit_title: 'Run', date: '2026-10-21', estimated_time: 0.5 },
        { habit_id: 4, habit_title: 'Run', date: '2026-10-12', estimated_time: 0.5 },
      ],
      notes: [{ id: 7, title: 'Lecture notes', tags: [cs] }],
      habits: [{ id: 4, title: 'Run', estimated_time: 0.5, tags: [health] }],
    }), week.start, week.end);

    expect(items).toHaveLength(3);
    const [lab, note, run] = items;
    expect(lab).toMatchObject({ kind: 'task', title: 'Lab writeup', hours: 2, completedOn: '2026-10-20', tags: [cs] });
    expect(note).toMatchObject({ kind: 'note', occurrences: 2, tags: [cs] });
    expect(note.hours).toBeCloseTo(1.5);
    expect(run).toMatchObject({ kind: 'habit', occurrences: 2, hours: 1, hoursEach: 0.5, tags: [health] });
  });

  it('treats notes and habits as untagged when the backend sends no notes or habits', () => {
    const items = collectTagItems(activity({
      note_sessions: [{ id: 1, note_id: 7, note_title: 'Lecture notes', started_at: at(21, 9), ended_at: at(21, 10), duration_seconds: 3600 }],
      habit_completions: [{ habit_id: 4, habit_title: 'Run', date: '2026-10-20', estimated_time: 0.5 }],
    }), week.start, week.end);
    expect(items.map(i => i.tags)).toEqual([[], []]);
    expect(items[1].hours).toBe(0.5);
  });

  it('counts tasks and check-ins without an estimate as missing, adding no time', () => {
    const items = collectTagItems(activity({
      completed_tasks: [task({ id: 1, completed_date: at(20) })],
      habit_completions: [
        { habit_id: 4, habit_title: 'Duolingo', date: '2026-10-20', estimated_time: null },
        { habit_id: 4, habit_title: 'Duolingo', date: '2026-10-21', estimated_time: null },
      ],
      habits: [{ id: 4, title: 'Duolingo', estimated_time: null, tags: [] }],
    }), week.start, week.end);
    expect(items.map(i => [i.hours, i.missingEstimates])).toEqual([[0, 1], [0, 2]]);
  });
});

describe('buildTagBreakdown', () => {
  const items = collectTagItems(activity({
    completed_tasks: [
      task({ id: 1, title: 'Study block', estimated_time: 3, completed_date: at(20), tags: [cs, math] }),
      task({ id: 2, title: 'Laundry', estimated_time: 1, completed_date: at(21) }),
    ],
    note_sessions: [
      { id: 1, note_id: 7, note_title: 'Lecture notes', started_at: at(21, 9), ended_at: at(21, 10), duration_seconds: 3600 },
      { id: 2, note_id: 7, note_title: 'Lecture notes', started_at: at(22, 9), ended_at: at(22, 10), duration_seconds: 3600 },
    ],
    habit_completions: [
      { habit_id: 4, habit_title: 'Run', date: '2026-10-20', estimated_time: 0.5 },
      { habit_id: 4, habit_title: 'Run', date: '2026-10-21', estimated_time: 0.5 },
    ],
    notes: [{ id: 7, title: 'Lecture notes', tags: [cs] }],
    habits: [{ id: 4, title: 'Run', estimated_time: 0.5, tags: [health] }],
  }), week.start, week.end);

  it('splits an item with several tags evenly, so the rows add up to the total', () => {
    const { total, rows } = buildTagBreakdown(items, 'time', all);
    expect(total).toBe(7);
    expect(rows.map(r => [r.name, r.total])).toEqual([
      ['CS 460', 3.5],
      ['MATH 254', 1.5],
      ['Health', 1],
      ['Untagged', 1],
    ]);
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(total);
    const csRow = rows[0];
    expect(csRow.byKind).toEqual({ task: 1.5, note: 2, habit: 0 });
    expect(csRow.counts).toEqual({ task: 1, note: 1, habit: 0 });
  });

  it('counts a task once, a note once however many sessions, and each habit check-in', () => {
    const { total, rows } = buildTagBreakdown(items, 'count', all);
    expect(total).toBe(5);
    expect(rows.map(r => [r.name, r.total])).toEqual([
      ['Health', 2],
      ['CS 460', 1.5],
      ['MATH 254', 0.5],
      ['Untagged', 1],
    ]);
    expect(rows[0].counts.habit).toBe(2);
  });

  it('leaves out kinds that are switched off', () => {
    const { total, rows } = buildTagBreakdown(items, 'time', { task: false, note: true, habit: false });
    expect(total).toBe(2);
    expect(rows.map(r => r.key)).toEqual([`tag:${cs.id}`]);
  });

  it('keeps Untagged last even when it is the largest', () => {
    const big = collectTagItems(activity({
      completed_tasks: [
        task({ id: 1, estimated_time: 10, completed_date: at(20) }),
        task({ id: 2, estimated_time: 1, completed_date: at(20), tags: [cs] }),
      ],
    }), week.start, week.end);
    expect(buildTagBreakdown(big, 'time', all).rows.map(r => r.key)).toEqual([`tag:${cs.id}`, UNTAGGED_KEY]);
  });

  it(`folds the tags past the top ${MAX_TAG_ROWS} into Other tags`, () => {
    const tags = Array.from({ length: MAX_TAG_ROWS + 2 }, (_, i) => ({ id: 100 + i, name: `Tag ${i}`, color: '#888888' }));
    const many = collectTagItems(activity({
      completed_tasks: [
        ...tags.map((tag, i) => task({ id: i + 1, title: `Task ${i}`, estimated_time: 20 - 2 * i, completed_date: at(20), tags: [tag] })),
        // Tagged with both folded tags: Other tags lists it once.
        task({ id: 99, title: 'Both small ones', estimated_time: 2, completed_date: at(21), tags: tags.slice(-2) }),
      ],
    }), week.start, week.end);
    const folded = buildTagBreakdown(many, 'time', all);
    expect(folded.rows).toHaveLength(MAX_TAG_ROWS + 1);
    const other = folded.rows[MAX_TAG_ROWS];
    expect(other).toMatchObject({ key: OTHER_KEY, name: 'Other tags (2)', foldedKeys: ['tag:108', 'tag:109'] });
    expect(other.total).toBe(4 + 2 + 2);
    expect(other.shares.map(s => s.item.title)).toEqual(['Task 8', 'Both small ones', 'Task 9']);
    expect(other.counts.task).toBe(3);
  });
});

describe('buildTagSeries', () => {
  const data = activity({
    completed_tasks: [
      task({ id: 1, completed_date: at(20), tags: [cs, math] }),
      task({ id: 2, completed_date: at(20), tags: [cs] }),
      task({ id: 3, completed_date: at(21) }),
      task({ id: 4, completed_date: at(12), tags: [cs] }),
    ],
    note_sessions: [
      // Runs past midnight: each day keeps its own part.
      { id: 1, note_id: 7, note_title: 'Lecture notes', started_at: at(21, 23, 30), ended_at: at(22, 0, 30), duration_seconds: 3600 },
    ],
    habit_completions: [
      { habit_id: 4, habit_title: 'Run', date: '2026-10-20', estimated_time: 0.5 },
      { habit_id: 5, habit_title: 'Read', date: '2026-10-20', estimated_time: null },
    ],
    notes: [{ id: 7, title: 'Lecture notes', tags: [math] }],
    habits: [{ id: 4, title: 'Run', estimated_time: 0.5, tags: [health] }, { id: 5, title: 'Read', estimated_time: null, tags: [] }],
  });

  it('counts only tasks per day, splitting a task with several tags evenly', () => {
    const { rows, byBucket } = buildTagSeries(data, week.start, week.end, 'task', false);
    expect(rows.map(r => [r.name, r.total])).toEqual([['CS 460', 1.5], ['MATH 254', 0.5], ['Untagged', 1]]);
    expect(Object.fromEntries(byBucket.get('2026-10-20')!)).toEqual({ 'tag:1': 1.5, 'tag:2': 0.5 });
    expect(Object.fromEntries(byBucket.get('2026-10-21')!)).toEqual({ [UNTAGGED_KEY]: 1 });
    expect([...byBucket.keys()].sort()).toEqual(['2026-10-20', '2026-10-21']);
  });

  it('puts note time on the local days it fell on, under the note’s tags', () => {
    const { rows, byBucket } = buildTagSeries(data, week.start, week.end, 'note', false);
    expect(rows.map(r => r.name)).toEqual(['MATH 254']);
    expect(byBucket.get('2026-10-21')!.get('tag:2')).toBeCloseTo(1800);
    expect(byBucket.get('2026-10-22')!.get('tag:2')).toBeCloseTo(1800);
  });

  it('counts habit check-ins, estimate or not, and groups by month for a year', () => {
    const year = periodContaining('year', new Date(2026, 9, 21));
    const { rows, byBucket } = buildTagSeries(data, year.start, year.end, 'habit', true);
    expect(rows.map(r => [r.name, r.total])).toEqual([['Health', 1], ['Untagged', 1]]);
    expect(Object.fromEntries(byBucket.get('2026-10')!)).toEqual({ 'tag:3': 1, [UNTAGGED_KEY]: 1 });
  });

  it('folds the smaller tags into Other tags, as the breakdown does', () => {
    const tags = Array.from({ length: MAX_TAG_ROWS + 2 }, (_, i) => ({ id: 100 + i, name: `T${i}`, color: '#123456' }));
    const many = activity({
      completed_tasks: tags.map((t, i) => task({ id: i, completed_date: at(20), tags: [t] })),
    });
    const { rows, byBucket } = buildTagSeries(many, week.start, week.end, 'task', false);
    expect(rows).toHaveLength(MAX_TAG_ROWS + 1);
    expect(rows[MAX_TAG_ROWS].key).toBe(OTHER_KEY);
    expect(byBucket.get('2026-10-20')!.get(OTHER_KEY)).toBe(2);
  });
});
