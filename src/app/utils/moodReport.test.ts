import { beforeAll, describe, expect, it } from 'vitest';
import type { MoodCheckin } from '@/app/types/mood';
import { periodContaining } from './calendarReport';
import { toLocalDateStr } from './dateUtils';
import {
  indexDayCheckins,
  monthMood,
  moodByTag,
  moodFetchRange,
  moodSummaryScope,
  periodRollingAverage,
  rollingAverage,
  summarizeMood,
} from './moodReport';

beforeAll(() => {
  // Local-day math depends on the zone; pin one with a DST change.
  process.env.TZ = 'America/Los_Angeles';
});

const day = (d: Date) => toLocalDateStr(d);

let nextId = 1;
const checkin = (period_start: string, mood: number, overrides: Partial<MoodCheckin> = {}): MoodCheckin => ({
  id: nextId++,
  period_kind: 'day',
  period_start,
  mood,
  energy: null,
  stress: null,
  workload: null,
  highlight: null,
  progress: null,
  word: null,
  note: null,
  tags: [],
  created_at: `${period_start}T20:00:00Z`,
  updated_at: `${period_start}T20:00:00Z`,
  ...overrides,
});

describe('trailing 4 weeks', () => {
  it('widens the current week to the 28 days ending today', () => {
    const now = new Date(2026, 9, 21, 22, 0); // Wednesday Oct 21
    const scope = moodSummaryScope(periodContaining('week', now), now);
    expect(scope.widened).toBe(true);
    expect([day(scope.start), day(scope.end)]).toEqual(['2026-09-24', '2026-10-21']);
  });

  it('ends a past week on its Sunday', () => {
    const now = new Date(2026, 9, 21);
    const scope = moodSummaryScope(periodContaining('week', new Date(2026, 9, 7)), now); // Oct 5–11
    expect([day(scope.start), day(scope.end)]).toEqual(['2026-09-14', '2026-10-11']);
  });

  it('counts 28 local days across the March DST change', () => {
    const scope = moodSummaryScope(periodContaining('week', new Date(2026, 2, 25)), new Date(2026, 3, 30)); // Mar 23–29
    expect([day(scope.start), day(scope.end)]).toEqual(['2026-03-02', '2026-03-29']);
    expect(summarizeMood(new Map(), scope.start, scope.end, new Date(2026, 3, 30)).days).toBe(28);
  });

  it('leaves months and years unwidened', () => {
    const month = periodContaining('month', new Date(2026, 9, 21));
    const scope = moodSummaryScope(month, new Date(2026, 9, 21));
    expect(scope.widened).toBe(false);
    expect([day(scope.start), day(scope.end)]).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('fetches the trailing weeks, the 6 days before a month, or the year', () => {
    const now = new Date(2026, 9, 21);
    const week = moodFetchRange(periodContaining('week', now), now);
    expect([day(week.start), day(week.end)]).toEqual(['2026-09-24', '2026-10-25']);
    const month = moodFetchRange(periodContaining('month', now), now);
    expect([day(month.start), day(month.end)]).toEqual(['2026-09-25', '2026-10-31']);
    const year = moodFetchRange(periodContaining('year', now), now);
    expect([day(year.start), day(year.end)]).toEqual(['2026-01-01', '2026-12-31']);
  });
});

describe('summarizeMood', () => {
  const week = periodContaining('week', new Date(2026, 9, 14)); // Oct 12–18

  it('counts logged days against the days so far', () => {
    const byDay = indexDayCheckins([
      checkin('2026-10-12', 4),
      checkin('2026-10-13', 2),
      checkin('2026-10-15', 4),
      checkin('2026-10-11', 1), // before the week
    ]);
    const summary = summarizeMood(byDay, week.start, week.end, new Date(2026, 9, 15, 21, 0));
    expect(summary.days).toBe(4);
    expect(summary.logged).toBe(3);
    expect(summary.average).toBeCloseTo(10 / 3);
    expect(summary.distribution).toEqual([0, 1, 0, 2, 0]);
  });

  it('counts the whole span once it is over', () => {
    const byDay = indexDayCheckins([checkin('2026-10-18', 5)]);
    const summary = summarizeMood(byDay, week.start, week.end, new Date(2026, 10, 1));
    expect([summary.days, summary.logged, summary.average]).toEqual([7, 1, 5]);
  });

  it('ignores weekly and monthly check-ins', () => {
    const byDay = indexDayCheckins([
      checkin('2026-10-12', 1, { period_kind: 'week' }),
      checkin('2026-10-01', 1, { period_kind: 'month' }),
    ]);
    const summary = summarizeMood(byDay, week.start, week.end, new Date(2026, 10, 1));
    expect([summary.logged, summary.average]).toEqual([0, null]);
  });
});

describe('rolling average', () => {
  it('averages the last 7 values, skipping gaps, once 3 are present', () => {
    const values = [4, null, 2, 3, null, null, null, null, 5, 5];
    const rolling = rollingAverage(values);
    expect(rolling.slice(0, 3)).toEqual([null, null, null]);
    expect(rolling[3]).toBeCloseTo(3);
    expect(rolling[6]).toBeCloseTo(3);
    // Index 7's window (1–7) has only 2 and 3.
    expect(rolling[7]).toBeNull();
    // Index 9's window (3–9) has 3, 5 and 5.
    expect(rolling[9]).toBeCloseTo(13 / 3);
  });

  it('reaches back before the month and stops at today', () => {
    const month = periodContaining('month', new Date(2026, 9, 1)); // October
    const byDay = indexDayCheckins([
      checkin('2026-09-28', 2),
      checkin('2026-09-29', 3),
      checkin('2026-10-01', 4, { energy: 5 }),
      checkin('2026-10-03', 5),
    ]);
    const now = new Date(2026, 9, 4, 12, 0);
    const mood = periodRollingAverage(month, byDay, 'mood', now);
    expect(mood).toHaveLength(31);
    expect(mood[0]).toBeCloseTo(3); // Sep 28, 29 and Oct 1
    expect(mood[3]).toBeCloseTo(3.5);
    expect(mood.slice(4).every(v => v === null)).toBe(true);
    // Energy was only recorded once, so it never reaches 3 points.
    expect(periodRollingAverage(month, byDay, 'energy', now).every(v => v === null)).toBe(true);
  });
});

describe('monthMood', () => {
  it('averages a month and spans its middle half', () => {
    const byDay = indexDayCheckins([
      checkin('2026-10-01', 1),
      checkin('2026-10-02', 3),
      checkin('2026-10-03', 4),
      checkin('2026-10-04', 4),
      checkin('2026-10-05', 5),
      checkin('2026-11-01', 1),
    ]);
    const oct = monthMood(byDay, '2026-10', 'mood');
    expect(oct.n).toBe(5);
    expect(oct.average).toBeCloseTo(3.4);
    expect([oct.q1, oct.q3]).toEqual([3, 4]);
    expect(monthMood(byDay, '2026-09', 'mood')).toEqual({ n: 0, average: null, q1: null, q3: null });
  });
});

describe('moodByTag', () => {
  const now = new Date(2026, 9, 21, 20);
  const tagged = (date: string, mood: number, tags: string[]) => checkin(date, mood, { tags });
  const byDay = indexDayCheckins([
    tagged('2026-10-01', 5, ['Exercised', 'Social']),
    tagged('2026-10-02', 4, ['Exercised']),
    tagged('2026-10-03', 4, ['Exercised', 'Tired', 'Tired']),
    tagged('2026-10-04', 2, ['Tired']),
    tagged('2026-10-05', 1, ['Tired', 'Social']),
    tagged('2026-10-06', 3, []),
    // Outside the range, and in the future.
    tagged('2026-09-30', 1, ['Exercised']),
    tagged('2026-10-25', 1, ['Social']),
  ]);

  it('averages mood on the days with each tag, hiding tags used on fewer than 3 days', () => {
    const rows = moodByTag(byDay, new Date(2026, 9, 1), new Date(2026, 9, 31), now);
    expect(rows.map(r => r.tag)).toEqual(['Exercised', 'Tired']);
    expect(rows[0]).toMatchObject({ days: 3 });
    expect(rows[0].average).toBeCloseTo(13 / 3);
    // A tag repeated on one check-in counts that day once.
    expect(rows[1]).toMatchObject({ days: 3 });
    expect(rows[1].average).toBeCloseTo(7 / 3);
  });

  it('takes a lower bar when asked', () => {
    const rows = moodByTag(byDay, new Date(2026, 9, 1), new Date(2026, 9, 31), now, 2);
    expect(rows.map(r => [r.tag, r.days])).toEqual([['Exercised', 3], ['Social', 2], ['Tired', 3]]);
  });
});
