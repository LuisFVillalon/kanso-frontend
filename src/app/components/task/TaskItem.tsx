import React, { useState, useRef, useEffect } from 'react';
import { Archive, Check, Timer, Trash2, Calendar, SquarePen, GraduationCap, ExternalLink, Plus } from 'lucide-react';
import { Task } from '@/app/types/task';
import {
  getDueStatus,
  getDurationColor,
  formatTime12Hour,
  formatDueDateShort,
  PRIORITY_COLORS,
  toInkTone,
} from '@/app/utils/taskUtils';
import { toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';
import { formatDuration } from '@/app/utils/duration';
import { canvasCourseLabel } from '@/app/utils/canvasTasks';
import PriorityPicker from './PriorityPicker';
import TaskTags from './TaskTags';
import TaskStatusChip from './TaskStatusChip';
import LinkedTasksSummary, { LinkedChip, LinkedCountPill } from './LinkedTasksSummary';
import ParentTrail, { TrailItem } from './ParentTrail';

/** "From Canvas · CS 460 ↗": opens the assignment a task added from Canvas follows. */
const FromCanvasLink: React.FC<{ url: string; className?: string }> = ({ url, className = '' }) => {
  const course = canvasCourseLabel(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Canvas"
      className={`inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline min-w-0 ${className}`}
    >
      <GraduationCap className="w-3 h-3 flex-shrink-0" aria-hidden />
      <span className="truncate">From Canvas{course ? ` · ${course}` : ''}</span>
      <ExternalLink className="w-3 h-3 flex-shrink-0" aria-hidden />
    </a>
  );
};

/** On a task the Canvas sync completed because Canvas shows its assignment done; never on one completed by hand. */
const DoneInCanvasBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap bg-success-subtle text-success-text ${className}`}
    title="Completed for you because Canvas shows this assignment done"
  >
    <Check className="w-3 h-3 flex-shrink-0" strokeWidth={3} aria-hidden />
    Done in Canvas
  </span>
);

interface TaskItemProps {
  task: Task;
  index: number;
  onToggleComplete?: (id: number) => void;
  tags: Array<{ id: number; name: string; color: string }>;
  onDeleteTask?: (task: Task) => void;
  onArchiveTask?: (task: Task) => void;
  onUpdatePriority?: (id: number, priority: number | null) => void;
  onEditTask?: (task: Task) => void;
  activeTaskCount?: number;
  occupiedPriorities?: number[];
  compact?: boolean;
  /** True while a toggle-complete, archive or delete request for this task is in flight. */
  pending?: boolean;
  /** The tasks above this one, from its original task down to the task before it (see parentChain). */
  parents?: TrailItem[];
  /** This task's own linked tasks, each also a card in the list. */
  linked?: LinkedChip[];
  /** Scrolls to another task's card (a parent in the trail, or a linked task). */
  onGoToTask?: (id: number) => void;
  /** Opens the "New linked task" form under this card. */
  onAddLinked?: (task: Task) => void;
  /** A completion question shown at the bottom of the card (see LinkedTaskBanner). */
  banner?: React.ReactNode;
}

const TaskItem: React.FC<TaskItemProps> = ({
  task,
  index,
  onToggleComplete,
  tags,
  onDeleteTask,
  onArchiveTask,
  onUpdatePriority,
  onEditTask,
  activeTaskCount,
  occupiedPriorities = [],
  compact = false,
  pending = false,
  parents = [],
  linked = [],
  onGoToTask,
  onAddLinked,
  banner,
}) => {
  const maxPriority = activeTaskCount ?? Object.keys(PRIORITY_COLORS).length;

  const availablePriorities = React.useMemo(() => {
    const max = activeTaskCount ?? Object.keys(PRIORITY_COLORS).length;
    const takenByOthers = occupiedPriorities.filter(p => p !== task.priority);
    return Array.from({ length: max }, (_, i) => i + 1).filter(
      p => !takenByOthers.includes(p)
    );
  }, [activeTaskCount, occupiedPriorities, task.priority]);

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const hasLinked = linked.length > 0;
  const linkedDone = linked.filter(c => c.task.completed).length;
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);

  const descriptionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;

    const checkOverflow = () => {
      const computed = window.getComputedStyle(el);
      const lineHeight = parseFloat(computed.lineHeight);
      setDescriptionOverflows(el.scrollHeight > lineHeight * 2 + 1);
    };

    checkOverflow();
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);
    window.addEventListener('resize', checkOverflow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [task.description]);

  const normalizedDueDate: string | null =
    task.due_date instanceof Date ? toLocalDateStr(task.due_date) : (task.due_date ?? null);

  const normalizedDueTime: string | null =
    task.due_time instanceof Date ? toLocalTimeStr(task.due_time) : (task.due_time ?? null);

  // The backend only stores https links; anything else isn't rendered as a link.
  const canvasUrl = task.canvas_html_url?.startsWith('https://') ? task.canvas_html_url : null;
  const doneInCanvas = task.completed && !!task.completed_by_canvas;

  const dueStatus = getDueStatus(task);
  const actualDueDateText = normalizedDueDate ? formatDueDateShort(normalizedDueDate) : null;

  if (compact) {
    return (
      <div
        data-task-id={task.id}
        className={`card-glass px-3 py-2 animate-fade-in ${task.completed ? 'opacity-75' : ''}`}
        style={{ animationDelay: `${index * 0.05}s` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onToggleComplete?.(task.id)}
            disabled={pending}
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            style={{ opacity: pending ? 0.5 : 1, cursor: pending ? 'wait' : 'pointer' }}
            className={`flex-shrink-0 w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-all active:scale-90 ${
              task.completed
                ? 'border-[var(--tm-success)] bg-[var(--tm-success-subtle)]'
                : 'border-border hover:border-accent'
            }`}
          >
            {task.completed && <Check className="w-2.5 h-2.5 text-success-text" strokeWidth={3} />}
          </button>

          <span
            className={`flex-1 min-w-0 text-sm font-semibold truncate ${
              task.completed ? 'line-through text-text-muted' : 'text-text-primary'
            }`}
            title={task.title}
          >
            {task.title}
          </span>

          {hasLinked && <LinkedCountPill done={linkedDone} total={linked.length} />}

          {onAddLinked && !task.completed && (
            <button
              type="button"
              onClick={() => onAddLinked(task)}
              className="btn btn-ghost p-1 flex-shrink-0"
              title="Add a linked task"
              aria-label={`Add a linked task to ${task.title}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          <PriorityPicker
            priority={task.priority}
            maxPriority={maxPriority}
            availablePriorities={availablePriorities}
            onSelect={(priority) => onUpdatePriority?.(task.id, priority)}
            size="sm"
          />

          <button
            onClick={() => onEditTask?.(task)}
            className="btn btn-ghost p-1 flex-shrink-0"
            title="Edit task"
            aria-label="Edit task"
          >
            <SquarePen className="w-3.5 h-3.5" />
          </button>

          {onArchiveTask && (
            <button
              onClick={() => onArchiveTask(task)}
              disabled={pending}
              className="btn btn-ghost p-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
              title="Archive task"
              aria-label="Archive task"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => onDeleteTask?.(task)}
            disabled={pending}
            className="btn btn-danger-ghost p-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
            title="Delete task"
            aria-label="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Its own line, so a long title never squeezes the trail out. */}
        {parents.length > 0 && (
          <div className="flex mt-1 pl-6 min-w-0">
            <ParentTrail chain={parents} onOpen={onGoToTask} maxShown={2} className="max-w-full" />
          </div>
        )}
        <TaskTags tags={task.tags} allTags={tags} className="mt-1.5 pl-6" />
        {(canvasUrl || doneInCanvas) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 ml-6 min-w-0">
            {canvasUrl && <FromCanvasLink url={canvasUrl} />}
            {doneInCanvas && <DoneInCanvasBadge />}
          </div>
        )}
        {banner}
      </div>
    );
  }

  return (
    <div
      data-task-id={task.id}
      className={`card-glass p-4 sm:p-6 animate-fade-in ${task.completed ? 'opacity-75' : ''}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          onClick={() => onToggleComplete?.(task.id)}
          disabled={pending}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          style={{ opacity: pending ? 0.5 : 1, cursor: pending ? 'wait' : 'pointer' }}
          className={`mt-0.5 sm:mt-1 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-sm border-2 flex items-center justify-center transition-all active:scale-90 ${
            task.completed
              ? 'border-[var(--tm-success)] bg-[var(--tm-success-subtle)]'
              : 'border-border hover:border-accent'
          }`}
        >
          {task.completed && <Check className="w-3 h-3 sm:w-4 sm:h-4 text-success-text" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 sm:gap-4 mb-1.5 sm:mb-2">
            <div className="min-w-0">
              <h3
                className={`text-base sm:text-lg font-semibold leading-snug ${
                  task.completed ? 'text-text-muted line-through' : 'text-text-primary'
                }`}
              >
                {task.title}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {task.category && (
                <span
                  className="chip rounded-full text-xs font-bold uppercase tracking-wide px-2.5 py-1"
                  style={{
                    backgroundColor: 'var(--tm-accent-subtle)',
                    color: 'var(--tm-accent)',
                  }}
                >
                  {task.category}
                </span>
              )}

              <PriorityPicker
                priority={task.priority}
                maxPriority={maxPriority}
                availablePriorities={availablePriorities}
                onSelect={(priority) => onUpdatePriority?.(task.id, priority)}
                size="md"
              />

              <button
                onClick={() => onEditTask?.(task)}
                className="btn btn-ghost p-1.5"
                title="Edit task"
                aria-label="Edit task"
              >
                <SquarePen className="w-4 h-4" />
              </button>

              {onArchiveTask && (
                <button
                  onClick={() => onArchiveTask(task)}
                  disabled={pending}
                  className="btn btn-ghost p-1.5 disabled:opacity-50 disabled:cursor-wait"
                  title="Archive task"
                  aria-label="Archive task"
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => onDeleteTask?.(task)}
                disabled={pending}
                className="btn btn-danger-ghost p-1.5 disabled:opacity-50 disabled:cursor-wait"
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Its own line under the title, so the trail gets the card's full width. */}
          {parents.length > 0 && (
            <div className="flex -mt-1 mb-2 min-w-0">
              <ParentTrail chain={parents} onOpen={onGoToTask} variant="card" maxShown={2} className="max-w-full" />
            </div>
          )}

          {task.description && (
            <div className="relative mb-3 pl-3 border-l-2 border-border-subtle">
              <p
                ref={descriptionRef}
                className={`text-xs sm:text-sm leading-relaxed ${
                  !isDescriptionExpanded ? 'line-clamp-2 pr-20' : ''
                } ${
                  task.completed ? 'line-through text-text-muted' : 'text-text-secondary'
                }`}
              >
                {task.description}
              </p>

              {descriptionOverflows && !isDescriptionExpanded && (
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded(true)}
                  className="absolute bottom-0 right-0 pl-2 text-[11px] font-semibold text-text-muted hover:text-text-primary transition-colors bg-surface"
                  aria-label="Expand task description"
                >
                  See more
                </button>
              )}

              {descriptionOverflows && isDescriptionExpanded && (
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded(false)}
                  className="mt-1 text-[11px] font-semibold text-text-muted hover:text-text-primary transition-colors"
                  aria-label="Collapse task description"
                >
                  See less
                </button>
              )}
            </div>
          )}

          <TaskTags tags={task.tags} allTags={tags} className="mb-3" />

          <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 flex-wrap">
              {dueStatus ? (
                <TaskStatusChip status={dueStatus} />
              ) : (
                <span className="flex items-center gap-1.5 text-text-muted">
                  <Calendar className="w-3.5 h-3.5" aria-hidden />
                  {actualDueDateText ?? 'No date'}
                </span>
              )}
              {dueStatus && actualDueDateText && (
                <span className="text-text-muted">{actualDueDateText}</span>
              )}
              {normalizedDueTime && (
                <span className="text-text-muted">
                  {'· '}
                  {formatTime12Hour(typeof task.due_time === 'string' ? task.due_time : null)}
                </span>
              )}
            </div>

            {task.estimated_time != null && (
              <div className="flex items-center gap-1.5">
                <Timer className={`w-3.5 h-3.5 ${toInkTone(getDurationColor(Number(task.estimated_time)))}`} />
                <span className={toInkTone(getDurationColor(Number(task.estimated_time)))}>
                  {formatDuration(Number(task.estimated_time))}
                </span>
              </div>
            )}

            {canvasUrl && <FromCanvasLink url={canvasUrl} />}
            {doneInCanvas && <DoneInCanvasBadge />}

            {onAddLinked && !task.completed && (
              <button
                type="button"
                onClick={() => onAddLinked(task)}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12.5px] font-medium text-accent hover:bg-[var(--tm-accent-subtle)]"
                aria-label={`Add a linked task to ${task.title}`}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Linked task
              </button>
            )}
          </div>

          {hasLinked && onGoToTask && <LinkedTasksSummary linked={linked} onGoTo={onGoToTask} />}
          {banner}
        </div>
      </div>
    </div>
  );
};

export default TaskItem;
