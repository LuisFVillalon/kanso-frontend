'use client';

import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import TaskItem from './TaskItem';
import LinkedTaskBanner, { LinkedBannerKind } from './LinkedTaskBanner';
import RemoveLinkedTasksDialog from './RemoveLinkedTasksDialog';
import { LinkedRemoveMode, Tag, Task } from '@/app/types/task';
import { TaskGroup } from '@/app/utils/taskUtils';

interface TasksPanelProps {
  tags: Tag[];
  /** Filtered, sorted top-level tasks, each with its linked tasks. */
  taskGroups: TaskGroup[];
  onToggleComplete: (id: number) => void;
  /** "Complete all": completes a task and its open linked tasks together. */
  onCompleteWithLinked: (id: number) => void;
  /** `linked` is passed only for a task with linked tasks, as picked in the dialog. */
  onDeleteTask: (task: Task, linked?: LinkedRemoveMode) => void;
  onArchiveTask: (task: Task, linked?: LinkedRemoveMode) => void;
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
  onCompleteWithLinked,
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
  // The completion question each parent card is asking, by parent id.
  const [banners, setBanners] = useState<Record<number, LinkedBannerKind>>({});
  const [removing, setRemoving] = useState<{ task: Task; verb: 'delete' | 'archive'; linkedCount: number } | null>(null);

  const setBanner = (id: number, kind: LinkedBannerKind | null) =>
    setBanners(prev => {
      const next = { ...prev };
      if (kind) next[id] = kind;
      else delete next[id];
      return next;
    });

  // Completing a parent with open linked tasks asks first; finishing a
  // parent's last open linked task suggests completing the parent.
  const handleToggleComplete = (id: number) => {
    const group = taskGroups.find(g => g.task.id === id);
    if (group) {
      if (!group.task.completed && group.linkedDone < group.linkedTotal) {
        setBanner(id, 'open');
        return;
      }
      setBanner(id, null);
    } else {
      const parentGroup = taskGroups.find(g => g.linked.some(t => t.id === id && t.parent_task_id === g.task.id));
      if (parentGroup) {
        const child = parentGroup.linked.find(t => t.id === id)!;
        const finishesLast = !child.completed && parentGroup.linkedDone + 1 === parentGroup.linkedTotal;
        setBanner(parentGroup.task.id, finishesLast && !parentGroup.task.completed ? 'alldone' : null);
      }
    }
    onToggleComplete(id);
  };

  const requestRemove = (task: Task, verb: 'delete' | 'archive') => {
    const linkedCount = taskGroups.find(g => g.task.id === task.id)?.linkedTotal ?? 0;
    if (linkedCount > 0) setRemoving({ task, verb, linkedCount });
    else if (verb === 'delete') onDeleteTask(task);
    else onArchiveTask(task);
  };

  const confirmRemove = (linked: LinkedRemoveMode) => {
    if (!removing) return;
    setBanner(removing.task.id, null);
    if (removing.verb === 'delete') onDeleteTask(removing.task, linked);
    else onArchiveTask(removing.task, linked);
    setRemoving(null);
  };

  // A banner shows only while its question still applies (a failed toggle
  // rolls the list back, which quietly drops it).
  const bannerFor = ({ task, linkedDone, linkedTotal }: TaskGroup) => {
    const kind = banners[task.id];
    const applies = !task.completed && linkedTotal > 0 && (kind === 'open' ? linkedDone < linkedTotal : linkedDone === linkedTotal);
    if (!kind || !applies) return null;
    return (
      <LinkedTaskBanner
        kind={kind}
        title={task.title}
        openCount={linkedTotal - linkedDone}
        onCompleteAll={() => { setBanner(task.id, null); onCompleteWithLinked(task.id); }}
        onCompleteOne={() => { setBanner(task.id, null); onToggleComplete(task.id); }}
        onDismiss={() => setBanner(task.id, null)}
      />
    );
  };

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
          {taskGroups.map((group, index) => (
            <TaskItem
              key={group.task.id}
              task={group.task}
              index={index}
              linkedTasks={group.linked}
              linkedDone={group.linkedDone}
              linkedTotal={group.linkedTotal}
              linkedVia={group.linkedVia}
              pendingTaskIds={pendingTaskIds}
              banner={bannerFor(group)}
              onToggleComplete={handleToggleComplete}
              tags={tags}
              onDeleteTask={t => requestRemove(t, 'delete')}
              onArchiveTask={t => requestRemove(t, 'archive')}
              onUpdatePriority={onUpdatePriority}
              onEditTask={onEditTask}
              activeTaskCount={activeTaskCount}
              occupiedPriorities={occupiedPriorities}
              compact={compact}
              pending={pendingTaskIds?.has(group.task.id)}
            />
          ))}
        </div>
      )}

      {removing && (
        <RemoveLinkedTasksDialog
          verb={removing.verb}
          title={removing.task.title}
          linkedCount={removing.linkedCount}
          onConfirm={confirmRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
};

export default TasksPanel;
