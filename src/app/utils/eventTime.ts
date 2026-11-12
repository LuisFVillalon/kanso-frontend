/**
 * Time in events per day (per month for a year) against the user's work
 * hours, split into time before and after now, and by tag: the Reports
 * Events view's chart and cards, and the Overview's Pace card.
 *
 * Which events count follows "Where your time went" (collectTagItems): time
 * is clipped to the period, all-day events add none, past archived
 * occurrences count and upcoming archived ones never arrive. Imported Google
 * events count, except ones the user declined or marked "Show as free"
 * (`busy: false`), which add no time, as in the backend's get-event-report.
 * A timed event 24 hours or longer (a trip, an "Out of office" block) counts
 * like an all-day one: it shows on its days but adds no hours.
 *
 * Each minute counts once however many events overlap then, so a day never
 * passes 24 hours and its work hours are never more than booked. That minute
 * is split evenly between the events in it, and each event's share evenly
 * between its tags, so the tags always add up to the day's total.
 *
 * A day's work window follows get-event-report too: its own window or the
 * every-day one, none on a rest day, and one ending at or before its start
 * runs into the next day and counts on the day it opens.
 */

import type { CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { workHoursOn, workHoursSpan, type WorkDaySettings } from '@/app/utils/dayReport';
import { addsHours } from '@/app/utils/eventOccurrences';
import {
  buildTagBreakdown, OTHER_KEY, UNTAGGED_KEY, type ReportTag, type TagItemKind, type TagReportItem, type TagRow,
} from '@/app/utils/tagReport';

export { addsHours, spansDays } from '@/app/utils/eventOccurrences';

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
  /** Of the work hours, the minutes still to come after now. */
  upcomingWindowMinutes: number;
  /** Time in the work hours. */
  inWindow: PastUpcoming;
  /** The rest of the bucket's event time. */
  outside: PastUpcoming;
  /** Each tag row's share, by TagRow key. */
  byTag: Map<string, EventTimeTag>;
  /** How many occurrences add time to the bucket. */
  eventCount: number;
}

export interface EventTimeSeries {
  /** Event tags as "Where your time went" lists them: largest first, then Other tags and Untagged. */
  rows: TagRow[];
  /** Per bucket key; a bucket with no work hours and no events is absent. */
  buckets: Map<string, EventTimeBucket>;
}

const MINUTE = 60000;
const sum = (p: PastUpcoming) => p.past + p.upcoming;

/** A bucket's whole event time. */
export const bucketTotal = (b: EventTimeBucket): number => sum(b.inWindow) + sum(b.outside);
/** A bucket's time in work hours. */
export const bucketInWindow = (b: EventTimeBucket): number => sum(b.inWindow);

/** One stretch of time with the same events in it. */
export interface EventSlice {
  /** Instants, in ms. */
  start: number;
  end: number;
  minutes: number;
  /** Each event in the slice, by its index in the events passed, and its even share of `minutes`. */
  shares: Map<number, number>;
}

/**
 * Sweeps the time from `rangeStart` to `rangeEnd` (ms) cut at every
 * occurrence's start and end and at `cutsAt`, keeping the slices some event
 * takes up. Only busy timed events under 24 hours take time. A slice's
 * minutes count once, split evenly between the events in it.
 */
export const eventMinuteShares = (
  events: EventOccurrence[],
  rangeStart: number,
  rangeEnd: number,
  cutsAt: number[] = [],
): EventSlice[] => {
  const starts = new Map<number, number[]>();
  const ends = new Map<number, number[]>();
  const points = new Set<number>();
  const at = (map: Map<number, number[]>, ms: number, i: number) => {
    const list = map.get(ms);
    if (list) list.push(i);
    else map.set(ms, [i]);
    points.add(ms);
  };
  events.forEach((o, i) => {
    if (o.busy === false || !addsHours(o)) return;
    const s = Math.max(new Date(o.starts_at).getTime(), rangeStart);
    const e = Math.min(new Date(o.ends_at).getTime(), rangeEnd);
    if (e <= s) return;
    at(starts, s, i);
    at(ends, e, i);
  });
  if (points.size === 0) return [];
  for (const c of cutsAt) if (c > rangeStart && c < rangeEnd) points.add(c);

  const sorted = [...points].sort((a, b) => a - b);
  const active = new Set<number>();
  const slices: EventSlice[] = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const p = sorted[k];
    for (const i of ends.get(p) ?? []) active.delete(i);
    for (const i of starts.get(p) ?? []) active.add(i);
    if (active.size === 0) continue;
    const minutes = (sorted[k + 1] - p) / MINUTE;
    const share = minutes / active.size;
    slices.push({ start: p, end: sorted[k + 1], minutes, shares: new Map([...active].map(i => [i, share])) });
  }
  return slices;
};

