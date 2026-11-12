// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: '/notes' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
}));
const api = vi.hoisted(() => ({
  createWorkBlock: vi.fn(),
  deleteWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  fetchCalendarActivity: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import FocusHeaderBar from './FocusHeaderBar';
import { FOCUS_LOG_KEY, readFocusState, resetFocusTimerForTests, type FocusTimerState } from '@/app/hooks/useFocusTimer';
import { takeFocusWidgetRequest } from '@/app/utils/focusWidgetRequest';
import { setHomeMode } from '@/app/utils/homeMode';

const START = new Date(2026, 10, 11, 14, 0, 0);
const MIN = 60_000;
const tasks = [{ id: 7, title: 'HW 7' }] as Task[];

let container: HTMLDivElement;
let root: Root;

const store = (state: Partial<FocusTimerState>) => localStorage.setItem('tm-focus-timer', JSON.stringify({
  taskId: null, taskPicked: true, minutes: 25, startedAt: null, resumedAt: null, elapsedBeforePauseMs: 0, pausedAt: null, savedAt: null, ...state,
}));
const mount = () => act(() => root.render(<FocusHeaderBar tasks={tasks} />));
const bar = () => container.querySelector('[aria-label="Focus session"]');
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!;
const advance = async (ms: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
  resetFocusTimerForTests();
  nav.push.mockReset();
  nav.pathname = '/notes';
  takeFocusWidgetRequest();
  setHomeMode('normal');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetFocusTimerForTests();
  vi.useRealTimers();
});

describe('FocusHeaderBar', () => {
  it('is hidden with no session, or once one has finished', () => {
    mount();
    expect(bar()).toBeNull();
    act(() => root.unmount());
    resetFocusTimerForTests();
    store({ startedAt: START.getTime() - 25 * MIN, savedAt: START.getTime(), elapsedBeforePauseMs: 25 * MIN });
    root = createRoot(container);
    mount();
    expect(bar()).toBeNull();
  });

  it('shows the time left and the task, and keeps counting', async () => {
    store({ taskId: 7, startedAt: START.getTime() - 5 * MIN, resumedAt: START.getTime() - 5 * MIN });
    mount();
    expect(bar()?.textContent).toContain('20:00');
    expect(bar()?.textContent).toContain('HW 7');
    await advance(61_000);
    expect(bar()?.textContent).toContain('18:59');
  });

  it('pauses, resumes and stops the shared timer', async () => {
    store({ startedAt: START.getTime(), resumedAt: START.getTime() });
    mount();
    act(() => button('Pause').click());
    expect(readFocusState().pausedAt).not.toBeNull();
    expect(bar()?.textContent).toContain('Paused');
    act(() => button('Resume').click());
    expect(readFocusState().resumedAt).not.toBeNull();
    act(() => button('Stop').click());
    expect(readFocusState().startedAt).toBeNull();
    expect(bar()).toBeNull();
  });

  it('opens the Focus tile, going Home first from another page', () => {
    store({ startedAt: START.getTime(), resumedAt: START.getTime() });
    mount();
    act(() => button('Focus:').click());
    expect(nav.push).toHaveBeenCalledWith('/');
    expect(takeFocusWidgetRequest()).toBe(true);

    nav.pathname = '/';
    mount();
    act(() => button('Focus:').click());
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(takeFocusWidgetRequest()).toBe(true);
  });

  it.each(['focus', 'doodle'] as const)('shows the time as a plain label while Home is in %s mode', mode => {
    store({ taskId: 7, startedAt: START.getTime(), resumedAt: START.getTime() });
    mount();
    expect(button('Focus:')).not.toBeNull();

    act(() => setHomeMode(mode));
    expect(container.querySelector('button[aria-label^="Focus:"]')).toBeNull();
    expect(container.querySelector('[title="Open the Focus timer"]')).toBeNull();
    expect(bar()?.textContent).toContain('25:00');
    expect(bar()?.textContent).toContain('HW 7');
    expect(button('Pause')).not.toBeNull();
    expect(button('Stop')).not.toBeNull();

    act(() => setHomeMode('normal'));
    act(() => button('Focus:').click());
    expect(nav.push).toHaveBeenCalledWith('/');
  });

  it('records a session that runs out away from Home', async () => {
    store({ startedAt: START.getTime() - 24 * MIN, resumedAt: START.getTime() - 24 * MIN });
    mount();
    await advance(MIN + 1_000);
    expect(bar()).toBeNull();
    expect(readFocusState().savedAt).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(FOCUS_LOG_KEY)!).sessions).toHaveLength(1);
  });
});
