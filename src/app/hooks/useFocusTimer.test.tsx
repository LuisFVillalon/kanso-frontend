// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkBlock } from '@/app/types/workBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  createWorkBlock: vi.fn(),
  deleteWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  fetchCalendarActivity: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import {
  CLAIM_SETTLE_MS, FOCUS_LOG_KEY, FOCUS_TIMER_KEY, readFocusState, resetFocusTimerForTests, useFocusTimer, type FocusTimer,
} from './useFocusTimer';

const START = new Date(2026, 10, 11, 14, 0, 0); // Wed Nov 11 2026, 2:00 PM
const MIN = 60_000;

const block = (extra: Partial<WorkBlock>): WorkBlock => ({
  id: 50, task_id: 7, habit_id: null, title: 'HW 7', tags: [], date: '2026-11-11', start_time: '13:30', end_time: '14:10',
  time_zone: 'UTC', starts_at: '', ends_at: '', ...extra,
});

let container: HTMLDivElement;
let root: Root;
let timer: FocusTimer;
let existingBlocks: WorkBlock[];

/** Keeps the hook's latest return value, refreshed after every render. */
const capture = (value: FocusTimer) => { timer = value; };

const Probe: React.FC = () => {
  capture(useFocusTimer());
  return null;
};

const mount = () => act(() => root.render(<Probe />));

/** Unmounts and forgets the in-memory timer, then mounts again: a page reload. */
const reload = () => {
  act(() => root.unmount());
  resetFocusTimerForTests();
  root = createRoot(container);
  mount();
};

/** Lets the clock run (ticks included) and the saves that follow settle. */
const advance = async (ms: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await Promise.resolve(); });
};

/** Lets a finished session's cross-tab claim settle, so its save goes through. */
const settle = () => advance(CLAIM_SETTLE_MS);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
  resetFocusTimerForTests();
  existingBlocks = [];
  let id = 100;
  api.createWorkBlock.mockReset().mockImplementation(async body => block({ id: ++id, ...body }));
  api.updateWorkBlock.mockReset().mockImplementation(async (blockId: number, body) => block({ id: blockId, ...body }));
  api.deleteWorkBlock.mockReset().mockResolvedValue(undefined);
  api.fetchCalendarActivity.mockReset().mockImplementation(async () => ({ work_blocks: existingBlocks, events: [] }));
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

