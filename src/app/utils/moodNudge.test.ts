import { describe, expect, it } from 'vitest';
import {
  checkinDayAt,
  moodNudgeState,
  optInHintSeen,
  periodNudgeState,
  periodStartOf,
  type MoodNudgeInput,
  type PeriodNudgeInput,
} from './moodNudge';
import { DEFAULT_MOOD_SETTINGS } from '@/app/types/mood';
import { toLocalDateStr } from './dateUtils';

// Tuesday, Oct 20 2026; the default rest days are Sat/Sun.
const at = (h: number, m = 0, day = 20) => new Date(2026, 9, day, h, m);

const input = (overrides: Partial<MoodNudgeInput> = {}): MoodNudgeInput => ({
  now: at(18, 4),
  settings: DEFAULT_MOOD_SETTINGS,
  dayStartTime: '08:00',
  shutoffTime: '18:00',
  restDays: [0, 6],
  checkedIn: false,
  dismissals: null,
  ...overrides,
});

describe('moodNudgeState', () => {
  it('stays hidden before "Call it a day"', () => {
    expect(moodNudgeState(input({ now: at(17, 59) }))).toBe('hidden');
  });

  it('shows the nudge from "Call it a day" until midnight', () => {
    expect(moodNudgeState(input({ now: at(18, 0) }))).toBe('nudge');
    expect(moodNudgeState(input({ now: at(23, 59) }))).toBe('nudge');
  });

  it('waits 30 minutes longer when reminding 30 minutes after "Call it a day"', () => {
    const settings = { ...DEFAULT_MOOD_SETTINGS, remind: 'shutoff+30' as const };
    expect(moodNudgeState(input({ settings, now: at(18, 29) }))).toBe('hidden');
    expect(moodNudgeState(input({ settings, now: at(18, 30) }))).toBe('nudge');
  });

  it('never nudges on a rest day, but leaves the chip for logging by hand', () => {
    const saturday = at(18, 4, 24);
    expect(moodNudgeState(input({ now: saturday }))).toBe('chip');
    expect(moodNudgeState(input({ now: saturday, restDays: [] }))).toBe('nudge');
  });

  it('only leaves the chip when reminders are off', () => {
    const settings = { ...DEFAULT_MOOD_SETTINGS, remind: 'off' as const };
    expect(moodNudgeState(input({ settings }))).toBe('chip');
  });

  it('shows nothing when the daily check-in is turned off', () => {
    expect(moodNudgeState(input({ settings: { ...DEFAULT_MOOD_SETTINGS, daily: false } }))).toBe('hidden');
  });

  it('hides the nudge once the day is saved, leaving the confirmation', () => {
    expect(moodNudgeState(input({ checkedIn: true }))).toBe('logged');
  });

  it('hides the nudge after a skip, leaving the chip', () => {
    expect(moodNudgeState(input({ dismissals: { date: '2026-10-20', skipped: true } }))).toBe('chip');
  });

  it('hides the nudge while snoozed', () => {
    const snoozedUntil = at(19, 4).getTime();
    expect(moodNudgeState(input({ dismissals: { date: '2026-10-20', snoozedUntil } }))).toBe('hidden');
    expect(moodNudgeState(input({ now: at(19, 4), dismissals: { date: '2026-10-20', snoozedUntil } }))).toBe('nudge');
  });

  it("ignores yesterday's skip", () => {
    expect(moodNudgeState(input({ dismissals: { date: '2026-10-19', skipped: true } }))).toBe('nudge');
  });
});

describe('checkinDayAt', () => {
  it("is today's check-in for a day that ends before midnight", () => {
    const { day, due } = checkinDayAt(at(22, 30), '08:00', '22:00', 'shutoff');
    expect(toLocalDateStr(day)).toBe('2026-10-20');
    expect(due).toBe(true);
  });

  it('is never due past midnight for a day that ends before it', () => {
    const { day, due } = checkinDayAt(at(1, 0, 21), '08:00', '22:00', 'shutoff');
    expect(toLocalDateStr(day)).toBe('2026-10-21');
    expect(due).toBe(false);
  });

  it("caps a late shutoff's 30-minute delay at the end of the day", () => {
    expect(checkinDayAt(at(23, 58), '08:00', '23:45', 'shutoff+30').due).toBe(false);
    expect(checkinDayAt(at(23, 59), '08:00', '23:45', 'shutoff+30').due).toBe(true);
  });

  it("is yesterday's check-in after midnight for a day that runs past it", () => {
    const before = checkinDayAt(at(0, 15, 21), '09:00', '00:30', 'shutoff');
    expect(toLocalDateStr(before.day)).toBe('2026-10-20');
    expect(before.due).toBe(false);

    const after = checkinDayAt(at(0, 45, 21), '09:00', '00:30', 'shutoff');
    expect(toLocalDateStr(after.day)).toBe('2026-10-20');
    expect(after.due).toBe(true);

    // Once the next day starts it's that day, and not due until its own shutoff.
    const nextDay = checkinDayAt(at(9, 0, 21), '09:00', '00:30', 'shutoff');
    expect(toLocalDateStr(nextDay.day)).toBe('2026-10-21');
    expect(nextDay.due).toBe(false);
  });

  it("checks a rest day against the day being called off, not the clock's", () => {
    // Saturday's day runs past midnight into Sunday morning; Saturday is not a rest day here.
    const sundayMorning = new Date(2026, 9, 25, 0, 45);
    expect(moodNudgeState(input({ now: sundayMorning, dayStartTime: '09:00', shutoffTime: '00:30', restDays: [0] }))).toBe('nudge');
  });
});