interface Span {
  start: number;
  end: number;
}

interface DayWindow extends Span {
  dateStr: string;
}

/**
 * Time in events over the local days `start` to `end` (inclusive), per day
 * or per month with `byMonth`, against `settings`' work hours. Time after
 * `now` is "upcoming". Overlapping events count once, sharing the time
 * evenly, and an event with several tags is split evenly between them, so a
 * bucket's tags add up to its total.
 */
export const buildEventTimeSeries = (
  activity: CalendarActivity,
  start: Date,
  end: Date,
  settings: WorkDaySettings,
  byMonth: boolean,
  now: Date,
): EventTimeSeries => {
  const events = activity.events ?? [];
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
      b = {
        key, windowMinutes: 0, upcomingWindowMinutes: 0,
        inWindow: { past: 0, upcoming: 0 }, outside: { past: 0, upcoming: 0 }, byTag: new Map(), eventCount: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };
  // Slices are cut at midnights, work-window edges and now, so every one lies
  // wholly inside or outside one window and before or after now.
  const cuts = [nowMs];
  for (let d = new Date(rangeStart); d.getTime() < rangeEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    cuts.push(d.getTime());
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
    cuts.push(span.start, span.end);
    const bucket = bucketOf(dateStr);
    bucket.windowMinutes += (span.end - span.start) / MINUTE;
    bucket.upcomingWindowMinutes += Math.max(span.end - Math.max(span.start, nowMs), 0) / MINUTE;
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

  const slices = eventMinuteShares(events, rangeStart, rangeEnd, cuts);

  // The tag rows, from each event's share of the time.
  const minutesOf = new Map<number, number>();
  for (const slice of slices) {
    for (const [i, share] of slice.shares) minutesOf.set(i, (minutesOf.get(i) ?? 0) + share);
  }
  const items: TagReportItem[] = [...minutesOf].map(([i, minutes]) => ({
    kind: 'event', id: i, title: events[i].title, tags: events[i].tags, hours: minutes / 60,
    occurrences: 1, missingEstimates: 0, completedOn: events[i].date, hoursEach: null,
  }));
  const only: Record<TagItemKind, boolean> = { task: false, note: false, habit: false, event: true };
  const { rows } = buildTagBreakdown(items, 'time', only);
  const rowOf = new Map<string, string>();
  for (const row of rows) {
    if (row.key.startsWith('tag:')) rowOf.set(row.key, row.key);
    for (const key of row.foldedKeys ?? []) rowOf.set(key, row.key);
  }
  const rowKeysOf = (tags: ReportTag[]) =>
    tags.length === 0 ? [UNTAGGED_KEY] : tags.map(t => rowOf.get(`tag:${t.id}`) ?? OTHER_KEY);

  const counted = new Map<string, Set<number>>();
  for (const slice of slices) {
    const part = slice.start >= nowMs ? 'upcoming' : 'past';
    const w = windowAt(slice.start);
    // Time in a window counts on the day the window opens; the rest on its own day.
    const bucket = bucketOf(w ? w.dateStr : toLocalDateStr(new Date(slice.start)));
    (w ? bucket.inWindow : bucket.outside)[part] += slice.minutes;
    let seen = counted.get(bucket.key);
    if (!seen) counted.set(bucket.key, (seen = new Set()));
    for (const [i, share] of slice.shares) {
      seen.add(i);
      const keys = rowKeysOf(events[i].tags);
      for (const key of keys) {
        let tag = bucket.byTag.get(key);
        if (!tag) bucket.byTag.set(key, (tag = { past: 0, upcoming: 0, inWindow: 0 }));
        tag[part] += share / keys.length;
        if (w) tag.inWindow += share / keys.length;
      }
    }
  }
  for (const [key, seen] of counted) buckets.get(key)!.eventCount = seen.size;
  return { rows, buckets };
};
