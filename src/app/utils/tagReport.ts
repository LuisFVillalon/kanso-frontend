/**
 * The /reports page's "Where your time went" card: how much of a week, month
 * or year each tag took, from completed tasks, time in notes, habit check-ins
 * and events. Like the rest of the report it works on local days, and counts
 * archived items too (they come back from GET /get-calendar-activity).
 *
 * Time is the estimate of each completed task, the editing time in each note
 * (clipped to the range), a habit's estimate per check-in and each event's
 * length (clipped to the range; an all-day event, or a timed one 24 hours or
 * longer, adds none). Count is one per completed task, one per note worked
 * on, one per habit check-in and one per event starting in the range. Events
 * follow GET /get-event-report: what the calendar shows, so past archived
 * occurrences count and upcoming archived ones never arrive, and a declined
 * or "Show as free" imported event doesn't count. Tags are the ones items carry now, so re-tagging
 * something moves its past time too.
 */

import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import { addSecondsByLocalDay, TOP_NOTES, type NoteTime } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { addsHours } from '@/app/utils/eventOccurrences';

export type TagMeasure = 'time' | 'count';

export type TagItemKind = 'task' | 'note' | 'habit' | 'event';

export const TAG_ITEM_KINDS: TagItemKind[] = ['task', 'note', 'habit', 'event'];

/** Every kind switched on, for the summaries of "Where your time went". */
export const ALL_TAG_KINDS: Record<TagItemKind, boolean> = { task: true, note: true, habit: true, event: true };

/** The kinds with a chart of their own, on the Tasks, Notes and Habits tabs. */
export type TagChartKind = Exclude<TagItemKind, 'event'>;

export interface ReportTag {
  id: number;
  name: string;
  color?: string | null;
}

