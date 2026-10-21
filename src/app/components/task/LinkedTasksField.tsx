import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, CornerDownRight, GripVertical, Info, Plus, Search, Timer, X,
} from 'lucide-react';
import { Task } from '@/app/types/task';
import { formatDueDate, formatDueDateShort, getDueStatus } from '@/app/utils/taskUtils';
import { formatDuration } from '@/app/utils/duration';
import {
  LINKED_TITLE_MAX, LinkCandidate, LinkedDraft, dueDateStr, linkCandidates, moveItem,
} from '@/app/utils/linkedTasks';
import { LinkedProgressBar } from './LinkedTasksList';
import TaskStatusChip from './TaskStatusChip';

interface LinkedTasksFieldProps {
  /** Every loaded (active) task. */
  allTasks: Task[];
  /** The task being edited; null while creating one. */
  parentId: number | null;
  /** The edited task's own parent as the form has it now (null once unlinked). */
  parentOfParent?: number | null;
  /** The edited task's due date, for the "due after this task" warning. */
  parentDueDate: string | Date | null;
  drafts: LinkedDraft[];
  onChange: (drafts: LinkedDraft[]) => void;
  /** Wording for the save button the hints refer to. */
  mode: 'create' | 'edit';
  /** Why saving the list failed, shown under it. */
  error?: string | null;
}

let nextDraftKey = 0;

const draftKey = (d: LinkedDraft) => (d.kind === 'existing' ? `task-${d.id}` : d.key);

interface RowData {
  title: string;
  done: boolean;
  due: string | null;
  estimate: number | null;
  isNew: boolean;
}

/**
 * The "Linked tasks" section of the create and edit task forms: tasks that
 * lead up to completing this one. Links existing tasks through a searchable
 * picker, adds new ones by title (created on save, with this task's tags),
 * reorders them by drag or ↑/↓, and unlinks them with × (the task itself
 * stays). Shows "x of y done" progress, the summed estimate and a warning
 * when a linked task is due after this one. Saving is the form's job.
 */
