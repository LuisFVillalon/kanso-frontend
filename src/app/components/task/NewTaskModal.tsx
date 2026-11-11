import React, { useCallback, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { BaseTaskForm, LinkedTaskRef, Tag, Task } from '@/app/types/task';
import type { Habit } from '@/app/types/habit';
import TaskFormFields, { TaskFormData } from './TaskFormFields';
import LinkedTasksField, { type LinkedPlan } from './LinkedTasksField';
import WhenToWorkSection, { SlotRows, usePlanInputs } from './WhenToWorkSection';
import Callout from './Callout';
import Modal from '@/app/components/common/Modal';
import { LinkedDraft, LinkedTasksSaveError, linkedSaveMessage, toLinkedRefs } from '@/app/utils/linkedTasks';
import { useSlotPlanner, planMinutes, minutesOf, type SlotPlanner } from '@/app/hooks/useSlotPlanner';
import { earlierRange, planRange, spread, suggest, withHeld, type PlanRange } from '@/app/utils/slotSuggest';
import { clock, dayShort } from '@/app/utils/slotLabels';
import { WorkBlocksSaveError, savePlans, samePick, togglePicks, type PlanPick, type PlanRequest } from '@/app/utils/workBlockPlans';
import { toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';

/**
 * Runs once the task (and its linked tasks, in list order) are saved: makes
 * the picked work blocks. Throws a WorkBlocksSaveError when some didn't save,
 * which keeps the modal open to try again.
 */
export type AfterTaskSave = (task: Task, linked?: Task[]) => Promise<void>;

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  newTask: BaseTaskForm;
  onTaskChange: (task: BaseTaskForm) => void;
  tags: Tag[];
  onToggleTag: (tag: Tag) => void;
  /**
   * Creates the task, then saves `linked` as its linked tasks when given, then
   * runs `afterSave` with the task and the saved linked tasks. `created` is set
   * when a previous try created the task but something after it failed: update
   * that task instead of creating another.
   */
  onSubmit: (e: React.FormEvent, linked?: LinkedTaskRef[], created?: Task, afterSave?: AfterTaskSave) => void | Promise<void>;
  activeTaskCount: number;
  usedPriorityLevels: number[];
  /** Every loaded task. When given, the form gets a Linked tasks section and suggested work times. */
  allTasks?: Task[];
  /** The habits, whose time today's suggestions keep free. */
  habits?: Habit[];
}

const NewTaskModal: React.FC<NewTaskModalProps> = props => {
  if (!props.isOpen) return null;
  return <NewTaskForm {...props} />;
};

const draftKey = (d: LinkedDraft) => (d.kind === 'existing' ? `task-${d.id}` : d.key);
const dateStr = (v: string | Date | null | undefined) => (v instanceof Date ? toLocalDateStr(v) : v || null);
const timeStr = (v: string | Date | null | undefined) => (v instanceof Date ? toLocalTimeStr(v) : v || null);

/**
 * Matches the saved linked tasks to the form's rows: an existing row by id,
 * a new row to the next saved task that wasn't in the list before.
 */
function childrenByRow(drafts: LinkedDraft[], children: Task[]): Map<string, Task> {
  const existing = new Set(drafts.flatMap(d => (d.kind === 'existing' ? [d.id] : [])));
  const fresh = children.filter(c => !existing.has(c.id));
  const byId = new Map(children.map(c => [c.id, c]));
  const out = new Map<string, Task>();
  for (const d of drafts) {
    const child = d.kind === 'existing' ? byId.get(d.id) : fresh.shift();
    if (child) out.set(draftKey(d), child);
  }
  return out;
}

/** The open modal's body, mounted fresh each time it opens so the linked-task rows start empty. */
const NewTaskForm: React.FC<NewTaskModalProps> = ({
  onClose, newTask, onTaskChange, tags, onToggleTag,
  onSubmit, activeTaskCount, usedPriorityLevels, allTasks, habits,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedDraft[]>([]);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  // Set once the task exists but its linked tasks or work blocks didn't
  // save, so trying again doesn't create it twice.
  const [created, setCreated] = useState<Task | null>(null);
  const [picks, setPicks] = useState<PlanPick[]>([]);
  // Picked times for linked tasks, by row key.
  const [linkedPicks, setLinkedPicks] = useState<Record<string, PlanPick[]>>({});
  const [planError, setPlanError] = useState<string | null>(null);

  const planner = useSlotPlanner({
    enabled: !!allTasks && !!newTask.title.trim(),
    tasks: allTasks ?? [],
    habits: habits ?? [],
    excludeTaskIds: created ? [created.id] : undefined,
  });

  const linkedPlan = useLinkedPlan(planner, linked, allTasks ?? [], newTask, picks, linkedPicks, setLinkedPicks);
  // The parent's rows keep off the times picked for its linked tasks.
  const heldForParent = useMemo(() => linked.flatMap(d => linkedPicks[draftKey(d)] ?? []), [linked, linkedPicks]);
  const parentPlanner = useMemo(
    () => planner && { ...planner, state: withHeld(planner.state, heldForParent) },
    [planner, heldForParent],
  );

  const handleFieldChange = (next: TaskFormData) => {
    onTaskChange({ ...newTask, ...next } as BaseTaskForm);
  };

  const linkedPlanned = linked.filter(d => (linkedPicks[draftKey(d)] ?? []).length > 0).length;
  const planCount = (picks.length > 0 ? 1 : 0) + linkedPlanned;

  const afterSave: AfterTaskSave = async (task, children) => {
    const requests: PlanRequest[] = picks.map(pick => ({ taskId: task.id, pick }));
    let rowTask = new Map<string, Task>();
    if (children) {
      rowTask = childrenByRow(linked, children);
      for (const [key, rowPicks] of Object.entries(linkedPicks)) {
        const child = rowTask.get(key);
        if (child) requests.push(...rowPicks.map(pick => ({ taskId: child.id, pick })));
      }
      // The linked tasks exist now: a retry links them again instead of creating them twice.
      setLinked(linked.map(d => {
        const child = rowTask.get(draftKey(d));
        return child ? { kind: 'existing', id: child.id } : d;
      }));
    }
    const { failed, reason } = await savePlans(requests);
    const failedFor = (taskId: number) => failed.filter(f => f.taskId === taskId).map(f => f.pick);
    setPicks(failedFor(task.id));
    const nextLinked: Record<string, PlanPick[]> = {};
    for (const child of rowTask.values()) {
      const left = failedFor(child.id);
      if (left.length) nextLinked[`task-${child.id}`] = left;
    }
    if (children) setLinkedPicks(nextLinked);
    if (failed.length) throw new WorkBlocksSaveError(task, failed.length, reason ?? 'Something went wrong.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLinkedError(null);
    setPlanError(null);
    if (linked.some(d => d.kind === 'new' && !d.form.title.trim())) {
      setLinkedError('Give each new linked task a title, or remove it.');
      return;
    }
    const refs = allTasks ? toLinkedRefs(linked, allTasks) : [];
    setIsLoading(true);
    try {
      const linkedArg = refs.length || created ? refs : undefined;
      if (planCount > 0) await onSubmit(e, linkedArg, created ?? undefined, afterSave);
      else await onSubmit(e, linkedArg, created ?? undefined);
    } catch (err) {
      if (err instanceof LinkedTasksSaveError) {
        setCreated(err.task);
        setLinkedError(linkedSaveMessage(err, allTasks ?? [], "The task was created, but its linked tasks weren't saved"));
      } else if (err instanceof WorkBlocksSaveError) {
        setCreated(err.task);
        setPlanError(`The task was created, but ${err.failed === 1 ? 'one planned time' : `${err.failed} planned times`} didn't make it onto your calendar: ${err.reason}`);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const submitLabel = created
    ? planCount > 0 ? 'Try again' : 'Save Changes'
    : linkedPlanned > 0 ? `Create & plan ${planCount}` : planCount > 0 ? 'Create & plan' : 'Create Task';

  return (
    <Modal onClose={onClose} panelClassName="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-custom">
      <div
        className="sticky top-0 z-30 px-6 py-4 flex items-center justify-between border-b border-border-subtle"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <h2 className="text-xl text-text-primary">Create new task</h2>
        <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">

        <TaskFormFields
          values={newTask as TaskFormData}
          onChange={handleFieldChange}
          tags={tags}
          onToggleTag={onToggleTag}
          activeTaskCount={activeTaskCount}
          usedPriorityLevels={usedPriorityLevels}
          afterDuration={(
            <WhenToWorkSection
              planner={parentPlanner}
              dueDate={newTask.due_date}
              dueTime={newTask.due_time}
              estimatedHours={newTask.estimated_time}
              picks={picks}
              onPicksChange={setPicks}
              error={planError && <Callout tone="danger" role="alert">{planError}</Callout>}
            />
          )}
        />

        {allTasks && (
          <div>
            {/* .perf zeroes its own margins, so the gap below it lives on this wrapper's second child. */}
            <hr className="perf" />
            <div className="mt-5">
              <LinkedTasksField
                allTasks={allTasks}
                parentId={created?.id ?? null}
                parentDueDate={newTask.due_date}
                parentTitle={newTask.title}
                parentTags={newTask.tags}
                parentPriority={newTask.priority}
                tags={tags}
                activeTaskCount={activeTaskCount + 1}
                usedPriorityLevels={usedPriorityLevels}
                drafts={linked}
                onChange={setLinked}
                mode={created ? 'edit' : 'create'}
                error={linkedError}
                plan={linkedPlan}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm rounded-md px-3 py-2" style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={isLoading} className="btn btn-secondary flex-1 py-2.5">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn btn-primary flex-1 py-2.5">
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {created ? 'Saving…' : 'Creating…'}</>
              : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** A linked row's length and due, as its form or task has them. */
function rowInputs(d: LinkedDraft, byId: Map<number, Task>) {
  if (d.kind === 'new') return { hours: d.form.estimated_time, due: dateStr(d.form.due_date), time: timeStr(d.form.due_time), done: false };
  const t = byId.get(d.id);
  return t ? { hours: t.estimated_time, due: dateStr(t.due_date), time: timeStr(t.due_time), done: t.completed } : null;
}

/**
 * The Linked tasks section's slot pills: each open row's time from spreading
 * the rows not planned yet in list order, before the parent and the row are
 * due ("Plan all" picks those), and when a pill is opened, that row's own 3
 * suggestions. The parent's picks and the other rows' picks count as taken.
 */
function useLinkedPlan(
  planner: SlotPlanner | null,
  drafts: LinkedDraft[],
  allTasks: Task[],
  parent: BaseTaskForm,
  parentPicks: PlanPick[],
  linkedPicks: Record<string, PlanPick[]>,
  setLinkedPicks: React.Dispatch<React.SetStateAction<Record<string, PlanPick[]>>>,
): LinkedPlan | undefined {
  const parentInputs = usePlanInputs(planner, parent.due_date, parent.due_time, parent.estimated_time);
  const byId = useMemo(() => new Map(allTasks.map(t => [t.id, t])), [allTasks]);
  const rows = useMemo(() => drafts.flatMap(d => {
    const r = rowInputs(d, byId);
    return r && !r.done ? [{ key: draftKey(d), ...r, len: planMinutes(r.hours) }] : [];
  }), [drafts, byId]);

  const rangeFor = useCallback((r: (typeof rows)[number]): PlanRange | null => {
    if (!planner || !parentInputs) return null;
    if (!r.due) return parentInputs.range;
    const own = planRange(planner.state.now, r.due, minutesOf(r.time));
    return own && earlierRange(own, parentInputs.range);
  }, [planner, parentInputs]);

  // What's taken for a row: the parent's picks and every other row's.
  const heldFor = useCallback((key: string | null) => withHeld(planner!.state, [
    ...parentPicks,
    ...rows.flatMap(r => (r.key === key ? [] : linkedPicks[r.key] ?? [])),
  ]), [planner, parentPicks, rows, linkedPicks]);

  const spreadOut = useMemo(() => {
    if (!planner || !parentInputs || rows.length === 0) return new Map<string, PlanPick | null>();
    const items = rows.flatMap(r => {
      if (linkedPicks[r.key]?.length) return [];
      const range = rangeFor(r);
      return range ? [{ key: r.key, len: r.len, range }] : [];
    });
    const out = spread(heldFor(null), items, parentInputs.range);
    return new Map(out.map(o => [o.key, o.slot && { date: o.slot.date, start: o.slot.start, end: o.slot.end }]));
  }, [planner, parentInputs, rows, linkedPicks, rangeFor, heldFor]);

  if (!planner || !parentInputs || rows.length === 0) return undefined;
  const today = planner.today;
  const pills: LinkedPlan['pills'] = {};
  for (const r of rows) {
    const picked = linkedPicks[r.key]?.[0];
    const slot = picked ?? spreadOut.get(r.key) ?? null;
    pills[r.key] = slot ? { label: `${dayShort(slot.date, today)} ${clock(slot.start)}`, planned: !!picked } : null;
  }
  const unplanned = rows.filter(r => !(linkedPicks[r.key]?.length) && spreadOut.get(r.key));

  return {
    pills,
    planAllCount: unplanned.length,
    onPlanAll: () => setLinkedPicks(prev => {
      const next = { ...prev };
      for (const r of unplanned) next[r.key] = [spreadOut.get(r.key)!];
      return next;
    }),
    renderOptions: key => {
      const r = rows.find(x => x.key === key);
      const range = r && rangeFor(r);
      if (!r || !range) return <p className="text-xs text-text-muted">It&apos;s past due, so there&apos;s nothing to plan.</p>;
      const state = heldFor(key);
      const own = suggest(state, r.len, range).slots;
      const spreadSlot = spreadOut.get(key);
      const lead = spreadSlot ? [spreadSlot] : linkedPicks[key] ?? [];
      const slots = [
        ...lead.map(p => ({ ...p, gap: p.end - p.start })),
        ...own.filter(s => !lead.some(p => samePick(s, p))),
      ].slice(0, Math.max(3, lead.length));
      if (slots.length === 0) return <p className="text-xs text-text-muted">No free time fits it before it&apos;s due.</p>;
      return (
        <SlotRows
          slots={slots}
          picks={linkedPicks[key] ?? []}
          onToggle={s => setLinkedPicks(prev => ({ ...prev, [key]: togglePicks(prev[key] ?? [], [s]) }))}
          state={state}
          range={range}
          today={today}
          soonest={false}
        />
      );
    },
  };
}

export default NewTaskModal;
