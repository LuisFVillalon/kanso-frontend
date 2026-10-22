import { BaseTaskForm, EditTaskForm, ParentSummary, Task } from '@/app/types/task';
import { compareLinkedOrder } from '@/app/utils/linkedTasks';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';

// ── Priority (static badge colors for levels 1–10) ────────────────────────────

export const PRIORITY_COLORS: Record<number, { bg: string; text: string }> = {
  1:  { bg: '#dc2626', text: '#ffffff' }, // red
  2:  { bg: '#ea580c', text: '#ffffff' }, // red-orange
  3:  { bg: '#f97316', text: '#ffffff' }, // orange
  4:  { bg: '#f59e0b', text: '#ffffff' }, // amber
  5:  { bg: '#eab308', text: '#ffffff' }, // yellow
  6:  { bg: '#84cc16', text: '#ffffff' }, // lime
  7:  { bg: '#22c55e', text: '#ffffff' }, // green
  8:  { bg: '#14b8a6', text: '#ffffff' }, // teal
  9:  { bg: '#3b82f6', text: '#ffffff' }, // blue
  10: { bg: '#e2e8f0', text: '#334155' }, // white/slate
};

const DEFAULT_PRIORITY_COLOR = { bg: '#2563eb', text: '#ffffff' };
const NULL_PRIORITY_COLOR = { bg: 'var(--tm-surface-raised)', text: 'var(--tm-text-muted)' };

export function getPriorityStyle(priority: number | null) {
  if (priority === null) return NULL_PRIORITY_COLOR;
  return PRIORITY_COLORS[priority] ?? DEFAULT_PRIORITY_COLOR;
}

export function formatDueDateShort(due: string | Date | null, now: Date = new Date()): string | null {
  if (!due) return null;
  const d = typeof due === 'string' ? new Date(due + 'T00:00:00') : due;
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export const formatDueDate = (
  date: string | Date | null | undefined,
  time?: string | null  // e.g. "23:59"
): string => {
  if (!date) return "No date";

  let dueDate: Date;

  if (typeof date === "string") {
    const parts = date.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      dueDate = new Date(year, month - 1, day);
    } else {
      dueDate = new Date(date);
    }
  } else {
    dueDate = new Date(date);
  }

  if (isNaN(dueDate.getTime())) return "Invalid date";

  if (time) {
    const [hours, minutes] = time.split(":").map(Number);
    dueDate.setHours(hours, minutes, 59, 999);
  } else {
    dueDate.setHours(23, 59, 59, 999); // fallback to end of day
  }

  const now = new Date();
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (dueDateOnly.getTime() - nowDateOnly.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "Slipped";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";

  const isThisYear = dueDate.getFullYear() === now.getFullYear();

  return dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(isThisYear ? {} : { year: "numeric" }),
  });
};

export const getTaskDateTime = (task: Task): number => {
  // If no due date at all → push to end
  if (!task.due_date) {
    return Number.MAX_SAFE_INTEGER;
  }

  // Normalize date
  const dateStr =
    typeof task.due_date === 'string'
      ? task.due_date
      : task.due_date instanceof Date
      ? task.due_date.toISOString().split('T')[0]
      : null;

  if (!dateStr) {
    return Number.MAX_SAFE_INTEGER;
  }

  // Normalize time (optional)
  const timeStr =
    typeof task.due_time === 'string'
      ? task.due_time
      : task.due_time instanceof Date
      ? task.due_time.toTimeString().slice(0, 5)
      : '23:59'; // no time → end of day

  const timestamp = new Date(`${dateStr}T${timeStr}`).getTime();

  return isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

// ── Task → EditTaskForm mapping ─────────────────────────────────────────────
// Shared by TaskManager's inline priority update and useTaskHandlers' full
// edit-form submit, which used to each hand-roll this same field mapping.
// Deliberately leaves due_date/due_time/created_date as whatever shape the
// task already has (string or Date) rather than pre-converting them —
// useTasksAndTags.ts's updateTask() already normalizes those correctly via
// toLocalDateStr/toLocalTimeStr, so converting them here too would be
// redundant and risks the UTC-drift bug those helpers exist to avoid.
export function taskToEditForm(task: Task, overrides: Partial<EditTaskForm> = {}): EditTaskForm {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    due_date: task.due_date ?? null,
    due_time: task.due_time ?? null,
    priority: task.priority,
    category: task.category ?? null,
    completed: task.completed,
    completed_date: task.completed_date ?? null,
    tags: task.tags ?? [],
    created_date: task.created_date,
    estimated_time: task.estimated_time ?? null,
    parent_task_id: task.parent_task_id ?? null,
    reminder_minutes: task.reminder_minutes ?? null,
    ...overrides,
  };
}

