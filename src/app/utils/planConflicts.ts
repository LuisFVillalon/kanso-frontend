/**
 * Plans that lost their time: a busy event now overlaps a kept work block, or
 * a habit's usual time today. The calendar rings the block and offers a ghost
 * at the nearest free time; the Daily brief asks the same in a callout.
 * Nothing moves until the user taps Move.
 */
import type { EventOccurrence } from '@/app/types/event';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';
import { blockSpan, dueMinutesOf, minutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import { occurrenceKey, occurrenceSpanOn, takesTime } from './eventOccurrences';
import { toLocalDateStr } from './dateUtils';
import { habitsToday, planRange, resuggest, subtract, type Slot, type SlotState } from './slotSuggest';

/** The first live, busy event overlapping `span` on `date`. */
function clashingEvent(events: EventOccurrence[], date: string, span: { start: number; end: number }): EventOccurrence | null {
  for (const o of events) {
    if (!takesTime(o)) continue;
    const on = occurrenceSpanOn(o, date);
    if (on && on.start < span.end && span.start < on.end) return o;
  }
  return null;
}

/** A kept block a busy event now covers, and where it could go instead. */
export interface BlockConflict {
  kind: 'task';
  key: string;
  block: WorkBlock;
  event: EventOccurrence;
  /** The nearest free slot before the deadline; null when none. */
  suggestion: Slot | null;
}

/** A habit whose usual time today a busy event takes, and a time that's free today. */
export interface HabitConflict {
  kind: 'habit';
  key: string;
  habit: Habit;
  event: EventOccurrence;
  /** Its usual time, in minutes. */
  usual: number;
  suggestion: { start: number; end: number } | null;
}

const blockKey = (b: WorkBlock, e: EventOccurrence) =>
  `block|${b.id}|${b.date}|${b.start_time}|${b.end_time}|${occurrenceKey(e)}|${e.start_time}|${e.end_time}`;

/**
 * Each task work block from now on that a busy event overlaps, with the free
 * slot nearest its time (same day first) before its task is due.
 */
export function blockConflicts(state: SlotState, workBlocks: WorkBlock[], events: EventOccurrence[], tasks: Task[]): BlockConflict[] {
  const out: BlockConflict[] = [];
  const byId = new Map(tasks.map(t => [t.id, t]));
  for (const b of workBlocks) {
    if (b.task_id == null) continue;
    const span = blockSpan(b);
    if (b.date < state.now.date || (b.date === state.now.date && span.end <= state.now.min)) continue;
    const event = clashingEvent(events, b.date, span);
    if (!event) continue;
    const task = byId.get(b.task_id);
    if (task?.completed) continue;
    const range = planRange(state.now, task?.due_date ? toLocalDateStr(task.due_date) : null, task ? dueMinutesOf(task) : null);
    const others: SlotState = { ...state, blocks: state.blocks.filter(x => !(x.taskId === b.task_id && x.date === b.date && x.start === span.start)) };
    const suggestion = range ? resuggest(others, span.end - span.start, range, { date: b.date, start: span.start }, 1)[0] ?? null : null;
    out.push({ kind: 'task', key: blockKey(b, event), block: b, event, suggestion });
  }
  return out;
}

/**
 * Today's open habits whose usual time a busy event takes (and that aren't
 * planned elsewhere today), each with today's first free time that fits.
 */
export function habitConflicts(state: SlotState, habits: Habit[], events: EventOccurrence[], workBlocks: WorkBlock[]): HabitConflict[] {
  const today = state.now.date;
  const out: HabitConflict[] = [];
  for (const h of habits) {
    const usual = minutesOf(h.planned_time);
    if (usual === null || h.logged_today || h.archived_at) continue;
    if (workBlocks.some(b => b.habit_id === h.id && b.date === today)) continue;
    const len = planMinutes(h.estimated_time);
    if (usual + len <= state.now.min) continue;
    const event = clashingEvent(events, today, { start: usual, end: usual + len });
    if (!event) continue;
    // Today only: the habit without its usual time, placed among today's other habits as the brief's card places it.
    const moved = habitsToday({
      ...state,
      habits: state.habits.filter(x => !workBlocks.some(b => b.habit_id === x.id && b.date === today))
        .map(x => (x.id === h.id ? { ...x, time: null } : x)),
    }).find(x => x.habit.id === h.id);
    const slot = moved?.slot && subtract([moved.slot], [usual, usual + len]).length ? moved.slot : null;
    out.push({
      kind: 'habit', key: `habit|${h.id}|${today}|${h.planned_time}|${occurrenceKey(event)}|${event.start_time}|${event.end_time}`,
      habit: h, event, usual, suggestion: slot && { start: slot[0], end: slot[1] },
    });
  }
  return out;
}

// "Keep it" / "Skip" answers, so the same question isn't asked again until
// the block's time or the event changes (both are in the key).
const KEPT_KEY = 'tm_plan_conflicts_kept';

export function loadKeptConflicts(): Set<string> {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(KEPT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k: unknown) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export function keepConflict(key: string): Set<string> {
  const kept = loadKeptConflicts();
  kept.add(key);
  try {
    // Only recent answers matter; old ones fall off.
    localStorage.setItem(KEPT_KEY, JSON.stringify([...kept].slice(-200)));
  } catch {
    // Storage full or off: the question just comes back next time.
  }
  return kept;
}
