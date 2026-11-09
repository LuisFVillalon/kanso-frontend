import { describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import { periodContaining } from './calendarReport';
import {
  buildTagBreakdown,
  buildTagSeries,
  collectTagItems,
  completedTasksOf,
  MAX_TAG_ROWS,
  OTHER_KEY,
  rowHasTags,
  topNotesOfRow,
  UNTAGGED_KEY,
  type TagItemKind,
} from './tagReport';

// Local-day math depends on the zone; pin one with a DST change.
// Hoisted so fixtures built at load time and in describe blocks see it too.
vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
const math = { id: 2, name: 'MATH 254', color: '#7A5AD0' };
const health = { id: 3, name: 'Health', color: '#3B9A5A' };
const all: Record<TagItemKind, boolean> = { task: true, note: true, habit: true, event: true };

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

// A timed occurrence on an October 2026 local day, as the calendar sends it.
const occurrence = (id: number, title: string, day: number, startHour: number, endHour: number, overrides: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: id, occurrence_date: `2026-10-${day}`, title, description: null, tags: [], all_day: false,
  date: `2026-10-${day}`, end_date: `2026-10-${day}`, start_time: `${startHour}:00:00`, end_time: `${endHour}:00:00`,
  starts_at: at(day, startHour), ends_at: at(day, endHour), time_zone: 'America/Los_Angeles',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: true, archived: false,
  ...overrides,
} as EventOccurrence);

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

