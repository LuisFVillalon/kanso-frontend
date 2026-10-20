import { TrashItem } from '@/app/types/trash';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until `purgeAt`, rounded up, so an item purged later today has 1 day left. Never negative. */
export function daysLeft(purgeAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now.getTime()) / DAY_MS));
}

/** A trash item's unique key: kind and id, since a task, a note, a tag and a habit can share an id. */
export const trashKey = (item: Pick<TrashItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;

const trashedTasks = (trash: TrashItem[]) => trash.filter(item => item.kind === 'task');

/**
 * The trashed task `rootId` plus the subtasks deleted along with it (they
 * share its `deleted_at`). Subtasks deleted on their own beforehand are not
 * included, matching how the backend restores and purges a task.
 */
export function deletedWithTask(trash: TrashItem[], rootId: number): Set<number> {
  const tasks = trashedTasks(trash);
  const root = tasks.find(t => t.id === rootId);
  const ids = new Set([rootId]);
  if (!root) return ids;
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (t.parent_task_id != null && ids.has(t.parent_task_id) && !ids.has(t.id) && t.deleted_at === root.deleted_at) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * Every task a restore of `rootId` brings back: the task, the subtasks
 * deleted along with it, and any trashed parents above it (so it never comes
 * back under a hidden parent).
 */
export function restoredWithTask(trash: TrashItem[], rootId: number): Set<number> {
  const tasks = trashedTasks(trash);
  const ids = deletedWithTask(trash, rootId);
  let parentId = tasks.find(t => t.id === rootId)?.parent_task_id;
  while (parentId != null && !ids.has(parentId)) {
    const parent = tasks.find(t => t.id === parentId);
    if (!parent) break;
    ids.add(parent.id);
    parentId = parent.parent_task_id;
  }
  return ids;
}
