// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import type { MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  fetchCalendarActivity: vi.fn(),
  fetchMoodCheckins: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  fetchMoodTags: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
const auth = vi.hoisted(() => ({ user: { id: 'user-1' } }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
const habitsContext = vi.hoisted(() => ({ habits: [] }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => habitsContext }));

import CalendarReportView from './CalendarReportView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (period_start: string, mood: number): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});

const showMood = (show: boolean) =>
  api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { show_in_reports: show } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Wednesday: the week is Oct 19–25, three days in.
  vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
  showMood(true);
  api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
    start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [],
  }));
  api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), checkin('2026-10-01', 2)]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
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

const render = async () => {
  await act(async () => {
    root.render(<ToastProvider><CalendarReportView /></ToastProvider>);
  });
};

const text = () => document.body.textContent ?? '';
const buttonLabelled = (pattern: RegExp) =>
  [...document.body.querySelectorAll('button')].find(b => pattern.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('CalendarReportView mood', () => {
  it('adds the Mood tile and widens the week summary to 4 weeks', async () => {
    await render();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-09-24', '2026-10-25', ['day']);
    expect(text()).toContain('1 of 3 days logged');
    expect(text()).toContain('Using 4 weeks — one week is too short');
    // The Check-ins card averages Good and Low over the 28 days to today.
    expect(text()).toContain('2 of 28 days logged');
    expect(text()).toContain('Mood over time');
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
  });

  it('keeps the Mood section for a week with check-ins only in the earlier weeks', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-15', 4), checkin('2026-10-01', 2)]);
    await render();
    expect(text()).not.toContain('Nothing recorded');
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
    expect(text()).toContain('Using 4 weeks — one week is too short');
    expect(text()).toContain('2 of 28 days logged');
    expect(text()).toContain('Mood over time');
  });

  it('leaves mood out when "Show mood in reports" is off', async () => {
    showMood(false);
    api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      start_date: start, end_date: end, scheduled_tasks: [], note_sessions: [], habit_completions: [],
      completed_tasks: [{
        id: 1, title: 'Task', category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
        completed: true, completed_date: '2026-10-20T18:00:00Z', parent_task_id: null, tags: [],
      }],
    }));
    await render();
    expect(text()).toContain('1 task finished');
    expect(text()).not.toContain('Mood over time');
    expect(text()).not.toContain('days logged');
    expect(container.querySelector('.lg\\:grid-cols-6')).toBeNull();
    expect(container.querySelector('.lg\\:grid-cols-5')).not.toBeNull();
  });

  it('edits a logged day and logs a hollow one', async () => {
    await render();
    await click(buttonLabelled(/^Tuesday, October 20: Mood Good/));
    expect(text()).toContain('Edit check-in · Tue, Oct 20');
    await click(buttonLabelled(/^Cancel$/));

    await click(buttonLabelled(/^Monday, October 19: no check-in/));
    expect(text()).toContain('Daily check-in');
    expect(text()).toContain('Monday, October 19');
    // Future days have no dot to click.
    expect(buttonLabelled(/^Thursday, October 22/)).toBeUndefined();
  });

  it('opens a month from the year chart', async () => {
    await render();
    await click(buttonLabelled(/^Year$/));
    await click(buttonLabelled(/^October: average mood 3\.0/));
    expect(container.querySelector('#calendar-report-heading')?.textContent).toBe('October 2026');
  });
});
