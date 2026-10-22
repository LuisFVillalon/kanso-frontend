/*
Purpose: This custom hook filters and sorts tasks based on the task view (which tasks to show,
the sort key and its direction), search term, and selected tags, nests linked tasks under their
parent, and computes statistics for different task categories.
*/

import { useMemo } from 'react';
import { StatsData, Tag, Task, TaskSortKey, TaskView } from '@/app/types/task';
import { countTasksByTag, getTaskDateTime, groupLinkedTasks } from '@/app/utils/taskUtils';

/** Everything, soonest due first: what the list showed before Show and Sort were split. */
export const DEFAULT_TASK_VIEW: TaskView = { show: 'all', sortKey: 'due', sortOrder: 'asc' };

export const isTaskView = (c: unknown): c is TaskView => {
  if (!c || typeof c !== 'object') return false;
  const v = c as Record<string, unknown>;
  return ['open', 'done', 'all'].includes(v.show as string)
    && ['due', 'priority', 'duration', 'created'].includes(v.sortKey as string)
    && (v.sortOrder === 'asc' || v.sortOrder === 'desc');
};

// Ascending value per sort key; a task without one sorts last going up.
const SORT_VALUE: Record<TaskSortKey, (t: Task) => number> = {
  due: getTaskDateTime,
  priority: t => t.priority ?? Infinity,
  duration: t => t.estimated_time ?? Infinity,
  created: t => new Date(t.created_date).getTime(),
};

export const useTaskFiltering = (
  tasks: Task[],
  view: TaskView,
  searchTerm: string,
  selectedTags: Tag[]
) => {
  const { taskGroups, stats } = useMemo(() => {
    // Ensure tasks is always an array
    const safeTasks = Array.isArray(tasks) ? tasks : [];

    const normalizedSearch = (searchTerm ?? '').toLowerCase();

    const filtered = safeTasks
      .filter(task => {
        // Ensure safe defaults
        const title = (task.title ?? '').toLowerCase();
        const description = (task.description ?? '').toLowerCase();
        const taskTags = task.tags ?? [];

        // Status filtering
        const matchesStatus =
          view.show === 'all' ? true : view.show === 'done' ? task.completed : !task.completed;

        // Search filtering
        const matchesSearch =
          title.includes(normalizedSearch) ||
          description.includes(normalizedSearch);

        // Tag filtering
        const matchesTags =
          selectedTags.length === 0 ||
          taskTags.some(taskTag =>
            selectedTags.some(selected => selected.id === taskTag.id)
          );

        return matchesStatus && matchesSearch && matchesTags;
      })
      .sort((a, b) => {
        const value = SORT_VALUE[view.sortKey];
        const diff = value(a) - value(b);
        // Infinity - Infinity is NaN: two tasks without a value tie.
        return (Number.isNaN(diff) ? 0 : diff) * (view.sortOrder === 'asc' ? 1 : -1);
      });

    const stats: StatsData = {
      total: {
        tasks: safeTasks,
        tags: countTasksByTag(safeTasks)
      },
      active: {
        tasks: safeTasks.filter(t => !t.completed),
        tags: countTasksByTag(safeTasks.filter(t => !t.completed))
      },
      completed: {
        tasks: safeTasks.filter(t => t.completed),
        tags: countTasksByTag(safeTasks.filter(t => t.completed))
      },
      prioritized: {
        tasks: safeTasks.filter(t => t.priority != null && !t.completed),
        tags: countTasksByTag(safeTasks.filter(t => t.priority != null && !t.completed))
      }
    };

    return { taskGroups: groupLinkedTasks(safeTasks, filtered), stats };
  }, [tasks, view, searchTerm, selectedTags]);

  return { taskGroups, stats };
};