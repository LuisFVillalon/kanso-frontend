import React from 'react';
import { Check, ChevronDown, ChevronRight, SquarePen } from 'lucide-react';
import { Task } from '@/app/types/task';
import { formatDueDate, getDueColor, getPriorityBadgeStyle, toInkTone } from '@/app/utils/taskUtils';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { formatDuration } from '@/app/utils/duration';

interface LinkedTasksListProps {
  /** The linked tasks to render (may be a filtered subset of the total). */
  linkedTasks: Task[];
  linkedDone: number;
  linkedTotal: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleComplete?: (id: number) => void;
  onEditTask?: (task: Task) => void;
  maxPriority: number;
  pendingTaskIds?: Set<number>;
  compact?: boolean;
}

export const LinkedProgressBar: React.FC<{ done: number; total: number; className?: string }> = ({
  done,
  total,
  className = '',
}) => (
  <div
    role="progressbar"
    aria-label="Linked tasks done"
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={done}
    className={`h-1.5 rounded-full overflow-hidden ${className}`}
    style={{ backgroundColor: 'var(--tm-surface-raised)' }}
  >
    <span
      className="block h-full rounded-full transition-[width] duration-300"
      style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: 'var(--tm-success)' }}
    />
  </div>
);

/** "2/5" pill shown on a compact card that has linked tasks. */
export const LinkedCountPill: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const allDone = done === total;
  return (
    <span
      className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      style={{
        backgroundColor: allDone ? 'var(--tm-success-subtle)' : 'var(--tm-surface-raised)',
        color: allDone ? 'var(--tm-success)' : 'var(--tm-text-secondary)',
      }}
      title={`${done} of ${total} linked tasks done`}
    >
      {done}/{total}
    </span>
  );
};

/** Chevron that collapses or expands a card's linked tasks. */
export const LinkedToggleButton: React.FC<{ expanded: boolean; onClick: () => void }> = ({ expanded, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="btn btn-ghost p-0.5 flex-shrink-0"
    aria-expanded={expanded}
    aria-label={expanded ? 'Hide linked tasks' : 'Show linked tasks'}
  >
    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
  </button>
);

const LinkedTaskRow: React.FC<{
  task: Task;
  compact: boolean;
  maxPriority: number;
  pending: boolean;
  onToggleComplete?: (id: number) => void;
  onEditTask?: (task: Task) => void;
}> = ({ task, compact, maxPriority, pending, onToggleComplete, onEditTask }) => {
  const dueDate = task.due_date instanceof Date ? toLocalDateStr(task.due_date) : task.due_date;
  const priorityStyle = task.priority != null ? getPriorityBadgeStyle(task.priority, maxPriority) : null;

  return (
    <li
      className={`group flex items-center gap-2.5 rounded-md hover:bg-[var(--tm-surface-raised)] ${
        compact ? 'px-1 py-0.5' : 'px-2 py-1.5'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggleComplete?.(task.id)}
        disabled={pending}
        aria-label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
        style={{ opacity: pending ? 0.5 : 1, cursor: pending ? 'wait' : 'pointer' }}
        className={`flex-shrink-0 w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-all active:scale-90 ${
          task.completed
            ? 'border-[var(--tm-success)] bg-[var(--tm-success)]'
            : 'border-border hover:border-accent'
        }`}
      >
        {task.completed && <Check className="w-2.5 h-2.5 text-white" />}
      </button>

      <span
        className={`flex-1 min-w-0 truncate text-sm font-medium ${
          task.completed ? 'line-through text-text-muted' : 'text-text-primary'
        }`}
      >
        {task.title}
      </span>

      {priorityStyle && (
        <span
          className="chip flex-shrink-0 font-bold"
          style={{
            backgroundColor: priorityStyle.bg,
            color: priorityStyle.text,
            padding: '0.1rem 0.45rem',
            borderRadius: '9999px',
            fontSize: '9px',
          }}
          title={`Priority ${task.priority}`}
        >
          {task.priority}
        </span>
      )}

      {!compact && !task.completed && dueDate && (
        <span className={`flex-shrink-0 text-xs whitespace-nowrap ${toInkTone(getDueColor(dueDate))}`}>
          {formatDueDate(dueDate)}
        </span>
      )}

      {!compact && !task.completed && task.estimated_time != null && (
        <span className="hidden sm:inline flex-shrink-0 text-xs whitespace-nowrap text-text-muted">
          {formatDuration(Number(task.estimated_time))}
        </span>
      )}

      <button
        type="button"
        onClick={() => onEditTask?.(task)}
        className="btn btn-ghost p-1 flex-shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        title="Edit task"
        aria-label={`Edit ${task.title}`}
      >
        <SquarePen className="w-3.5 h-3.5" />
      </button>
    </li>
  );
};

/**
 * The linked tasks nested under a parent card. The full card gets a
 * collapsible "Linked tasks · x of y done" header with a progress bar; the
 * compact card puts its toggle and count in the card's own row, so it only
 * renders the rows here.
 */
const LinkedTasksList: React.FC<LinkedTasksListProps> = ({
  linkedTasks,
  linkedDone,
  linkedTotal,
  expanded,
  onToggleExpanded,
  onToggleComplete,
  onEditTask,
  maxPriority,
  pendingTaskIds,
  compact = false,
}) => {
  const rows = expanded && linkedTasks.length > 0 && (
    <ul
      className={`list-none flex flex-col gap-0.5 border-l-2 border-border-subtle ${
        compact ? 'mt-1.5 ml-[22px] pl-2.5' : 'mt-1.5 ml-2 pl-3'
      }`}
    >
      {linkedTasks.map(t => (
        <LinkedTaskRow
          key={t.id}
          task={t}
          compact={compact}
          maxPriority={maxPriority}
          pending={pendingTaskIds?.has(t.id) ?? false}
          onToggleComplete={onToggleComplete}
          onEditTask={onEditTask}
        />
      ))}
    </ul>
  );

  if (compact) return rows || null;

  return (
    <div className="mt-3 pt-2.5 border-t border-border-subtle">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 rounded-md px-0.5 py-1 text-left hover:bg-[var(--tm-surface-raised)]"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />}
        <span className="text-sm font-semibold text-text-primary">Linked tasks</span>
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {linkedDone} of {linkedTotal} done
        </span>
        <LinkedProgressBar done={linkedDone} total={linkedTotal} className="flex-1 max-w-40 min-w-12" />
      </button>
      {rows}
    </div>
  );
};

export default LinkedTasksList;
