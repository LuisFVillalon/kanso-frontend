import { describe, expect, it } from 'vitest';
import { computeDayRun } from './dayRuns';

// Week of Sun Jan 4 – Sat Jan 10, 2026.
const at = (day: number, h = 12) => new Date(2026, 0, day, h, 30);
const midnight = (day: number) => new Date(2026, 0, day);
const WEEKEND = [0, 6];

describe('computeDayRun', () => {
  it('on a work day, work counts down to the start of the next day off', () => {
    // Wed Jan 7 → work runs through Fri, ends at Sat 00:00.
    expect(computeDayRun(at(7), WEEKEND, 'work')).toEqual({ status: 'active', end: midnight(10) });
  });

  it('on a work day, days off shows the next run of days off', () => {
    expect(computeDayRun(at(7), WEEKEND, 'off')).toEqual({ status: 'upcoming', start: midnight(10), lengthDays: 2 });
  });

  it('a run of days off wraps the week', () => {
    // Sat Jan 10 with Sat/Sun off → ends Mon Jan 12 00:00.
    expect(computeDayRun(at(10), WEEKEND, 'off')).toEqual({ status: 'active', end: midnight(12) });
    // Rest days Fri, Sat, Sun, Mon: from Thu Jan 8 the next run is 4 days.
    expect(computeDayRun(at(8), [5, 6, 0, 1], 'off')).toEqual({ status: 'upcoming', start: midnight(9), lengthDays: 4 });
  });

  it('a work run wraps the week', () => {
    // Only Wednesday off; on Thu Jan 8 work runs Thu → Tue, ending Wed Jan 14 00:00.
    expect(computeDayRun(at(8), [3], 'work')).toEqual({ status: 'active', end: midnight(14) });
    expect(computeDayRun(at(8), [3], 'off')).toEqual({ status: 'upcoming', start: midnight(14), lengthDays: 1 });
  });

  it('picks the next run when rest days are split across the week', () => {
    // Off Tue and Fri; on Wed Jan 7 the next day off is Fri for 1 day, work ends Fri 00:00.
    expect(computeDayRun(at(7), [2, 5], 'off')).toEqual({ status: 'upcoming', start: midnight(9), lengthDays: 1 });
    expect(computeDayRun(at(7), [2, 5], 'work')).toEqual({ status: 'active', end: midnight(9) });
  });

  it('a single-day run ends at the following midnight', () => {
    expect(computeDayRun(at(9, 23), [2, 5], 'off')).toEqual({ status: 'active', end: midnight(10) });
  });

  it('no rest days: work is every day and days off never come', () => {
    expect(computeDayRun(at(7), [], 'work')).toEqual({ status: 'everyDay' });
    expect(computeDayRun(at(7), [], 'off')).toEqual({ status: 'never' });
  });

  it('every day a rest day: days off is every day and work never comes', () => {
    const all = [0, 1, 2, 3, 4, 5, 6];
    expect(computeDayRun(at(7), all, 'off')).toEqual({ status: 'everyDay' });
    expect(computeDayRun(at(7), all, 'work')).toEqual({ status: 'never' });
  });
});
