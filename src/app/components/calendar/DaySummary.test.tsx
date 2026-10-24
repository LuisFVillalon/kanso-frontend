// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { EventOccurrence } from '@/app/types/event';
import type { Habit } from '@/app/types/habit';
import type { MoodCheckin } from '@/app/types/mood';
import type { Task } from '@/app/types/task';

const mood = vi.hoisted(() => ({ checkin: undefined as MoodCheckin | null | undefined }));

vi.mock('@/app/hooks/useNoteTimeTotals', () => ({
  useNoteTimeTotalsForRange: () => ({}),
}));
vi.mock('@/app/hooks/useDayMoodCheckin', () => ({
  useDayMoodCheckin: (date: string | null) => ({ checkin: date ? mood.checkin : undefined, failed: false }),
}));
vi.mock('./DayMoodChip', () => ({ default: () => <button type="button">Log mood</button> }));

import DaySummary from './DaySummary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const art = { id: 2, name: 'Art', color: '#ec4899' };
let nextId = 1;
const event = (title: string, start: string, end: string, extra: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: nextId++, occurrence_date: '2026-10-23', title, description: null, tags: [art], all_day: false,
  date: '2026-10-23', end_date: '2026-10-23', start_time: `${start}:00`, end_time: `${end}:00`,
  starts_at: `2026-10-23T${start}:00Z`, ends_at: `2026-10-23T${end}:00Z`, time_zone: 'America/Los_Angeles',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: true, archived: false,
  ...extra,
});

const studio = event('ART 157 Studio', '13:00', '15:50', { description: 'Bring the charcoal set', repeat_days: [5] });
const lecture = event('CS 460 Lecture', '10:00', '10:50', { repeat_days: [1, 3, 5], repeat_interval: 2 });
const yoga = event('Yoga', '09:00', '09:30', { archived: true });
const prescription = { id: 9, title: 'Pick up prescription', description: '', completed: false, due_date: '2026-10-23', due_time: '13:30:00', estimated_time: 1, tags: [] } as unknown as Task;
const essay = { id: 10, title: 'Essay draft', completed: true, completed_date: new Date(2026, 9, 23, 11, 20), due_date: '2026-10-20', due_time: null, estimated_time: 2, tags: [] } as unknown as Task;
const walk = { id: 3, title: 'Walk', estimated_time: null, tags: [] } as unknown as Habit;
const read = { id: 4, title: 'Read', estimated_time: null, tags: [] } as unknown as Habit;

const data: DayData = {
  dateStr: '2026-10-23', habitsCompleted: [walk], tasksDue: [prescription], tasksCompleted: [essay], estimatedHours: 1, notesEdited: [],
  events: [yoga, lecture, studio],
};
const empty: DayData = { ...data, habitsCompleted: [], tasksDue: [], tasksCompleted: [], events: [] };

const render = (d: DayData, showMood = false) => act(() => root.render(
  <DaySummary date={new Date(2026, 9, 23)} data={d} totalHabits={2} allHabits={[walk, read]} showMood={showMood} />,
));

