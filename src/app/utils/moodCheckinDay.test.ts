import { describe, expect, it } from 'vitest';
import { checkinDayAt, dayCalledOffAt, endsPeriod, periodStartOf } from './moodCheckinDay';
import { toLocalDateStr } from './dateUtils';

// Tuesday, Oct 20 2026.
const at = (h: number, m = 0, day = 20) => new Date(2026, 9, day, h, m);
const dayAt = (now: Date, dayStart: string, shutoff: string) => toLocalDateStr(checkinDayAt(now, dayStart, shutoff));

describe('checkinDayAt', () => {
  it("is today's check-in for a day that ends before midnight", () => {
    expect(dayAt(at(9, 0), '08:00', '22:00')).toBe('2026-10-20');
    expect(dayAt(at(22, 30), '08:00', '22:00')).toBe('2026-10-20');
    expect(dayAt(at(1, 0, 21), '08:00', '22:00')).toBe('2026-10-21');
  });

  it("is yesterday's check-in after midnight for a day that runs past it", () => {
    expect(dayAt(at(0, 15, 21), '09:00', '00:30')).toBe('2026-10-20');
    expect(dayAt(at(8, 59, 21), '09:00', '00:30')).toBe('2026-10-20');
    // Once the next day starts it's that day's.
    expect(dayAt(at(9, 0, 21), '09:00', '00:30')).toBe('2026-10-21');
  });
});

describe('dayCalledOffAt', () => {
  it('closes at the shutoff for a day that ends before midnight, until midnight', () => {
    expect(dayCalledOffAt(at(21, 59), '08:00', '22:00')).toBe(false);
    expect(dayCalledOffAt(at(22, 0), '08:00', '22:00')).toBe(true);
    expect(dayCalledOffAt(at(23, 59), '08:00', '22:00')).toBe(true);
    // After midnight it's the next day's check-in, still open.
    expect(dayCalledOffAt(at(1, 0, 21), '08:00', '22:00')).toBe(false);
  });

  it('closes in the small hours for a day that runs past midnight', () => {
    expect(dayCalledOffAt(at(23, 0), '09:00', '00:30')).toBe(false);
    expect(dayCalledOffAt(at(0, 15, 21), '09:00', '00:30')).toBe(false);
    expect(dayCalledOffAt(at(0, 30, 21), '09:00', '00:30')).toBe(true);
    expect(dayCalledOffAt(at(8, 59, 21), '09:00', '00:30')).toBe(true);
    expect(dayCalledOffAt(at(9, 0, 21), '09:00', '00:30')).toBe(false);
  });

  it('never closes a day whose shutoff is its start', () => {
    expect(dayCalledOffAt(at(8, 0), '08:00', '08:00')).toBe(false);
    expect(dayCalledOffAt(at(23, 0), '08:00', '08:00')).toBe(false);
  });
});

describe('days with their own window', () => {
  // Every day 9 AM – 12:30 AM, except Wednesdays (3) 8 AM – 4 PM.
  const windows = { '3': { start: '08:00', end: '16:00' } };

  it("uses each day's own window for the check-in day", () => {
    // Tuesday's window runs past midnight into Wednesday's small hours.
    expect(toLocalDateStr(checkinDayAt(at(0, 15, 21), '09:00', '00:30', windows))).toBe('2026-10-20');
    // Wednesday starts at 8, not 9.
    expect(toLocalDateStr(checkinDayAt(at(8, 30, 21), '09:00', '00:30', windows))).toBe('2026-10-21');
    // Wednesday ends the same day, so Thursday's small hours are Thursday's.
    expect(toLocalDateStr(checkinDayAt(at(0, 15, 22), '09:00', '00:30', windows))).toBe('2026-10-22');
  });

  it("calls the day off at that day's own shutoff", () => {
    expect(dayCalledOffAt(at(15, 59, 21), '09:00', '00:30', windows)).toBe(false);
    expect(dayCalledOffAt(at(16, 0, 21), '09:00', '00:30', windows)).toBe(true);
    // Tuesday's late window still closes at 12:30 AM on Wednesday.
    expect(dayCalledOffAt(at(0, 30, 21), '09:00', '00:30', windows)).toBe(true);
    // Thursday's runs past midnight, so it isn't called off on Thursday itself.
    expect(dayCalledOffAt(at(23, 0, 22), '09:00', '00:30', windows)).toBe(false);
  });

  it("carries a day's own late window into the next day's small hours", () => {
    // Every day 8 AM – 4 PM, except Wednesdays 8 PM – 2 AM.
    const late = { '3': { start: '20:00', end: '02:00' } };
    expect(toLocalDateStr(checkinDayAt(at(1, 0, 22), '08:00', '16:00', late))).toBe('2026-10-21');
    expect(dayCalledOffAt(at(1, 0, 22), '08:00', '16:00', late)).toBe(false);
    expect(dayCalledOffAt(at(2, 0, 22), '08:00', '16:00', late)).toBe(true);
    expect(dayCalledOffAt(at(23, 0, 21), '08:00', '16:00', late)).toBe(false);
  });
});

describe('endsPeriod', () => {
  it('ends the Mon–Sun week on Sunday', () => {
    expect(endsPeriod('week', new Date(2026, 9, 25))).toBe(true);
    expect(endsPeriod('week', new Date(2026, 9, 24))).toBe(false);
  });

  it('ends the month on its last day', () => {
    expect(endsPeriod('month', new Date(2026, 8, 30))).toBe(true);
    expect(endsPeriod('month', new Date(2026, 8, 29))).toBe(false);
  });
});

describe('periodStartOf', () => {
  it('starts the week on Monday and the month on the 1st', () => {
    expect(toLocalDateStr(periodStartOf('week', new Date(2026, 9, 25)))).toBe('2026-10-19');
    expect(toLocalDateStr(periodStartOf('month', new Date(2026, 8, 30)))).toBe('2026-09-01');
  });
});
