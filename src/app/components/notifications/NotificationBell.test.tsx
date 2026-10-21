// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@/app/types/notification';

const ctx = vi.hoisted(() => ({
  notifications: [] as AppNotification[],
  markRead: vi.fn(),
  setPanelOpen: vi.fn(),
}));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => ({ dataUserId: 'user-1' }) }));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({ tasks: [{ id: 1, title: 'Essay' }, { id: 2, title: 'Lab report' }] }),
}));
vi.mock('@/app/context/NotificationsContextValue', () => ({
  useNotifications: () => ({
    notifications: ctx.notifications,
    unreadCount: ctx.notifications.filter(n => !n.read).length,
    status: 'ready',
    refresh: vi.fn(async () => {}),
    markRead: ctx.markRead,
    markAllRead: vi.fn(),
    dismiss: vi.fn(),
    panelOpen: true,
    setPanelOpen: ctx.setPanelOpen,
  }),
}));

import NotificationBell from './NotificationBell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const notification = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
  id, type: 'task_reminder', title: `Title ${id}`, body: '', fire_at: '2026-10-21T00:00:00Z',
  task_ids: [], habit_ids: [], read: false, ...overrides,
});

const onOpenTask = vi.fn();
const onOpenHabits = vi.fn();
const onOpenMoodCheckin = vi.fn();

const render = (list: AppNotification[]) => {
  ctx.notifications = list;
  act(() => root.render(<NotificationBell onOpenTask={onOpenTask} onOpenHabits={onOpenHabits} onOpenMoodCheckin={onOpenMoodCheckin} />));
};

const item = (title: string) =>
  [...container.querySelectorAll('li button')].find(b => b.querySelector('.truncate')?.textContent === title) as HTMLButtonElement;
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('NotificationBell', () => {
  it("opens the reminder's day's mood check-in and marks it read", () => {
    render([notification('m', { type: 'mood_reminder', title: 'How was today?', dates: ['2026-10-20'] })]);
    act(() => item('How was today?').click());
    expect(onOpenMoodCheckin).toHaveBeenCalledWith('2026-10-20');
    expect(ctx.markRead).toHaveBeenCalledWith(['m']);
    expect(ctx.setPanelOpen).toHaveBeenCalledWith(false);
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it('opens the most recent missed day from the item, and any other from its chips', () => {
    render([notification('x', { type: 'mood_missed', title: 'A few days unlogged', dates: ['2026-10-17', '2026-10-19', '2026-10-18'] })]);
    act(() => item('A few days unlogged').click());
    expect(onOpenMoodCheckin).toHaveBeenLastCalledWith('2026-10-19');

    expect(byLabel('Log mood for Monday, October 19')).toBeTruthy();
    act(() => byLabel('Log mood for Saturday, October 17').click());
    expect(onOpenMoodCheckin).toHaveBeenLastCalledWith('2026-10-17');
    expect(ctx.markRead).toHaveBeenCalledWith(['x']);
  });

  it('shows no day chips for a single missed day', () => {
    render([notification('x', { type: 'mood_missed', title: 'Yesterday unlogged', dates: ['2026-10-19'] })]);
    expect(container.querySelector('button[aria-label^="Log mood for"]')).toBeNull();
    act(() => item('Yesterday unlogged').click());
    expect(onOpenMoodCheckin).toHaveBeenCalledWith('2026-10-19');
  });

  it('only marks a missed-days notice read when it names no days', () => {
    render([notification('x', { type: 'mood_missed', title: 'Unlogged' })]);
    act(() => item('Unlogged').click());
    expect(onOpenMoodCheckin).not.toHaveBeenCalled();
    expect(ctx.markRead).toHaveBeenCalledWith(['x']);
  });

  it('still routes task and habit notifications as before', () => {
    render([
      notification('t', { title: 'Essay due soon', task_ids: [1] }),
      notification('h', { type: 'habit_reminder', title: 'Habits left', habit_ids: [4] }),
    ]);
    act(() => item('Essay due soon').click());
    expect(onOpenTask).toHaveBeenCalledWith(1);
    act(() => item('Habits left').click());
    expect(onOpenHabits).toHaveBeenCalledWith([4]);
    expect(onOpenMoodCheckin).not.toHaveBeenCalled();
  });
});
