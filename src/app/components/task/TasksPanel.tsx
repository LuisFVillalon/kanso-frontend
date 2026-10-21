'use client';

import React from 'react';
import { Filter } from 'lucide-react';
import TaskItem from './TaskItem';
import { Tag, Task } from '@/app/types/task';
import { TaskGroup } from '@/app/utils/taskUtils';

interface TasksPanelProps {
  tags: Tag[];
  /** Filtered, sorted top-level tasks, each with its linked tasks. */
  taskGroups: TaskGroup[];
  onToggleComplete: (id: number) => void;
  onDeleteTask: (task: Task) => void;
  onArchiveTask: (task: Task) => void;
  onUpdatePriority: (taskId: number, priority: number | null) => void;
  onEditTask: (task: Task) => void;
  activeTaskCount: number;
  occupiedPriorities: number[];
  compact: boolean;
  /** User-adjustable scroll-area height in px (overrides the default responsive height). */
  heightPx?: number | null;
  pendingTaskIds?: Set<number>;
}

const TasksPanel: React.FC<TasksPanelProps> = ({
  tags,
  taskGroups,
  onToggleComplete,
  onDeleteTask,
  onArchiveTask,
  onUpdatePriority,
  onEditTask,
  activeTaskCount,
  occupiedPriorities,
  compact,
  heightPx,
  pendingTaskIds,
}) => {
  return (
    <div className="split-tasks flex flex-col space-y-2 sm:space-y-3">
      {taskGroups.length === 0 ? (
        <div className="card-glass p-6 sm:p-8 text-center mt-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: 'var(--tm-surface-raised)' }}
          >
            <Filter className="w-6 h-6 text-text-muted" />
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">No tasks found</h3>
          <p className="text-sm text-text-secondary">Try adjusting your filters</p>
        </div>
      ) : (
        <div
          className="flex flex-col gap-2 overflow-y-auto h-[50vh] lg:h-[600px] pl-2 pr-1 scrollbar-custom"
          style={heightPx ? { height: `${heightPx}px` } : undefined}
        >
          {taskGroups.map(({ task, linked, linkedDone, linkedTotal }, index) => (
            <TaskItem
              key={task.id}
              task={task}
              index={index}
              linkedTasks={linked}
              linkedDone={linkedDone}
              linkedTotal={linkedTotal}
              pendingTaskIds={pendingTaskIds}
              onToggleComplete={onToggleComplete}
              tags={tags}
              onDeleteTask={onDeleteTask}
              onArchiveTask={onArchiveTask}
              onUpdatePriority={onUpdatePriority}
              onEditTask={onEditTask}
              activeTaskCount={activeTaskCount}
              occupiedPriorities={occupiedPriorities}
              compact={compact}
              pending={pendingTaskIds?.has(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TasksPanel;
