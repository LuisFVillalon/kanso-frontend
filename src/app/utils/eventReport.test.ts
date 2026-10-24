import { describe, expect, it } from 'vitest';
import type { EventReport, EventReportDay } from '@/app/types/event';
import { periodContaining } from './calendarReport';
import { eventBuckets } from './eventReport';

const day = (date: string, minutes: number, window = 840, eventWindow = minutes): EventReportDay => ({
  date, count: minutes > 0 ? 1 : 0, minutes, is_rest_day: window === 0,
  window_minutes: window, event_window_minutes: eventWindow, free_minutes: window - eventWindow,
});

const report = (byDay: EventReportDay[]): EventReport => ({
  start_date: '', end_date: '', event_count: 0, archived_count: 0, total_minutes: 0,
  window_minutes: 0, event_window_minutes: 0, free_minutes: 0, free_pct: null,
  busiest_day: null, by_tag: [], by_day: byDay, by_week: [], by_month: [],
});

const now = new Date(2026, 9, 21, 12);

describe('eventBuckets', () => {
  it('gives a week a column per day, Monday first', () => {
    const buckets = eventBuckets(report([day('2026-10-19', 50), day('2026-10-25', 30, 0, 0)]), periodContaining('week', now), now);
    expect(buckets.map(b => b.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(buckets[0]).toMatchObject({ longLabel: 'Mon, Oct 19', count: 1, minutes: 50, windowMinutes: 840, freeMinutes: 790 });
    expect(buckets[2].isCurrent).toBe(true);
    // A day the report left out still gets its column.
    expect(buckets[1]).toMatchObject({ count: 0, minutes: 0, windowMinutes: 0 });
    expect(buckets[6]).toMatchObject({ minutes: 30, windowMinutes: 0 });
  });

  it('gives a month a column per Monday week, cut at the month’s ends', () => {
    const buckets = eventBuckets(
      report([day('2026-10-01', 60), day('2026-10-04', 30, 0, 0), day('2026-10-05', 90), day('2026-10-31', 45, 0, 0)]),
      periodContaining('month', now),
      now,
    );
    expect(buckets.map(b => b.longLabel)).toEqual(['Oct 1 – 4', 'Oct 5 – 11', 'Oct 12 – 18', 'Oct 19 – 25', 'Oct 26 – 31']);
    expect(buckets.map(b => b.count)).toEqual([2, 1, 0, 0, 1]);
    expect(buckets[0]).toMatchObject({ label: 'Oct 1', minutes: 90, windowMinutes: 840, eventWindowMinutes: 60 });
    expect(buckets[3].isCurrent).toBe(true);
  });

  it('gives a year a column per month', () => {
    const buckets = eventBuckets(report([day('2026-01-05', 60), day('2026-01-06', 30), day('2026-12-31', 15)]), periodContaining('year', now), now);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ key: '2026-01', label: 'Jan', longLabel: 'January 2026', count: 2, minutes: 90 });
    expect(buckets[11].minutes).toBe(15);
    expect(buckets[9].isCurrent).toBe(true);
  });
});
