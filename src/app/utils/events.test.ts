import { describe, expect, it } from 'vitest';
import type { CalendarEvent, EventOccurrence } from '@/app/types/event';
import {
  allowedEditScopes,
  blankEventForm,
  editBody,
  eventColor,
  eventFormEdit,
  eventFormErrors,
  eventFormFromOccurrence,
  eventFormSummary,
  eventFormToCreate,
  eventFormWarnings,
  repeatDates,
  repeatText,
  timeRangeText,
  type EventFormValues,
} from './events';

const TAG = { id: 4, name: 'CS 460', color: '#3b82f6' };

const occurrence = (overrides: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: 30, occurrence_date: '2026-10-21', title: 'CS 460 Lecture', description: null, tags: [TAG],
  all_day: false, date: '2026-10-21', end_date: '2026-10-21', start_time: '10:00:00', end_time: '10:50:00',
  starts_at: '2026-10-21T17:00:00Z', ends_at: '2026-10-21T17:50:00Z', time_zone: 'America/Los_Angeles',
  repeat_days: [1, 3, 5], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
  ...overrides,
});

const series = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 30, title: 'CS 460 Lecture', description: null, tags: [TAG], all_day: false,
  start_date: '2026-08-24', end_date: '2026-12-11', start_time: '10:00:00', end_time: '10:50:00',
  time_zone: 'America/Los_Angeles', repeat_days: [1, 3, 5], repeat_interval: 1, reminder_minutes: null,
  split_from_id: null, created_date: '2026-08-01T00:00:00Z', archived_at: null, deleted_at: null, ...overrides,
});

const form = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
  ...blankEventForm({ date: '2026-10-26', startTime: '17:00', endTime: '18:00', title: 'Guitar lesson' }),
  ...overrides,
});

describe('repeatText', () => {
  it('reads weekly, every N weeks, and the common day sets', () => {
    expect(repeatText({ repeat_days: [1, 3, 5], repeat_interval: 1 })).toBe('Weekly on Mon, Wed and Fri');
    expect(repeatText({ repeat_days: [2], repeat_interval: 2 })).toBe('Every 2 weeks on Tue');
    expect(repeatText({ repeat_days: [1, 2, 3, 4, 5], repeat_interval: 1 })).toBe('Weekly on weekdays');
    expect(repeatText({ repeat_days: [0, 1, 2, 3, 4, 5, 6], repeat_interval: 1 })).toBe('Every day');
    expect(repeatText({ repeat_days: [], repeat_interval: 1 })).toBeNull();
  });
});

describe('eventColor', () => {
  it("takes the first tag's color, and the pencil gray without one", () => {
    expect(eventColor([TAG, { color: '#10b981' }])).toBe('#3b82f6');
    expect(eventColor([])).toBe('var(--tm-pencil)');
  });
});

describe('timeRangeText', () => {
  it('says when a range runs into the next day', () => {
    expect(timeRangeText(13 * 60, 15 * 60 + 50)).toBe('1:00 PM – 3:50 PM');
    expect(timeRangeText(22 * 60, 60)).toBe('10:00 PM – 1:00 AM the next day');
  });
});

describe('repeatDates', () => {
  it('lands on the chosen weekdays from the start through the end', () => {
    expect(repeatDates({ start: '2026-10-26', end: '2026-11-06', days: [1, 3, 5], interval: 1 })).toEqual([
      '2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06',
    ]);
  });

  it('skips weeks for every N weeks, counting Sunday weeks from the first', () => {
    // Starts Thu Oct 22: that week, then every other week.
    expect(repeatDates({ start: '2026-10-22', end: '2026-11-21', days: [2, 4], interval: 2 })).toEqual([
      '2026-10-22', '2026-11-03', '2026-11-05', '2026-11-17', '2026-11-19',
    ]);
  });

  it('steps calendar days across the end of daylight saving time', () => {
    expect(repeatDates({ start: '2026-10-30', end: '2026-11-02', days: [0, 1], interval: 1 })).toEqual(['2026-11-01', '2026-11-02']);
  });
});

