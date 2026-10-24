// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasLinkedTaskSync } from '@/app/types/canvas';
import type { Task } from '@/app/types/task';

const syncCanvasLinkedTasks = vi.fn<(refresh?: boolean) => Promise<CanvasLinkedTaskSync[]>>();
vi.mock('@/app/lib/backend-api', () => ({ syncCanvasLinkedTasks: (refresh?: boolean) => syncCanvasLinkedTasks(refresh) }));

import { CANVAS_TASK_SYNC_GAP_MS, useCanvasTaskSync } from './useCanvasTaskSync';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: number, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-21', completed_date: null, ...extra,
});
const result = (task_id: number, extra: Partial<CanvasLinkedTaskSync> = {}): CanvasLinkedTaskSync => ({
  task_id, synced: true, submitted: false, due_at: null, due_changed: false, ...extra,
});

let hook: ReturnType<typeof useCanvasTaskSync>;
const refreshTasks = vi.fn<(ids: number[]) => Promise<void>>();
const Probe: React.FC<{ tasks: Task[]; enabled: boolean; onResult: (r: typeof hook) => void }> = ({ tasks, enabled, onResult }) => {
  onResult(useCanvasTaskSync({ enabled, tasks, refreshTasks }));
  return null;
};

let root: Root;
const linked = [task(1, { canvas_assignment_id: 11 }), task(2, { canvas_assignment_id: 22 }), task(3)];
const render = async (tasks: Task[], enabled = true) => {
  await act(async () => root.render(<Probe tasks={tasks} enabled={enabled} onResult={r => { hook = r; }} />));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 9, 0));
  root = createRoot(document.createElement('div'));
  syncCanvasLinkedTasks.mockResolvedValue([]);
  refreshTasks.mockResolvedValue();
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useCanvasTaskSync', () => {
  it('syncs once the tasks have loaded, and not at all without tasks from Canvas', async () => {
    await render(linked, false);
    expect(syncCanvasLinkedTasks).not.toHaveBeenCalled();
    await render(linked);
    expect(syncCanvasLinkedTasks).toHaveBeenCalledTimes(1);
    expect(syncCanvasLinkedTasks).toHaveBeenCalledWith(false);

    vi.setSystemTime(Date.now() + CANVAS_TASK_SYNC_GAP_MS);
    syncCanvasLinkedTasks.mockClear();
    await render([task(3)]);
    await act(() => hook.sync(true));
    expect(syncCanvasLinkedTasks).not.toHaveBeenCalled();
  });

  it('syncs at most once every 30 seconds', async () => {
    await render(linked);
    await act(() => hook.sync(true));
    expect(syncCanvasLinkedTasks).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + CANVAS_TASK_SYNC_GAP_MS - 1000);
    await act(() => hook.sync(true));
    expect(syncCanvasLinkedTasks).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1000);
    await act(() => hook.sync(true));
    expect(syncCanvasLinkedTasks).toHaveBeenCalledTimes(2);
    expect(syncCanvasLinkedTasks).toHaveBeenLastCalledWith(true);
  });

  it('offers to complete submitted tasks, and "Not yet" hides it until the next day', async () => {
    syncCanvasLinkedTasks.mockResolvedValue([result(1, { submitted: true }), result(2)]);
    await render(linked);
    expect(hook.showsSubmitted(linked[0])).toBe(true);
    expect(hook.showsSubmitted(linked[1])).toBe(false);
    expect(hook.showsSubmitted({ ...linked[0], completed: true })).toBe(false);

    act(() => hook.dismiss(1));
    expect(hook.showsSubmitted(linked[0])).toBe(false);
    expect(JSON.parse(localStorage.getItem('tm-canvas-not-yet')!)).toEqual({ 1: '2026-10-21' });

    // Still hidden after a reload (which syncs again) the same day; back the next morning.
    act(() => root.unmount());
    root = createRoot(document.createElement('div'));
    await render(linked);
    expect(syncCanvasLinkedTasks).toHaveBeenCalledTimes(2);
    expect(hook.showsSubmitted(linked[0])).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 22, 8, 0));
    await render(linked);
    expect(hook.showsSubmitted(linked[0])).toBe(true);
  });

  it("keeps a task's last answer when Canvas couldn't be read for it", async () => {
    syncCanvasLinkedTasks.mockResolvedValueOnce([result(1, { submitted: true })]);
    await render(linked);
    syncCanvasLinkedTasks.mockResolvedValueOnce([result(1, { synced: false })]);
    vi.setSystemTime(Date.now() + CANVAS_TASK_SYNC_GAP_MS);
    await act(() => hook.sync());
    expect(hook.showsSubmitted(linked[0])).toBe(true);
  });

  it('reloads the tasks whose due dates moved', async () => {
    syncCanvasLinkedTasks.mockResolvedValue([result(1, { due_changed: true }), result(2)]);
    await render(linked);
    expect(refreshTasks).toHaveBeenCalledWith([1]);
  });

  it('reloads the tasks the sync completed, with no banner for them', async () => {
    syncCanvasLinkedTasks.mockResolvedValue([
      result(1, { submitted: true, done: true, done_reason: 'submitted', completed: true }), result(2),
    ]);
    await render(linked);
    expect(refreshTasks).toHaveBeenCalledWith([1]);
    expect(hook.showsSubmitted(linked[0])).toBe(false);
  });

  it('offers to complete work done in Canvas when the sync leaves it open, in the words that fit', async () => {
    syncCanvasLinkedTasks.mockResolvedValue([
      result(1, { done: true, done_reason: 'marked_complete' }),
      result(2, { submitted: true, done: true, done_reason: 'graded' }),
    ]);
    await render(linked);
    expect(refreshTasks).not.toHaveBeenCalled();
    expect(hook.showsSubmitted(linked[0])).toBe(true);
    expect(hook.doneAs(linked[0])).toBe('done');
    expect(hook.showsSubmitted(linked[1])).toBe(true);
    expect(hook.doneAs(linked[1])).toBe('submitted');
  });

  it('changes nothing when the sync fails, e.g. before the backend has the route', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    syncCanvasLinkedTasks.mockRejectedValue(new Error('404 Not Found'));
    await render(linked);
    expect(hook.showsSubmitted(linked[0])).toBe(false);
    expect(refreshTasks).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
