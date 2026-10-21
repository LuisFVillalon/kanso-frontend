'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { CanvasTaskExistsError } from '@/app/lib/backend-api';
import { useTasksContext } from '@/app/context/TasksContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useToast } from '@/app/context/ToastContext';
import type { CanvasItem } from '@/app/types/canvas';
import type { Task } from '@/app/types/task';
import { canvasAssignmentId, canvasTaskForm, isCanvasItemDone } from '@/app/utils/canvasTasks';

/** What a Canvas item row offers: "Add to tasks", "In tasks", or nothing. */
export type CanvasAddState = { kind: 'add'; pending: boolean } | { kind: 'added'; task: Task } | null;

export interface CanvasAddToTasks {
  stateOf: (item: CanvasItem) => CanvasAddState;
  add: (item: CanvasItem, courseLabel: string | null) => Promise<void>;
}

/**
 * "Add to tasks" for the Canvas panel: turns an assignment into a task that
 * follows it (see canvasTaskForm), then offers Undo. An assignment an open
 * task already follows shows "In tasks"; if the backend still finds one
 * (a 409), the toast offers to show it through `onShowTask`.
 */
export function useCanvasAddToTasks(onShowTask: (taskId: number) => void): CanvasAddToTasks {
  const { tasks, addTask, discardTask } = useTasksContext();
  const { tags, setTags } = useTagsContext();
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

  const add = useCallback(async (item: CanvasItem, courseLabel: string | null) => {
    const assignmentId = canvasAssignmentId(item);
    if (assignmentId == null || pendingRef.current.has(assignmentId) || linked.has(assignmentId)) return;
    setPending(assignmentId, true);
    try {
      const created = await addTask(canvasTaskForm(item, assignmentId, courseLabel, tags));
      if (!created) return;
      // The backend creates the course's tag when the user has none of that name.
      setTags(prev => [...prev, ...created.tags.filter(t => !prev.some(p => p.id === t.id))]);
      showToast(`Added "${item.title}" to your tasks.`, 'success', {
        label: 'Undo',
        onClick: () => { void discardTask(created); },
      });
    } catch (err) {
      // addTask toasts every other failure itself.
      if (err instanceof CanvasTaskExistsError) {
        showToast('Already in your tasks.', 'info', { label: 'Show', onClick: () => onShowTask(err.taskId) });
      } else {
        console.error('Add to tasks failed:', err);
      }
    } finally {
      setPending(assignmentId, false);
    }
  }, [linked, addTask, tags, setTags, showToast, discardTask, onShowTask]);

  return { stateOf, add };
}
