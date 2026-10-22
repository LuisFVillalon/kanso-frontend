import { describe, expect, it } from 'vitest';
import type { Task } from '@/app/types/task';
import {
  LinkedDraft, compareLinkedOrder, describeLinkError, linkCandidates, linkedDraftsChanged, linkedDraftsFor,
  moveItem, toLinkedRefs,
} from './linkedTasks';

const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

const existing = (id: number): LinkedDraft => ({ kind: 'existing', id });

describe('linkedDraftsFor', () => {
  it("lists a parent's linked tasks by position, then id, with unpositioned ones last", () => {
    const tasks = [
      task(1, 'Parent'),
      task(5, 'Old link', { parent_task_id: 1, position: null }),
      task(2, 'Second', { parent_task_id: 1, position: 1 }),
      task(3, 'First', { parent_task_id: 1, position: 0 }),
      task(4, 'Elsewhere', { parent_task_id: 9, position: 0 }),
    ];
    expect(linkedDraftsFor(tasks, 1)).toEqual([existing(3), existing(2), existing(5)]);
    expect(linkedDraftsFor(tasks, null)).toEqual([]);
    expect([...tasks].sort(compareLinkedOrder).map(t => t.id)).toEqual([3, 4, 2, 1, 5]);
  });
});

describe('linkedDraftsChanged', () => {
  it('notices added, removed, reordered and new rows', () => {
    const saved = [existing(1), existing(2)];
    expect(linkedDraftsChanged(saved, [existing(1), existing(2)])).toBe(false);
    expect(linkedDraftsChanged(saved, [existing(2), existing(1)])).toBe(true);
    expect(linkedDraftsChanged(saved, [existing(1)])).toBe(true);
    expect(linkedDraftsChanged(saved, [existing(1), { kind: 'new', key: 'n', title: 'x' }])).toBe(true);
  });
});

describe('toLinkedRefs', () => {
  it('keeps the order, trims new titles and skips tasks no longer loaded', () => {
    const refs = toLinkedRefs(
      [existing(2), { kind: 'new', key: 'n', title: '  Draft cover letter ' }, existing(7)],
      [task(2, 'Mock interview')],
    );
    expect(refs).toEqual([{ id: 2 }, { title: 'Draft cover letter' }]);
  });
});

describe('moveItem', () => {
  it('moves an item and ignores moves past either end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('linkCandidates', () => {
  const tasks = [
    task(1, 'Apply to internships', { due_date: '2026-11-15' }),
    task(2, 'Prepare for Google phone screen'),
    task(3, 'Mock interview with Dana', { parent_task_id: 2, due_date: '2026-10-25' }),
    task(4, 'Update résumé', { due_date: '2026-10-26' }),
    task(5, 'Grocery run', { completed: true, due_date: '2026-10-20' }),
    task(6, 'Read DDIA chapter 5'),
  ];

  it('leaves out the task itself and tasks already listed', () => {
    const ids = linkCandidates(tasks, { parentId: 1, parentOfParent: null, drafts: [existing(4)], query: '' })
      .map(c => c.task.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(4);
  });

  it('explains moves and offers tasks that have linked tasks of their own', () => {
    const list = linkCandidates(tasks, { parentId: 1, parentOfParent: null, drafts: [], query: '' });
    const byId = new Map(list.map(c => [c.task.id, c]));
    expect(byId.get(3)).toMatchObject({
      ok: true, moves: true, note: 'Already linked to “Prepare for Google phone screen”. Linking moves it here',
    });
    expect(byId.get(2)).toMatchObject({ ok: true });
    expect(byId.get(2)?.note).toBeUndefined();
    expect(byId.get(6)).toMatchObject({ ok: true });
    expect(byId.get(6)?.note).toBeUndefined();
  });

  it('blocks a loop through the edited task’s own parent', () => {
    const list = linkCandidates(tasks, { parentId: 3, parentOfParent: 2, drafts: [], query: '' });
    expect(list.find(c => c.task.id === 2)).toMatchObject({
      ok: false, note: 'Would create a loop: this task already leads up to it',
    });
  });

  it('blocks every task above a nested task, not just its own parent', () => {
    const nested = [...tasks, task(7, 'Book the room', { parent_task_id: 3 })];
    const list = linkCandidates(nested, { parentId: 7, parentOfParent: 3, drafts: [], query: '' });
    const blocked = list.filter(c => !c.ok).map(c => c.task.id);
    expect(blocked).toEqual([3, 2]);
  });

  it('sorts linkable before blocked, open before done, then by due date', () => {
    const ids = linkCandidates(tasks, { parentId: 3, parentOfParent: 2, drafts: [], query: '' })
      .map(c => c.task.id);
    expect(ids).toEqual([4, 1, 6, 5, 2]);
  });

  it('filters by title, ignoring case', () => {
    const list = linkCandidates(tasks, { parentId: null, parentOfParent: null, drafts: [], query: 'MOCK' });
    expect(list.map(c => c.task.id)).toEqual([3]);
  });
});

describe('describeLinkError', () => {
  it('names tasks by title instead of id', () => {
    const tasks = [task(12, 'Mock interview'), task(7, 'Apply')];
    expect(describeLinkError('Task 12 is archived; restore it before linking it', tasks))
      .toBe('“Mock interview” is archived; restore it before linking it');
    expect(describeLinkError('Linking task 12 under task 7 would create a loop', tasks))
      .toBe('Linking “Mock interview” under “Apply” would create a loop');
    expect(describeLinkError('Task with ID 99 not found', tasks)).toBe('Task with ID 99 not found');
  });
});
