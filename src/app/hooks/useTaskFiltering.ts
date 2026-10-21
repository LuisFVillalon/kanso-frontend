/*
Purpose: This custom hook filters and sorts tasks based on status, search term, and selected tags,
nests linked tasks under their parent, and computes statistics for different task categories.
*/

import { useMemo } from 'react';
import { FilterType, StatsData, Tag, Task } from '@/app/types/task';
import { countTasksByTag, getTaskDateTime, groupLinkedTasks } from '@/app/utils/taskUtils';

export const useTaskFiltering = (
  tasks: Task[],
  filter: FilterType,
  sortOrder: Record<FilterType, 'asc' | 'desc'>,
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
          filter === 'all'
            ? true
            : filter === 'active'
            ? !task.completed
            : filter === 'completed'
            ? task.completed
            : filter === 'priority'
            ? !task.completed
            : filter === 'created'
            ? true
            : filter === 'duration'
            ? !task.completed
            : true;

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
        const dir = sortOrder[filter] === 'asc' ? 1 : -1;
        if (filter === 'priority') {
          const pa = a.priority ?? Infinity;
          const pb = b.priority ?? Infinity;
          return (pa - pb) * dir;
        }
        if (filter === 'duration') {
          const ea = a.estimated_time ?? Infinity;
          const eb = b.estimated_time ?? Infinity;
          return (ea - eb) * dir;
        }
        if (filter === 'created') {
          const da = new Date(a.created_date).getTime();
          const db = new Date(b.created_date).getTime();
          return (da - db) * dir;
        }
        const diff = getTaskDateTime(a) - getTaskDateTime(b);
        return diff * dir;
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
  }, [tasks, filter, sortOrder, searchTerm, selectedTags]);

  return { taskGroups, stats };
};