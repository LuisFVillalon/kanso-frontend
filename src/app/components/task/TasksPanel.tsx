'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import TaskItem from './TaskItem';
import LinkedTaskBanner, { LinkedBannerKind } from './LinkedTaskBanner';
import CanvasSubmittedBanner from './CanvasSubmittedBanner';
import RemoveLinkedTasksDialog, { RemovedBranch } from './RemoveLinkedTasksDialog';
import LinkedTaskInlineForm from './LinkedTaskInlineForm';
import TasksToolbar from './TasksToolbar';
import { TaskFormData } from './TaskFormFields';
import { TrailItem } from './ParentTrail';
import { LinkedRemoveMode, Tag, Task, TaskView } from '@/app/types/task';
import type { CanvasDoneAs } from '@/app/hooks/useCanvasTaskSync';
import { linkedTaskIndex, parentChain } from '@/app/utils/taskUtils';
import { ToastAction, useToast } from '@/app/context/ToastContext';

interface TasksPanelProps {
  tags: Tag[];
  /** Filtered, sorted tasks: every task that matches is its own card, linked or not. */
  tasks: Task[];
  /** Every loaded task, for parent trails, linked-task progress and the completion questions. */
  allTasks: Task[];
  onToggleComplete: (id: number) => void;
  /** "Complete all": completes a task and every open task under it together. */
  onCompleteWithLinked: (id: number) => void;
  /** `linked` is passed only for a task with linked tasks, as picked in the dialog. */
  onDeleteTask: (task: Task, linked?: LinkedRemoveMode) => void;
  onArchiveTask: (task: Task, linked?: LinkedRemoveMode) => void;
  onUpdatePriority: (taskId: number, priority: number | null) => void;
  onEditTask: (task: Task) => void;
  /** Creates a task as a linked task of `parent` (the "+ Linked task" form); false when it failed. */
  onCreateLinkedTask?: (parent: Task, form: TaskFormData) => Promise<Task | false>;
  /** Clears the search, tag filter and Show, so a task they hide can be shown. */
  onShowAll?: () => void;
  activeTaskCount: number;
  occupiedPriorities: number[];
  compact: boolean;
  /** User-adjustable scroll-area height in px (overrides the default responsive height). */
  heightPx?: number | null;
  pendingTaskIds?: Set<number>;
  /** Tasks added from Canvas whose assignment Canvas shows submitted or done (see useCanvasTaskSync). */
  canvasSubmitted?: {
    shows: (task: Task) => boolean;
    /** Left out, the banner says "submitted". */
    doneAs?: (task: Task) => CanvasDoneAs;
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
  tasks,
  allTasks,
  onToggleComplete,
  onCompleteWithLinked,
  onDeleteTask,
  onArchiveTask,
  onUpdatePriority,
  onEditTask,
  onCreateLinkedTask,
  onShowAll,
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
  const showToast = useToast();
  // The completion question each task with linked tasks is asking, by task id.
  const [banners, setBanners] = useState<Record<number, LinkedBannerKind>>({});
  const [removing, setRemoving] = useState<{ task: Task; verb: 'delete' | 'archive'; linked: RemovedBranch[] } | null>(null);
  // The task whose "New linked task" form is open under its card.
  const [addingTo, setAddingTo] = useState<number | null>(null);
  // A task to scroll to once the list shows it (after "Show it" cleared the filters).
  const goToWhenShown = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => linkedTaskIndex(allTasks), [allTasks]);
  const { byId, childrenOf, descendantsOf, openUnder } = index;
  // The tasks as they are now, for a toast's button clicked after the list changed.
  const indexNow = useRef(index);
  useEffect(() => { indexNow.current = index; }, [index]);

  const setBanner = (id: number, kind: LinkedBannerKind | null) =>
    setBanners(prev => {
      const next = { ...prev };
      if (kind) next[id] = kind;
      else delete next[id];
      return next;
    });