describe('the event form', () => {
  it('starts a quick event an hour long, repeating on its weekday until the end of term', () => {
    const f = blankEventForm({ date: '2026-10-23', startTime: '16:00', repeat: true, termEnd: '2026-12-11' });
    expect(f).toMatchObject({ startTime: '16:00', endTime: '17:00', repeat: 'weekly', repeatDays: [5], endMode: 'term' });
    expect(blankEventForm({ date: '2026-10-23' }).endMode).toBe('never');
  });

  it('sums up a repeating event with its count, and a one-off with its day', () => {
    const repeating = form({ repeat: 'weekly', repeatDays: [1, 3, 5], endMode: 'on', endDate: '2026-12-11' });
    expect(eventFormSummary(repeating, null)).toBe('Every Mon, Wed and Fri · 5:00 PM – 6:00 PM · Oct 26 – Dec 11, 21 events');
    expect(eventFormSummary({ ...repeating, repeat: 'biweekly', repeatDays: [2] }, null)).toBe('Every 2 weeks on Tue · 5:00 PM – 6:00 PM · Oct 26 – Dec 11, 4 events');
    expect(eventFormSummary({ ...repeating, endMode: 'never' }, null)).toBe('Every Mon, Wed and Fri · 5:00 PM – 6:00 PM · from Oct 26, no end');
    expect(eventFormSummary(form({ startTime: '22:00', endTime: '01:00' }), null)).toBe('Mon, Oct 26 · 10:00 PM – 1:00 AM the next day');
    expect(eventFormSummary(form({ allDay: true }), null)).toBe('Mon, Oct 26 · All day');
  });

  it('turns into the create body, a one-off with no repeat or end', () => {
    expect(eventFormToCreate(form({ description: '  Bring the capo ', tags: [TAG] }), 'America/Los_Angeles', null)).toEqual({
      title: 'Guitar lesson', description: 'Bring the capo', tags: [{ name: 'CS 460', color: '#3b82f6' }], all_day: false,
      start_date: '2026-10-26', end_date: null, start_time: '17:00', end_time: '18:00', time_zone: 'America/Los_Angeles',
      repeat_days: [], repeat_interval: 1, reminder_minutes: null,
    });
    const custom = eventFormToCreate(
      form({ repeat: 'custom', repeatInterval: 3, repeatDays: [3, 1], endMode: 'term', allDay: true, reminderMinutes: 0 }),
      'UTC', '2026-12-11',
    );
    expect(custom).toMatchObject({ repeat_days: [1, 3], repeat_interval: 3, end_date: '2026-12-11', start_time: null, end_time: null, reminder_minutes: 0 });
  });

  it('ends on its own date, not a term that ended before it starts', () => {
    const f = blankEventForm({ date: '2026-10-23', title: 'Spring seminar', repeat: true, termEnd: '2026-12-11' });
    const moved = { ...f, date: '2027-01-12', repeatDays: [2], endDate: '2027-03-01' };
    expect(eventFormToCreate(moved, 'UTC', '2026-12-11')).toMatchObject({ start_date: '2027-01-12', end_date: '2027-03-01' });
    expect(eventFormErrors(moved, '2026-12-11')).toEqual([]);
    expect(eventFormSummary(moved, '2026-12-11')).toBe('Every Tue · 9:00 AM – 10:00 AM · Jan 12 – Mar 1, 7 events');
    expect(eventFormEdit(f, moved, '2026-12-11').series).toMatchObject({ end_date: '2027-03-01' });
  });

  it("won't save without a title, with the same start and end, or with a repeat ending before it starts", () => {
    expect(eventFormErrors(form(), null)).toEqual([]);
    expect(eventFormErrors(form({ title: ' ' }), null)).toEqual(['Give the event a title.']);
    expect(eventFormErrors(form({ endTime: '17:00' }), null)).toEqual(['The event has to end at a different time than it starts.']);
    expect(eventFormErrors(form({ repeat: 'weekly', endMode: 'on', endDate: '2026-10-01' }), null)).toEqual(['The repeat ends before it starts.']);
    expect(eventFormErrors(form({ repeat: 'weekly', repeatDays: [] }), null)).toEqual(['Pick at least one day to repeat on.']);
    // Past midnight is fine.
    expect(eventFormErrors(form({ startTime: '22:00', endTime: '01:00' }), null)).toEqual([]);
  });

  it('warns about rest days, the work window and overlaps without blocking', () => {
    const context = {
      restDays: [0, 6],
      windowOn: (): [number, number] => [8 * 60, 22 * 60],
      others: [
        occurrence({ title: 'PSY 101 Lecture', date: '2026-10-26', start_time: '17:30:00', end_time: '18:30:00' }),
        occurrence({ title: 'PSY 101 Lecture', date: '2026-10-28', start_time: '17:30:00', end_time: '18:30:00' }),
        occurrence({ title: 'Old yoga', date: '2026-10-26', start_time: '17:00:00', end_time: '18:00:00', archived: true }),
      ],
    };
    expect(eventFormWarnings(form({ repeat: 'weekly', repeatDays: [1, 3, 6], startTime: '07:00', endTime: '22:30' }), context)).toEqual([
      'Saturday is a rest day.',
      'Starts before your day opens (8:00 AM).',
      "Runs past your day's close (10:00 PM).",
      'Overlaps PSY 101 Lecture on Mons and Weds.',
    ]);
    expect(eventFormWarnings(form(), context)).toEqual(['Overlaps PSY 101 Lecture.']);
  });
});

