// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { EventOccurrence } from '@/app/types/event';
import DayCell from './DayCell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const event = (title: string, extra: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: title.length, occurrence_date: '2026-10-21', title, description: null,
  tags: [{ id: 1, name: 'CS 460', color: '#8b5cf6' }], all_day: false,
  date: '2026-10-21', end_date: '2026-10-21', start_time: '10:00:00', end_time: '10:50:00',
  starts_at: '2026-10-21T17:00:00Z', ends_at: '2026-10-21T17:50:00Z', time_zone: 'America/Los_Angeles',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
  ...extra,
});

const day = (events: EventOccurrence[]): DayData => ({
  dateStr: '2026-10-21', habitsCompleted: [], tasksDue: [], tasksCompleted: [], estimatedHours: 0, notesEdited: [], events,
});

const render = (data: DayData | undefined) =>
  act(() => root.render(<DayCell date={new Date(2026, 9, 21)} data={data} isToday={false} onSelect={() => {}} hue="#000" />));

const bars = () => [...container.querySelectorAll<HTMLElement>('[data-event-bar]')];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DayCell events', () => {
  it('shows up to two titled bars in their tag color, then +N, and counts them for screen readers', () => {
    render(day([event('CS 460 Lecture'), event('MATH 254'), event('Library shift')]));
    expect(bars().map(b => b.textContent)).toEqual(['CS 460 Lecture', 'MATH 254']);
    expect(bars()[0].style.borderLeft).toContain('rgb(139, 92, 246)');
    expect(container.textContent).toContain('+1');
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('October 21, 2026 — 3 events — has activity');
  });

  it('fades a past event and hatches and strikes through an archived one', () => {
    render(day([event('Gym', { past: true }), event('Yoga', { past: true, archived: true })]));
    const [past, archived] = bars();
    expect(past.style.opacity).toBe('0.7');
    expect(past.style.textDecoration).toBe('');
    expect(archived.style.textDecoration).toBe('line-through');
    expect(archived.style.background).toContain('repeating-linear-gradient');
    expect(archived.title).toBe('Yoga · 10:00 – 10:50 AM · archived');
  });

  it('shows no bars without events', () => {
    render(day([]));
    expect(bars()).toHaveLength(0);
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('October 21, 2026');
  });
});
