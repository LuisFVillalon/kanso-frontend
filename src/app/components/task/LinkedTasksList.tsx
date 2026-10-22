import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, SquarePen } from 'lucide-react';
import { Task } from '@/app/types/task';
import { TaskGroup, formatDueDateShort, getDueStatus, getPriorityBadgeStyle } from '@/app/utils/taskUtils';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { formatDuration } from '@/app/utils/duration';
import TaskStatusChip from './TaskStatusChip';
import ParentTrail from './ParentTrail';

/** Nesting deeper than this stops indenting further; each row's parent trail still says where it sits. */
const MAX_INDENT_DEPTH = 4;

/** What every row in the tree needs from the card. */
interface RowContext {
  onToggleComplete?: (id: number) => void;
  onEditTask?: (task: Task) => void;
  maxPriority: number;
  pendingTaskIds?: Set<number>;
  compact: boolean;
  /** The completion question a linked task with linked tasks of its own is asking, if any. */
  bannerFor?: (group: TaskGroup) => React.ReactNode;
}

interface LinkedTasksListProps extends Partial<Pick<RowContext, 'compact'>>, Omit<RowContext, 'compact'> {
  /** The linked tasks to render, each with its own (may be a filtered subset of the total). */
  linkedTasks: TaskGroup[];
  linkedDone: number;
  linkedTotal: number;
  /** The card's task, which these rows lead up to. */
  parent: Task;
  expanded: boolean;
  onToggleExpanded: () => void;
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
        color: allDone ? 'var(--tm-success-text)' : 'var(--tm-text-secondary)',
      }}
      title={`${done} of ${total} linked tasks done`}
    >
      {done}/{total}
    </span>
  );
};

/** Chevron that collapses or expands a task's linked tasks; `title` names the task for a nested row. */
export const LinkedToggleButton: React.FC<{ expanded: boolean; onClick: () => void; title?: string }> = ({
  expanded,
  onClick,
  title,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="btn btn-ghost p-0.5 flex-shrink-0"
    aria-expanded={expanded}
    aria-label={`${expanded ? 'Hide' : 'Show'} linked tasks${title ? ` of ${title}` : ''}`}
  >
    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
  </button>
);

/** Toggle-sized gap that keeps checkboxes lined up beside rows that have a toggle. */
const TOGGLE_SPACER = <span className="w-[18px] flex-shrink-0" aria-hidden />;

/** The rows for one level of the tree, each nesting its own linked tasks. */
const LinkedTaskTree: React.FC<{
  groups: TaskGroup[];
  /** The tasks above this level, from the card's task down to these rows' parent. */
  ancestors: Task[];
  depth: number;
  ctx: RowContext;
}> = ({ groups, ancestors, depth, ctx }) => {
  const nestedIndent = depth >= MAX_INDENT_DEPTH ? 'pl-1' : 'ml-[9px] pl-2.5';
  const listClass = depth === 0
    ? (ctx.compact ? 'mt-1.5 ml-[22px] pl-2.5' : 'mt-1.5 ml-2 pl-3')
    : `mt-0.5 ${nestedIndent}`;
  const anyNested = groups.some(g => g.linkedTotal > 0);

  return (
    <ul className={`list-none flex flex-col gap-0.5 border-l-2 border-border-subtle ${listClass}`}>
      {groups.map(g => (
        <LinkedTaskRow
          key={g.task.id}
          group={g}
          ancestors={ancestors}
          depth={depth}
          alignToggle={anyNested}
          ctx={ctx}
        />
      ))}
    </ul>
  );
};

const LinkedTaskRow: React.FC<{
  group: TaskGroup;
  ancestors: Task[];
  depth: number;
  /** True when a sibling has a toggle, so this row leaves room for one. */
  alignToggle: boolean;
  ctx: RowContext;
}> = ({ group, ancestors, depth, alignToggle, ctx }) => {
  const { task, linked, linkedDone, linkedTotal } = group;
  const { compact, maxPriority, pendingTaskIds, onToggleComplete, onEditTask, bannerFor } = ctx;
  const [expanded, setExpanded] = useState(true);
  const pending = pendingTaskIds?.has(task.id) ?? false;
  const hasLinked = linkedTotal > 0;
  const dueStatus = getDueStatus(task);
  const priorityStyle = task.priority != null ? getPriorityBadgeStyle(task.priority, maxPriority) : null;
  const openAncestor = (id: number) => {
    const ancestor = ancestors.find(a => a.id === id);
    if (ancestor) onEditTask?.(ancestor);
  };

  return (
    <li>
      <div
        className={`group flex items-center gap-2.5 rounded-md hover:bg-[var(--tm-surface-raised)] ${
          compact ? 'px-1 py-0.5' : 'px-2 py-1.5'
        }`}
      >
        {hasLinked
          ? <LinkedToggleButton expanded={expanded} onClick={() => setExpanded(v => !v)} title={task.title} />
          : alignToggle && TOGGLE_SPACER}

        <button
          type="button"
          onClick={() => onToggleComplete?.(task.id)}
          disabled={pending}
          aria-label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
          style={{ opacity: pending ? 0.5 : 1, cursor: pending ? 'wait' : 'pointer' }}
          className={`flex-shrink-0 w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-all active:scale-90 ${
            task.completed
              ? 'border-[var(--tm-success)] bg-[var(--tm-success-subtle)]'
              : 'border-border hover:border-accent'
          }`}
        >
          {task.completed && <Check className="w-2.5 h-2.5 text-success-text" strokeWidth={3} />}
        </button>

        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          <span
            className={`min-w-0 truncate text-sm font-medium ${
              task.completed ? 'line-through text-text-muted' : 'text-text-primary'
            }`}
          >
            {task.title}
          </span>
          {/* The nesting already shows the rest, so the row names just its own parent. */}
          <ParentTrail
            chain={ancestors.map(a => ({ id: a.id, title: a.title }))}
            onOpen={onEditTask && openAncestor}
            maxShown={1}
            className="flex-shrink-[3]"
          />
        </span>

        {hasLinked && <LinkedCountPill done={linkedDone} total={linkedTotal} />}

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

        {!compact && !task.completed && (dueStatus ? (
          <TaskStatusChip status={dueStatus} size="sm" />
        ) : task.due_date && (
          <span className="flex-shrink-0 text-xs whitespace-nowrap text-text-muted">
            {formatDueDateShort(toLocalDateStr(task.due_date))}
          </span>
        ))}

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
      </div>

      {bannerFor?.(group)}

      {expanded && linked.length > 0 && (
        <LinkedTaskTree groups={linked} ancestors={[...ancestors, task]} depth={depth + 1} ctx={ctx} />
      )}
    </li>
  );
};

/**
 * The linked tasks nested under a parent card, each with its own nested
 * under it at any depth. The full card gets a collapsible "Linked tasks · x
 * of y done" header with a progress bar; the compact card puts its toggle
 * and count in the card's own row, so it only renders the rows here.
 */
const LinkedTasksList: React.FC<LinkedTasksListProps> = ({
  linkedTasks,
  linkedDone,
  linkedTotal,
  parent,
  expanded,
  onToggleExpanded,
  compact = false,
  ...rest
}) => {
  const rows = expanded && linkedTasks.length > 0 && (
    <LinkedTaskTree groups={linkedTasks} ancestors={[parent]} depth={0} ctx={{ ...rest, compact }} />
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
