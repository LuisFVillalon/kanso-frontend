/**
 * The Reports "Activity by day" card's Events tab: time in events per day
 * (per month for a year) against the user's work hours, split into time
 * before and after now, and by tag.
 *
 * Which events count follows "Where your time went" (collectTagItems): time
 * is clipped to the period, all-day events add none, past archived
 * occurrences count and upcoming archived ones never arrive. Imported Google
 * events count, except ones the user declined or marked "Show as free"
 * (`busy: false`), which add no time, as in the backend's get-event-report.
 *
 * A day's work window follows get-event-report too: its own window or the
 * every-day one, none on a rest day, and one ending at or before its start
 * runs into the next day and counts on the day it opens. Time inside a
 * window counts once however many events overlap there (the backend's
 * event_window_minutes); a bar's total counts every event in full, like the
 * Events tile, so overlap inside work hours lands in "Outside".
 */

import type { CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { workHoursOn, workHoursSpan, type WorkDaySettings } from '@/app/utils/dayReport';
import {
  buildTagBreakdown, collectTagItems, OTHER_KEY, UNTAGGED_KEY, type ReportTag, type TagItemKind, type TagRow,
} from '@/app/utils/tagReport';

/** Minutes before now and after it. */
export interface PastUpcoming {
  past: number;
  upcoming: number;
}

export interface EventTimeTag extends PastUpcoming {
  /** Of the tag's time, the minutes inside work hours. */
  inWindow: number;
}

export interface EventTimeBucket {
  /** A day's "YYYY-MM-DD", or a month's "YYYY-MM" in a year. */
  key: string;
  /** The work hours' length; 0 on a rest day. A month adds up its days. */
  windowMinutes: number;
  /** Time in the work hours, overlapping events counted once. */
  inWindow: PastUpcoming;
  /** The rest of the bucket's event time. */
  outside: PastUpcoming;
  /** Each tag row's share, by TagRow key. */
  byTag: Map<string, EventTimeTag>;
}

export interface EventTimeSeries {
  /** Event tags as "Where your time went" lists them: largest first, then Other tags and Untagged. */
  rows: TagRow[];
  /** Per bucket key; a bucket with no work hours and no events is absent. */
  buckets: Map<string, EventTimeBucket>;
}

/** The occurrences that add event time: every one but a declined or "Show as free" imported event. */
export const busyEvents = (events: EventOccurrence[] | undefined): EventOccurrence[] =>
  (events ?? []).filter(o => o.busy !== false);

const MINUTE = 60000;
const sum = (p: PastUpcoming) => p.past + p.upcoming;

/** A bucket's whole event time. */
export const bucketTotal = (b: EventTimeBucket): number => sum(b.inWindow) + sum(b.outside);
/** A bucket's time in work hours. */
export const bucketInWindow = (b: EventTimeBucket): number => sum(b.inWindow);

interface Span {
  start: number;
  end: number;
}

/** Minutes of `window` covered by any of `spans`; overlaps count once. */
const unionMinutes = (spans: Span[], window: Span): number => {
  const clipped = spans
    .map(s => ({ start: Math.max(s.start, window.start), end: Math.min(s.end, window.end) }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let coveredTo = -Infinity;
  for (const s of clipped) {
    const start = Math.max(s.start, coveredTo);
    if (s.end > start) {
      total += s.end - start;
      coveredTo = s.end;
    }
  }
  return total / MINUTE;
};

interface DayWindow extends Span {
  dateStr: string;
}

/**
 * Time in events over the local days `start` to `end` (inclusive), per day
 * or per month with `byMonth`, against `settings`' work hours. Time after
 * `now` is "upcoming". An event with several tags is split evenly between
 * them, so a bucket's tags add up to its total.
 */
export const buildEventTimeSeries = (
  activity: CalendarActivity,
  start: Date,
  end: Date,
  settings: WorkDaySettings,
  byMonth: boolean,
  now: Date,
): EventTimeSeries => {
  const events = busyEvents(activity.events);
  const only: Record<TagItemKind, boolean> = { task: false, note: false, habit: false, event: true };
  const { rows } = buildTagBreakdown(collectTagItems({ ...activity, events }, start, end), 'time', only);
  const rowOf = new Map<string, string>();
  for (const row of rows) {
    if (row.key.startsWith('tag:')) rowOf.set(row.key, row.key);
    for (const key of row.foldedKeys ?? []) rowOf.set(key, row.key);
  }
  const rowKeysOf = (tags: ReportTag[]) =>
    tags.length === 0 ? [UNTAGGED_KEY] : tags.map(t => rowOf.get(`tag:${t.id}`) ?? OTHER_KEY);

  const rangeStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const rangeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  const nowMs = now.getTime();
  const keyOf = (dateStr: string) => (byMonth ? dateStr.slice(0, 7) : dateStr);

  // Every day's work window as instants, by its local day.
  const windows = new Map<string, DayWindow>();
  const buckets = new Map<string, EventTimeBucket>();
  const bucketOf = (dateStr: string): EventTimeBucket => {
    const key = keyOf(dateStr);
    let b = buckets.get(key);
    if (!b) {
      b = { key, windowMinutes: 0, inWindow: { past: 0, upcoming: 0 }, outside: { past: 0, upcoming: 0 }, byTag: new Map() };
      buckets.set(key, b);
    }
    return b;
  };
  for (let d = new Date(rangeStart); d.getTime() < rangeEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const hours = workHoursOn(settings, d);
    if (!hours) continue;
    const { opens, closes } = workHoursSpan(hours);
    // The Date constructor rolls minutes past midnight into the next day, in local time.
    const span = {
      start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, opens).getTime(),
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, closes).getTime(),
    };
    const dateStr = toLocalDateStr(d);
    windows.set(dateStr, { dateStr, ...span });
    bucketOf(dateStr).windowMinutes += (span.end - span.start) / MINUTE;
  }

  /** The work window holding instant `at`: its own day's, or the day before's when that one runs past midnight. */
  const windowAt = (at: number): DayWindow | null => {
    const day = new Date(at);
    const before = toLocalDateStr(new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1));
    for (const w of [windows.get(toLocalDateStr(day)), windows.get(before)]) {
      if (w && at >= w.start && at < w.end) return w;
    }
    return null;
  };

  // Each occurrence is cut at midnights, work-window edges and now, so every
  // slice lies wholly inside or outside one window and before or after now.
  const pastSpans = new Map<string, Span[]>();
  const upcomingSpans = new Map<string, Span[]>();
  const totals = new Map<string, PastUpcoming>();
  for (const occurrence of events) {
    if (occurrence.all_day) continue;
    const s = Math.max(new Date(occurrence.starts_at).getTime(), rangeStart);
    const e = Math.min(new Date(occurrence.ends_at).getTime(), rangeEnd);
    if (e <= s) continue;
    const cuts = new Set<number>([s, e]);
    if (nowMs > s && nowMs < e) cuts.add(nowMs);
    const first = new Date(s);
    for (let d = new Date(first.getFullYear(), first.getMonth(), first.getDate() - 1); d.getTime() < e; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const w = windows.get(toLocalDateStr(d));
      for (const at of [next, w?.start, w?.end]) if (at !== undefined && at > s && at < e) cuts.add(at);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const keys = rowKeysOf(occurrence.tags);
    for (let i = 0; i < points.length - 1; i++) {
      const slice = { start: points[i], end: points[i + 1] };
      const minutes = (slice.end - slice.start) / MINUTE;
      const upcoming = slice.start >= nowMs;
      const w = windowAt(slice.start);
      // Time in a window counts on the day the window opens; the rest on its own day.
      const dateStr = w ? w.dateStr : toLocalDateStr(new Date(slice.start));
      const bucket = bucketOf(dateStr);
      if (w) {
        const spans = upcoming ? upcomingSpans : pastSpans;
        let list = spans.get(w.dateStr);
        if (!list) spans.set(w.dateStr, (list = []));
        list.push(slice);
      }
      let total = totals.get(bucket.key);
      if (!total) totals.set(bucket.key, (total = { past: 0, upcoming: 0 }));
      total[upcoming ? 'upcoming' : 'past'] += minutes;
      for (const key of keys) {
        let tag = bucket.byTag.get(key);
        if (!tag) bucket.byTag.set(key, (tag = { past: 0, upcoming: 0, inWindow: 0 }));
        const share = minutes / keys.length;
        tag[upcoming ? 'upcoming' : 'past'] += share;
        if (w) tag.inWindow += share;
      }
    }
  }

  for (const w of windows.values()) {
    const bucket = bucketOf(w.dateStr);
    bucket.inWindow.past += unionMinutes(pastSpans.get(w.dateStr) ?? [], w);
    bucket.inWindow.upcoming += unionMinutes(upcomingSpans.get(w.dateStr) ?? [], w);
  }
  for (const bucket of buckets.values()) {
    const total = totals.get(bucket.key) ?? { past: 0, upcoming: 0 };
    // Rounding guard: float sums can leave a hair below zero.
    bucket.outside.past = Math.max(total.past - bucket.inWindow.past, 0);
    bucket.outside.upcoming = Math.max(total.upcoming - bucket.inWindow.upcoming, 0);
  }
  return { rows, buckets };
};