  const cardOf = (id: number) =>
    listRef.current?.querySelector<HTMLElement>(`[data-task-id="${id}"]`) ?? null;

  /** Scrolls to a task's card and highlights it; false when the list doesn't show it. */
  const flash = useCallback((id: number, block: ScrollLogicalPosition = 'center') => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
    if (!el) return false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block, behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('task-flash');
    void el.offsetWidth; // restarts the highlight when it's already running
    el.classList.add('task-flash');
    return true;
  }, []);

  const showIt = (task: Task): ToastAction | undefined => onShowAll && {
    label: 'Show it',
    onClick: () => { goToWhenShown.current = task.id; onShowAll(); },
  };

  const hiddenToast = (task: Task, lead: string) => showToast(lead, 'info', showIt(task));

  // The "all linked tasks are done" banner, for a parent the filters hide.
  const allDoneToast = (parent: Task) => {
    const complete = {
      label: `Complete “${parent.title}”`,
      onClick: () => {
        const now = indexNow.current.byId.get(parent.id);
        if (!now || now.completed || indexNow.current.openUnder(parent.id) > 0) return;
        setBanner(parent.id, null);
        onToggleComplete(parent.id);
      },
    };
    const show = showIt(parent);
    showToast(`All linked tasks are done. “${parent.title}” is hidden by your filters.`, 'info', show ? [complete, show] : complete);
  };

  // A parent in a trail or a linked-task chip: scroll to its card, or say the filters hide it.
  const goToTask = (id: number) => {
    if (flash(id)) return;
    const task = byId.get(id);
    if (task) hiddenToast(task, `“${task.title}” is hidden by your filters.`);
    else showToast('That task is no longer in your list.', 'info');
  };

  useEffect(() => {
    if (goToWhenShown.current != null && flash(goToWhenShown.current)) goToWhenShown.current = null;
  }, [tasks, flash]);

  // Completing a task with open linked tasks asks first; finishing a task's
  // last open linked task suggests completing that task. Both work at any depth.
  const handleToggleComplete = (id: number) => {
    const task = byId.get(id);
    if (task) {
      if (!task.completed && openUnder(id) > 0) {
        setBanner(id, 'open');
        return;
      }
      setBanner(id, null);
      const parent = task.parent_task_id != null ? byId.get(task.parent_task_id) : undefined;
      if (parent) {
        const finishesLast = !task.completed && !parent.completed && openUnder(parent.id) === 1;
        setBanner(parent.id, finishesLast ? 'alldone' : null);
        if (finishesLast) setTimeout(() => { if (!flash(parent.id, 'nearest')) allDoneToast(parent); }, 50);
      }
    }
    onToggleComplete(id);
  };

  const requestRemove = (task: Task, verb: 'delete' | 'archive') => {
    const linked = childrenOf(task.id).map(c => ({ task: c, under: descendantsOf(c.id) }));
    if (linked.length > 0) setRemoving({ task, verb, linked });
    else if (verb === 'delete') onDeleteTask(task);
    else onArchiveTask(task);
  };

  const confirmRemove = (linked: LinkedRemoveMode) => {
    if (!removing) return;
    setBanner(removing.task.id, null);
    if (removing.verb === 'delete') onDeleteTask(removing.task, linked);
    else onArchiveTask(removing.task, linked);
    if (addingTo === removing.task.id) setAddingTo(null);
    setRemoving(null);
  };

  const trailOf = (task: Task): TrailItem[] =>
    parentChain(byId, task).map(p => ({ ...p, completed: byId.get(p.id)?.completed }));

  const created = (task: Task, parent: Task, more: boolean) => {
    if (!more) setAddingTo(null);
    // Wait for the new card to render before looking for it.
    setTimeout(() => {
      if (flash(task.id, more ? 'nearest' : 'center')) {
        showToast(`Created “${task.title}” under “${parent.title}”.`, 'success');
      } else {
        hiddenToast(task, `Created “${task.title}”. It’s hidden by your filters.`);
      }
    }, 50);
  };

  // A banner shows only while its question still applies (a failed toggle
  // rolls the list back, which quietly drops it). A linked-task question
  // comes before Canvas's.
  const bannerFor = (task: Task) => {
    const kind = banners[task.id];
    const open = openUnder(task.id);
    const applies = !task.completed && childrenOf(task.id).length > 0 && (kind === 'open' ? open > 0 : open === 0);
    if (!kind || !applies) {
      if (!canvasSubmitted?.shows(task)) return null;
      return (
        <CanvasSubmittedBanner
          title={task.title}
          doneAs={canvasSubmitted.doneAs?.(task)}
          onComplete={() => handleToggleComplete(task.id)}
          onNotYet={() => canvasSubmitted.onNotYet(task.id)}
        />
      );
    }
    return (
      <LinkedTaskBanner
        kind={kind}
        title={task.title}
        openCount={open}
        onCompleteAll={() => { setBanner(task.id, null); onCompleteWithLinked(task.id); }}
        onCompleteOne={() => { setBanner(task.id, null); onToggleComplete(task.id); }}
        onDismiss={() => setBanner(task.id, null)}
      />
    );
  };

  const addingParent = addingTo != null ? byId.get(addingTo) : undefined;
  const inlineForm = addingParent && onCreateLinkedTask && (
    <LinkedTaskInlineForm
      key={addingParent.id}
      parent={addingParent}
      parents={trailOf(addingParent)}
      tags={tags}
      // The new task will be active too, so it can take the next free rank.
      activeTaskCount={activeTaskCount + 1}
      usedPriorityLevels={occupiedPriorities}
      onCreate={form => onCreateLinkedTask(addingParent, form)}
      onCreated={(task, more) => created(task, addingParent, more)}
      onCancel={() => setAddingTo(null)}
    />
  );
  // A parent the filters hide (say, completed elsewhere) keeps its open form at the top.
  const formShownInList = addingParent != null && tasks.some(t => t.id === addingParent.id);

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
      {tasks.length === 0 && !inlineForm ? (
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
          ref={listRef}
          className="flex flex-col gap-2 overflow-y-auto h-[50vh] lg:h-[600px] pl-2 pr-1 py-1 scrollbar-custom"
          data-panel-body
          style={heightPx ? { height: `${heightPx}px` } : undefined}
        >
          {!formShownInList && inlineForm}
          {tasks.map((task, i) => (
            <React.Fragment key={task.id}>
              <TaskItem
                task={task}
                index={i}
                parents={trailOf(task)}
                linked={childrenOf(task.id).map(c => ({ task: c, linkedCount: childrenOf(c.id).length }))}
                onGoToTask={goToTask}
                onAddLinked={onCreateLinkedTask && (t => {
                  setAddingTo(t.id);
                  // Already open: bring it back into view.
                  if (addingTo === t.id) cardOf(t.id)?.nextElementSibling?.scrollIntoView?.({ block: 'nearest' });
                })}
                banner={bannerFor(task)}
                onToggleComplete={handleToggleComplete}
                tags={tags}
                onDeleteTask={t => requestRemove(t, 'delete')}
                onArchiveTask={t => requestRemove(t, 'archive')}
                onUpdatePriority={onUpdatePriority}
                onEditTask={onEditTask}
                activeTaskCount={activeTaskCount}
                occupiedPriorities={occupiedPriorities}
                compact={compact}
                pending={pendingTaskIds?.has(task.id)}
              />
              {formShownInList && addingParent.id === task.id && inlineForm}
            </React.Fragment>
          ))}
        </div>
      )}

      {removing && (
        <RemoveLinkedTasksDialog
          verb={removing.verb}
          title={removing.task.title}
          linked={removing.linked}
          onConfirm={confirmRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
};

export default TasksPanel;
