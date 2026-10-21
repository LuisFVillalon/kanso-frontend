// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';

const api = vi.hoisted(() => ({ updateLinkedTasks: vi.fn() }));
vi.mock('@/app/lib/backend-api', () => ({
  ...api,
  describeError: (err: unknown, fallback: string) =>
    err instanceof Error && err.message.startsWith('400:') ? err.message.slice(4) : fallback,
}));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import { useTasks } from './useTasksAndTags';
import { LinkedTasksSaveError } from '@/app/utils/linkedTasks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

let hook: ReturnType<typeof useTasks>;
const Probe: React.FC<{ onResult: (r: typeof hook) => void }> = ({ onResult }) => {
  onResult(useTasks(false));
  return null;
};

let root: Root;
beforeEach(() => {
  api.updateLinkedTasks.mockReset();
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe onResult={r => { hook = r; }} />));
});
afterEach(() => act(() => root.unmount()));

describe('useTasks.saveLinkedTasks', () => {
  it('saves the list and merges it: moved, reordered, created and unlinked tasks', async () => {
    const parent = task(1, 'Apply');
    act(() => hook.setTasks([
      parent,
      task(2, 'Résumé', { parent_task_id: 1, position: 0 }),
      task(3, 'Dropped', { parent_task_id: 1, position: 1 }),
      task(4, 'Mock interview', { parent_task_id: 9, position: 0 }),
      task(9, 'Phone screen'),
    ]));
    api.updateLinkedTasks.mockResolvedValue({
      parent,
      children: [
        task(4, 'Mock interview', { parent_task_id: 1, position: 0 }),
        task(2, 'Résumé', { parent_task_id: 1, position: 1 }),
        task(10, 'Cover letter', { parent_task_id: 1, position: 2 }),
      ],
    });

    await act(() => hook.saveLinkedTasks(parent, [{ id: 4 }, { id: 2 }, { title: 'Cover letter' }]));

    expect(api.updateLinkedTasks).toHaveBeenCalledWith(1, [{ id: 4 }, { id: 2 }, { title: 'Cover letter' }]);
    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(byId.get(4)).toMatchObject({ parent_task_id: 1, position: 0 });
    expect(byId.get(2)).toMatchObject({ parent_task_id: 1, position: 1 });
    expect(byId.get(10)).toMatchObject({ title: 'Cover letter', parent_task_id: 1, position: 2 });
    expect(byId.get(3)).toMatchObject({ parent_task_id: null, position: null });
    expect(hook.tasks).toHaveLength(6);
  });

  it('throws a LinkedTasksSaveError with the server reason and leaves the tasks alone', async () => {
    const parent = task(1, 'Apply');
    const before = [parent, task(2, 'Résumé', { parent_task_id: 1, position: 0 })];
    act(() => hook.setTasks(before));
    api.updateLinkedTasks.mockRejectedValue(new Error('400:Task 7 is archived; restore it before linking it'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = await hook.saveLinkedTasks(parent, [{ id: 7 }]).catch(e => e);
    expect(err).toBeInstanceOf(LinkedTasksSaveError);
    expect(err).toMatchObject({ task: parent, message: 'Task 7 is archived; restore it before linking it' });
    expect(hook.tasks).toEqual(before);
  });
});
