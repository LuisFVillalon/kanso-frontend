// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { DailyDebriefReport } from '@/app/types/debrief';
import { DEFAULT_MOOD_SETTINGS, type MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  fetchTaskDebrief: vi.fn(),
  fetchMoodCheckins: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import TaskDebriefPanel from './TaskDebriefPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (mood: number, date = '2026-10-24'): MoodCheckin => ({
  id: 7, period_kind: 'day', period_start: date, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: '2026-10-24T15:00:00Z', updated_at: '2026-10-24T15:00:00Z',
});

const debrief: DailyDebriefReport = {
  report_date: '2026-10-24',
  overdue_tasks: [],
  due_today_tasks: [],
  completed_today_tasks: [],
  notes_worked_today: [],
  habit_status: [],
  workload: { is_rest_day: true, available_minutes: null, committed_minutes: 0, utilization_pct: null, is_overcommitted: false },
  focus_next: [],
};

const profile = {
  dayStartTime: '08:00',
  shutoffTime: '18:00',
  restDays: [0, 6],
  dailyBriefCollapsed: null,
  moodCheckins: DEFAULT_MOOD_SETTINGS,
} as unknown as ProfileFields;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // A Saturday (a rest day) morning, long before "Call it a day".
  vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
  localStorage.clear();
  api.fetchTaskDebrief.mockResolvedValue(debrief);
  api.fetchMoodCheckins.mockResolvedValue([]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
  api.saveMoodCheckin.mockImplementation(async (body: { mood: number; period_start: string }) => checkin(body.mood, body.period_start));
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

const render = async (props: Partial<React.ComponentProps<typeof TaskDebriefPanel>> = {}) => {
  await act(async () => {
    root.render(
      <ToastProvider>
        <TaskDebriefPanel
          profile={profile}
          profileLoaded
          onSaveProfile={vi.fn(async () => ({ ok: true }))}
          tasks={[]}
          habits={[]}
          completionSyncToken={0}
          {...props}
        />
      </ToastProvider>,
    );
  });
};

const text = () => document.body.textContent ?? '';
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const dialogTitle = () => document.getElementById('mood-checkin-title')?.textContent;

/** The Focus Next card: the grid cell holding the "Focus Next" heading. */
const focusNextCard = () =>
  [...document.body.querySelectorAll('span')].find(el => el.textContent === 'Focus Next')?.closest('.rounded-md');

describe('TaskDebriefPanel mood chip', () => {
  it("offers to log today's mood at any time, even on a rest day", async () => {
    await render();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-24', '2026-10-24', ['day']);
    await click(button('Log today’s mood'));
    expect(dialogTitle()).toBe('Daily check-in');
  });

  it('logs the day and then offers Edit in its place', async () => {
    await render();
    await click(button('Log today’s mood'));
    await click(button('Good'));
    await click(button('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'day', period_start: '2026-10-24', mood: 4 }));
    expect(dialogTitle()).toBeUndefined();
    expect(text()).toContain('Today’s mood: Good');
    expect(button('Log today’s mood')).toBeUndefined();
    expect(button('Edit today’s mood')).toBeDefined();
  });

  it('opens the saved check-in prefilled to edit it', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(2)]);
    await render();
    expect(text()).toContain('Today’s mood: Low');
    await click(button('Edit today’s mood'));
    expect(dialogTitle()).toBe('Edit check-in · Sat, Oct 24');
    expect(document.querySelector('[role="radio"][aria-label="Low"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('sits beside Focus Next while the brief is open', async () => {
    await render();
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('is hidden while the brief is collapsed, and shows once it opens', async () => {
    await render({ profile: { ...profile, dailyBriefCollapsed: true } });
    expect(button('Log today’s mood')).toBeUndefined();
    expect(text()).not.toContain('mood');
    await click(document.querySelector('h2')!.closest('button')!);
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('is not shown when the brief fails to load', async () => {
    api.fetchTaskDebrief.mockRejectedValue(new Error('Brief unavailable'));
    await render();
    expect(text()).toContain('Brief unavailable');
    expect(button('Log today’s mood')).toBeUndefined();
  });

  it('keeps an open check-in form while the brief refreshes', async () => {
    await render();
    await click(button('Log today’s mood'));
    await click(button('Good'));
    api.fetchTaskDebrief.mockReturnValue(new Promise(() => {}));
    await render({ completionSyncToken: 1 });
    expect(api.fetchTaskDebrief).toHaveBeenCalledTimes(2);
    expect(dialogTitle()).toBe('Daily check-in');
    expect(document.querySelector('[role="radio"][aria-label="Good"]')?.getAttribute('aria-checked')).toBe('true');
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('keeps the last brief and an open check-in form when a refresh fails', async () => {
    await render();
    await click(button('Log today’s mood'));
    await click(button('Good'));
    api.fetchTaskDebrief.mockRejectedValue(new Error('Brief unavailable'));
    await render({ completionSyncToken: 1 });
    expect(text()).toContain('Brief unavailable');
    expect(dialogTitle()).toBe('Daily check-in');
    expect(document.querySelector('[role="radio"][aria-label="Good"]')?.getAttribute('aria-checked')).toBe('true');
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('is hidden while daily check-ins are off, and until the profile loads', async () => {
    await render({ profile: { ...profile, moodCheckins: { ...DEFAULT_MOOD_SETTINGS, daily: false } } });
    expect(button('Log today’s mood')).toBeUndefined();
    await render({ profileLoaded: false });
    expect(button('Log today’s mood')).toBeUndefined();
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });

  it('shows nothing it could act on when the check-in fails to load', async () => {
    api.fetchMoodCheckins.mockRejectedValue(new Error('offline'));
    await render();
    expect(button('Log today’s mood')).toBeUndefined();
    expect(button('Edit today’s mood')).toBeUndefined();
  });

  it('keeps mood out of the AI brief request', async () => {
    await render();
    expect(api.fetchTaskDebrief).toHaveBeenCalledWith();
  });
});
