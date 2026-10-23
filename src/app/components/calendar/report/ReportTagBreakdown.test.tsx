// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import { periodContaining } from '@/app/utils/calendarReport';

const api = vi.hoisted(() => ({ fetchCalendarActivity: vi.fn() }));
vi.mock('@/app/lib/backend-api', () => api);

import ReportTagBreakdown from './ReportTagBreakdown';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
const math = { id: 2, name: 'MATH 254', color: '#7A5AD0' };
const health = { id: 3, name: 'Health', color: '#3B9A5A' };

const task = (id: number, title: string, hours: number | null, day: number, tags = [cs], month = 9): ActivityTask => ({
  id, title, category: null, priority: null, due_date: null, due_time: null, estimated_time: hours,
  completed: true, completed_date: new Date(2026, month, day, 12).toISOString(), parent_task_id: null, tags,
});

const empty = (overrides: Partial<CalendarActivity> = {}): CalendarActivity => ({
  start_date: '2026-09-24', end_date: '2026-10-25', scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [],
  ...overrides,
});

const weekActivity = empty({
  completed_tasks: [
    task(1, 'Study block', 3, 20, [cs, math]),
    task(2, 'Lab writeup', 2, 21),
    task(3, 'Laundry', 1, 20, []),
  ],
  note_sessions: [{
    id: 1, note_id: 7, note_title: 'Lecture notes',
    started_at: new Date(2026, 9, 21, 9).toISOString(), ended_at: new Date(2026, 9, 21, 10).toISOString(), duration_seconds: 3600,
  }],
  habit_completions: [
    { habit_id: 4, habit_title: 'Run', date: '2026-10-20', estimated_time: 0.5 },
    { habit_id: 4, habit_title: 'Run', date: '2026-10-21', estimated_time: 0.5 },
  ],
  notes: [{ id: 7, title: 'Lecture notes', tags: [cs] }],
  habits: [{ id: 4, title: 'Run', estimated_time: 0.5, tags: [health] }],
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Wednesday: the week is Oct 19–25, three days in.
  vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const render = async (kind: 'week' | 'month', activity: CalendarActivity) => {
  await act(async () => {
    root.render(<ReportTagBreakdown period={periodContaining(kind, new Date())} activity={activity} />);
  });
};

const text = () => container.textContent ?? '';
const rowNames = () => [...container.querySelectorAll('li > button')].map(b => b.getAttribute('aria-label'));
const button = (pattern: RegExp) =>
  [...container.querySelectorAll('button')].find(b => pattern.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('ReportTagBreakdown', () => {
  it('shares time out by tag, splitting several tags evenly, without comparing to last week', async () => {
    await render('week', weekActivity);
    expect(text()).toContain('8h');
    expect(text()).toContain('estimated and tracked this week');
    expect(text()).toContain('most went to CS 460 (56%)');
    expect(rowNames()).toEqual([
      'CS 460, 4.5h, 56%. Show its items',
      'MATH 254, 1.5h, 19%. Show its items',
      'Health, 1h, 13%. Show its items',
      'Untagged, 1h, 13%. Show its items',
    ]);
    expect(text()).toContain('Tap a tag to see its tasks, notes and habits.');
    expect(text()).not.toMatch(/vs last|new vs|same as last/);
    expect(api.fetchCalendarActivity).not.toHaveBeenCalled();
  });

  it('counts instead of timing, and leaves out a kind that is switched off', async () => {
    await render('week', weekActivity);
    await click(button(/^Count$/));
    expect(text()).toContain('things done this week');
    expect(rowNames()[0]).toBe('CS 460, 2.5, 42%. Show its items');
    await click(button(/^Habits$/));
    expect(rowNames().some(name => name?.startsWith('Health'))).toBe(false);
  });

  it('opens a tag to its items and goes back', async () => {
    await render('week', weekActivity);
    await click(button(/^MATH 254, /));
    expect(container.querySelector('h3')?.textContent).toBe('MATH 254');
    expect(text()).toContain('Study block');
    expect(text()).toContain('split 1/2 with');
    expect(text()).not.toContain('Lab writeup');
    expect(document.activeElement?.textContent).toBe('All tags');
    await click(button(/^All tags$/));
    expect(container.querySelector('h3')).toBeNull();
    expect(rowNames()).toHaveLength(4);
  });

  it('shows a month without loading or comparing to last month', async () => {
    await render('month', empty({ completed_tasks: [task(2, 'Lab writeup', 2, 21)] }));
    expect(rowNames()).toEqual(['CS 460, 2h, 100%. Show its items']);
    expect(text()).not.toContain('last month');
    expect(api.fetchCalendarActivity).not.toHaveBeenCalled();
  });
});
