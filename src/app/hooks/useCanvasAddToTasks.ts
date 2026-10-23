'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { CanvasTaskExistsError } from '@/app/lib/backend-api';
import { useTasksContext } from '@/app/context/TasksContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useToast } from '@/app/context/ToastContext';
import type { CanvasItem } from '@/app/types/canvas';
import type { NewTag, Tag, Task } from '@/app/types/task';
import { canvasAssignmentId, canvasTaskForm, isCanvasItemDone } from '@/app/utils/canvasTasks';

/** What a Canvas item row offers: "Add to tasks", "In tasks", or nothing. */
export type CanvasAddState = { kind: 'add'; pending: boolean } | { kind: 'added'; task: Task } | null;

export interface CanvasAddToTasks {
  stateOf: (item: CanvasItem) => CanvasAddState;
  /** Adds the item with `tags` (a new tag has id 0); resolves to the task, or null when it wasn't added. */
  add: (item: CanvasItem, tags: Tag[]) => Promise<Task | null>;
  /** The user's tags, for the tag picker. */
  tags: Tag[];
  /** Creates a tag on its own (choosing a class's tags without adding a task); null when it failed. */
  createTag: (tag: NewTag) => Promise<Tag | null>;
}

/** "CS, Exam prep" or "no tags", for the toast. */
const tagNames = (tags: Tag[]) => (tags.length ? tags.map(t => t.name).join(', ') : 'no tags');

/**
 * "Add to tasks" for the Canvas panel: turns an assignment into a task that
 * follows it with the tags the user picked (see canvasTaskForm), then offers
 * Undo. An assignment an open task already follows shows "In tasks"; if the
 * backend still finds one (a 409), the toast offers to show it through
 * `onShowTask`.
 */
export function useCanvasAddToTasks(onShowTask: (taskId: number) => void): CanvasAddToTasks {
  const { tasks, addTask, discardTask } = useTasksContext();
  const { tags, setTags, addTag } = useTagsContext();
  const showToast = useToast();
  const pendingRef = useRef<Set<number>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  const linked = useMemo(() => {
    const byAssignment = new Map<number, Task>();
    for (const task of tasks) {
      if (task.canvas_assignment_id != null && !byAssignment.has(task.canvas_assignment_id)) {
        byAssignment.set(task.canvas_assignment_id, task);
      }
    }
    return byAssignment;
  }, [tasks]);

  const stateOf = useCallback((item: CanvasItem): CanvasAddState => {
    const assignmentId = canvasAssignmentId(item);
    if (assignmentId == null) return null;
    const task = linked.get(assignmentId);
    if (task) return { kind: 'added', task };
    if (isCanvasItemDone(item)) return null;
    return { kind: 'add', pending: pendingIds.has(assignmentId) };
  }, [linked, pendingIds]);

  const setPending = (id: number, on: boolean) => {
    if (on) pendingRef.current.add(id);
    else pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  };

  const add = useCallback(async (item: CanvasItem, chosen: Tag[]) => {
    const assignmentId = canvasAssignmentId(item);
    if (assignmentId == null || pendingRef.current.has(assignmentId) || linked.has(assignmentId)) return null;
    setPending(assignmentId, true);
    try {
      const created = await addTask(canvasTaskForm(item, assignmentId, chosen));
      if (!created) return null;
      // The backend creates any tag the user has none of that name of.
      setTags(prev => [...prev, ...created.tags.filter(t => !prev.some(p => p.id === t.id))]);
      showToast(`Added "${item.title}" to your tasks with ${tagNames(created.tags)}.`, 'success', {
        label: 'Undo',
        onClick: () => { void discardTask(created); },
      });
      return created;
    } catch (err) {
      // addTask toasts every other failure itself.
      if (err instanceof CanvasTaskExistsError) {
        showToast('Already in your tasks.', 'info', { label: 'Show', onClick: () => onShowTask(err.taskId) });
      } else {
        console.error('Add to tasks failed:', err);
      }
      return null;
    } finally {
      setPending(assignmentId, false);
    }
  }, [linked, addTask, setTags, showToast, discardTask, onShowTask]);

  const createTag = useCallback(async (tag: NewTag) => (await addTag(tag)) || null, [addTag]);

  return { stateOf, add, tags, createTag };
}