const LinkedTasksField: React.FC<LinkedTasksFieldProps> = ({
  allTasks, parentId, parentOfParent = null, parentDueDate, drafts, onChange, mode, error,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [newTitle, setNewTitle] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; after: boolean } | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const gripRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const newInputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(allTasks.map(t => [t.id, t])), [allTasks]);
  // A row whose task has since been deleted or archived elsewhere drops out.
  const visible = drafts.filter(d => d.kind === 'new' || byId.has(d.id));
  const rows: RowData[] = visible.map(d => {
    if (d.kind === 'new') return { title: d.title, done: false, due: null, estimate: null, isNew: true };
    const t = byId.get(d.id)!;
    return {
      title: t.title,
      done: t.completed,
      due: dueDateStr(t.due_date),
      estimate: t.estimated_time ?? null,
      isNew: false,
    };
  });

  const candidates = useMemo(
    () => (open ? linkCandidates(allTasks, { parentId, parentOfParent, drafts, query }) : []),
    [open, allTasks, parentId, parentOfParent, drafts, query],
  );
  const pickable = candidates.filter(c => c.ok);
  const blocked = candidates.filter(c => !c.ok);
  const activeIndex = Math.min(active, pickable.length - 1);

  const total = rows.length;
  const done = rows.filter(r => r.done).length;
  const estimate = rows.reduce((sum, r) => sum + (r.estimate ?? 0), 0);
  const newCount = rows.filter(r => r.isNew).length;
  const parentDue = dueDateStr(parentDueDate);
  const isLate = (r: RowData) => !r.done && !!r.due && !!parentDue && r.due > parentDue;
  const late = rows.filter(isLate);
  const saveWord = mode === 'create' ? 'create' : 'save';

  const move = (from: number, to: number) => onChange(moveItem(visible, from, to));

  const pick = (c: LinkCandidate) => {
    if (!c.ok) return;
    onChange([...visible, { kind: 'existing', id: c.task.id }]);
    setQuery('');
    setActive(0);
    setOpen(false);
  };

  const addNew = () => {
    const title = newTitle.trim();
    if (!title) return;
    onChange([...visible, { kind: 'new', key: `new-${++nextDraftKey}`, title }]);
    setNewTitle('');
    newInputRef.current?.focus();
  };

  const rename = (index: number, title: string) =>
    onChange(visible.map((d, i) => (i === index && d.kind === 'new' ? { ...d, title } : d)));

  const remove = (index: number) => onChange(visible.filter((_, i) => i !== index));

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(open ? Math.min(activeIndex + 1, pickable.length - 1) : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter picks a task here; it never submits the form.
      e.preventDefault();
      if (open && pickable[activeIndex]) pick(pickable[activeIndex]);
    } else if (e.key === 'Escape' && open) {
      // Close just the list, not the modal around it.
      e.stopPropagation();
      setOpen(false);
    }
  };

  const onGripKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const to = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= visible.length) return;
    move(index, to);
    // Keep focus on the moved row's grip once it has re-rendered in its new place.
    setTimeout(() => gripRefs.current[to]?.focus());
  };

  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
    setArmed(null);
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragFrom == null) return;
    let to = dropAt?.after ? index + 1 : index;
    if (dragFrom < to) to -= 1;
    move(dragFrom, to);
    endDrag();
  };

  const optionId = (c: LinkCandidate) => `linked-option-${c.task.id}`;

  const renderOption = (c: LinkCandidate, index: number | null) => {
    const due = dueDateStr(c.task.due_date);
    const dueStatus = getDueStatus(c.task);
    const selected = index !== null && index === activeIndex;
    return (
      <li
        key={c.task.id}
        id={optionId(c)}
        role="option"
        aria-selected={selected}
        aria-disabled={!c.ok}
        onMouseDown={e => e.preventDefault()}
        onClick={() => pick(c)}
        onMouseEnter={() => index !== null && setActive(index)}
        className={`flex items-center gap-2 rounded-md p-2 ${
          c.ok ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'
        } ${selected ? 'bg-[var(--tm-surface-raised)]' : ''}`}
      >
        <CheckBox done={c.task.completed} />
        <span className="flex-1 min-w-0">
          <span className={`block truncate text-sm font-medium ${c.task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
            {c.task.title}
          </span>
          {c.note && (
            <span
              className="block text-xs"
              style={{ color: c.moves ? 'var(--tm-warning)' : 'var(--tm-text-muted)' }}
            >
              {c.moves && '↪ '}{c.note}
            </span>
          )}
        </span>
        {dueStatus ? (
          <TaskStatusChip status={dueStatus} size="sm" />
        ) : due && (
          <span className="flex-shrink-0 text-xs whitespace-nowrap text-text-muted">
            {formatDueDate(due)}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span id="linked-tasks-label" className="block text-sm font-medium text-text-secondary">
            Linked tasks <span className="font-normal text-text-muted">(optional)</span>
          </span>
          {total > 0 && (
            <span className="text-[13px] font-semibold text-text-secondary whitespace-nowrap">
              {done} of {total} done
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mt-1">Tasks that need to happen before this one is finished.</p>
      </div>

      {total > 0 && <LinkedProgressBar done={done} total={total} />}

      <ul
        aria-labelledby="linked-tasks-label"
        className="list-none flex flex-col gap-1 rounded-xl border border-border p-1.5"
        style={{ backgroundColor: 'var(--tm-surface-raised)' }}
      >
        {total === 0 && (
          <li className="px-3 py-3.5 text-center text-[13px] text-text-muted">
            No linked tasks yet. Find an existing task or add a new one below.
          </li>
        )}
        {visible.map((d, i) => {
          const r = rows[i];
          const lateRow = isLate(r);
          const dropLine = dropAt?.index === i && dragFrom !== null && dragFrom !== i
            ? `inset 0 ${dropAt.after ? '-2px' : '2px'} 0 var(--tm-accent)`
            : undefined;
          return (
            <li
              key={draftKey(d)}
              draggable={armed === i}
              onDragStart={e => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragOver={e => {
                if (dragFrom == null) return;
                e.preventDefault();
                const box = e.currentTarget.getBoundingClientRect();
                setDropAt({ index: i, after: e.clientY > box.top + box.height / 2 });
              }}
              onDrop={e => onDrop(e, i)}
              onDragEnd={endDrag}
              className="flex items-center gap-2 rounded-lg border border-border-subtle px-2 py-[7px]"
              style={{
                backgroundColor: 'var(--tm-surface)',
                opacity: dragFrom === i ? 0.4 : 1,
                boxShadow: dropLine,
              }}
            >
              <button
                type="button"
                ref={el => { gripRefs.current[i] = el; }}
                onPointerDown={() => setArmed(i)}
                onPointerUp={() => dragFrom == null && setArmed(null)}
                onKeyDown={e => onGripKeyDown(e, i)}
                className="btn btn-ghost p-0.5 flex-shrink-0 cursor-grab text-text-muted"
                aria-label={`Reorder ${r.title || 'new task'}. Use the up and down arrow keys`}
                title="Drag, or use ↑/↓"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
              <CheckBox done={r.done} />
              <span className="flex-1 min-w-0">
                {r.isNew ? (
                  <input
                    type="text"
                    value={r.title}
                    maxLength={LINKED_TITLE_MAX}
                    onChange={e => rename(i, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                    aria-label="New linked task title"
                    className="w-full border-0 bg-transparent p-0 text-sm font-medium text-text-primary outline-none"
                  />
                ) : (
                  <span className={`block truncate text-sm font-medium ${r.done ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                    {r.title}
                  </span>
                )}
              </span>
              {r.isNew && <NewBadge />}
              {r.due && (
                <span
                  className="flex-shrink-0 inline-flex items-center gap-1 text-xs whitespace-nowrap"
                  style={{ color: lateRow ? 'var(--tm-warning)' : 'var(--tm-text-muted)' }}
                  title={lateRow ? 'Due after this task' : 'Due'}
                >
                  {lateRow && <AlertTriangle className="w-3 h-3" />}
                  {formatDueDateShort(r.due)}
                </span>
              )}
              {r.estimate != null && (
                <span className="hidden sm:inline flex-shrink-0 text-xs whitespace-nowrap text-text-muted">
                  {formatDuration(Number(r.estimate))}
                </span>
              )}
              <span className="flex items-center flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  className="btn btn-ghost p-1 hidden sm:inline-flex disabled:opacity-30"
                  aria-label={`Move ${r.title || 'new task'} up`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === total - 1}
                  className="btn btn-ghost p-1 hidden sm:inline-flex disabled:opacity-30"
                  aria-label={`Move ${r.title || 'new task'} down`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="btn btn-ghost p-1 hover:text-[var(--tm-danger)]"
                  aria-label={`Remove ${r.title || 'new task'}`}
                  title={r.isNew ? 'Remove' : 'Unlink (the task itself stays)'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-2">
        <span id="linked-search-label" className="text-[13px] font-medium text-text-secondary">
          Link a task you already have
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="linked-options"
            aria-autocomplete="list"
            aria-labelledby="linked-search-label"
            aria-activedescendant={open && pickable[activeIndex] ? optionId(pickable[activeIndex]) : undefined}
            autoComplete="off"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search your tasks by title…"
            className="input-field pl-10"
          />
          {open && (
            <ul
              id="linked-options"
              role="listbox"
              aria-labelledby="linked-search-label"
              className="card-glass list-none absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[300px] overflow-auto scrollbar-custom p-1.5"
              style={{ backgroundColor: 'var(--tm-surface)', boxShadow: 'var(--tm-shadow-lg)' }}
            >
              {candidates.length === 0 && (
                <li className="px-3 py-3.5 text-center text-[13px] text-text-muted">
                  {query.trim()
                    ? <>No tasks match “{query.trim()}”. Add it as a new task below.</>
                    : 'No other tasks to link yet.'}
                </li>
              )}
              {pickable.map((c, i) => renderOption(c, i))}
              {blocked.length > 0 && (
                <li role="presentation" className="px-2 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  Can&apos;t be linked here
                </li>
              )}
              {blocked.map(c => renderOption(c, null))}
            </ul>
          )}
        </div>

        <span id="linked-new-label" className="mt-1 text-[13px] font-medium text-text-secondary">
          Or create a new task and link it
        </span>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
            <input
              ref={newInputRef}
              type="text"
              value={newTitle}
              maxLength={LINKED_TITLE_MAX}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addNew(); }
              }}
              placeholder="New task title, e.g. Draft cover letter"
              aria-labelledby="linked-new-label"
              aria-describedby="linked-new-hint"
              className="input-field pl-10"
            />
          </div>
          <button type="button" onClick={addNew} className="btn btn-secondary px-4">Add</button>
        </div>
        <p id="linked-new-hint" className="text-xs text-text-muted">
          Type just the title. It&apos;s added to the list above as <NewBadge />, and the task is created
          when you {saveWord} this one, with this task&apos;s tags. You can fill in its other details later.
        </p>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <Timer className="w-3 h-3" />
            {estimate > 0 ? `${formatDuration(estimate)} estimated across linked tasks` : 'No estimates yet'}
          </span>
          {newCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Plus className="w-3 h-3" />
              {newCount === 1 ? '1 new task' : `${newCount} new tasks`} created on save, with this task&apos;s tags
            </span>
          )}
        </div>
      )}

      {late.length > 0 && (
        <Callout tone="warning">
          {late.map((r, i) => (
            <React.Fragment key={i}>{i > 0 && ', '}<b>{r.title}</b></React.Fragment>
          ))}{' '}
          {late.length === 1 ? 'is' : 'are'} due after this task ({formatDueDateShort(parentDue)}). Saving is still allowed.
        </Callout>
      )}

      {error && <Callout tone="danger" role="alert">{error}</Callout>}
    </div>
  );
};

