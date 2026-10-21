'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { syncCanvasLinkedTasks } from '@/app/lib/backend-api';
import type { Task } from '@/app/types/task';
import { toLocalDateStr } from '@/app/utils/dateUtils';

/** The shortest gap between two linked-task syncs, however they're asked for. */
export const CANVAS_TASK_SYNC_GAP_MS = 30 * 1000;

// Task id → the local day "Not yet" was pressed on; tm- keys are cleared on sign-out.
const NOT_YET_KEY = 'tm-canvas-not-yet';

const readNotYet = (): Record<number, string> => {
  try {
    const stored = JSON.parse(localStorage.getItem(NOT_YET_KEY) ?? '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
};

interface UseCanvasTaskSyncOptions {
  /** False until the task list has loaded. */
  enabled: boolean;
  tasks: Task[];
  /** Reloads the tasks whose due dates the backend moved. */
  refreshTasks: (ids: number[]) => Promise<void>;
}

/**
 * Keeps tasks added from Canvas in step with their assignments through
 * POST /canvas/linked-tasks/sync: once when the home page loads, and again
 * when the Canvas panel refreshes, at most once every 30 seconds. Tasks the
 * sync finds submitted get a banner offering to mark them complete; "Not
 * yet" hides it until the next day. Tasks whose due date the backend moved
 * are reloaded.
 *
 * A failed sync changes nothing: Canvas not connected or rejecting the
 * token, Canvas down, or a backend without the route yet.
 */
export function useCanvasTaskSync({ enabled, tasks, refreshTasks }: UseCanvasTaskSyncOptions) {
  const [submitted, setSubmitted] = useState<Set<number>>(new Set());
  const [notYet, setNotYet] = useState<Record<number, string>>({});
  const lastSyncAt = useRef<number | null>(null);
  const homeSynced = useRef(false);
  const refreshTasksRef = useRef(refreshTasks);
  const hasLinked = tasks.some(t => t.canvas_assignment_id != null && !t.completed);
  const hasLinkedRef = useRef(hasLinked);

  useEffect(() => {
    refreshTasksRef.current = refreshTasks;
    hasLinkedRef.current = hasLinked;
  });

  // Read once on mount, not during render, so the server render matches.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNotYet(readNotYet()); }, []);

  /** Syncs now unless one ran in the last 30 seconds; `refresh` asks the backend for fresh Canvas data. */
  const sync = useCallback(async (refresh = false) => {
    if (!enabled || !hasLinkedRef.current) return;
    const now = Date.now();
    if (lastSyncAt.current != null && now - lastSyncAt.current < CANVAS_TASK_SYNC_GAP_MS) return;
    lastSyncAt.current = now;
    let results;
    try {
      results = await syncCanvasLinkedTasks(refresh);
    } catch (err) {
      console.warn('Canvas linked-task sync skipped:', err);
      return;
    }
    const unread = new Set(results.filter(r => !r.synced).map(r => r.task_id));
    // A task Canvas couldn't be read for keeps what the last sync said.
    setSubmitted(prev => new Set([
      ...[...prev].filter(id => unread.has(id)),
      ...results.filter(r => r.synced && r.submitted).map(r => r.task_id),
    ]));
    const moved = results.filter(r => r.due_changed).map(r => r.task_id);
    if (moved.length > 0) await refreshTasksRef.current(moved);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !hasLinked || homeSynced.current) return;
    homeSynced.current = true;
    void sync();
  }, [enabled, hasLinked, sync]);

  const today = toLocalDateStr(new Date());

  /** Whether the task's card asks to mark it complete. */
  const showsSubmitted = (task: Task) => !task.completed && submitted.has(task.id) && notYet[task.id] !== today;

  /** "Not yet": hides the task's banner until tomorrow. */
  const dismiss = (taskId: number) => {
    // Days other than today no longer hide anything, so they're dropped.
    const next = Object.fromEntries(Object.entries({ ...notYet, [taskId]: today }).filter(([, day]) => day === today));
    setNotYet(next);
    try {
      localStorage.setItem(NOT_YET_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: it stays hidden until the page reloads.
    }
  };

  return { sync, showsSubmitted, dismiss };
}