describe('periodNudgeState', () => {
  // Sunday Oct 25 ends the week of Mon Oct 19; Wednesday Sep 30 ends September.
  // Saturdays are the only rest day here, so these Sundays get the nudge.
  const sunday = at(18, 4, 25);
  const monthEnd = new Date(2026, 8, 30, 18, 4);
  const weeklyOn = { ...DEFAULT_MOOD_SETTINGS, weekly: true };
  const monthlyOn = { ...DEFAULT_MOOD_SETTINGS, monthly: true };

  const period = (overrides: Partial<PeriodNudgeInput> = {}): PeriodNudgeInput => ({
    ...input({ now: sunday, restDays: [6], settings: weeklyOn }),
    kind: 'week',
    periodCheckedIn: false,
    hintSeen: false,
    ...overrides,
  });

  it('adds the weekly check-in on Sunday only, once it is "Call it a day"', () => {
    expect(periodNudgeState(period())).toBe('strip');
    expect(periodNudgeState(period({ now: at(17, 59, 25) }))).toBe('hidden');
    expect(periodNudgeState(period({ now: at(18, 4, 24), restDays: [] }))).toBe('hidden'); // Saturday
    expect(periodNudgeState(period({ now: at(18, 4, 26) }))).toBe('hidden'); // Monday
  });

  it('adds the monthly check-in on the last day of the month only', () => {
    expect(periodNudgeState(period({ kind: 'month', now: monthEnd, settings: monthlyOn }))).toBe('strip');
    expect(periodNudgeState(period({ kind: 'month', now: new Date(2026, 8, 29, 18, 4), settings: monthlyOn }))).toBe('hidden');
  });

  it('bundles both when a Sunday ends the month', () => {
    const may31 = new Date(2026, 4, 31, 18, 4);
    const both = { ...DEFAULT_MOOD_SETTINGS, weekly: true, monthly: true };
    expect(periodNudgeState(period({ now: may31, settings: both }))).toBe('strip');
    expect(periodNudgeState(period({ kind: 'month', now: may31, settings: both }))).toBe('strip');
  });

  it('still offers the weekly check-in when the daily one is off', () => {
    expect(periodNudgeState(period({ settings: { ...weeklyOn, daily: false } }))).toBe('strip');
  });

  it('never nudges on a rest day, but leaves the chip for logging by hand', () => {
    expect(periodNudgeState(period({ restDays: [0, 6] }))).toBe('chip');
  });

  it('leaves the chip when reminders are off, after "Not today" or after skipping it', () => {
    expect(periodNudgeState(period({ settings: { ...weeklyOn, remind: 'off' } }))).toBe('chip');
    expect(periodNudgeState(period({ dismissals: { date: '2026-10-25', skipped: true } }))).toBe('chip');
    const skippedWeek = { date: '2026-10-25', periodsSkipped: ['week' as const] };
    expect(periodNudgeState(period({ dismissals: skippedWeek }))).toBe('chip');
    expect(moodNudgeState(period({ dismissals: skippedWeek }))).toBe('nudge');
  });

  it('hides while the nudge is snoozed', () => {
    const snoozedUntil = at(19, 4, 25).getTime();
    expect(periodNudgeState(period({ dismissals: { date: '2026-10-25', snoozedUntil } }))).toBe('hidden');
  });

  it('shows the confirmation once the period is checked in', () => {
    expect(periodNudgeState(period({ periodCheckedIn: true }))).toBe('logged');
    expect(periodNudgeState(period({ periodCheckedIn: true, restDays: [0] }))).toBe('logged');
  });

  it('follows a day that runs past midnight into Monday', () => {
    const mondayMorning = at(0, 45, 26);
    expect(periodNudgeState(period({ now: mondayMorning, dayStartTime: '09:00', shutoffTime: '00:30' }))).toBe('strip');
  });

  describe('while the check-in is off', () => {
    const off = (overrides: Partial<PeriodNudgeInput> = {}) => period({ settings: DEFAULT_MOOD_SETTINGS, ...overrides });

    it('hints once at turning it on, on the day\'s nudge', () => {
      expect(periodNudgeState(off())).toBe('hint');
      expect(periodNudgeState(off({ kind: 'month', now: monthEnd }))).toBe('hint');
      expect(periodNudgeState(off({ hintSeen: true }))).toBe('hidden');
    });

    it('drops the hint wherever the day has no nudge', () => {
      expect(periodNudgeState(off({ checkedIn: true }))).toBe('hidden');
      expect(periodNudgeState(off({ restDays: [0] }))).toBe('hidden');
      expect(periodNudgeState(off({ settings: { ...DEFAULT_MOOD_SETTINGS, daily: false } }))).toBe('hidden');
      expect(periodNudgeState(off({ now: at(18, 4, 26) }))).toBe('hidden');
    });
  });
});

describe('optInHintSeen', () => {
  const sunday = new Date(2026, 9, 25, 18, 4);

  it('is unseen until it first shows, and for the rest of that day', () => {
    expect(optInHintSeen(undefined, sunday)).toBe(false);
    expect(optInHintSeen('2026-10-25', sunday)).toBe(false);
  });

  it('is used up on any later day', () => {
    expect(optInHintSeen('2026-10-18', sunday)).toBe(true);
  });
});

describe('periodStartOf', () => {
  it('starts a week on its Monday and a month on the 1st', () => {
    expect(toLocalDateStr(periodStartOf('week', new Date(2026, 9, 25)))).toBe('2026-10-19');
    expect(toLocalDateStr(periodStartOf('week', new Date(2026, 9, 19)))).toBe('2026-10-19');
    expect(toLocalDateStr(periodStartOf('week', new Date(2026, 10, 1)))).toBe('2026-10-26');
    expect(toLocalDateStr(periodStartOf('month', new Date(2026, 8, 30)))).toBe('2026-09-01');
  });
});
