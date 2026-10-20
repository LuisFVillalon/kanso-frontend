import { describe, expect, it } from 'vitest';
import { daysLeft, deletedWithTask, restoredWithTask } from './trashUtils';
import { TrashItem } from '@/app/types/trash';

const T1 = '2026-10-01T10:00:00Z';
const T2 = '2026-10-02T10:00:00Z';

const task = (id: number, deleted_at: string, parent_task_id: number | null = null): TrashItem => ({
  kind: 'task', id, title: `Task ${id}`, deleted_at, purge_at: deleted_at, parent_task_id,
});

describe('daysLeft', () => {
  const now = new Date('2026-10-19T12:00:00Z');

  it('rounds a partial day up', () => {
    expect(daysLeft('2026-10-20T00:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-10-21T13:00:00Z', now)).toBe(3);
  });

  it('is 30 for something deleted just now', () => {
    expect(daysLeft('2026-11-18T12:00:00Z', now)).toBe(30);
  });

  it('never goes below zero', () => {
    expect(daysLeft('2026-10-18T12:00:00Z', now)).toBe(0);
  });
});

describe('deletedWithTask', () => {
  // 1 ─┬─ 2 ── 3   (all deleted together at T1)
  //    └─ 4        (deleted on its own earlier, at T2)
  // 5 (another task, also at T1)
  const trash = [task(1, T1), task(2, T1, 1), task(3, T1, 2), task(4, T2, 1), task(5, T1)];

  it('includes subtasks deleted along with the task, at any depth', () => {
    expect([...deletedWithTask(trash, 1)].sort()).toEqual([1, 2, 3]);
  });

  it('leaves out subtasks deleted on their own and unrelated tasks', () => {
    const ids = deletedWithTask(trash, 1);
    expect(ids.has(4)).toBe(false);
    expect(ids.has(5)).toBe(false);
  });

  it('ignores other kinds sharing an id', () => {
    const withNote: TrashItem[] = [...trash, { kind: 'note', id: 9, title: 'n', deleted_at: T1, purge_at: T1, parent_task_id: 1 }];
    expect(deletedWithTask(withNote, 1).has(9)).toBe(false);
  });
});

describe('restoredWithTask', () => {
  it('brings back trashed parents above the task, but not their other subtasks', () => {
    // 1 (deleted at T2) ─┬─ 2 (deleted on its own at T1, before its parent)
    //                    └─ 3 (deleted with 1 at T2)
    const trash = [task(2, T1, 1), task(1, T2), task(3, T2, 1)];
    expect([...restoredWithTask(trash, 2)].sort()).toEqual([1, 2]);
  });

  it('stops at a parent that is not in the trash', () => {
    const trash = [task(2, T1, 1)];
    expect([...restoredWithTask(trash, 2)]).toEqual([2]);
  });
});
