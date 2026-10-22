// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';

const api = vi.hoisted(() => ({
  updateLinkedTasks: vi.fn(),
  onDelete: vi.fn(),
  archiveTask: vi.fn(),
  completeTaskWithLinked: vi.fn(),
  restoreTask: vi.fn(),
  createTask: vi.fn(),
}));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/backend-api', () => ({
  ...api,
  describeError: (err: unknown, fallback: string) =>
    err instanceof Error && err.message.startsWith('400:') ? err.message.slice(4) : fallback,
}));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));

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
  [...Object.values(api), showToast].forEach(fn => fn.mockReset());
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

describe('useTasks.addTask', () => {
  it('sends the Canvas link and due_at of a task added from Canvas', async () => {
    const dueAt = '2026-10-24T06:59:00Z';
    api.createTask.mockResolvedValue(task(50, 'Problem Set 6', { canvas_assignment_id: 9876, canvas_due_at: dueAt }));

    await act(() => hook.addTask({
      id: 0, title: 'Problem Set 6', description: '', priority: null, due_date: '2026-10-23', due_time: '23:59',
      tags: [], created_date: new Date(), canvas_assignment_id: 9876,
      canvas_html_url: 'https://sdsu.instructure.com/courses/1001/assignments/9876', canvas_due_at: dueAt,
    }));

    expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({
      canvas_assignment_id: 9876,
      canvas_html_url: 'https://sdsu.instructure.com/courses/1001/assignments/9876',
      canvas_due_at: dueAt,
    }));
    expect(hook.tasks[0]).toMatchObject({ id: 50, canvas_due_at: dueAt });
  });
});

describe('useTasks linked task lifecycle', () => {
  const family = () => [
    task(1, 'Apply'),
    task(2, 'Résumé', { parent_task_id: 1, position: 0, completed: true, completed_date: '2026-10-02T10:00:00' }),
    task(3, 'Mock interview', { parent_task_id: 1, position: 1, priority: 2 }),
    task(5, 'Unrelated'),
  ];

  it('completes all with one call and merges the parent and its open linked tasks', async () => {
    act(() => hook.setTasks(family()));
    api.completeTaskWithLinked.mockResolvedValue(task(1, 'Apply', { completed: true, completed_date: '2026-10-21T09:00:00' }));

    await act(() => hook.completeWithLinked(1));

    expect(api.completeTaskWithLinked).toHaveBeenCalledTimes(1);
    expect(api.completeTaskWithLinked).toHaveBeenCalledWith(1);
    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(byId.get(1)).toMatchObject({ completed: true, completed_date: '2026-10-21T09:00:00' });
    expect(byId.get(3)).toMatchObject({ completed: true, completed_date: '2026-10-21T09:00:00', priority: null });
    expect(byId.get(2)).toMatchObject({ completed: true, completed_date: '2026-10-02T10:00:00' });
    expect(byId.get(5)).toMatchObject({ completed: false });
  });

  it('rolls "Complete all" back when the request fails', async () => {
    const before = family();
    act(() => hook.setTasks(before));
    api.completeTaskWithLinked.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => hook.completeWithLinked(1));
    expect(hook.tasks).toEqual(before);
  });

  it('deletes with keep: only the parent leaves and its linked tasks stay, unlinked', async () => {
    act(() => hook.setTasks(family()));
    api.onDelete.mockResolvedValue(undefined);

    await act(() => hook.deleteTask(family()[0], 'keep'));

    expect(api.onDelete).toHaveBeenCalledWith(1, 'keep');
    expect(hook.tasks.map(t => t.id)).toEqual([2, 3, 5]);
    expect(hook.tasks.filter(t => t.id !== 5).every(t => t.parent_task_id === null && t.position === null)).toBe(true);
  });

  it('undoes a keep delete: restores the parent and re-links its linked tasks in their original order', async () => {
    const tasks = [task(1, 'Apply'), task(3, 'Mock interview', { parent_task_id: 1, position: 1 }),
      task(2, 'Résumé', { parent_task_id: 1, position: 0 }), task(5, 'Unrelated')];
    act(() => hook.setTasks(tasks));
    api.onDelete.mockResolvedValue(undefined);
    api.restoreTask.mockResolvedValue(tasks[0]);
    api.updateLinkedTasks.mockResolvedValue({
      parent: tasks[0],
      children: [
        task(2, 'Résumé', { parent_task_id: 1, position: 0 }),
        task(3, 'Mock interview', { parent_task_id: 1, position: 1 }),
      ],
    });

    await act(() => hook.deleteTask(tasks[0], 'keep'));
    const undo = showToast.mock.calls.find(([, , action]) => action?.label === 'Undo')![2];
    await act(() => undo.onClick());

    expect(api.restoreTask).toHaveBeenCalledWith(1);
    expect(api.updateLinkedTasks).toHaveBeenCalledWith(1, [{ id: 2 }, { id: 3 }]);
    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(hook.tasks).toHaveLength(4);
    expect(byId.get(1)).toBeDefined();
    expect(byId.get(2)).toMatchObject({ parent_task_id: 1, position: 0 });
    expect(byId.get(3)).toMatchObject({ parent_task_id: 1, position: 1 });
  });

  it('archives with cascade: the parent and its linked tasks leave together', async () => {
    act(() => hook.setTasks(family()));
    api.archiveTask.mockResolvedValue(family()[0]);

    await act(() => hook.archiveTask(family()[0], 'cascade'));

    expect(api.archiveTask).toHaveBeenCalledWith(1, 'cascade');
    expect(hook.tasks.map(t => t.id)).toEqual([5]);
  });

  it('puts the parent back and re-links its tasks when a keep archive fails', async () => {
    act(() => hook.setTasks(family()));
    api.archiveTask.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => hook.archiveTask(family()[0], 'keep'));

    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(hook.tasks).toHaveLength(4);
    expect(byId.get(1)).toBeDefined();
    expect(byId.get(3)).toMatchObject({ parent_task_id: 1, position: 1 });
  });
});