/** Read-only done box for a row; linked tasks are checked off from the task list. */
const CheckBox: React.FC<{ done: boolean }> = ({ done }) => (
  <span
    role="img"
    aria-label={done ? 'Done' : 'Not done'}
    className={`flex-shrink-0 w-4 h-4 rounded-sm border-2 flex items-center justify-center ${
      done ? 'border-[var(--tm-success)] bg-[var(--tm-success)]' : 'border-border'
    }`}
  >
    {done && <Check className="w-2.5 h-2.5 text-white" />}
  </span>
);

const NewBadge: React.FC = () => (
  <span
    className="inline-block flex-shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide align-middle"
    style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
    title="Created when you save"
  >
    New
  </span>
);

const Callout: React.FC<{ tone: 'warning' | 'danger' | 'info'; role?: string; children: React.ReactNode }> = ({
  tone, role, children,
}) => {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      role={role}
      className="flex gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug text-text-primary"
      style={{ backgroundColor: `var(--tm-${tone === 'info' ? 'accent' : tone}-subtle)` }}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: `var(--tm-${tone === 'info' ? 'accent' : tone})` }} />
      <div>{children}</div>
    </div>
  );
};

/**
 * "Leads up to [parent] [Unlink]" on the edit form of a linked task. Unlinking
 * turns it back into a standalone task when the form is saved; until then it
 * can be undone.
 */
