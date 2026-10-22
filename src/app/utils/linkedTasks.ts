import { LinkedTaskRef, NewLinkedTask, Tag, Task } from '@/app/types/task';
import type { TaskFormData } from '@/app/components/task/TaskFormFields';
import { parseLocalDate, toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';

// ── Linked tasks on the task form ───────────────────────────────────────────
// A task's linked tasks are the tasks that lead up to completing it, stored
// as subtasks (parent_task_id) and ordered by `position`. Links nest to any
// depth, a task has at most one parent, and linking a task that already has
// a parent moves it (with its own linked tasks). A task can't be linked under
// itself or a task below it. The backend enforces the same rules
// (PUT /update-linked-tasks/{id}).

/** One row of the form's Linked tasks list: an existing task, or one created on save with all its fields. */
export type LinkedDraft =
  | { kind: 'existing'; id: number }
  | { kind: 'new'; key: string; form: TaskFormData };

/** Mirrors the backend's title limit, so a new linked task's title can't fail on length. */
export const LINKED_TITLE_MAX = 500;

/** Order of a parent's linked tasks: by `position`, then id, with unpositioned (older) links last. */
export function compareLinkedOrder(
  a: Pick<Task, 'id' | 'position'>,
  b: Pick<Task, 'id' | 'position'>,
): number {
  const pa = a.position ?? Number.MAX_SAFE_INTEGER;
  const pb = b.position ?? Number.MAX_SAFE_INTEGER;
  return pa - pb || a.id - b.id;
}

/** A parent's linked tasks as form rows, in their saved order. */
export function linkedDraftsFor(allTasks: Task[], parentId: number | null): LinkedDraft[] {
  if (parentId == null) return [];
  return allTasks
    .filter(t => t.parent_task_id === parentId)
    .sort(compareLinkedOrder)
    .map(t => ({ kind: 'existing', id: t.id }));
}

/** Whether the rows differ from the saved ones (order included), so saving them would change anything. */
export function linkedDraftsChanged(saved: LinkedDraft[], drafts: LinkedDraft[]): boolean {
  if (saved.length !== drafts.length) return true;
  return drafts.some((d, i) => {
    const s = saved[i];
    return d.kind !== 'existing' || s.kind !== 'existing' || d.id !== s.id;
  });
}

/** A blank form for a new linked task, starting with its parent's tags. */
export function blankLinkedTaskForm(parentTags: Tag[], title = ''): TaskFormData {
  return {
    title,
    description: '',
    priority: null,
    due_date: '',
    due_time: '',
    tags: [...parentTags],
    estimated_time: null,
    reminder_minutes: null,
  };
}

const dateOrNull = (v: string | Date | null | undefined) =>
  v instanceof Date ? toLocalDateStr(v) : v ? v : null;
const timeOrNull = (v: string | Date | null | undefined) =>
  v instanceof Date ? toLocalTimeStr(v) : v ? v : null;

/** A new linked task's form as the fields PUT /update-linked-tasks creates it with. */
export function toNewLinkedTask(form: TaskFormData): NewLinkedTask {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    priority: form.priority ?? null,
    due_date: dateOrNull(form.due_date),
    due_time: timeOrNull(form.due_time),
    tags: form.tags.map(tag => ({ id: tag.id, name: tag.name, color: tag.color })),
    estimated_time: form.estimated_time ?? null,
    reminder_minutes: form.reminder_minutes ?? null,
  };
}

/** The request body's children for PUT /update-linked-tasks, skipping rows whose task is no longer loaded. */
export function toLinkedRefs(drafts: LinkedDraft[], allTasks: Task[]): LinkedTaskRef[] {
  const ids = new Set(allTasks.map(t => t.id));
  return drafts.flatMap((d): LinkedTaskRef[] => {
    if (d.kind === 'new') return [toNewLinkedTask(d.form)];
    return ids.has(d.id) ? [{ id: d.id }] : [];
  });
}

