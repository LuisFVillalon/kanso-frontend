/**
 * The /reports page's "Where your time went" card: how much of a week, month
 * or year each tag took, from completed tasks, time in notes and habit
 * check-ins. Like the rest of the report it works on local days, and counts
 * archived items too (they come back from GET /get-calendar-activity).
 *
 * Time is the estimate of each completed task, the editing time in each note
 * (clipped to the range) and a habit's estimate per check-in. Count is one per
 * completed task, one per note worked on and one per habit check-in. Tags are
 * the ones items carry now, so re-tagging something moves its past time too.
 */

import type { CalendarActivity } from '@/app/types/activity';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { elapsedDays, shiftPeriod, type ReportPeriod } from '@/app/utils/calendarReport';

export type TagMeasure = 'time' | 'count';

export type TagItemKind = 'task' | 'note' | 'habit';

export const TAG_ITEM_KINDS: TagItemKind[] = ['task', 'note', 'habit'];

export interface ReportTag {
  id: number;
  name: string;
  color?: string | null;
}

export interface TagReportItem {
  kind: TagItemKind;
  id: number;
  title: string;
  tags: ReportTag[];
  /** Estimated hours for a task or a habit's check-ins, editing hours for a note. */
  hours: number;
  /** 1 for a task, editing sessions for a note, check-ins for a habit. */
  occurrences: number;
  /** A task without an estimate (1), or a habit's check-ins without one. */
  missingEstimates: number;
  /** A task's local completion day ("YYYY-MM-DD"). */
  completedOn: string | null;
  /** A habit's estimate per check-in, in hours. */
  hoursEach: number | null;
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Every completed task, note with editing time and habit with check-ins in
 * the local days `start` to `end` (inclusive), one item each. A note's
 * sessions are clipped to the range, so one running past midnight on the
 * last day counts only up to midnight.
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

  return items;
};

/** What an item adds to its tags under `measure`. */
export const itemValue = (item: TagReportItem, measure: TagMeasure): number => {
  if (measure === 'time') return item.hours;
  return item.kind === 'habit' ? item.occurrences : 1;
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
  /** Tasks, notes and habit check-ins behind the row. */
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
const zeroByKind = (): Record<TagItemKind, number> => ({ task: 0, note: 0, habit: 0 });
const countOf = (item: TagReportItem) => (item.kind === 'habit' ? item.occurrences : 1);

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
 * one "Other tags (n)" row unless `fold` is off.
 */
export const buildTagBreakdown = (
  items: TagReportItem[],
  measure: TagMeasure,
  kinds: Record<TagItemKind, boolean>,
  { fold = true }: { fold?: boolean } = {},
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
  const rows = fold && tagRows.length > MAX_TAG_ROWS ? tagRows.slice(0, MAX_TAG_ROWS) : tagRows;
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

/** A row's total in another breakdown — for Other tags, the tags it folded in. */
export const rowTotalIn = (row: TagRow, breakdown: TagBreakdown): number => {
  const keys = row.foldedKeys ?? [row.key];
  return breakdown.rows.filter(r => keys.includes(r.key)).reduce((sum, r) => sum + r.total, 0);
};

export interface ComparisonRange {
  start: Date;
  end: Date;
  /** Cut to the days this period has had so far, because it's still running. */
  partial: boolean;
}

/**
 * The period before `period` to compare against: all of it once `period` is
 * over, otherwise only as many days as `period` has had so far. Null for a
 * period that hasn't started.
 */
export const comparisonRange = (period: ReportPeriod, now: Date = new Date()): ComparisonRange | null => {
  const elapsed = elapsedDays(period, now);
  if (elapsed === 0) return null;
  const previous = shiftPeriod(period, -1);
  const full = startOfDay(now) > period.end;
  if (full) return { start: previous.start, end: previous.end, partial: false };
  const end = new Date(previous.start.getFullYear(), previous.start.getMonth(), previous.start.getDate() + elapsed - 1);
  return { start: previous.start, end: end < previous.end ? end : previous.end, partial: true };
};