describe('useTasks with linked tasks nested deeper', () => {
  // Apply (1) → Mock interview (3) → Practice (4) → Notes (6); Mock interview → Room (7).
  const tree = () => [
    task(1, 'Apply'),
    task(3, 'Mock interview', { parent_task_id: 1, position: 0 }),
    task(4, 'Practice', { parent_task_id: 3, position: 0 }),
    task(6, 'Notes', { parent_task_id: 4, position: 0 }),
    task(7, 'Room', { parent_task_id: 3, position: 1, completed: true }),
    task(5, 'Unrelated'),
  ];

  it('archives a nested task with cascade: its whole subtree leaves, the tasks above stay', async () => {
    act(() => hook.setTasks(tree()));
    api.archiveTask.mockResolvedValue(tree()[1]);

    await act(() => hook.archiveTask(tree()[1], 'cascade'));

    expect(api.archiveTask).toHaveBeenCalledWith(3, 'cascade');
    expect(hook.tasks.map(t => t.id)).toEqual([1, 5]);
  });

  it('deletes a nested task with keep: only its direct linked tasks are unlinked, deeper ones stay put', async () => {
    act(() => hook.setTasks(tree()));
    api.onDelete.mockResolvedValue(undefined);

    await act(() => hook.deleteTask(tree()[1], 'keep'));

    expect(api.onDelete).toHaveBeenCalledWith(3, 'keep');
    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(byId.has(3)).toBe(false);
    expect(byId.get(4)).toMatchObject({ parent_task_id: null, position: null });
    expect(byId.get(7)).toMatchObject({ parent_task_id: null, position: null });
    expect(byId.get(6)).toMatchObject({ parent_task_id: 4, position: 0 });
  });

  it('puts a nested subtree back where it was when its delete fails', async () => {
    act(() => hook.setTasks(tree()));
    api.onDelete.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => hook.deleteTask(tree()[2]));

    expect(new Set(hook.tasks.map(t => t.id))).toEqual(new Set([1, 3, 4, 5, 6, 7]));
    expect(hook.tasks.find(t => t.id === 6)).toMatchObject({ parent_task_id: 4 });
  });

  it('completes all on a nested task: it and its own open linked tasks, nothing above it', async () => {
    act(() => hook.setTasks(tree()));
    api.completeTaskWithLinked.mockResolvedValue(task(3, 'Mock interview', {
      parent_task_id: 1, position: 0, completed: true, completed_date: '2026-10-21T09:00:00',
    }));

    await act(() => hook.completeWithLinked(3));

    expect(api.completeTaskWithLinked).toHaveBeenCalledWith(3);
    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(byId.get(3)).toMatchObject({ completed: true, parent_task_id: 1 });
    expect(byId.get(4)).toMatchObject({ completed: true, completed_date: '2026-10-21T09:00:00' });
    expect(byId.get(1)).toMatchObject({ completed: false });
  });

  it('saves linked tasks under a nested task, moving one in with its own linked tasks', async () => {
    act(() => hook.setTasks(tree()));
    const room = tree()[4];
    api.updateLinkedTasks.mockResolvedValue({
      parent: room,
      children: [task(4, 'Practice', { parent_task_id: 7, position: 0 })],
    });

    await act(() => hook.saveLinkedTasks(room, [{ id: 4 }]));

    expect(api.updateLinkedTasks).toHaveBeenCalledWith(7, [{ id: 4 }]);
    const byId = new Map(hook.tasks.map(t => [t.id, t]));
    expect(byId.get(4)).toMatchObject({ parent_task_id: 7, position: 0 });
    // Notes moves along with Practice.
    expect(byId.get(6)).toMatchObject({ parent_task_id: 4 });
    expect(byId.get(7)).toMatchObject({ parent_task_id: 3 });
  });
});