describe('saving an edit', () => {
  const termEnd = '2026-12-11';
  const initial = eventFormFromOccurrence(occurrence(), series(), termEnd);

  it('reads the occurrence for what it shows and the series for how it repeats', () => {
    expect(initial).toMatchObject({
      title: 'CS 460 Lecture', date: '2026-10-21', startTime: '10:00', endTime: '10:50',
      repeat: 'weekly', repeatDays: [1, 3, 5], endMode: 'term',
    });
    expect(eventFormFromOccurrence(occurrence(), series({ repeat_interval: 4, end_date: null })).repeat).toBe('custom');
    // The summary counts the whole series, not just from this date.
    expect(eventFormSummary(initial, termEnd)).toBe('Every Mon, Wed and Fri · 10:00 AM – 10:50 AM · Aug 24 – Dec 11, 48 events');
  });

  it('sends only what changed, any scope for occurrence fields', () => {
    const edit = eventFormEdit(initial, { ...initial, title: 'CS 460 Midterm', startTime: '09:00' }, termEnd);
    expect(allowedEditScopes(edit)).toEqual(['this', 'following', 'all']);
    expect(editBody(edit, 'this', true, initial)).toEqual({ title: 'CS 460 Midterm', start_time: '09:00' });
    expect(editBody(edit, 'all', true, initial)).toEqual({ title: 'CS 460 Midterm', start_time: '09:00' });
  });

  it('keeps series changes off "this", and a new date to "this" alone', () => {
    const repeat = eventFormEdit(initial, { ...initial, repeatDays: [2, 4] }, termEnd);
    expect(allowedEditScopes(repeat)).toEqual(['following', 'all']);
    expect(editBody(repeat, 'following', true, initial)).toEqual({ repeat_days: [2, 4] });

    const moved = eventFormEdit(initial, { ...initial, date: '2026-10-22' }, termEnd);
    expect(allowedEditScopes(moved)).toEqual(['this']);
    expect(editBody(moved, 'this', true, initial)).toEqual({ date: '2026-10-22' });

    const both = eventFormEdit(initial, { ...initial, date: '2026-10-22', repeatInterval: 2, repeat: 'biweekly' }, termEnd);
    expect(allowedEditScopes(both)).toEqual([]);
  });

  it('moves the last occurrence past the series end as "this" alone', () => {
    const last = eventFormFromOccurrence(occurrence({ date: '2026-12-11' }), series(), termEnd);
    const onDate = { ...last, endMode: 'on' as const, endDate: termEnd };
    for (const start of [last, onDate]) {
      const moved = { ...start, date: '2026-12-12' };
      expect(eventFormErrors(moved, termEnd)).toEqual([]);
      expect(allowedEditScopes(eventFormEdit(start, moved, termEnd))).toEqual(['this']);
    }
  });

  it('moves a one-off with date, and starts a repeat from the form day', () => {
    const oneOff = eventFormFromOccurrence(occurrence({ repeat_days: [] }), series({ repeat_days: [], end_date: null }));
    const moved = eventFormEdit(oneOff, { ...oneOff, date: '2026-10-30' }, null);
    expect(editBody(moved, 'all', false, { ...oneOff, date: '2026-10-30' })).toEqual({ date: '2026-10-30' });

    const next = { ...oneOff, repeat: 'weekly' as const, repeatDays: [3], endMode: 'never' as const };
    expect(editBody(eventFormEdit(oneOff, next, null), 'all', false, next)).toEqual({ repeat_days: [3], start_date: '2026-10-21' });
  });
});