/** `task` with a new-task form's fields applied, for re-saving a task an earlier try already created. */
export function applyNewTaskForm(task: Task, form: BaseTaskForm): EditTaskForm {
  const { title, description, priority, due_date, due_time, tags, category, estimated_time, reminder_minutes } = form;
  return taskToEditForm(task, {
    title, description, priority, due_date, due_time, tags, category, estimated_time, reminder_minutes,
  });
}

/** Ids of `rootId` and every task nested under it (subtasks, their subtasks, …). */
export function subtaskTreeIds(tasks: Pick<Task, 'id' | 'parent_task_id'>[], rootId: number): Set<number> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (t.parent_task_id != null && ids.has(t.parent_task_id) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  return ids;
}

// ── Linked tasks (nesting for the task list) ────────────────────────────────

/** A task in the list with the linked tasks shown under it, each nesting its own the same way. */
export interface TaskGroup {
  task: Task;
  /** Linked tasks to render under `task`, in their saved order (`position`, then id). */
  linked: TaskGroup[];
  /** Progress over `task`'s direct linked tasks, including ones the filters hide. */
  linkedDone: number;
  linkedTotal: number;
}

/**
 * Nests linked tasks (tasks with a parent_task_id) under their parent, at
 * any depth.
 *
 * `matching` is the filtered, sorted list; `allTasks` is everything loaded.
 * Each top-level group is a tree rooted at a task with no loaded parent. A
 * task whose parent isn't loaded, or whose chain loops, stays top-level.
 *
 * A group is shown when its root or any task in its tree matches the
 * filters, so a matching linked task never loses the tasks above it. A
 * matching task shows every task under it; otherwise only the branches that
 * lead to a match are shown. When the root matches, the group sits at the
 * root's place in the sort; otherwise it sits at the first match's place.
 */
export function groupLinkedTasks(allTasks: Task[], matching: Task[]): TaskGroup[] {
  const byId = new Map(allTasks.map(t => [t.id, t]));

  const rootOf = (task: Task): number => {
    const seen = new Set([task.id]);
    let current = task;
    while (current.parent_task_id != null) {
      const parent = byId.get(current.parent_task_id);
      if (!parent) break;
      if (seen.has(parent.id)) return task.id;
      seen.add(parent.id);
      current = parent;
    }
    return current.id;
  };

  // Only tasks whose chain reaches a root hang under their parent, so the
  // children map has no loops.
  const childrenOf = new Map<number, Task[]>();
  for (const t of allTasks) {
    if (rootOf(t) === t.id) continue;
    const list = childrenOf.get(t.parent_task_id!) ?? [];
    list.push(t);
    childrenOf.set(t.parent_task_id!, list);
  }
  for (const list of childrenOf.values()) list.sort(compareLinkedOrder);

  const matchingIds = new Set(matching.map(t => t.id));
  const leadsToMatch = new Map<number, boolean>();
  const hasMatch = (task: Task): boolean => {
    let found = leadsToMatch.get(task.id);
    if (found === undefined) {
      found = matchingIds.has(task.id) || (childrenOf.get(task.id) ?? []).some(hasMatch);
      leadsToMatch.set(task.id, found);
    }
    return found;
  };

  const build = (task: Task, showAll: boolean): TaskGroup => {
    const children = childrenOf.get(task.id) ?? [];
    const all = showAll || matchingIds.has(task.id);
    return {
      task,
      linked: children.filter(c => all || hasMatch(c)).map(c => build(c, all)),
      linkedDone: children.filter(c => c.completed).length,
      linkedTotal: children.length,
    };
  };

  const groups: TaskGroup[] = [];
  const placed = new Set<number>();

  for (const m of matching) {
    const rootId = rootOf(m);
    // A matching root gets placed at its own position in the sort.
    if (rootId !== m.id && matchingIds.has(rootId)) continue;
    if (placed.has(rootId)) continue;
    placed.add(rootId);
    groups.push(build(byId.get(rootId) ?? m, false));
  }

  return groups;
}

/**
 * The tasks above `task`, from the topmost down to its own parent, found by
 * following parent_task_id through `byId`. When a parent isn't there, the
 * trail ends with the summary the API sent for it, if any. Stops at a loop.
 */
export function parentChain<T extends Pick<Task, 'id' | 'title' | 'parent_task_id' | 'parent'>>(
  byId: ReadonlyMap<number, T>,
  task: T,
): ParentSummary[] {
  const chain: ParentSummary[] = [];
  const seen = new Set([task.id]);
  let current = task;
  while (current.parent_task_id != null && !seen.has(current.parent_task_id)) {
    const parent = byId.get(current.parent_task_id);
    if (!parent) {
      if (current.parent?.id === current.parent_task_id) chain.unshift(current.parent);
      break;
    }
    seen.add(parent.id);
    chain.unshift({ id: parent.id, title: parent.title });
    current = parent;
  }
  return chain;
}

