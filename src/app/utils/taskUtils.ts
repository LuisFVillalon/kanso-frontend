import { EditTaskForm, Task } from '@/app/types/task';

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

export function formatDueDateShort(due: string | Date | null): string | null {
  if (!due) return null;
  const d = typeof due === 'string' ? new Date(due + 'T00:00:00') : due;
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  if (diffDays < 0) return "Overdue";
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
    ...overrides,
  };
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

// Returns Tailwind utility classes — use for badge/chip backgrounds.
// Note: string dates are parsed as local midnight to prevent UTC-offset drift.
export const getDueColor = (dueDate?: string | Date | null) => {
  if (!dueDate) return "text-gray-400 bg-gray-50";

  const now = new Date();
  const due = typeof dueDate === 'string' ? new Date(dueDate + 'T00:00:00') : new Date(dueDate);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "text-red-700 bg-red-50";
  if (diffDays <= 3) return "text-yellow-700 bg-yellow-50";
  return "text-green-700 bg-green-50";
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