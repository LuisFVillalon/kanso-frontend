// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { EventOccurrence } from '@/app/types/event';
import type { Task } from '@/app/types/task';

vi.mock('@/app/hooks/useNoteTimeTotals', () => ({
  useNoteTimeTotalsForRange: () => ({}),
  useNoteTimeTotalsByDay: () => ({}),
}));

import DaySummary from './DaySummary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const art = { id: 2, name: 'Art', color: '#ec4899' };
const event = (title: string, start: string, end: string, extra: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: title.length, occurrence_date: '2026-10-23', title, description: null, tags: [art], all_day: false,
  date: '2026-10-23', end_date: '2026-10-23', start_time: `${start}:00`, end_time: `${end}:00`,
  starts_at: `2026-10-23T${start}:00Z`, ends_at: `2026-10-23T${end}:00Z`, time_zone: 'America/Los_Angeles',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
  ...extra,
});

const studio = event('ART 157 Studio', '13:00', '15:50', { description: 'Bring the charcoal set', repeat_days: [5] });
const lecture = event('CS 460 Lecture', '10:00', '10:50', { past: true, repeat_days: [1, 3, 5], repeat_interval: 2 });
const yoga = event('Yoga', '09:00', '09:30', { past: true, archived: true });
const prescription = { id: 9, title: 'Pick up prescription', description: '', completed: false, due_date: '2026-10-23', due_time: '13:30:00', estimated_time: 1, tags: [] } as unknown as Task;

const data: DayData = {
  dateStr: '2026-10-23', habitsCompleted: [], tasksDue: [prescription], tasksCompleted: [], estimatedHours: 1, notesEdited: [],
  events: [yoga, lecture, studio],
};

const render = (d: DayData) => act(() => root.render(
  <DaySummary date={new Date(2026, 9, 23)} data={d} totalHabits={0} allHabits={[]} dayData={new Map([[d.dateStr, d]])} />,
));

const text = () => container.textContent ?? '';

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DaySummary events', () => {
  it('leads with an Events tile and the day’s events, before habits and tasks', () => {
    render(data);
    // Live event time (the archived yoga class left out) and how many were archived.
    expect(text()).toContain('Events33h 40m · 1 archived');
    const rows = [...container.querySelectorAll('[data-event-row]')];
    expect(rows.map(r => r.querySelector('span')!.textContent)).toEqual(['Yoga', 'CS 460 Lecture', 'ART 157 Studio']);
    const headings = [...container.querySelectorAll('h3')].map(h => h.textContent);
    expect(headings.indexOf('Events')).toBeLessThan(headings.indexOf('Habits completed'));
    expect(rows[2].textContent).toContain('1:00 – 3:50 PM');
    expect(rows[2].textContent).toContain('Bring the charcoal set');
    expect(rows[2].textContent).toContain('Weekly on Fri');
    expect(rows[1].textContent).toContain('Every 2 weeks on Mon, Wed and Fri');
    expect(rows[1].textContent).toContain('Past');
    expect(rows[0].textContent).toContain('Archived');
  });

  it('notes a task due during an event', () => {
    render(data);
    expect(container.querySelector('[data-event-clash]')!.textContent)
      .toBe('Pick up prescription is due at 1:30 PM, during ART 157 Studio (1:00 – 3:50 PM).');
  });

  it('counts every event as planned time and only the ones that happened as actual time', () => {
    render(data);
    // Plan: the task (1h) plus all three events (0.5h + 0.83h + 2.83h) under Art; Actual: the past lecture only.
    expect(text()).not.toContain('No estimated hours today');
    expect(text()).not.toContain('No hours worked today');
    render({ ...data, events: [yoga, studio] });
    expect(text()).toContain('No hours worked today');
  });

  it('says so when there are no events', () => {
    render({ ...data, events: [] });
    expect(text()).toContain('No events');
    expect(container.querySelectorAll('[data-event-row]')).toHaveLength(0);
  });
});
