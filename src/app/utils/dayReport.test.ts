import { describe, expect, it } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import type { Task } from '@/app/types/task';
import {
  dayContextLine,
  daySentence,
  dayTimeline,
  dayWhen,
  defaultOpenSections,
  minutesOnDay,
  minutesToClock,
  workWindowFrom,
  type DaySentenceInput,
} from './dayReport';

const day = (overrides: Partial<DaySentenceInput>): DaySentenceInput => ({
  when: 'past', rest: false, events: 0, tasksDue: 0, tasksDueDone: 0, tasksDone: 0, habitsDone: 0, notes: 0,
  ...overrides,
});

describe('daySentence', () => {
  it('a busy work day: how it felt, then events and tasks', () => {
    expect(daySentence(day({ mood: 4, energy: 3, stress: 3, events: 4, tasksDue: 5, tasksDueDone: 4, tasksDone: 5, habitsDone: 4, notes: 2 })))
      .toEqual({ main: 'Felt good on a full day: 4 events, 4 of 5 tasks done.', sub: 'Energy steady · stress some' });
  });

  it('a rest day', () => {
    expect(daySentence(day({ rest: true, mood: 5, energy: 4, stress: 1, events: 1, tasksDone: 1, habitsDone: 3 })))
      .toEqual({ main: 'Felt great on a rest day: 1 event, 1 task done.', sub: 'Energy good · stress calm' });
  });

  it('a past day with an archived event counts only the events that went ahead', () => {
    expect(daySentence(day({ mood: 3, energy: 2, stress: 4, events: 2, tasksDue: 3, tasksDueDone: 2, tasksDone: 2 })))
      .toEqual({ main: 'Felt okay on a lighter day: 2 events, 2 of 3 tasks done.', sub: 'Energy low · stress high' });
  });

  it('a day with no check-in asks for one, calmly', () => {
    expect(daySentence(day({ mood: null, events: 3, tasksDue: 4, tasksDueDone: 4, tasksDone: 4, habitsDone: 5, notes: 1 })))
      .toEqual({ main: 'No check-in for a full day: 3 events, 4 of 4 tasks done.', sub: 'Add how it went, any time.' });
    expect(daySentence(day({ when: 'today', mood: null, events: 1 })).main).toBe('No check-in yet for a lighter day: 1 event.');
  });

  it('an empty day', () => {
    expect(daySentence(day({ mood: null }))).toEqual({ main: 'Nothing was logged on this day.', sub: 'That’s fine. You can still add how it went.' });
    expect(daySentence(day({}))).toEqual({ main: 'Nothing was logged on this day.', sub: 'That’s fine.' });
    expect(daySentence(day({ when: 'today', mood: null })).main).toBe('Nothing logged today yet.');
    expect(daySentence(day({ when: 'future' }))).toEqual({ main: 'Nothing planned for this day yet.', sub: null });
  });

  it('a check-in alone, or only habits and notes', () => {
    expect(daySentence(day({ mood: 2 }))).toEqual({ main: 'Felt low on a quiet day.', sub: null });
    expect(daySentence(day({ habitsDone: 2, notes: 1 })).main).toBe('A quiet day: 2 habits done, 1 note edited.');
  });

  it('leaves mood out when it isn’t shown, and looks ahead on a future day', () => {
    expect(daySentence(day({ events: 1, tasksDue: 1 }))).toEqual({ main: 'A lighter day: 1 event, 0 of 1 task done.', sub: null });
    expect(daySentence(day({ when: 'future', mood: null, events: 3, tasksDue: 2 })))
      .toEqual({ main: 'A full day ahead: 3 events, 2 tasks due.', sub: null });
  });
});

describe('defaultOpenSections', () => {
  it('opens Events and Tasks on desktop, Events only on a phone', () => {
    const open = (phone: boolean) => Object.entries(defaultOpenSections(phone)).filter(([, v]) => v).map(([k]) => k);
    expect(open(false)).toEqual(['events', 'tasks']);
    expect(open(true)).toEqual(['events']);
  });
});

describe('day context line', () => {
  it('names the work window or the rest day, and the term', () => {
    expect(dayContextLine({ rest: false, window: workWindowFrom('08:00', '18:00'), term: 'Fall 2026' })).toBe('Work day · 8 AM – 6 PM · Fall 2026');
    expect(dayContextLine({ rest: true, window: null, term: 'Fall 2026' })).toBe('Rest day · Fall 2026');
    expect(dayContextLine({ rest: false, window: workWindowFrom('09:30', '00:00') })).toBe('Work day · 9:30 AM – midnight');
    // A window that ends the next morning only opens on this day.
    expect(dayContextLine({ rest: false, window: workWindowFrom('20:00', '02:00') })).toBe('Work day · 8 PM');
  });

  it('formats minutes as a clock', () => {
    expect(minutesToClock(0)).toBe('12 AM');
    expect(minutesToClock(13 * 60 + 5)).toBe('1:05 PM');
    expect(minutesToClock(1440)).toBe('midnight');
  });
});

describe('dayTimeline', () => {
  const event = (id: number, start: string, end: string, extra: Partial<EventOccurrence> = {}) => ({
    event_id: id, occurrence_date: '2026-10-21', date: '2026-10-21', end_date: '2026-10-21',
    all_day: false, start_time: `${start}:00`, end_time: `${end}:00`, ...extra,
  }) as EventOccurrence;
  const task = (id: number, completed_date: string | Date | null) => ({ id, completed_date }) as Task;
  const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m);

  it('puts events, finished tasks and the check-in in order, inside the work window', () => {
    const entries = dayTimeline({
      dateStr: '2026-10-21',
      events: [event(1, '13:00', '15:50'), event(2, '10:00', '10:50'), event(3, '00:00', '00:00', { all_day: true, start_time: null, end_time: null })],
      tasksDone: [task(7, at(14, 40)), task(8, '2026-10-21'), task(9, at(9, 15).toISOString())],
      checkinAt: at(21, 12).toISOString(),
      window: workWindowFrom('08:00', '18:00'),
    });
    expect(entries.map(e => `${e.kind}@${e.at}`)).toEqual([
      'window@480', 'task@555', 'event@600', 'event@780', 'task@880', 'window@1080', 'checkin@1272',
    ]);
  });

  it('leaves out times from another day, and the window when nothing else is on it', () => {
    expect(minutesOnDay(new Date(2026, 9, 22, 0, 30), '2026-10-21')).toBeNull();
    expect(minutesOnDay('2026-10-21', '2026-10-21')).toBeNull();
    expect(dayTimeline({ dateStr: '2026-10-21', events: [], tasksDone: [], window: workWindowFrom('08:00', '18:00') })).toEqual([]);
  });
});

describe('dayWhen', () => {
  it('places a day before, on or after today', () => {
    expect(dayWhen('2026-10-20', '2026-10-21')).toBe('past');
    expect(dayWhen('2026-10-21', '2026-10-21')).toBe('today');
    expect(dayWhen('2026-10-22', '2026-10-21')).toBe('future');
  });
});
