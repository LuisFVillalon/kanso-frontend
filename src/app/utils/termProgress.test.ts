import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeTermProgress, isInTerm, termEndInstant } from './termProgress';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

// Mon Jan 5 – Wed Jan 14, 2026: 10 days (not a multiple of 7), 8 weekdays + 2 weekend days.
const start = d(2026, 1, 5);
const end = d(2026, 1, 14);

describe('computeTermProgress', () => {
  it('first day: nothing completed, every day remaining', () => {
    expect(computeTermProgress(start, end, start)).toEqual({
      totalDays: 10, daysInto: 0, daysRemaining: 10,
      weekNumber: 1, totalWeeks: 2, weeksRemaining: 2, pct: 0,
      businessDaysRemaining: 8, weekendDaysRemaining: 2,
    });
  });

  it('mid-term day', () => {
    expect(computeTermProgress(start, end, d(2026, 1, 9))).toEqual({
      totalDays: 10, daysInto: 4, daysRemaining: 6,
      weekNumber: 1, totalWeeks: 2, weeksRemaining: 2, pct: 40,
      businessDaysRemaining: 4, weekendDaysRemaining: 2,
    });
  });

  it('first day of the final partial week', () => {
    expect(computeTermProgress(start, end, d(2026, 1, 12))).toMatchObject({
      daysInto: 7, daysRemaining: 3, weekNumber: 2, totalWeeks: 2, weeksRemaining: 1, pct: 70,
    });
  });

  it('last day: one day left, below 100%', () => {
    expect(computeTermProgress(start, end, end)).toEqual({
      totalDays: 10, daysInto: 9, daysRemaining: 1,
      weekNumber: 2, totalWeeks: 2, weeksRemaining: 1, pct: 90,
      businessDaysRemaining: 1, weekendDaysRemaining: 0,
    });
  });

  it('keeps days in + days left equal to the inclusive term length every day', () => {
    for (let day = 5; day <= 14; day++) {
      const p = computeTermProgress(start, end, d(2026, 1, day))!;
      expect(p.daysInto + p.daysRemaining).toBe(p.totalDays);
      expect(p.businessDaysRemaining + p.weekendDaysRemaining).toBe(p.daysRemaining);
      expect(p.weekNumber).toBeLessThanOrEqual(p.totalWeeks);
      expect(p.weekNumber + p.weeksRemaining - 1).toBe(p.totalWeeks);
    }
  });

  it('a 15-day term has 3 weeks, and day 2 still has all 3 remaining', () => {
    expect(computeTermProgress(d(2026, 1, 5), d(2026, 1, 19), d(2026, 1, 6))).toMatchObject({
      totalDays: 15, weekNumber: 1, totalWeeks: 3, weeksRemaining: 3,
    });
  });

  it('never rounds up to 100% on the last day of a long term', () => {
    expect(computeTermProgress(d(2026, 1, 1), d(2026, 12, 31), d(2026, 12, 31))).toMatchObject({
      totalDays: 365, daysInto: 364, daysRemaining: 1, pct: 99, weekNumber: 53, totalWeeks: 53,
    });
  });

  it('ignores the time of day', () => {
    expect(computeTermProgress(start, end, new Date(2026, 0, 9, 23, 59))).toMatchObject({ daysInto: 4, daysRemaining: 6 });
  });

  it('returns null outside the term', () => {
    expect(computeTermProgress(start, end, d(2026, 1, 4))).toBeNull();
    expect(computeTermProgress(start, end, d(2026, 1, 15))).toBeNull();
  });

  describe('across a DST change', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => { process.env.TZ = 'America/Los_Angeles'; });
    afterAll(() => { process.env.TZ = originalTz; });

    it('counts calendar days, not 24h blocks', () => {
      // US clocks spring forward on Sun Mar 8, 2026.
      expect(computeTermProgress(d(2026, 3, 1), d(2026, 3, 31), d(2026, 3, 20))).toMatchObject({
        totalDays: 31, daysInto: 19, daysRemaining: 12,
      });
    });
  });
});

describe('isInTerm', () => {
  it('includes both the start and end dates', () => {
    expect(isInTerm(start, end, start)).toBe(true);
    expect(isInTerm(start, end, new Date(2026, 0, 14, 23, 59))).toBe(true);
    expect(isInTerm(start, end, d(2026, 1, 15))).toBe(false);
  });
});

describe('termEndInstant', () => {
  it('is local midnight at the close of the end date', () => {
    expect(termEndInstant(end)).toEqual(new Date(2026, 0, 15, 0, 0, 0, 0));
  });
});
