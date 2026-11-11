import { describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import type { WorkDaySettings } from './dayReport';
import { workDayOn, workHoursSpan } from './dayReport';
import { bucketInWindow, bucketTotal, buildEventTimeSeries, type EventTimeBucket } from './eventTime';
import { UNTAGGED_KEY } from './tagReport';

// Local days depend on the zone; pin one with a DST change.
vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
const work = { id: 2, name: 'Work', color: '#7A5AD0' };

/** An occurrence from local [day, hour, minute] to [day, hour, minute] in November 2026. */
const event = (from: [number, number, number?], to: [number, number, number?], overrides: Partial<EventOccurrence> = {}): EventOccurrence => {
  const start = new Date(2026, 10, from[0], from[1], from[2] ?? 0);
  const end = new Date(2026, 10, to[0], to[1], to[2] ?? 0);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    event_id: 1, occurrence_date: ymd(start), title: 'Event', description: null, tags: [], all_day: false,
    date: ymd(start), end_date: ymd(end), start_time: null, end_time: null,
    starts_at: start.toISOString(), ends_at: end.toISOString(), time_zone: 'America/Los_Angeles',
    repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
    ...overrides,
  };
};

const activity = (events: EventOccurrence[]): CalendarActivity => ({
  start_date: '2026-11-09', end_date: '2026-11-15', scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [], events,
});

// Weekends off, 9 AM to 5 PM.
const settings: WorkDaySettings = { restDays: [0, 6], dayStartTime: '09:00', shutoffTime: '17:00', dayWindows: {} };

// The week of Mon Nov 9 2026; "now" is Tue Nov 10, 1 PM.
const MON = new Date(2026, 10, 9);
const SUN = new Date(2026, 10, 15);
const NOW = new Date(2026, 10, 10, 13);

const week = (events: EventOccurrence[], s: WorkDaySettings = settings, now = NOW) =>
  buildEventTimeSeries(activity(events), MON, SUN, s, false, now);

const day = (series: ReturnType<typeof week>, key: string): EventTimeBucket => {
  const b = series.buckets.get(key);
  if (!b) throw new Error(`no bucket ${key}`);
  return b;
};

describe('work days', () => {
  it('reads a rest day, the day’s own window and the every-day one', () => {
    const s: WorkDaySettings = { ...settings, dayWindows: { '3': { start: '10:00', end: '14:00' } } };
    expect(workDayOn(s, new Date(2026, 10, 15))).toEqual({ rest: true, window: null });
    expect(workDayOn(s, new Date(2026, 10, 11))).toEqual({ rest: false, window: { opens: 600, closes: 840 } });
    expect(workDayOn(s, MON)).toEqual({ rest: false, window: { opens: 540, closes: 1020 } });
  });

  it('falls back to 8 AM – 10 PM when the times aren’t valid', () => {
    const series = week([], { ...settings, dayStartTime: 'soon', shutoffTime: '' });
    expect(day(series, '2026-11-09').windowMinutes).toBe(840);
  });

  it('runs hours that end at or before they start into the next day', () => {
    expect(workHoursSpan({ start: '20:00', end: '02:00' })).toEqual({ opens: 1200, closes: 1560 });
    expect(workHoursSpan({ start: '09:00', end: '00:00' })).toEqual({ opens: 540, closes: 1440 });
  });
});