describe('useFocusTimer', () => {
  it('starts at the remembered length and counts down from the clock', async () => {
    mount();
    expect(timer.phase).toBe('idle');
    expect(timer.remainingMs).toBe(25 * MIN);
    act(() => timer.setMinutes(50));
    act(() => timer.start(7));
    await advance(10 * MIN);
    expect(timer.phase).toBe('running');
    expect(timer.remainingMs).toBe(40 * MIN);
    expect(readFocusState().minutes).toBe(50);
  });

  it("can't change the length while a session is on", () => {
    mount();
    act(() => timer.start(null));
    act(() => timer.setMinutes(90));
    expect(timer.minutes).toBe(25);
  });

  it('keeps running, pausing and resuming across a reload', async () => {
    mount();
    act(() => timer.start(7));
    await advance(5 * MIN);
    reload();
    expect(timer.phase).toBe('running');
    expect(timer.remainingMs).toBe(20 * MIN);

    act(() => timer.pause());
    await advance(30 * MIN);
    reload();
    expect(timer.phase).toBe('paused');
    expect(timer.remainingMs).toBe(20 * MIN);

    act(() => timer.resume());
    await advance(2 * MIN);
    reload();
    expect(timer.remainingMs).toBe(18 * MIN);

    act(() => timer.stop());
    await advance(0);
    expect(timer.phase).toBe('idle');
    expect(timer.remainingMs).toBe(25 * MIN);
  });

  it('saves a session of 5 minutes or more on a task as one work block for its real span', async () => {
    mount();
    act(() => timer.start(7));
    await advance(25 * MIN);
    expect(timer.phase).toBe('done');
    expect(timer.remainingMs).toBe(0);
    await settle();
    expect(api.createWorkBlock).toHaveBeenCalledTimes(1);
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 7, date: '2026-11-11', start_time: '14:00', end_time: '14:25',
    }));
    expect(timer.saved?.minutes).toBe(25);
    expect(timer.sessions).toHaveLength(1);
  });

  it('extends an overlapping block for the same task today instead of adding a second one', async () => {
    existingBlocks = [block({ id: 50, task_id: 7, start_time: '13:30', end_time: '14:10' }), block({ id: 51, task_id: 8, start_time: '14:00', end_time: '15:00' })];
    mount();
    act(() => timer.start(7));
    await advance(25 * MIN);
    await settle();
    expect(api.createWorkBlock).not.toHaveBeenCalled();
    expect(api.updateWorkBlock).toHaveBeenCalledTimes(1);
    expect(api.updateWorkBlock).toHaveBeenCalledWith(50, { date: '2026-11-11', start_time: '13:30', end_time: '14:25' });

    act(() => timer.undo());
    await advance(0);
    expect(api.updateWorkBlock).toHaveBeenLastCalledWith(50, { date: '2026-11-11', start_time: '13:30', end_time: '14:10' });
  });

  it('Undo deletes a block the session made', async () => {
    mount();
    act(() => timer.start(7));
    await advance(8 * MIN);
    act(() => timer.stop());
    await settle();
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ start_time: '14:00', end_time: '14:08' }));
    act(() => timer.undo());
    await advance(0);
    expect(api.deleteWorkBlock).toHaveBeenCalledWith(101);
    expect(timer.saved).toBeNull();
  });

  it('only tallies sessions with no task and ones under 5 minutes', async () => {
    mount();
    act(() => timer.start(null));
    await advance(25 * MIN);
    await settle();
    act(() => timer.start(7));
    await advance(4 * MIN);
    act(() => timer.stop());
    await settle();
    expect(api.createWorkBlock).not.toHaveBeenCalled();
    expect(api.updateWorkBlock).not.toHaveBeenCalled();
    expect(timer.sessions.map(s => [s.taskId, s.ms])).toEqual([[null, 25 * MIN], [7, 4 * MIN]]);
    expect(JSON.parse(localStorage.getItem(FOCUS_LOG_KEY)!).date).toBe('2026-11-11');
  });

  it('saves a session that ran out while the tab was hidden exactly once, at the moment it ran out', async () => {
    mount();
    act(() => timer.start(7));
    act(() => root.unmount()); // the tab goes away mid-session
    resetFocusTimerForTests();
    vi.setSystemTime(new Date(START.getTime() + 70 * MIN));

    root = createRoot(container);
    mount();
    await advance(0);
    expect(timer.remainingMs).toBe(0);
    expect(timer.phase).toBe('done');
    // A second view in the same tab and another tick don't record it again.
    reload();
    await advance(5000);
    expect(api.createWorkBlock).toHaveBeenCalledTimes(1);
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ start_time: '14:00', end_time: '14:25' }));
    expect(JSON.parse(localStorage.getItem(FOCUS_TIMER_KEY)!).savedAt).not.toBeNull();
  });

  it('saves a session that ran out unattended once when two tabs load together', async () => {
    // A session ran out while no tab was open.
    localStorage.setItem(FOCUS_TIMER_KEY, JSON.stringify({
      taskId: 7, taskPicked: false, minutes: 25, startedAt: START.getTime(), resumedAt: START.getTime(),
      elapsedBeforePauseMs: 0, pausedAt: null, savedAt: null,
    }));
    vi.setSystemTime(new Date(START.getTime() + 70 * MIN));
    // Another tab sees a timer write only a moment later, as with real tabs.
    const realSet = Storage.prototype.setItem;
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === FOCUS_TIMER_KEY) queueMicrotask(() => realSet.call(this, k, v));
      else realSet.call(this, k, v);
    });
    // A Web Locks stand-in: one holder at a time, the rest wait their turn.
    let queue: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: (_name: string, cb: () => Promise<void>) => {
          const run = queue.then(cb);
          queue = run.catch(() => undefined);
          return run;
        },
      },
    });

    // Two tabs, each with its own copy of the module, open at the same moment.
    const tabs: { root: Root; el: HTMLDivElement; Probe: React.FC }[] = [];
    for (let i = 0; i < 2; i++) {
      vi.resetModules();
      const mod = await import('./useFocusTimer');
      const el = document.createElement('div');
      document.body.appendChild(el);
      tabs.push({ root: createRoot(el), el, Probe: () => { mod.useFocusTimer(); return null; } });
    }
    try {
      act(() => { tabs.forEach(({ root: r, Probe: P }) => r.render(<P />)); });
      await advance(5000);
      expect(api.createWorkBlock).toHaveBeenCalledTimes(1);
      expect(api.updateWorkBlock).not.toHaveBeenCalled();
    } finally {
      act(() => tabs.forEach(t => t.root.unmount()));
      tabs.forEach(t => t.el.remove());
      set.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('saves it once when two tabs load together even without Web Locks, by a claim token in storage', async () => {
    // A session ran out while no tab was open.
    localStorage.setItem(FOCUS_TIMER_KEY, JSON.stringify({
      taskId: 7, taskPicked: false, minutes: 25, startedAt: START.getTime(), resumedAt: START.getTime(),
      elapsedBeforePauseMs: 0, pausedAt: null, savedAt: null,
    }));
    vi.setSystemTime(new Date(START.getTime() + 70 * MIN));
    // Every write reaches the shared storage only a moment later, as between real tabs.
    const realSet = Storage.prototype.setItem;
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      queueMicrotask(() => realSet.call(this, k, v));
    });
    vi.stubGlobal('navigator', { ...navigator, locks: undefined });

    // Two tabs: separate copies of the module (separate in-memory stores), one localStorage.
    const tabs: { root: Root; el: HTMLDivElement; Probe: React.FC; read: () => FocusTimer | null }[] = [];
    for (let i = 0; i < 2; i++) {
      vi.resetModules();
      const mod = await import('./useFocusTimer');
      const el = document.createElement('div');
      document.body.appendChild(el);
      let last: FocusTimer | null = null;
      tabs.push({ root: createRoot(el), el, Probe: () => { last = mod.useFocusTimer(); return null; }, read: () => last });
    }
    try {
      act(() => { tabs.forEach(({ root: r, Probe: P }) => r.render(<P />)); });
      await advance(5000);
      expect(api.createWorkBlock).toHaveBeenCalledTimes(1);
      expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ task_id: 7, start_time: '14:00', end_time: '14:25' }));
      expect(api.updateWorkBlock).not.toHaveBeenCalled();
      // Both tabs read 00:00, and today's tally holds the session once.
      tabs.forEach(t => { expect(t.read()?.phase).toBe('done'); expect(t.read()?.remainingMs).toBe(0); });
      expect(JSON.parse(localStorage.getItem(FOCUS_LOG_KEY)!).sessions).toHaveLength(1);
    } finally {
      act(() => tabs.forEach(t => t.root.unmount()));
      tabs.forEach(t => t.el.remove());
      set.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('follows another tab through the storage event', () => {
    mount();
    const other = { taskId: 3, minutes: 90, startedAt: START.getTime(), resumedAt: START.getTime(), elapsedBeforePauseMs: 0, pausedAt: null, savedAt: null };
    localStorage.setItem(FOCUS_TIMER_KEY, JSON.stringify(other));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: FOCUS_TIMER_KEY })); });
    expect(timer.phase).toBe('running');
    expect(timer.taskId).toBe(3);
    expect(timer.minutes).toBe(90);
  });

  it('keeps an idle pick, No task included, in storage apart from the default', () => {
    mount();
    expect(timer.taskPicked).toBe(false);
    act(() => timer.setTaskId(null));
    reload();
    expect(timer.phase).toBe('idle');
    expect(timer.taskPicked).toBe(true);
    expect(timer.taskId).toBeNull();
    act(() => timer.setTaskId(4));
    act(() => timer.start(4));
    act(() => timer.stop());
    expect(timer.taskPicked).toBe(true);
    expect(timer.taskId).toBe(4);
  });

  it('still runs on the page when storage is unavailable', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      mount();
      act(() => timer.start(7));
      await advance(25 * MIN);
      expect(timer.phase).toBe('done');
      expect(api.createWorkBlock).toHaveBeenCalledTimes(1);
      expect(timer.sessions).toHaveLength(1);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
