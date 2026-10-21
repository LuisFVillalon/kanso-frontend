import { useEffect, useRef } from 'react';
import type { Task } from '@/app/types/task';
import { todayPlanProgress } from '@/app/utils/taskUtils';

/**
 * Calls `onSettled` when checking off a task finishes today's plan (every
 * task due today or earlier is done). It fires on that transition only, not
 * when the dashboard loads with the day already settled, and not when the
 * last open task is deleted or archived instead of completed.
 */
export function useDayComplete(tasks: Task[], loading: boolean, onSettled: () => void): void {
  const previous = useRef<{ open: number; done: number } | null>(null);

  useEffect(() => {
    if (loading) return;
    const next = todayPlanProgress(tasks);
    const before = previous.current;
    previous.current = next;
    if (before && before.open > 0 && next.open === 0 && next.done > before.done) onSettled();
  }, [tasks, loading, onSettled]);
}