describe('buildEventTimeSeries', () => {
  it('gives each workday its window and rest days none', () => {
    const series = week([]);
    expect(day(series, '2026-11-09').windowMinutes).toBe(480);
    expect(series.buckets.get('2026-11-14')).toBeUndefined();
    expect(series.buckets.get('2026-11-15')).toBeUndefined();
  });

  it('splits time inside and outside work hours', () => {
    const b = day(week([event([9, 16], [9, 18])]), '2026-11-09');
    expect(b.inWindow).toEqual({ past: 60, upcoming: 0 });
    expect(b.outside).toEqual({ past: 60, upcoming: 0 });
    expect(bucketTotal(b)).toBe(120);
  });

  it('clips an event to the period', () => {
    const series = week([event([8, 23], [9, 1])]);
    expect(series.buckets.get('2026-11-08')).toBeUndefined();
    expect(day(series, '2026-11-09').outside.past).toBe(60);
  });

  it('adds nothing for an all-day event', () => {
    const b = day(week([event([9, 0], [10, 0], { all_day: true })]), '2026-11-09');
    expect(bucketTotal(b)).toBe(0);
  });

  it('splits an event across midnight between its days', () => {
    const series = week([event([9, 23], [10, 1])]);
    expect(day(series, '2026-11-09').outside.past).toBe(60);
    expect(day(series, '2026-11-10').outside.past).toBe(60);
  });

  it('splits an event in progress at now into past and upcoming', () => {
    const b = day(week([event([10, 12], [10, 14])]), '2026-11-10');
    expect(b.inWindow).toEqual({ past: 60, upcoming: 60 });
  });

  it('counts later days as upcoming', () => {
    const b = day(week([event([12, 9], [12, 10])]), '2026-11-12');
    expect(b.inWindow).toEqual({ past: 0, upcoming: 60 });
  });

  it('counts past archived occurrences', () => {
    const b = day(week([event([9, 10], [9, 11], { archived: true, past: true })]), '2026-11-09');
    expect(bucketInWindow(b)).toBe(60);
  });

  it('counts imported Google events, but not declined or “Show as free” ones', () => {
    const b = day(week([
      event([9, 10], [9, 11], { source: 'google', event_id: -4 }),
      event([9, 12], [9, 13], { source: 'google', event_id: -5, busy: false }),
    ]), '2026-11-09');
    expect(bucketTotal(b)).toBe(60);
  });

  it('splits an event with two tags evenly', () => {
    const series = week([event([9, 10], [9, 12], { tags: [cs, work] }), event([9, 13], [9, 14])]);
    const b = day(series, '2026-11-09');
    expect(b.byTag.get('tag:1')).toEqual({ past: 60, upcoming: 0, inWindow: 60 });
    expect(b.byTag.get('tag:2')).toEqual({ past: 60, upcoming: 0, inWindow: 60 });
    expect(b.byTag.get(UNTAGGED_KEY)).toEqual({ past: 60, upcoming: 0, inWindow: 60 });
    expect(series.rows.map(r => r.key)).toEqual(['tag:1', 'tag:2', UNTAGGED_KEY]);
  });

  it('counts overlapping events once in work hours but twice in the total', () => {
    const b = day(week([event([9, 10], [9, 11]), event([9, 10], [9, 11], { event_id: 2 })]), '2026-11-09');
    expect(b.inWindow.past).toBe(60);
    expect(b.outside.past).toBe(60);
    expect(bucketTotal(b)).toBe(120);
  });

  it('puts all of a rest day’s time outside work hours', () => {
    const b = day(week([event([14, 10], [14, 11])]), '2026-11-14');
    expect(b.windowMinutes).toBe(0);
    expect(b.outside.upcoming).toBe(60);
  });

  it('counts a window past midnight on the day it opens, as the backend’s by_day does', () => {
    // Mon 8 PM – Tue 2 AM. get-event-report's by_day gives Monday
    // window_minutes 360 and event_window_minutes 60 for this event.
    const s: WorkDaySettings = { ...settings, dayWindows: { '1': { start: '20:00', end: '02:00' } } };
    const series = week([event([10, 1], [10, 3])], s);
    const mon = day(series, '2026-11-09');
    expect(mon.windowMinutes).toBe(360);
    expect(mon.inWindow.past).toBe(60);
    expect(day(series, '2026-11-10').outside.past).toBe(60);
  });

  it('adds up a year’s days by month', () => {
    const series = buildEventTimeSeries(
      { ...activity([event([9, 10], [9, 11]), event([20, 18], [20, 19])]), start_date: '2026-01-01', end_date: '2026-12-31' },
      new Date(2026, 0, 1), new Date(2026, 11, 31), settings, true, NOW,
    );
    const nov = series.buckets.get('2026-11');
    // November 2026 has 21 weekdays.
    expect(nov?.windowMinutes).toBe(21 * 480);
    expect(nov?.inWindow).toEqual({ past: 60, upcoming: 0 });
    expect(nov?.outside).toEqual({ past: 0, upcoming: 60 });
    expect(series.buckets.get('2026-12')?.windowMinutes).toBe(23 * 480);
  });
});
