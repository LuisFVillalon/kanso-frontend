import { describe, expect, it } from 'vitest';
import type { Task } from '@/app/types/task';
import { groupLinkedTasks, subtaskTreeIds } from './taskUtils';

describe('subtaskTreeIds', () => {
  const tasks = [
    { id: 1, parent_task_id: null },
    { id: 2, parent_task_id: 1 },
    { id: 3, parent_task_id: 2 },
    { id: 4, parent_task_id: null },
    { id: 5, parent_task_id: 4 },
  ];

  it('collects the task and every nested subtask', () => {
    expect([...subtaskTreeIds(tasks, 1)].sort()).toEqual([1, 2, 3]);
  });

  it('collects descendants even when they are listed before their parent', () => {
    expect([...subtaskTreeIds([...tasks].reverse(), 1)].sort()).toEqual([1, 2, 3]);
  });

  it('returns just the task when it has no subtasks', () => {
    expect([...subtaskTreeIds(tasks, 3)]).toEqual([3]);
  });
});

describe('groupLinkedTasks', () => {
  const task = (id: number, parent_task_id: number | null = null, completed = false): Task => ({
    id, parent_task_id, completed,
    title: `Task ${id}`, description: '', priority: null, due_date: null, due_time: null,
    tags: [], created_date: '2026-10-01', completed_date: null,
  });
  const shape = (groups: ReturnType<typeof groupLinkedTasks>) =>
    groups.map(g => ({ id: g.task.id, linked: g.linked.map(t => t.id), done: g.linkedDone, total: g.linkedTotal }));

  // 1 has linked tasks 2 (done), 3 and 5; 4 stands alone.
  const all = [task(1), task(5, 1), task(2, 1, true), task(3, 1), task(4)];
  const byId = (ids: number[]) => ids.map(id => all.find(t => t.id === id)!);

  it('nests linked tasks under their parent, oldest first, with progress', () => {
    expect(shape(groupLinkedTasks(all, byId([1, 5, 2, 3, 4])))).toEqual([
      { id: 1, linked: [2, 3, 5], done: 1, total: 3 },
      { id: 4, linked: [], done: 0, total: 0 },
    ]);
  });

  it('keeps every linked task under a matching parent, even ones the filters hide', () => {
    expect(shape(groupLinkedTasks(all, byId([4, 1])))).toEqual([
      { id: 4, linked: [], done: 0, total: 0 },
      { id: 1, linked: [2, 3, 5], done: 1, total: 3 },
    ]);
  });

  it('keeps the parent visible when only a linked task matches, showing just the matches', () => {
    expect(shape(groupLinkedTasks(all, byId([4, 3])))).toEqual([
      { id: 4, linked: [], done: 0, total: 0 },
      { id: 1, linked: [3], done: 1, total: 3 },
    ]);
  });

  it('places a group at its parent when the parent matches, not at an earlier linked task', () => {
    expect(shape(groupLinkedTasks(all, byId([3, 4, 1]))).map(g => g.id)).toEqual([4, 1]);
  });

  it('places a group at its first matching linked task when the parent does not match', () => {
    expect(shape(groupLinkedTasks(all, byId([3, 4, 5]))).map(g => g.id)).toEqual([1, 4]);
  });

  it('shows each task once', () => {
    const ids = groupLinkedTasks(all, all).flatMap(g => [g.task.id, ...g.linked.map(t => t.id)]);
    expect(ids.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('treats a linked task whose parent is not loaded as top-level', () => {
    const orphan = task(9, 99);
    expect(shape(groupLinkedTasks([orphan], [orphan]))).toEqual([{ id: 9, linked: [], done: 0, total: 0 }]);
  });

  it('hangs a deeper tree off its topmost ancestor', () => {
    const deep = [task(1), task(2, 1), task(3, 2)];
    expect(shape(groupLinkedTasks(deep, [deep[2]]))).toEqual([{ id: 1, linked: [3], done: 0, total: 2 }]);
  });

  it('keeps tasks in a parent loop top-level instead of hanging', () => {
    const loop = [task(1, 2), task(2, 1)];
    expect(shape(groupLinkedTasks(loop, loop)).map(g => g.id)).toEqual([1, 2]);
  });
});
