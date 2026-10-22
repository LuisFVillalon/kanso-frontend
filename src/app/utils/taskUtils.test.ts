import { describe, expect, it } from 'vitest';
import type { Task } from '@/app/types/task';
import { formatDueDateShort, getDueStatus, linkedTaskIndex, parentChain, subtaskTreeIds, taskToEditForm, todayPlanProgress } from './taskUtils';

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

describe('linkedTaskIndex', () => {
  const task = (id: number, parent_task_id: number | null = null, completed = false, position: number | null = null): Task => ({
    id, parent_task_id, completed, position,
    title: `Task ${id}`, description: '', priority: null, due_date: null, due_time: null,
    tags: [], created_date: '2026-10-01', completed_date: null,
  });
  const ids = (tasks: Task[]) => tasks.map(t => t.id);

  // 1 → 2 → 3 (done) and 2 → 4; 1 → 5 stands beside 2; 6 stands alone.
  const all = [task(6), task(5, 1, false, 1), task(4, 2), task(3, 2, true), task(2, 1, false, 0), task(1)];
  const index = linkedTaskIndex(all);

  it('lists a task\'s direct linked tasks in their saved order', () => {
    expect(ids(index.childrenOf(1))).toEqual([2, 5]);
    expect(ids(index.childrenOf(2))).toEqual([3, 4]);
    expect(index.childrenOf(6)).toEqual([]);
  });

  it('collects every task under a task, at any depth', () => {
    expect(ids(index.descendantsOf(1)).sort()).toEqual([2, 3, 4, 5]);
    expect(ids(index.descendantsOf(2)).sort()).toEqual([3, 4]);
  });

  it('counts the open tasks anywhere under a task', () => {
    expect(index.openUnder(1)).toBe(3);
    expect(index.openUnder(2)).toBe(1);
    expect(index.openUnder(3)).toBe(0);
  });

  it('leaves a task whose parent is not loaded under nothing', () => {
    const orphanIndex = linkedTaskIndex([task(9, 99)]);
    expect(orphanIndex.childrenOf(99)).toEqual([]);
    expect(orphanIndex.byId.get(9)?.id).toBe(9);
  });

  it('stops at a parent loop instead of hanging', () => {
    const loop = linkedTaskIndex([task(1, 2), task(2, 1), task(3, 1)]);
    expect(ids(loop.descendantsOf(1)).sort()).toEqual([2, 3]);
    expect(loop.openUnder(1)).toBe(2);
  });
});

describe('parentChain', () => {
  const t = (id: number, parent_task_id: number | null = null, extra: Partial<Task> = {}): Task => ({
    id, parent_task_id, title: `Task ${id}`, description: '', completed: false, priority: null,
    due_date: null, due_time: null, tags: [], created_date: '2026-10-01', completed_date: null, ...extra,
  });
  const map = (tasks: Task[]) => new Map(tasks.map(x => [x.id, x]));

  it('lists the tasks above, topmost first', () => {
    const tasks = [t(1), t(2, 1), t(3, 2)];
    expect(parentChain(map(tasks), tasks[2])).toEqual([{ id: 1, title: 'Task 1' }, { id: 2, title: 'Task 2' }]);
    expect(parentChain(map(tasks), tasks[0])).toEqual([]);
  });

  it("ends with the API's summary of a parent that isn't loaded", () => {
    const child = t(3, 2, { parent: { id: 2, title: 'Archived parent' } });
    expect(parentChain(map([child]), child)).toEqual([{ id: 2, title: 'Archived parent' }]);
    // A summary for some other parent is ignored.
    expect(parentChain(map([child]), { ...child, parent_task_id: 9 })).toEqual([]);
  });

  it('stops at a loop', () => {
    const tasks = [t(1, 2), t(2, 1)];
    expect(parentChain(map(tasks), tasks[0])).toEqual([{ id: 2, title: 'Task 2' }]);
  });
});

describe('taskToEditForm', () => {
  const task: Task = {
    id: 7, title: 'Essay', description: '', completed: false, priority: null,
    due_date: '2026-10-21', due_time: '17:00', tags: [], created_date: '2026-10-01T00:00:00',
    completed_date: null, reminder_minutes: 45,
  };

  // /update-task replaces every field, so a lead left out resets to the default.
  it("carries the task's reminder lead into the update", () => {
    expect(taskToEditForm(task).reminder_minutes).toBe(45);
    expect(taskToEditForm(task, { priority: 2 }).reminder_minutes).toBe(45);
  });

  it('sends null for a task on the default lead', () => {
    expect(taskToEditForm({ ...task, reminder_minutes: undefined }).reminder_minutes).toBeNull();
  });
});

describe('getDueStatus', () => {
  const now = new Date(2026, 9, 20, 15, 0);
  const status = (due_date: string | null, completed = false) => getDueStatus({ due_date, completed }, now);

  it('shows Done for a completed task, whatever its due date', () => {
    expect(status('2026-10-01', true)).toEqual({ kind: 'done', label: 'Done' });
    expect(status(null, true)).toEqual({ kind: 'done', label: 'Done' });
  });

  it('calls a past due date Slipped, never overdue', () => {
    expect(status('2026-10-19')).toEqual({ kind: 'slipped', label: 'Slipped' });
  });

  it('marks today and tomorrow as due', () => {
    expect(status('2026-10-20')).toEqual({ kind: 'due', label: 'Due today' });
    expect(status('2026-10-21')).toEqual({ kind: 'due', label: 'Due tomorrow' });
  });

  it('counts down the coming week, then shows no chip', () => {
    expect(status('2026-10-23')).toEqual({ kind: 'upcoming', label: 'In 3 days' });
    expect(status('2026-10-27')).toEqual({ kind: 'upcoming', label: 'In 7 days' });
    expect(status('2026-10-28')).toBeNull();
  });

  it('has no status for an open task without a due date', () => {
    expect(status(null)).toBeNull();
  });
});

describe('formatDueDateShort', () => {
  const now = new Date(2026, 9, 21);

  it('omits the year for dates in the current year', () => {
    expect(formatDueDateShort('2026-12-05', now)).toBe('Dec 5');
  });

  it('includes the year for dates in another year', () => {
    expect(formatDueDateShort('2027-03-01', now)).toBe('Mar 1, 2027');
    expect(formatDueDateShort('2025-03-01', now)).toBe('Mar 1, 2025');
  });
});

describe('todayPlanProgress', () => {
  const now = new Date(2026, 9, 20, 9, 0);
  const t = (due_date: string | null, completed: boolean, archived_at: string | null = null) =>
    ({ due_date, completed, archived_at });

  it('counts tasks due today or earlier, skipping future, undated and archived ones', () => {
    expect(todayPlanProgress([
      t('2026-10-20', true),
      t('2026-10-20', false),
      t('2026-10-18', false),
      t('2026-10-21', false),
      t(null, false),
      t('2026-10-20', false, '2026-10-19T12:00:00Z'),
    ], now)).toEqual({ open: 2, done: 1 });
  });

  it('is settled once nothing in the plan is left open', () => {
    expect(todayPlanProgress([t('2026-10-20', true), t('2026-10-19', true)], now)).toEqual({ open: 0, done: 2 });
  });
});
