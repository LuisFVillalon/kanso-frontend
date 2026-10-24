/**
 * Shapes GET /get-event-report's days into the Reports → Events charts'
 * columns: a column per day for a week, per week (Monday to Sunday, like the
 * report's weeks) for a month, and per month for a year.
 */

import type { EventReport } from '@/app/types/event';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';

export interface EventBucket {
  key: string;
  /** Short axis label: "Mon", "Oct 5" or "Jan". */
  label: string;
  /** Full label for tooltips and screen readers. */
  longLabel: string;
  count: number;
  minutes: number;
  /** The work windows' length in the bucket; 0 when every day in it is a rest day. */
  windowMinutes: number;
  /** The part of the work windows events took. */
  eventWindowMinutes: number;
  /** The time left in the work windows after events. */
  freeMinutes: number;
  /** Holds today. */
  isCurrent: boolean;
}

const shortDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Monday on or before `d`, as the report's weeks start. */
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

export function eventBuckets(report: EventReport, period: ReportPeriod, now: Date = new Date()): EventBucket[] {
  const todayStr = toLocalDateStr(now);
  const buckets = new Map<string, EventBucket>();
  const order: string[] = [];

  // Every day of the period gets its bucket, even one the report left out.
  for (let d = new Date(period.start); d <= period.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    let key: string;
    let label: string;
    let longLabel: string;
    if (period.kind === 'week') {
      key = toLocalDateStr(d);
      label = d.toLocaleDateString('en-US', { weekday: 'short' });
      longLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else if (period.kind === 'month') {
      const monday = mondayOf(d);
      const first = monday < period.start ? period.start : monday;
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      const last = sunday > period.end ? period.end : sunday;
      key = toLocalDateStr(monday);
      label = shortDay(first);
      longLabel = first.getTime() === last.getTime()
        ? shortDay(first)
        : `${shortDay(first)} – ${first.getMonth() === last.getMonth() ? last.getDate() : shortDay(last)}`;
    } else {
      key = toLocalDateStr(d).slice(0, 7);
      label = d.toLocaleDateString('en-US', { month: 'short' });
      longLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, longLabel, count: 0, minutes: 0, windowMinutes: 0, eventWindowMinutes: 0, freeMinutes: 0, isCurrent: false });
      order.push(key);
    }
    if (toLocalDateStr(d) === todayStr) buckets.get(key)!.isCurrent = true;
  }

  const keyOf = (dateStr: string): string => {
    if (period.kind === 'week') return dateStr;
    if (period.kind === 'month') return toLocalDateStr(mondayOf(parseLocalDate(dateStr)));
    return dateStr.slice(0, 7);
  };

  for (const day of report.by_day) {
    const bucket = buckets.get(keyOf(day.date));
    if (!bucket) continue;
    bucket.count += day.count;
    bucket.minutes += day.minutes;
    bucket.windowMinutes += day.window_minutes;
    bucket.eventWindowMinutes += day.event_window_minutes;
    bucket.freeMinutes += day.free_minutes;
  }

  return order.map(key => buckets.get(key)!);
}
