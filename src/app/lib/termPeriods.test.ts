import { describe, expect, it } from 'vitest';
import type { ArchivedTerm, CalendarSettings, TermPeriod } from '@/app/types/calendar';
import { calendarTermPeriods, formatTermRange, termOnDay, termsInRange } from './termPeriods';

const fall: CalendarSettings = { id: 3, title: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-18' };
const spring: ArchivedTerm = { id: 1, title: 'Spring 2026', start_date: '2026-01-20', end_date: '2026-05-15', archived_at: '2026-05-20T00:00:00Z' };

describe('calendarTermPeriods', () => {
  it('lists the archived terms and then the saved current term', () => {
    expect(calendarTermPeriods(fall, [spring])).toEqual([
      { title: 'Spring 2026', start_date: '2026-01-20', end_date: '2026-05-15', archived: true },
      { title: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-18', archived: false },
    ]);
  });

  it('leaves out the placeholder term shown before one is saved', () => {
    expect(calendarTermPeriods({ ...fall, id: 0 }, [spring]).map(t => t.title)).toEqual(['Spring 2026']);
  });
});

describe('termOnDay', () => {
  const terms: TermPeriod[] = [
    { title: 'Old', start_date: '2026-08-01', end_date: '2026-09-30', archived: true },
    { title: 'Now', start_date: '2026-09-15', end_date: '2026-12-18', archived: false },
  ];

  it('includes both ends of a term', () => {
    expect(termOnDay(terms, '2026-08-01')?.title).toBe('Old');
    expect(termOnDay(terms, '2026-12-18')?.title).toBe('Now');
    expect(termOnDay(terms, '2026-12-19')).toBeUndefined();
  });

  it('prefers the current term where terms overlap', () => {
    expect(termOnDay(terms, '2026-09-20')?.title).toBe('Now');
  });
});

describe('termsInRange', () => {
  it('keeps the terms touching the range', () => {
    const terms = calendarTermPeriods(fall, [spring]);
    expect(termsInRange(terms, '2026-05-01', '2026-05-31').map(t => t.title)).toEqual(['Spring 2026']);
    expect(termsInRange(terms, '2026-06-01', '2026-06-30')).toEqual([]);
  });
});

describe('formatTermRange', () => {
  it('names the year once within a year, and both across two', () => {
    expect(formatTermRange(fall)).toBe('Aug 24 – Dec 18, 2026');
    expect(formatTermRange({ start_date: '2026-12-01', end_date: '2027-02-10' })).toBe('Dec 1, 2026 – Feb 10, 2027');
  });
});
