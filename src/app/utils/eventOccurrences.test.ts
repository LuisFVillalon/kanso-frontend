import { describe, expect, it } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import {
  describeRepeat,
  formatEventMinutes,
  formatEventTime,
  occurrenceDays,
  occurrenceMinutes,
  occurrenceMinutesOn,
  occurrenceSpanOn,
  occurrencesByDay,
  occurrencesStartingOn,
  repeatLabel,
} from './eventOccurrences';

const occurrence = (overrides: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: 1,
  occurrence_date: '2026-10-23',
  title: 'CS 460 Lecture',
  description: null,
  tags: [],
  all_day: false,
  date: '2026-10-23',
  end_date: '2026-10-23',
  start_time: '10:00:00',
  end_time: '10:50:00',
  starts_at: '2026-10-23T17:00:00Z',
  ends_at: '2026-10-23T17:50:00Z',
  time_zone: 'America/Los_Angeles',
  repeat_days: [],
  repeat_interval: 1,
  reminder_minutes: null,
  edited: false,
  past: false,
  archived: false,
  ...overrides,
});

const overnight = occurrence({
  title: 'Night shift',
  start_time: '22:00:00',
  end_time: '02:00:00',
  end_date: '2026-10-24',
  starts_at: '2026-10-24T05:00:00Z',
  ends_at: '2026-10-24T09:00:00Z',
});

describe('occurrenceSpanOn', () => {
  it('places a timed event on its day', () => {
    expect(occurrenceSpanOn(occurrence(), '2026-10-23')).toEqual({ start: 600, end: 650 });
    expect(occurrenceSpanOn(occurrence(), '2026-10-24')).toBeNull();
  });

  it('splits an event past midnight across both days', () => {
    expect(occurrenceSpanOn(overnight, '2026-10-23')).toEqual({ start: 1320, end: 1440 });
    expect(occurrenceSpanOn(overnight, '2026-10-24')).toEqual({ start: 0, end: 120 });
    expect(occurrenceMinutesOn(overnight, '2026-10-23')).toBe(120);
    expect(occurrenceMinutes(overnight)).toBe(240);
  });

  it('gives an all-day event no span and no minutes', () => {
    const allDay = occurrence({ all_day: true, start_time: null, end_time: null });
    expect(occurrenceSpanOn(allDay, '2026-10-23')).toBeNull();
    expect(occurrenceMinutes(allDay)).toBe(0);
  });
});

describe('occurrenceDays', () => {
  it('shows an event past midnight on both days, unless it ends right at midnight', () => {
    expect(occurrenceDays(occurrence())).toEqual(['2026-10-23']);
    expect(occurrenceDays(overnight)).toEqual(['2026-10-23', '2026-10-24']);
    expect(occurrenceDays({ ...overnight, end_time: '00:00:00' })).toEqual(['2026-10-23']);
  });

  it('groups by day', () => {
    const byDay = occurrencesByDay([occurrence(), overnight]);
    expect(byDay.get('2026-10-23')!.map(o => o.title)).toEqual(['CS 460 Lecture', 'Night shift']);
    expect(byDay.get('2026-10-24')!.map(o => o.title)).toEqual(['Night shift']);
  });

  it('keeps only the events that start on a day, not the night before past midnight', () => {
    expect(occurrencesStartingOn([occurrence(), overnight], '2026-10-24')).toEqual([]);
    expect(occurrencesStartingOn([occurrence(), overnight], '2026-10-23').map(o => o.title)).toEqual(['CS 460 Lecture', 'Night shift']);
    expect(occurrencesStartingOn(undefined, '2026-10-23')).toEqual([]);
  });
});

describe('formatting', () => {
  it('reads times like a calendar', () => {
    expect(formatEventTime(occurrence())).toBe('10:00 – 10:50 AM');
    expect(formatEventTime(occurrence({ start_time: '11:30:00', end_time: '13:00:00' }))).toBe('11:30 AM – 1:00 PM');
    expect(formatEventTime(overnight)).toBe('10:00 PM – 2:00 AM');
    expect(formatEventTime(occurrence({ all_day: true, start_time: null, end_time: null }))).toBe('All day');
  });

  it('names how a series repeats', () => {
    expect(repeatLabel(occurrence())).toBeNull();
    expect(repeatLabel(occurrence({ repeat_days: [1, 3, 5] }))).toBe('Weekly');
    expect(repeatLabel(occurrence({ repeat_days: [2], repeat_interval: 2 }))).toBe('Every 2 weeks');
    expect(describeRepeat({ repeat_days: [5, 1, 3], repeat_interval: 1, start_date: '2026-08-24' })).toBe('Weekly on Mon, Wed and Fri');
    expect(describeRepeat({ repeat_days: [1, 2, 3, 4, 5], repeat_interval: 1, start_date: '2026-08-24' })).toBe('Weekly on weekdays');
    expect(describeRepeat({ repeat_days: [2], repeat_interval: 2, start_date: '2026-08-24' })).toBe('Every 2 weeks on Tue');
    expect(describeRepeat({ repeat_days: [2, 4], repeat_interval: 3, start_date: '2026-08-24' })).toBe('Every 3 weeks on Tue and Thu');
    expect(describeRepeat({ repeat_days: [], repeat_interval: 1, start_date: '2026-11-03' })).toBe('Tue, Nov 3, 2026');
  });

  it('formats minutes', () => {
    expect(formatEventMinutes(0)).toBe('0m');
    expect(formatEventMinutes(50)).toBe('50m');
    expect(formatEventMinutes(120)).toBe('2h');
    expect(formatEventMinutes(2920)).toBe('48h 40m');
  });
});
