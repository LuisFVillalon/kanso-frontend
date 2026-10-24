// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import { NotificationsContext, type NotificationsContextValue } from '@/app/context/NotificationsContextValue';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { DailyDebriefReport } from '@/app/types/debrief';
import type { Task } from '@/app/types/task';
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

/** The notification settings as far as daily mood reads them; null renders outside the provider. */
const notificationsWith = (
  preferences: { types: Record<string, boolean> } | null,
  status: NotificationsContextValue['status'] = 'ready',
) => ({ status, preferences, preferencesError: false }) as unknown as NotificationsContextValue;

const render = async (
  props: Partial<React.ComponentProps<typeof TaskDebriefPanel>> = {},
  notifications: NotificationsContextValue | null = null,
) => {
  const panel = (
    <TaskDebriefPanel
      profile={profile}
      profileLoaded
      onSaveProfile={vi.fn(async () => ({ ok: true }))}
      tasks={[]}
      habits={[]}
      completionSyncToken={0}
      {...props}
    />
  );
  await act(async () => {
    root.render(
      <ToastProvider>
        {notifications ? <NotificationsContext.Provider value={notifications}>{panel}</NotificationsContext.Provider> : panel}
      </ToastProvider>,
    );
  });
};

const text = () => document.body.textContent ?? '';
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const dialogTitle = () => document.getElementById('mood-checkin-title')?.textContent;

const cardWithHeading = (heading: string) =>
  [...document.body.querySelectorAll('span')].find(el => el.textContent === heading)?.closest('.rounded-md');
