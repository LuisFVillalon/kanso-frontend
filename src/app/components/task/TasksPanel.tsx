'use client';

import React, { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import TaskItem from './TaskItem';
import LinkedTaskBanner, { LinkedBannerKind } from './LinkedTaskBanner';
import CanvasSubmittedBanner from './CanvasSubmittedBanner';
import RemoveLinkedTasksDialog from './RemoveLinkedTasksDialog';
import TasksToolbar from './TasksToolbar';
import { LinkedRemoveMode, Tag, Task, TaskView } from '@/app/types/task';
import { TaskGroup } from '@/app/utils/taskUtils';

interface TasksPanelProps {
  tags: Tag[];
  /** Filtered, sorted top-level tasks, each with its linked tasks nested under it. */
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
  /** Tasks added from Canvas whose assignment Canvas shows submitted (see useCanvasTaskSync). */
  canvasSubmitted?: {
    shows: (task: Task) => boolean;
    onNotYet: (id: number) => void;
  };
  /** Which tasks show and how they're sorted (the toolbar's Show and Sort). */
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  /** The toolbar's tag filter. */
  selectedTags: Tag[];
  onToggleTag: (tag: Tag) => void;
  onClearTags: () => void;
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
  canvasSubmitted,
  view,
  onViewChange,
  selectedTags,
  onToggleTag,
  onClearTags,
}) => {
  // The completion question each task with linked tasks is asking, by task id.
  const [banners, setBanners] = useState<Record<number, LinkedBannerKind>>({});
  const [removing, setRemoving] = useState<{ task: Task; verb: 'delete' | 'archive'; linkedCount: number } | null>(null);

  const setBanner = (id: number, kind: LinkedBannerKind | null) =>
    setBanners(prev => {
      const next = { ...prev };
      if (kind) next[id] = kind;
      else delete next[id];
      return next;
    });

  // Every shown task, at any depth, with the task it's nested under.
  const shown = useMemo(() => {
    const map = new Map<number, { group: TaskGroup; parent: TaskGroup | null }>();
    const visit = (group: TaskGroup, parent: TaskGroup | null) => {
      map.set(group.task.id, { group, parent });
      group.linked.forEach(child => visit(child, group));
    };
    taskGroups.forEach(g => visit(g, null));
    return map;
  }, [taskGroups]);

  // Completing a task with open linked tasks asks first; finishing a task's
  // last open linked task suggests completing that task. Both work at any depth.
  const handleToggleComplete = (id: number) => {
    const entry = shown.get(id);
    if (entry) {
      const { group, parent } = entry;
      if (!group.task.completed && group.linkedDone < group.linkedTotal) {
        setBanner(id, 'open');
        return;
      }
      setBanner(id, null);
      if (parent) {
        const finishesLast = !group.task.completed && parent.linkedDone + 1 === parent.linkedTotal;
        setBanner(parent.task.id, finishesLast && !parent.task.completed ? 'alldone' : null);
      }
    }
    onToggleComplete(id);
  };

  const requestRemove = (task: Task, verb: 'delete' | 'archive') => {
    const linkedCount = shown.get(task.id)?.group.linkedTotal ?? 0;
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
  // rolls the list back, which quietly drops it). A linked-task question
  // comes before Canvas's. Nested tasks get theirs under their own row.
  const bannerFor = ({ task, linkedDone, linkedTotal }: TaskGroup) => {
    const kind = banners[task.id];
    const applies = !task.completed && linkedTotal > 0 && (kind === 'open' ? linkedDone < linkedTotal : linkedDone === linkedTotal);
    if (!kind || !applies) {
      if (!canvasSubmitted?.shows(task)) return null;
      return (
        <CanvasSubmittedBanner
          title={task.title}
          onComplete={() => handleToggleComplete(task.id)}
          onNotYet={() => canvasSubmitted.onNotYet(task.id)}
        />
      );
    }
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
    <div className="flex flex-col space-y-2 sm:space-y-3">
      <TasksToolbar
        view={view}
        onViewChange={onViewChange}
        tags={tags}
        selectedTags={selectedTags}
        onToggleTag={onToggleTag}
        onClearTags={onClearTags}
        compact={compact}
      />
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
              pendingTaskIds={pendingTaskIds}
              banner={bannerFor(group)}
              linkedBannerFor={bannerFor}
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
