// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@/app/types/notification';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly detail: string) {
      super(detail);
    }
  }
  return {
    ApiError,
    fetchNotifications: vi.fn(),
    markNotificationsRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    dismissNotifications: vi.fn(),
    fetchNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
    push: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/' }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => ({ dataUserId: 'user-1' }) }));
vi.mock('@/app/lib/backend-api', () => ({
  ApiError: mocks.ApiError,
  describeError: (_err: unknown, fallback: string) => fallback,
  fetchNotifications: mocks.fetchNotifications,
  markNotificationsRead: mocks.markNotificationsRead,
  markAllNotificationsRead: mocks.markAllNotificationsRead,
  dismissNotifications: mocks.dismissNotifications,
  fetchNotificationPreferences: mocks.fetchNotificationPreferences,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
}));

import { ToastProvider } from './ToastContext';
import { NotificationsProvider, POLL_INTERVAL_MS } from './NotificationsContext';
import { useNotifications } from './NotificationsContextValue';

type Ctx = ReturnType<typeof useNotifications>;

let container: HTMLDivElement;
let root: Root;
let ctx: Ctx;

function Grab() {
  const value = useNotifications();
  useEffect(() => { ctx = value; });
  return null;
}

const notification = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
  id, type: 'task_reminder', title: `Title ${id}`, body: '', fire_at: '2026-10-20T16:00:00Z',
  task_ids: [], habit_ids: [], read: false, ...overrides,
});

/** The toast messages on screen. */
const toasts = () => [...document.querySelectorAll('[aria-live] p')].map(p => p.textContent);

// Async act() waits on real timers, so settle promises by stepping the fake clock.
const settle = async (ms = 0) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

const mount = async () => {
  act(() => root.render(<ToastProvider><NotificationsProvider><Grab /></NotificationsProvider></ToastProvider>));
  await settle();
};

const poll = () => settle(POLL_INTERVAL_MS);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  mocks.fetchNotificationPreferences.mockResolvedValue({
    types: { task_reminder: true }, quiet_hours_start: null, quiet_hours_end: null, default_reminder_minutes: 120,
  });
  mocks.markNotificationsRead.mockResolvedValue(undefined);
  mocks.dismissNotifications.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('NotificationsProvider polling and toasts', () => {
  it('summarises several unread notifications on first load in one toast', async () => {
    mocks.fetchNotifications.mockResolvedValue([notification('a'), notification('b'), notification('c', { read: true })]);
    await mount();
    expect(ctx.status).toBe('ready');
    expect(ctx.unreadCount).toBe(2);
    expect(toasts()).toEqual(['You have 2 new notifications.']);
  });

  it('toasts only notifications new since the last poll', async () => {
    mocks.fetchNotifications.mockResolvedValue([notification('a')]);
    await mount();
    expect(toasts()).toEqual(['Title a']);

    // Polls land on the minute, long after that toast timed out.
    await poll();
    expect(toasts()).toEqual([]);

    mocks.fetchNotifications.mockResolvedValue([notification('b', { title: 'Essay is due in 2 hours' }), notification('a')]);
    await poll();
    expect(toasts()).toEqual(['Essay is due in 2 hours']);
    expect(mocks.fetchNotifications).toHaveBeenCalledTimes(3);
  });

  it('shows no toast when everything is already read', async () => {
    mocks.fetchNotifications.mockResolvedValue([notification('a', { read: true })]);
    await mount();
    expect(toasts()).toEqual([]);
    expect(ctx.unreadCount).toBe(0);
  });

  it('keeps a notification read when a poll lands before the mark-read request', async () => {
    mocks.fetchNotifications.mockResolvedValue([notification('a')]);
    mocks.markNotificationsRead.mockReturnValue(new Promise(() => {}));
    await mount();
    act(() => ctx.markRead(['a']));
    expect(ctx.unreadCount).toBe(0);
    await poll();
    expect(ctx.notifications[0].read).toBe(true);
    expect(mocks.markNotificationsRead).toHaveBeenCalledWith(['a']);
  });

  it('removes a dismissed notification and keeps it out of later polls', async () => {
    mocks.fetchNotifications.mockResolvedValue([notification('a'), notification('b')]);
    mocks.dismissNotifications.mockReturnValue(new Promise(() => {}));
    await mount();
    act(() => ctx.dismiss(['a']));
    expect(ctx.notifications.map(n => n.id)).toEqual(['b']);
    await poll();
    expect(ctx.notifications.map(n => n.id)).toEqual(['b']);
  });

  it('puts a notification back when dismissing it fails', async () => {
    mocks.fetchNotifications.mockResolvedValue([notification('a')]);
    mocks.dismissNotifications.mockRejectedValue(new Error('offline'));
    await mount();
    act(() => ctx.dismiss(['a']));
    await settle();
    expect(ctx.notifications.map(n => n.id)).toEqual(['a']);
    expect(toasts()).toContain("Couldn't dismiss the notification. Please try again.");
  });

  it('goes unavailable and stops polling when the API refuses', async () => {
    mocks.fetchNotifications.mockRejectedValue(new mocks.ApiError(404, 'Not Found'));
    await mount();
    expect(ctx.status).toBe('unavailable');
    await poll();
    await poll();
    expect(mocks.fetchNotifications).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([]);
  });

  it('keeps polling through a transient error', async () => {
    mocks.fetchNotifications.mockRejectedValueOnce(new mocks.ApiError(500, 'boom'));
    mocks.fetchNotifications.mockResolvedValue([notification('a')]);
    await mount();
    expect(ctx.status).toBe('error');
    await poll();
    expect(ctx.status).toBe('ready');
    expect(toasts()).toEqual(['Title a']);
  });

  it('loads preferences once notifications prove available', async () => {
    mocks.fetchNotifications.mockResolvedValue([]);
    await mount();
    expect(ctx.preferences?.default_reminder_minutes).toBe(120);
    await poll();
    expect(mocks.fetchNotificationPreferences).toHaveBeenCalledTimes(1);
  });
});