const text = () => container.textContent ?? '';
const section = (id: string) => container.querySelector<HTMLDetailsElement>(`[data-section="${id}"]`)!;
const openSections = () => [...container.querySelectorAll<HTMLDetailsElement>('details')].filter(d => d.open).map(d => d.dataset.section);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 24, 9));
  mood.checkin = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DaySummary', () => {
  it('opens with one plain sentence and the day’s counts', () => {
    render(data);
    expect(container.querySelector('[data-day-sentence]')!.textContent).toBe('A lighter day: 2 events, 0 of 1 task done.');
    expect(container.querySelector('[data-day-counts]')!.textContent).toBe('2 events0/1 task0 noteshabits 1/2');
  });

  it('opens Events and Tasks on desktop, and only Events on a phone', () => {
    render(data);
    expect(openSections()).toEqual(['events', 'tasks']);
    act(() => root.unmount());
    root = createRoot(container);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 767px)' }));
    render(data);
    expect(openSections()).toEqual(['events']);
  });

  it('previews a closed section in one line', () => {
    render(data);
    expect(section('habits').querySelector('summary')!.textContent).toBe('Habits · 1 of 2Walk');
    expect(section('time').querySelector('summary')!.textContent).toBe('Where the time went · about 5.7hArt 3.7h · Untagged 2h');
    expect(section('events').querySelector('[data-preview]')!.textContent)
      .toBe('9 AM Yoga (archived) · 10 AM CS 460 Lecture · 1 PM ART 157 Studio');
  });

  it('shows the events as the day in order, with finished tasks between them', () => {
    render(data);
    const entries = [...container.querySelectorAll('[data-timeline-entry]')];
    expect(entries.map(e => e.getAttribute('data-timeline-entry'))).toEqual(['event', 'event', 'task', 'event']);
    expect(entries[2].textContent).toContain('Essay draft');
    expect(entries[2].textContent).toContain('was due Oct 20');
    const rows = [...container.querySelectorAll('[data-event-row]')];
    expect(rows[2].textContent).toContain('1:00 – 3:50 PM');
    expect(rows[2].textContent).toContain('Bring the charcoal set');
    expect(rows[2].textContent).toContain('Weekly on Fri');
    expect(rows[1].textContent).toContain('Every 2 weeks on Mon, Wed and Fri');
    expect(rows[0].textContent).toContain('Archived');
    // Every event on a past day is past, so none is marked so.
    expect(rows[1].textContent).not.toContain('Past');
  });

  it('notes a task due during an event', () => {
    render(data);
    expect(container.querySelector('[data-event-clash]')!.textContent)
      .toBe('Pick up prescription is due at 1:30 PM, during ART 157 Studio (1:00 – 3:50 PM).');
  });

  it('lists tasks once: due this day, then the ones done from another day', () => {
    render(data);
    const rows = [...section('tasks').querySelectorAll('[data-task-row]')].map(r => r.textContent);
    expect(rows).toEqual(['Pick up prescriptionDue 1:30 PM · still open', 'Essay draftDone 11:20 AM · was due Oct 20']);
    expect(section('tasks').querySelector('summary')!.textContent).toContain('0 of 1 done · 1 still open · +1 from another day');
  });

  it('counts only the events that took place in Where the time went', () => {
    render({ ...data, tasksCompleted: [], events: [yoga, { ...studio, past: false }, { ...lecture, past: false }] });
    expect(section('time').textContent).toContain('No time logged.');
  });

  it('marks a habit not done for the day it is about', () => {
    render(data);
    const habitRows = () => [...section('habits').querySelectorAll('.py-1')].map(r => r.textContent);
    expect(habitRows()).toEqual(['Walk', 'ReadNot done']);
    act(() => root.render(
      <DaySummary date={new Date(2026, 9, 24)} data={{ ...data, dateStr: '2026-10-24' }} totalHabits={2} allHabits={[walk, read]} showMood={false} />,
    ));
    expect(habitRows()).toEqual(['Walk', 'ReadNot today']);
  });

  it('leaves out the timeline hint when there is no timeline', () => {
    render({ ...data, events: [event('Holiday', '00:00', '00:00', { all_day: true, start_time: null, end_time: null })] });
    expect(container.querySelector('[data-timeline]')).toBeNull();
    expect(section('events').textContent).not.toContain('Shows your finished tasks');
    render(data);
    expect(section('events').textContent).toContain('Shows your finished tasks between events.');
  });

  it('says so when there are no events', () => {
    render({ ...data, events: [] });
    expect(section('events').textContent).toContain('No events.');
    expect(container.querySelectorAll('[data-event-row]')).toHaveLength(0);
  });

  it('is one calm line on an empty day', () => {
    render(empty);
    expect(text()).toBe('Nothing was logged on this day.That’s fine.');
    expect(container.querySelectorAll('details')).toHaveLength(0);
    mood.checkin = null;
    render(empty, true);
    expect(container.querySelector('[data-day-sentence]')!.textContent).toBe('Nothing was logged on this day.');
    expect(text()).toContain('Log mood');
  });

  it('shows the check-in: how it felt, its answers and its place in the day', () => {
    mood.checkin = {
      id: 1, period_kind: 'day', period_start: '2026-10-23', mood: 4, energy: 3, stress: 2, workload: null, highlight: null,
      progress: null, word: null, note: 'Good studio session', tags: ['Busy', 'Focused'],
      created_at: new Date(2026, 9, 23, 21, 12).toISOString(), updated_at: new Date(2026, 9, 23, 21, 12).toISOString(),
    };
    render(data, true);
    expect(container.querySelector('[data-day-glance]')!.textContent).toContain('Felt good on a lighter day: 2 events, 0 of 1 task done.Energy steady · stress mild');
    expect(section('mood').querySelector('[data-preview]')!.textContent).toBe('Good · energy steady · stress mild · Busy, Focused');
    expect(section('mood').textContent).toContain('checked in at 9:12 PM');
    const last = [...container.querySelectorAll('[data-timeline-entry]')].pop()!;
    expect(last.textContent).toContain('Checked in: Good');
  });

  it('asks for a check-in on a day without one', () => {
    mood.checkin = null;
    render(data, true);
    expect(container.querySelector('[data-day-sentence]')!.textContent).toBe('No check-in for a lighter day: 2 events, 0 of 1 task done.');
    expect(section('mood').querySelector('[data-preview]')!.textContent).toBe('No check-in');
  });
});