const activityLogCard = () => cardWithHeading("Today's Activity Log");
const focusNextCard = () => cardWithHeading('Focus Next');

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

  it("sits in Today's Activity Log's header while the brief is open", async () => {
    await render();
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(false);
  });

  it("sits in Today's Activity Log's header on a work day, beside Overcommitted", async () => {
    api.fetchTaskDebrief.mockResolvedValue({
      ...debrief,
      completed_today_tasks: [{ id: 1, title: 'Draft', priority: null, due_date: null, due_time: null, category: null, estimated_time: 2, tags: [] }],
      workload: { is_rest_day: false, available_minutes: 60, committed_minutes: 120, utilization_pct: 200, is_overcommitted: true },
    });
    await render();
    const card = activityLogCard()!;
    expect(card.textContent).toContain('Overcommitted');
    expect(card.contains(button('Log today’s mood'))).toBe(true);
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(false);
  });

  it("still shows Today's Activity Log on a rest day, with a gentle reminder and no capacity", async () => {
    api.fetchTaskDebrief.mockResolvedValue({
      ...debrief,
      completed_today_tasks: [{ id: 1, title: 'Draft', priority: null, due_date: null, due_time: null, category: null, estimated_time: 2, tags: [{ id: 1, name: 'Writing', color: null }] }],
      workload: { is_rest_day: true, available_minutes: 60, committed_minutes: 0, utilization_pct: null, is_overcommitted: false },
    });
    await render();
    const card = activityLogCard()!.textContent ?? '';
    expect(card).toContain('Today is a rest day. Take it easy; anything you do still shows here.');
    expect(card).toContain('Writing');
    expect(card).not.toContain('capacity');
    expect(card).not.toContain('Overcommitted');
    expect(text()).not.toContain('no workload scheduled');
  });

  it('shows no rest-day reminder on a work day', async () => {
    api.fetchTaskDebrief.mockResolvedValue({
      ...debrief,
      workload: { is_rest_day: false, available_minutes: 480, committed_minutes: 0, utilization_pct: 0, is_overcommitted: false },
    });
    await render();
    expect(activityLogCard()?.textContent).not.toContain('rest day');
  });

  it('is hidden while the brief is collapsed, and shows once it opens', async () => {
    await render({ profile: { ...profile, dailyBriefCollapsed: true } });
    expect(button('Log today’s mood')).toBeUndefined();
    expect(text()).not.toContain('mood');
    await click(document.querySelector('h2')!.closest('button')!);
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
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
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
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
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('is hidden while the mood check-in reminder is off, and until it and the profile load', async () => {
    await render({}, notificationsWith({ types: { mood_reminder: false } }));
    expect(button('Log today’s mood')).toBeUndefined();
    await render({}, notificationsWith(null, 'loading'));
    expect(button('Log today’s mood')).toBeUndefined();
    await render({ profileLoaded: false });
    expect(button('Log today’s mood')).toBeUndefined();
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
    await render({}, notificationsWith({ types: { mood_reminder: true } }));
    expect(button('Log today’s mood')).toBeDefined();
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

describe('TaskDebriefPanel Slipped actions', () => {
  const slippedTask = {
    id: 5, title: 'File taxes', description: null, due_date: '2026-10-22', due_time: '17:00:00',
    priority: null, category: null, completed: false, completed_date: null, tags: [],
    created_date: '2026-10-01T00:00:00', estimated_time: null, parent_task_id: null, position: null,
  } as unknown as Task;
  const slippedDebrief: DailyDebriefReport = {
    ...debrief,
    overdue_tasks: [{
      id: 5, title: 'File taxes', category: null, priority: null,
      due_date: '2026-10-22', due_time: '17:00:00', estimated_time: null, tags: [],
    }],
  };
  const actions = () => ({
    onArchiveTask: vi.fn(async () => true),
    onDeleteTask: vi.fn(async () => true),
    onUpdateTask: vi.fn(async () => true),
  });
  const input = (label: string) => document.body.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

  beforeEach(() => { api.fetchTaskDebrief.mockResolvedValue(slippedDebrief); });

  it('archives a slipped task and drops it from the list at once', async () => {
    const a = actions();
    await render({ tasks: [slippedTask], ...a });
    await click(button('Archive “File taxes”'));
    expect(a.onArchiveTask).toHaveBeenCalledWith(slippedTask, undefined);
    expect(text()).toContain('Nothing slipped.');
  });

  it('deletes a slipped task, and puts it back if the delete fails', async () => {
    const a = { ...actions(), onDeleteTask: vi.fn(async () => false) };
    await render({ tasks: [slippedTask], ...a });
    await click(button('Delete “File taxes”'));
    expect(a.onDeleteTask).toHaveBeenCalledWith(slippedTask, undefined);
    expect(text()).toContain('File taxes');
  });

  it('asks about linked tasks before deleting a task that has them', async () => {
    const a = actions();
    const child = { ...slippedTask, id: 6, title: 'Find W-2', parent_task_id: 5, due_date: null, due_time: null } as Task;
    await render({ tasks: [slippedTask, child], ...a });
    await click(button('Delete “File taxes”'));
    expect(a.onDeleteTask).not.toHaveBeenCalled();
    expect(text()).toContain('Find W-2');
  });

  it('reschedules with a quick pick and leaves Slipped', async () => {
    const a = actions();
    await render({ tasks: [slippedTask], ...a });
    await click(button('Change due date and time for “File taxes”'));
    await click(button('Tomorrow'));
    expect(a.onUpdateTask).toHaveBeenCalledWith(5, expect.objectContaining({ due_date: '2026-10-25', due_time: '09:00' }));
    expect(api.fetchTaskDebrief).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Nothing slipped.');
  });

  it('reschedules to a custom date and time', async () => {
    const a = actions();
    await render({ tasks: [slippedTask], ...a });
    await click(button('Change due date and time for “File taxes”'));
    expect(input('New due date').value).toBe('2026-10-22');
    expect(input('New due time').value).toBe('17:00');
    await act(async () => {
      for (const [label, value] of [['New due date', '2026-10-30'], ['New due time', '08:15']]) {
        const el = input(label);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await click(button('Save'));
    expect(a.onUpdateTask).toHaveBeenCalledWith(5, expect.objectContaining({ due_date: '2026-10-30', due_time: '08:15' }));
  });

  it('shows no actions without the handlers', async () => {
    await render({ tasks: [slippedTask] });
    expect(button('Archive “File taxes”')).toBeUndefined();
  });
});
