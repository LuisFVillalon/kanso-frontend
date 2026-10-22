import { describe, expect, it } from 'vitest';
import { checkinDayAt, endsPeriod, periodStartOf } from './moodCheckinDay';
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