export const LeadsUpToField: React.FC<{
  parentTitle: string | null;
  unlinked: boolean;
  onUnlink: () => void;
  onUndo: () => void;
}> = ({ parentTitle, unlinked, onUnlink, onUndo }) => (
  <div>
    <span className="block text-sm font-medium text-text-secondary mb-2">Leads up to</span>
    <div
      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2"
      style={{ backgroundColor: 'var(--tm-surface)' }}
    >
      <CornerDownRight className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
      <span className={`flex-1 min-w-0 truncate text-sm font-medium ${unlinked ? 'line-through text-text-muted' : 'text-text-primary'}`}>
        {parentTitle ?? 'Another task'}
      </span>
      <button type="button" onClick={unlinked ? onUndo : onUnlink} className="btn btn-outline px-3 py-1 text-sm">
        {unlinked ? 'Undo' : 'Unlink'}
      </button>
    </div>
    <p className="text-xs text-text-muted mt-1">
      {unlinked
        ? 'Unlinked. Save to make it a standalone task again.'
        : 'Unlinking turns it back into a standalone task.'}
    </p>
  </div>
);

/** Shown instead of the Linked tasks section on a task that is itself linked. */
export const LinkedDepthNote: React.FC<{ parentTitle: string | null }> = ({ parentTitle }) => (
  <Callout tone="info">
    This task is one of the linked tasks of <b>{parentTitle ?? 'another task'}</b>, so it can&apos;t have
    linked tasks of its own: links go one level deep. Unlink it above to give it its own.
  </Callout>
);

export default LinkedTasksField;