export interface TagReportItem {
  kind: TagItemKind;
  /** Unique within its kind. */
  id: number;
  title: string;
  tags: ReportTag[];
  /** Estimated hours for a task or a habit's check-ins, editing hours for a note, hours inside the range for an event. */
  hours: number;
  /** 1 for a task, editing sessions for a note, check-ins for a habit, occurrences starting in the range for an event. */
  occurrences: number;
  /** A task without an estimate (1), or a habit's check-ins without one. */
  missingEstimates: number;
  /** A task's local completion day ("YYYY-MM-DD"), or the local day an event first starts on in the range (the day before it when it only runs in). */
  completedOn: string | null;
  /** A habit's estimate per check-in, in hours. */
  hoursEach: number | null;
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Every completed task, note with editing time, habit with check-ins and
 * event in the local days `start` to `end` (inclusive), one item each. A
 * note's sessions and an event's occurrences are clipped to the range, so one
 * running past midnight on the last day counts only up to midnight.
 */
export const collectTagItems = (activity: CalendarActivity, start: Date, end: Date): TagReportItem[] => {
  const firstDay = toLocalDateStr(start);
  const lastDay = toLocalDateStr(end);
  const inRange = (dateStr: string) => dateStr >= firstDay && dateStr <= lastDay;
  const items: TagReportItem[] = [];

  for (const task of activity.completed_tasks) {
    if (!task.completed_date) continue;
    const completedOn = toLocalDateStr(new Date(task.completed_date));
    if (!inRange(completedOn)) continue;
    items.push({
      kind: 'task',
      id: task.id,
      title: task.title,
      tags: task.tags,
      hours: task.estimated_time ?? 0,
      occurrences: 1,
      missingEstimates: task.estimated_time == null ? 1 : 0,
      completedOn,
      hoursEach: null,
    });
  }

  const noteMeta = new Map((activity.notes ?? []).map(n => [n.id, n]));
  const rangeStartMs = startOfDay(start).getTime();
  const rangeEndMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  const notes = new Map<number, TagReportItem>();
  for (const session of activity.note_sessions) {
    const startMs = Math.max(new Date(session.started_at).getTime(), rangeStartMs);
    const endMs = Math.min(new Date(session.ended_at).getTime(), rangeEndMs);
    if (endMs <= startMs) continue;
    let note = notes.get(session.note_id);
    if (!note) {
      const meta = noteMeta.get(session.note_id);
      note = {
        kind: 'note',
        id: session.note_id,
        title: session.note_title || meta?.title || 'Untitled Note',
        tags: meta?.tags ?? [],
        hours: 0,
        occurrences: 0,
        missingEstimates: 0,
        completedOn: null,
        hoursEach: null,
      };
      notes.set(session.note_id, note);
    }
    note.hours += (endMs - startMs) / 3600000;
    note.occurrences++;
  }
  items.push(...notes.values());

  const habitMeta = new Map((activity.habits ?? []).map(h => [h.id, h]));
  const habits = new Map<number, TagReportItem>();
  for (const completion of activity.habit_completions) {
    if (!inRange(completion.date)) continue;
    let habit = habits.get(completion.habit_id);
    if (!habit) {
      const meta = habitMeta.get(completion.habit_id);
      habit = {
        kind: 'habit',
        id: completion.habit_id,
        title: completion.habit_title,
        tags: meta?.tags ?? [],
        hours: 0,
        occurrences: 0,
        missingEstimates: 0,
        completedOn: null,
        hoursEach: meta ? meta.estimated_time : completion.estimated_time,
      };
      habits.set(completion.habit_id, habit);
    }
    const each = habit.hoursEach;
    if (each == null) habit.missingEstimates++;
    else habit.hours += each;
    habit.occurrences++;
  }
  items.push(...habits.values());

  const events = new Map<string, TagReportItem>();
  for (const occurrence of activity.events ?? []) {
    // A declined or "Show as free" imported event leaves the time free.
    if (occurrence.busy === false) continue;
    const startsInRange = inRange(occurrence.date);
    const startMs = Math.max(new Date(occurrence.starts_at).getTime(), rangeStartMs);
    const endMs = Math.min(new Date(occurrence.ends_at).getTime(), rangeEndMs);
    const hours = addsHours(occurrence) ? Math.max(endMs - startMs, 0) / 3600000 : 0;
    if (!startsInRange && hours === 0) continue;
    // A repeating event is one item, but an occurrence retitled or re-tagged on its own stands apart.
    const key = `${occurrence.event_id}|${occurrence.title}|${occurrence.tags.map(t => t.id).sort((a, b) => a - b).join(',')}`;
    let event = events.get(key);
    if (!event) {
      event = {
        kind: 'event',
        id: events.size,
        title: occurrence.title,
        tags: occurrence.tags,
        hours: 0,
        occurrences: 0,
        missingEstimates: 0,
        completedOn: occurrence.date,
        hoursEach: null,
      };
      events.set(key, event);
    }
    event.hours += hours;
    if (startsInRange) {
      if (event.occurrences === 0) event.completedOn = occurrence.date;
      event.occurrences++;
    }
  }
  items.push(...events.values());

  return items;
};

/** How many things an item stands for: a habit's check-ins or an event's occurrences, otherwise one. */
const countOf = (item: TagReportItem) => (item.kind === 'habit' || item.kind === 'event' ? item.occurrences : 1);

/** What an item adds to its tags under `measure`. */
export const itemValue = (item: TagReportItem, measure: TagMeasure): number => {
  if (measure === 'time') return item.hours;
  return countOf(item);
};

export const UNTAGGED_KEY = 'untagged';
export const OTHER_KEY = 'other';

/** Tags shown as their own row; the rest fold into "Other tags (n)". */
export const MAX_TAG_ROWS = 8;

export interface TagShare {
  item: TagReportItem;
  /** The part of the item's value this row got. */
  value: number;
}

export interface TagRow {
  /** `tag:<id>`, UNTAGGED_KEY or OTHER_KEY. */
  key: string;
  name: string;
  /** The tag's own color; null for Untagged and Other tags. */
  color: string | null;
  total: number;
  byKind: Record<TagItemKind, number>;
  /** Tasks, notes, habit check-ins and event occurrences behind the row. */
  counts: Record<TagItemKind, number>;
  shares: TagShare[];
  /** For Other tags: the keys of the tags folded into it. */
  foldedKeys?: string[];
}

export interface TagBreakdown {
  /** Everything counted, whatever its tags. */
  total: number;
  /** Tags by total, largest first, then Other tags and Untagged. */
  rows: TagRow[];
}

const tagKey = (tag: ReportTag) => `tag:${tag.id}`;
const zeroByKind = (): Record<TagItemKind, number> => ({ task: 0, note: 0, habit: 0, event: 0 });

const newRow = (key: string, name: string, color: string | null): TagRow => ({
  key, name, color, total: 0, byKind: zeroByKind(), counts: zeroByKind(), shares: [],
});

const addShare = (row: TagRow, item: TagReportItem, value: number) => {
  row.total += value;
  row.byKind[item.kind] += value;
  const existing = row.shares.find(s => s.item === item);
  if (existing) {
    existing.value += value;
    return;
  }
  row.counts[item.kind] += countOf(item);
  row.shares.push({ item, value });
};

/**
 * Shares each item's value out among its tags. An item with several tags is
 * split evenly between them, so the rows always add up to `total`; one with
 * none goes to Untagged. Past MAX_TAG_ROWS tags, the smaller ones fold into
 * one "Other tags (n)" row.
 */
export const buildTagBreakdown = (
  items: TagReportItem[],
  measure: TagMeasure,
  kinds: Record<TagItemKind, boolean>,
): TagBreakdown => {
  const tags = new Map<string, TagRow>();
  const untagged = newRow(UNTAGGED_KEY, 'Untagged', null);
  let total = 0;

  for (const item of items) {
    if (!kinds[item.kind]) continue;
    const value = itemValue(item, measure);
    if (value <= 0) continue;
    total += value;
    if (item.tags.length === 0) {
      addShare(untagged, item, value);
      continue;
    }
    const share = value / item.tags.length;
    for (const tag of item.tags) {
      const key = tagKey(tag);
      let row = tags.get(key);
      if (!row) {
        row = newRow(key, tag.name, tag.color ?? null);
        tags.set(key, row);
      }
      addShare(row, item, share);
    }
  }

  const tagRows = [...tags.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const rows = tagRows.length > MAX_TAG_ROWS ? tagRows.slice(0, MAX_TAG_ROWS) : tagRows;
  if (rows.length < tagRows.length) {
    const rest = tagRows.slice(MAX_TAG_ROWS);
    const other = newRow(OTHER_KEY, `Other tags (${rest.length})`, null);
    other.foldedKeys = rest.map(r => r.key);
    for (const row of rest) for (const { item, value } of row.shares) addShare(other, item, value);
    rows.push(other);
  }
  if (untagged.total > 0) rows.push(untagged);
  return { total, rows };
};

/**
 * The notes behind a row of the Notes chart, most time first, as long as the
 * report's top-notes list. Each keeps its own full time in the period, not
 * the share of it the row got.
 */
export const topNotesOfRow = (row: TagRow): NoteTime[] =>
  row.shares
    // Back to whole milliseconds: hours summed as floats can land just under a minute, which would then display as one less.
    .map(({ item }) => ({ noteId: item.id, title: item.title, seconds: Math.round(item.hours * 3600000) / 1000 }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, TOP_NOTES);

/** Whether something carrying `tags` belongs to a chart row, including any tag folded into Other tags. */
export const rowHasTags = (row: TagRow, tags: ReportTag[]): boolean => {
  if (row.key === UNTAGGED_KEY) return tags.length === 0;
  return tags.some(tag => tagKey(tag) === row.key || row.foldedKeys?.includes(tagKey(tag)));
};

/**
 * The tasks completed in the local days `start` to `end`, the ones the Tasks
 * chart counts, newest first. With `row`, only the tasks behind that row of
 * the chart.
 */
export const completedTasksOf = (activity: CalendarActivity, start: Date, end: Date, row: TagRow | null): ActivityTask[] => {
  const firstDay = toLocalDateStr(start);
  const lastDay = toLocalDateStr(end);
  const ids = row && new Set(row.shares.map(s => s.item.id));
  return activity.completed_tasks
    .filter(task => {
      if (!task.completed_date || (ids && !ids.has(task.id))) return false;
      const completedOn = toLocalDateStr(new Date(task.completed_date));
      return completedOn >= firstDay && completedOn <= lastDay;
    })
    .sort((a, b) => new Date(b.completed_date!).getTime() - new Date(a.completed_date!).getTime());
};

/** What a kind's chart counts: tasks completed, seconds in notes, habit check-ins. */
export const KIND_MEASURE: Record<TagChartKind, TagMeasure> = { task: 'count', note: 'time', habit: 'count' };

export interface TagSeries {
  /** The kind's tags, as the Time tab lists them: largest first, then Other tags and Untagged. */
  rows: TagRow[];
  /** Per bucket key ("YYYY-MM-DD", or "YYYY-MM" by month), each row's value — seconds for notes. */
  byBucket: Map<string, Map<string, number>>;
}

/**
 * One kind's activity over `start` to `end`, per day (or per month with
 * `byMonth`) and per tag, for the Tasks, Notes and Habits charts: tasks
 * completed, note editing time or habit check-ins. Like the Time tab, an
 * item with several tags is split evenly between them, so a bucket's tags
 * add up to what was done in it.
 */
export const buildTagSeries = (
  activity: CalendarActivity,
  start: Date,
  end: Date,
  kind: TagChartKind,
  byMonth: boolean,
): TagSeries => {
  const only: Record<TagItemKind, boolean> = { task: kind === 'task', note: kind === 'note', habit: kind === 'habit', event: false };
  const { rows } = buildTagBreakdown(collectTagItems(activity, start, end), KIND_MEASURE[kind], only);
  const rowOf = new Map<string, string>();
  for (const row of rows) {
    if (row.key.startsWith('tag:')) rowOf.set(row.key, row.key);
    for (const key of row.foldedKeys ?? []) rowOf.set(key, row.key);
  }

  const firstDay = toLocalDateStr(start);
  const lastDay = toLocalDateStr(end);
  const byBucket = new Map<string, Map<string, number>>();
  const add = (dateStr: string, tags: ReportTag[], value: number) => {
    if (dateStr < firstDay || dateStr > lastDay || value <= 0) return;
    const key = byMonth ? dateStr.slice(0, 7) : dateStr;
    let bucket = byBucket.get(key);
    if (!bucket) {
      bucket = new Map();
      byBucket.set(key, bucket);
    }
    const keys = tags.length === 0 ? [UNTAGGED_KEY] : tags.map(t => rowOf.get(tagKey(t)) ?? OTHER_KEY);
    for (const k of keys) bucket.set(k, (bucket.get(k) ?? 0) + value / keys.length);
  };

  if (kind === 'task') {
    for (const task of activity.completed_tasks) {
      if (task.completed_date) add(toLocalDateStr(new Date(task.completed_date)), task.tags, 1);
    }
  } else if (kind === 'note') {
    const tagsOf = new Map((activity.notes ?? []).map(n => [n.id, n.tags]));
    const rangeStartMs = startOfDay(start).getTime();
    const rangeEndMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
    for (const session of activity.note_sessions) {
      const startMs = Math.max(new Date(session.started_at).getTime(), rangeStartMs);
      const endMs = Math.min(new Date(session.ended_at).getTime(), rangeEndMs);
      if (endMs <= startMs) continue;
      const seconds = new Map<string, number>();
      addSecondsByLocalDay(startMs, endMs, seconds);
      for (const [dateStr, s] of seconds) add(dateStr, tagsOf.get(session.note_id) ?? [], s);
    }
  } else {
    const tagsOf = new Map((activity.habits ?? []).map(h => [h.id, h.tags]));
    for (const c of activity.habit_completions) add(c.date, tagsOf.get(c.habit_id) ?? [], 1);
  }
  return { rows, byBucket };
};
