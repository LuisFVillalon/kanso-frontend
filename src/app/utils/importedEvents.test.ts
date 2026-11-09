import { describe, expect, it } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import { eventFormWarnings, blankEventForm } from './events';
import { buildWeekEvents, startOfWeek } from './weekLayout';
import { googleEventLink, isImportedEvent, tagSignature } from './importedEvents';

const occurrence = (overrides: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: 5, occurrence_date: '2026-11-11', title: 'Dentist', description: null, tags: [], all_day: false,
  date: '2026-11-11', end_date: '2026-11-11', start_time: '10:00:00', end_time: '11:00:00',
  starts_at: '2026-11-11T18:00:00Z', ends_at: '2026-11-11T19:00:00Z', time_zone: 'America/Los_Angeles',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
  ...overrides,
});
const google = (overrides: Partial<EventOccurrence> = {}) => occurrence({ event_id: -5, source: 'google', read_only: true, ...overrides });

describe('isImportedEvent', () => {
  it('is true for a Google event or anything read-only', () => {
    expect(isImportedEvent(google())).toBe(true);
    expect(isImportedEvent(occurrence({ read_only: true }))).toBe(true);
  });

  it('is false for a kanso event, including one from a server that sends no source', () => {
    expect(isImportedEvent(occurrence({ source: 'kanso', read_only: false }))).toBe(false);
    expect(isImportedEvent(occurrence())).toBe(false);
  });
});

describe('googleEventLink', () => {
  it('passes an https link through', () => {
    const link = 'https://www.google.com/calendar/event?eid=abc';
    expect(googleEventLink({ html_link: link })).toBe(link);
  });

  it.each([null, undefined, '', 'javascript:alert(1)', 'http://www.google.com/calendar'])('has no link for %s', html_link => {
    expect(googleEventLink({ html_link })).toBeNull();
  });
});

describe('imported events count like kanso events', () => {
  it('rings a planned task that falls during one', () => {
    const weekStart = startOfWeek(new Date(2026, 10, 11));
    const task = { id: 1, title: 'Essay', completed: false, due_date: '2026-11-11', due_time: '10:30:00', estimated_time: 1, tags: [] };
    const { timed } = buildWeekEvents({
      weekStart,
      scheduledTasks: [task] as never,
      completedTasks: [],
      noteSessions: [],
      habitCompletions: [],
      events: [google({ title: 'Team sync' })],
      now: new Date(2026, 10, 9),
    });
    expect(timed.find(e => e.kind === 'task')?.clashWith).toBe('Team sync');
  });

  it("warns about overlapping one in the event form", () => {
    const warnings = eventFormWarnings(blankEventForm({ date: '2026-11-11', startTime: '10:30' }), {
      restDays: [],
      windowOn: () => [0, 24 * 60],
      others: [google({ title: 'Team sync' })],
    });
    expect(warnings).toContain('Overlaps Team sync.');
  });
});

describe('tagSignature', () => {
  it('ignores order', () => {
    expect(tagSignature([{ id: 2 }, { id: 1 }])).toBe(tagSignature([{ id: 1 }, { id: 2 }]));
  });
});