/** "YYYY-MM-DD" moved by `days`. */
export function shiftDateStr(date: string, days: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

/** Whether a linked task due `due` is due after its parent, due `parentDue` (both "YYYY-MM-DD" or empty). */
export const isDueAfterParent = (due: string | null, parentDue: string | null) =>
  !!due && !!parentDue && due > parentDue;

/** Returns a copy of `list` with the item at `from` moved to `to` (unchanged if `to` is out of range). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export interface LinkCandidate {
  task: Task;
  /** False when the task can't be linked here; `note` says why. */
  ok: boolean;
  note?: string;
  /** True when linking moves the task from another parent. */
  moves?: boolean;
}

/**
 * Tasks the picker offers for linking under the task being edited, filtered
 * by `query` (title, ignoring case). Tasks that can't be linked are listed
 * too, with the reason, after the ones that can; open tasks come before done
 * ones, then by due date. The task itself and tasks already in the list are
 * left out.
 *
 * `parentId` is the task being edited (null while creating one) and
 * `parentOfParent` its own parent as the form has it now.
 */
export function linkCandidates(
  allTasks: Task[],
  { parentId, parentOfParent, drafts, query }: {
    parentId: number | null;
    parentOfParent: number | null;
    drafts: LinkedDraft[];
    query: string;
  },
): LinkCandidate[] {
  const byId = new Map(allTasks.map(t => [t.id, t]));
  const listed = new Set(drafts.flatMap(d => (d.kind === 'existing' ? [d.id] : [])));
  const ancestors = new Set<number>();
  for (let a = parentOfParent; a != null && !ancestors.has(a); a = byId.get(a)?.parent_task_id ?? null) {
    ancestors.add(a);
  }

  const q = query.trim().toLowerCase();
  const status = (t: Task): LinkCandidate => {
    if (ancestors.has(t.id)) return { task: t, ok: false, note: 'Would create a loop: this task already leads up to it' };
    if (t.parent_task_id != null && t.parent_task_id !== parentId) {
      const other = byId.get(t.parent_task_id);
      const where = other ? `“${other.title}”` : 'another task';
      return { task: t, ok: true, moves: true, note: `Already linked to ${where}. Linking moves it here` };
    }
    return { task: t, ok: true };
  };

  return allTasks
    .filter(t => t.id !== parentId && !listed.has(t.id) && (!q || t.title.toLowerCase().includes(q)))
    .map(status)
    .sort((a, b) =>
      Number(b.ok) - Number(a.ok)
      || Number(a.task.completed) - Number(b.task.completed)
      || (dueDateKey(a.task) < dueDateKey(b.task) ? -1 : dueDateKey(a.task) > dueDateKey(b.task) ? 1 : 0)
      || a.task.id - b.task.id,
    );
}

/** A task's due date as "YYYY-MM-DD", or null. */
export function dueDateStr(due: string | Date | null | undefined): string | null {
  if (!due) return null;
  return due instanceof Date ? toLocalDateStr(due) : due.slice(0, 10);
}

const dueDateKey = (t: Task) => dueDateStr(t.due_date) ?? '9999-12-31';

/**
 * Rewrites the task ids in a backend link error ("Task 12 is archived; …")
 * into the tasks' titles, so the message reads naturally in the form.
 */
export function describeLinkError(detail: string, allTasks: Pick<Task, 'id' | 'title'>[]): string {
  const titles = new Map(allTasks.map(t => [t.id, t.title]));
  return detail.replace(/\b[Tt]ask (?:with ID )?(\d+)\b/g, (match, id: string) => {
    const title = titles.get(Number(id));
    return title ? `“${title}”` : match;
  });
}

/** Thrown when a task saved but its linked tasks didn't. `task` is the saved task; the message is the reason. */
export class LinkedTasksSaveError extends Error {
  constructor(readonly task: Task, message: string) {
    super(message);
    this.name = 'LinkedTasksSaveError';
  }
}

/** The form's message for a failed linked-task save: `lead`, then the reason with tasks named by title. */
export function linkedSaveMessage(err: LinkedTasksSaveError, allTasks: Pick<Task, 'id' | 'title'>[], lead: string): string {
  return `${lead}: ${describeLinkError(err.message, allTasks)}`;
}