export const countTasksByTag = (tasks: Task[]) => {
  const map: Record<number, { name: string; color: string; count: number }> = {};
  tasks.forEach(task => {
    task.tags?.forEach(tag => {
      if (!map[tag.id]) {
        map[tag.id] = {
          name: tag.name,
          color: tag.color,
          count: 0
        };
      }
      map[tag.id].count += 1;
    });
  });

  return Object.values(map);
};

// ── Due status (the four status chips in brand/DESIGN.md) ───────────────────

/**
 * done: completed. slipped: past its due date (never shown in red). due: due
 * today or tomorrow. upcoming: due within UPCOMING_DAYS.
 */
export type DueStatusKind = 'done' | 'slipped' | 'due' | 'upcoming';

export interface DueStatus {
  kind: DueStatusKind;
  label: string;
}

/** How far ahead a due date still gets an "In N days" chip; further out shows only the plain date. */
const UPCOMING_DAYS = 7;

/** Whole calendar days from `now` to the due date: 0 today, negative once it has passed. */
function daysUntilDue(dueDate: string | Date, now: Date): number {
  const due = parseLocalDate(toLocalDateStr(dueDate));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** The chip state for a task, or null for an open task with no due date or one due beyond UPCOMING_DAYS. */
export function getDueStatus(
  task: Pick<Task, 'completed' | 'due_date'>,
  now: Date = new Date(),
): DueStatus | null {
  if (task.completed) return { kind: 'done', label: 'Done' };
  if (!task.due_date) return null;
  const days = daysUntilDue(task.due_date, now);
  if (days < 0) return { kind: 'slipped', label: 'Slipped' };
  if (days === 0) return { kind: 'due', label: 'Due today' };
  if (days === 1) return { kind: 'due', label: 'Due tomorrow' };
  if (days <= UPCOMING_DAYS) return { kind: 'upcoming', label: `In ${days} days` };
  return null;
}

/**
 * Today's plan is every task due today or earlier. `open` counts the ones
 * still to do; the plan is settled once `open` reaches 0.
 */
export function todayPlanProgress(
  tasks: Pick<Task, 'completed' | 'due_date' | 'archived_at'>[],
  now: Date = new Date(),
): { open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const t of tasks) {
    if (!t.due_date || t.archived_at || daysUntilDue(t.due_date, now) > 0) continue;
    if (t.completed) done += 1;
    else open += 1;
  }
  return { open, done };
}

// Ink tone for the duration indicator's semantic color classes below.
export const toInkTone = (classes: string) => {
  if (classes.includes('red')) return 'text-[var(--tm-accent-2)]';
  if (classes.includes('yellow')) return 'text-[var(--tm-accent)]';
  if (classes.includes('green')) return 'text-[var(--tm-success-text)]';
  return 'text-text-muted';
};

export const getDurationColor = (hours?: number | null) => {
  if (hours == null) return "text-gray-500 bg-gray-50";
  if (hours <= 2.5) return "text-green-700 bg-green-50";
  if (hours <= 5) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
};

// ── Priority badge (rank-based continuous color interpolation) ─────────────────
// Used by PriorityPicker to color priority chips relative to the active task count.
// Different from getPriorityStyle above, which maps a fixed level to a discrete color.

const PRIORITY_BADGE_STOPS = ['#dc2626', '#ea580c', '#eab308', '#16a34a', '#2563eb', '#ffffff'];

function hexInterpolate(c1: string, c2: string, t: number): string {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const r  = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g  = Math.round(((a >> 8)  & 255) + (((b >> 8)  & 255) - ((a >> 8)  & 255)) * t);
  const bl = Math.round((a & 255)         + ((b & 255)         - (a & 255))          * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function getPriorityBadgeStyle(
  priority: number | null,
  maxPriority: number,
): { bg: string; text: string } {
  if (priority == null) return { bg: '#f3f4f6', text: '#6b7280' };
  const normalized = maxPriority <= 1 ? 0 : (priority - 1) / (maxPriority - 1);
  const segCount = PRIORITY_BADGE_STOPS.length - 1;
  const seg = Math.min(Math.floor(normalized * segCount), segCount - 1);
  const localT = (normalized - seg / segCount) * segCount;
  return {
    bg: hexInterpolate(PRIORITY_BADGE_STOPS[seg], PRIORITY_BADGE_STOPS[seg + 1], localT),
    text: normalized > 0.72 ? '#111827' : '#ffffff',
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────────

export const formatTime12Hour = (time?: string | null) => {
  if (!time) return "--:--";

  const [hours, minutes] = time.split(":");

  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const period = hourNum >= 12 ? "PM" : "AM";
  const adjustedHour = hourNum % 12 || 12; // converts 0 → 12

  return `${adjustedHour}:${minuteNum.toString().padStart(2, "0")} ${period}`;
};