describe('collectTagItems events', () => {
  const eventItems = (events: EventOccurrence[]) => collectTagItems(activity({ events }), week.start, week.end);

  it('makes a repeating event one item, adding up its occurrences', () => {
    const items = eventItems([occurrence(1, 'Lecture', 20, 9, 11, { tags: [cs] }), occurrence(1, 'Lecture', 22, 9, 10, { tags: [cs] })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'event', title: 'Lecture', hours: 3, occurrences: 2, completedOn: '2026-10-20', tags: [cs] });
  });

  it('keeps apart an occurrence retitled or re-tagged on its own, with ids that stay unique', () => {
    const items = eventItems([
      occurrence(1, 'Lecture', 20, 9, 10, { tags: [cs] }),
      occurrence(1, 'Guest lecture', 21, 9, 10, { tags: [cs] }),
      occurrence(1, 'Lecture', 22, 9, 10, { tags: [math] }),
    ]);
    expect(items.map(i => i.title)).toEqual(['Lecture', 'Guest lecture', 'Lecture']);
    expect(new Set(items.map(i => i.id)).size).toBe(3);
  });

  it('counts an all-day event without adding time', () => {
    const [item] = eventItems([occurrence(2, 'Holiday', 21, 0, 0, { all_day: true, start_time: null, end_time: null, ends_at: at(22, 0) })]);
    expect(item).toMatchObject({ hours: 0, occurrences: 1 });
    expect(buildTagBreakdown([item], 'time', all).total).toBe(0);
    expect(buildTagBreakdown([item], 'count', all).total).toBe(1);
  });

  it('clips an event at the range, counting it only in the period it starts in', () => {
    const fromLastWeek = occurrence(3, 'Night shift', 18, 22, 2, { end_date: '2026-10-19', ends_at: at(19, 2) });
    const intoNextWeek = occurrence(4, 'Late show', 25, 23, 1, { end_date: '2026-10-26', ends_at: at(26, 1) });
    const [before, after] = eventItems([fromLastWeek, intoNextWeek]);
    expect(before).toMatchObject({ hours: 2, occurrences: 0 });
    expect(after).toMatchObject({ hours: 1, occurrences: 1 });
    expect(buildTagBreakdown([before, after], 'count', all).total).toBe(1);
  });

  it('dates an event by its first occurrence starting in the range, not one running in from before it', () => {
    const fromLastWeek = occurrence(3, 'Night shift', 18, 22, 2, { end_date: '2026-10-19', ends_at: at(19, 2) });
    const lastNight = occurrence(3, 'Night shift', 25, 22, 2, { end_date: '2026-10-26', ends_at: at(26, 2) });
    expect(eventItems([fromLastWeek, lastNight])[0]).toMatchObject({ hours: 4, occurrences: 1, completedOn: '2026-10-25' });
    expect(eventItems([fromLastWeek])[0]).toMatchObject({ hours: 2, occurrences: 0, completedOn: '2026-10-18' });
  });

  it('counts a past archived event, and is fine on a backend that sends no events', () => {
    expect(eventItems([occurrence(5, 'Old class', 20, 9, 10, { archived: true })])[0]).toMatchObject({ hours: 1, occurrences: 1 });
    expect(collectTagItems(activity({}), week.start, week.end)).toEqual([]);
  });

  it('splits a multi-tag event evenly and sends an untagged one to Untagged', () => {
    const items = eventItems([occurrence(6, 'Review', 20, 9, 11, { tags: [cs, math] }), occurrence(7, 'Dentist', 21, 9, 10)]);
    const { total, rows } = buildTagBreakdown(items, 'time', all);
    expect(total).toBe(3);
    expect(rows.map(r => [r.key, r.total, r.byKind.event, r.counts.event])).toEqual([
      [`tag:${cs.id}`, 1, 1, 1],
      [`tag:${math.id}`, 1, 1, 1],
      [UNTAGGED_KEY, 1, 1, 1],
    ]);
    expect(buildTagBreakdown(items, 'time', { ...all, event: false }).total).toBe(0);
  });

  it('stays out of the per-kind charts', () => {
    const data = activity({ events: [occurrence(1, 'Lecture', 20, 9, 11, { tags: [cs] })] });
    expect(buildTagSeries(data, week.start, week.end, 'task', false).rows).toEqual([]);
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
    expect(csRow.byKind).toEqual({ task: 1.5, note: 2, habit: 0, event: 0 });
    expect(csRow.counts).toEqual({ task: 1, note: 1, habit: 0, event: 0 });
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
    const { total, rows } = buildTagBreakdown(items, 'time', { task: false, note: true, habit: false, event: false });
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

describe('rowHasTags', () => {
  const completion = (habit_id: number) => ({ habit_id, habit_title: `Habit ${habit_id}`, date: '2026-10-20', estimated_time: null });
  const tags = Array.from({ length: MAX_TAG_ROWS + 2 }, (_, i) => ({ id: 100 + i, name: `T${i}`, color: '#123456' }));
  // Eight large tags, the last two fold into Other tags, and one habit carries none.
  const { rows } = buildTagSeries(activity({
    habit_completions: [...tags.flatMap((_, i) => Array.from({ length: tags.length - i }, () => completion(i + 1))), completion(50)],
    habits: [...tags.map((t, i) => ({ id: i + 1, title: `Habit ${i + 1}`, estimated_time: null, tags: [t] })), { id: 50, title: 'Habit 50', estimated_time: null, tags: [] }],
  }), week.start, week.end, 'habit', false);
  const row = (key: string) => rows.find(r => r.key === key)!;

  it('matches a tag row by the tag', () => {
    expect(rowHasTags(row('tag:100'), [tags[0], tags[1]])).toBe(true);
    expect(rowHasTags(row('tag:100'), [tags[1]])).toBe(false);
    expect(rowHasTags(row('tag:100'), [])).toBe(false);
  });

  it('matches Untagged only with no tags', () => {
    expect(rowHasTags(row(UNTAGGED_KEY), [])).toBe(true);
    expect(rowHasTags(row(UNTAGGED_KEY), [tags[0]])).toBe(false);
  });

  it('matches Other tags by any folded tag', () => {
    expect(rowHasTags(row(OTHER_KEY), [tags[MAX_TAG_ROWS + 1]])).toBe(true);
    expect(rowHasTags(row(OTHER_KEY), [tags[0]])).toBe(false);
    expect(rowHasTags(row(OTHER_KEY), [])).toBe(false);
  });
});

describe('completedTasksOf', () => {
  const done = (id: number, tags: typeof cs[], day: number, hour = 9) => task({ id, tags, completed_date: at(day, hour) });
  const rowOf = (data: CalendarActivity, name: string) =>
    buildTagSeries(data, week.start, week.end, 'task', false).rows.find(r => r.name.startsWith(name))!;
  const ids = (data: CalendarActivity, row: ReturnType<typeof rowOf> | null) =>
    completedTasksOf(data, week.start, week.end, row).map(t => t.id);

  it('lists the period’s completed tasks, newest first', () => {
    const data = activity({
      completed_tasks: [done(1, [], 19), done(2, [cs], 21, 8), done(3, [], 21, 17), done(4, [], 12), done(5, [], 26), task({ id: 6 })],
    });
    expect(ids(data, null)).toEqual([3, 2, 1]);
  });

  it('counts a task on its local day, as the chart does', () => {
    const lastMinute = task({ id: 1, completed_date: new Date(2026, 9, 25, 23, 59).toISOString() });
    const nextDay = task({ id: 2, completed_date: new Date(2026, 9, 26, 0, 1).toISOString() });
    expect(ids(activity({ completed_tasks: [lastMinute, nextDay] }), null)).toEqual([1]);
  });

  it('lists a tag’s tasks, and untagged tasks for Untagged', () => {
    const data = activity({ completed_tasks: [done(1, [cs, math], 19), done(2, [math], 20), done(3, [], 21)] });
    expect(ids(data, rowOf(data, 'MATH 254'))).toEqual([2, 1]);
    expect(ids(data, rowOf(data, 'CS 460'))).toEqual([1]);
    expect(ids(data, rowOf(data, 'Untagged'))).toEqual([3]);
  });

  it('lists a task once under Other tags, even with two folded tags', () => {
    const tags = Array.from({ length: MAX_TAG_ROWS + 2 }, (_, i) => ({ id: 100 + i, name: `T${i}`, color: '#123456' }));
    const top = tags.slice(0, MAX_TAG_ROWS).flatMap((tag, i) => [done(10 + i * 2, [tag], 20), done(11 + i * 2, [tag], 20)]);
    const data = activity({ completed_tasks: [...top, done(1, tags.slice(MAX_TAG_ROWS), 19)] });
    expect(ids(data, rowOf(data, 'Other tags'))).toEqual([1]);
  });
});

describe('topNotesOfRow', () => {
  const session = (id: number, note_id: number, minutes: number, day = 20) => ({
    id, note_id, note_title: `Note ${note_id}`, started_at: at(day, 9), ended_at: at(day, 9, minutes), duration_seconds: minutes * 60,
  });
  const rowsOf = (data: CalendarActivity) => buildTagSeries(data, week.start, week.end, 'note', false).rows;
  const named = (rows: ReturnType<typeof rowsOf>, name: string) => rows.find(r => r.name === name)!;

  it('ranks a tag’s notes by each one’s own full time, not its split share', () => {
    const rows = rowsOf(activity({
      note_sessions: [session(1, 1, 40), session(2, 2, 30), session(3, 2, 20, 21), session(4, 3, 10)],
      notes: [{ id: 1, title: 'Note 1', tags: [cs, math] }, { id: 2, title: 'Note 2', tags: [cs] }, { id: 3, title: 'Note 3', tags: [math] }],
    }));
    expect(topNotesOfRow(named(rows, 'CS 460'))).toEqual([
      { noteId: 2, title: 'Note 2', seconds: 3000 },
      { noteId: 1, title: 'Note 1', seconds: 2400 },
    ]);
    expect(topNotesOfRow(named(rows, 'MATH 254')).map(n => n.noteId)).toEqual([1, 3]);
  });

  it('lists untagged notes for Untagged', () => {
    const rows = rowsOf(activity({ note_sessions: [session(1, 1, 30), session(2, 2, 30)], notes: [{ id: 1, title: 'Note 1', tags: [cs] }, { id: 2, title: 'Note 2', tags: [] }] }));
    expect(topNotesOfRow(named(rows, 'Untagged')).map(n => n.noteId)).toEqual([2]);
  });

  it('lists a note once under Other tags, even with two folded tags', () => {
    const tags = Array.from({ length: MAX_TAG_ROWS + 2 }, (_, i) => ({ id: 100 + i, name: `T${i}`, color: '#123456' }));
    const big = tags.slice(0, MAX_TAG_ROWS).map((t, i) => ({ id: i + 1, title: `Note ${i + 1}`, tags: [t] }));
    const rows = rowsOf(activity({
      note_sessions: [...big.map(n => session(n.id, n.id, 30)), session(99, 99, 5)],
      notes: [...big, { id: 99, title: 'Note 99', tags: tags.slice(MAX_TAG_ROWS) }],
    }));
    expect(topNotesOfRow(rows.find(r => r.key === OTHER_KEY)!)).toEqual([{ noteId: 99, title: 'Note 99', seconds: 300 }]);
  });

  it('keeps to five notes and to whole milliseconds', () => {
    const notes = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `Note ${i + 1}`, tags: [cs] }));
    const top = topNotesOfRow(named(rowsOf(activity({
      // Three thirds of an hour: summed as floats, these miss a clean hour.
      note_sessions: [...notes.map(n => session(n.id, n.id, n.id)), session(11, 7, 20, 21), session(12, 7, 20, 22), session(13, 7, 13, 23)],
      notes,
    })), 'CS 460'));
    expect(top.map(n => n.noteId)).toEqual([7, 6, 5, 4, 3]);
    expect(top[0].seconds).toBe(3600);
  });
});
