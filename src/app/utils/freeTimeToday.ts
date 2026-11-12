/**
 * The Free Time tile's numbers: how much of today's work window is still
 * free, what fills the rest, and which due-soon tasks fit in it. Pure, so the
 * tile and its overlay read the same answers from the same planner state.
 */
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';
import { dueMinutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import { toLocalDateStr } from './dateUtils';
import {
  PLAN_HORIZON_DAYS, SLOT_STEP, addDaysStr, planRange, rawGaps, suggest, withHeld,
  type PlanRange, type Slot, type SlotState, type Span,
} from './slotSuggest';

/** What fills a piece of the rest of the day. */
export type BusyKind = 'block' | 'event' | 'habit';

export interface BusyPiece {
  kind: BusyKind;
  start: number;
  end: number;
  title?: string;
}

export interface FreeTimeToday {
  /** Today's work window as [start, end) minutes. */
  window: Span;
  /** Where the rest of the day starts: now, on the 15-minute grid, inside the window. */
  from: number;
  /** True once the window has closed. */
  ended: boolean;
  /** Free minutes from `from` to the window's end. */
  free: number;
  gaps: Span[];
  /** What's on from `from` to the window's end, cut to that range. */
  busy: BusyPiece[];
  /** Minutes each kind takes from `from` to the window's end (overlaps within a kind counted once). */
  totals: Record<BusyKind, number>;
}

const ceilStep = (m: number) => Math.ceil(m / SLOT_STEP) * SLOT_STEP;

/** Total length of `spans` with overlaps counted once. */
function unionLength(spans: Span[]): number {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of sorted) {
    if (s > curE) {
      total += Math.max(0, curE - curS);
      curS = s;
      curE = e;
    } else if (e > curE) {
      curE = e;
    }
  }
  return total + Math.max(0, curE - curS);
}

/**
 * The rest of `today`'s work window: the free gaps (the same `rawGaps` the
 * calendar's suggestions start from, so habits with no hold today don't take
 * time here), and the work blocks, busy timed events and habit holds that
 * fill the rest. Null on a rest day.
 */
export function freeTimeToday(S: SlotState, today: string): FreeTimeToday | null {
  const win = S.windowOn(today);
  if (!win) return null;
  const nowMin = today === S.now.date ? ceilStep(S.now.min) : today < S.now.date ? win[1] : 0;
  const from = Math.min(win[1], Math.max(win[0], nowMin));
  const ended = from >= win[1];
  const gaps = ended ? [] : rawGaps(S, today);
  const free = gaps.reduce((n, [s, e]) => n + e - s, 0);

  const busy = busyBetween(S, today, from, win[1]);

  const totals = { block: 0, event: 0, habit: 0 } as Record<BusyKind, number>;
  for (const kind of Object.keys(totals) as BusyKind[]) {
    totals[kind] = unionLength(busy.filter(p => p.kind === kind).map(p => [p.start, p.end] as Span));
  }
  return { window: win, from, ended, free, gaps, busy, totals };
}

/**
 * What's on `date` from `from` to `to`, cut to that range: busy timed events,
 * and work blocks (a habit's block is its hold). Sorted by start.
 */
export function busyBetween(S: SlotState, date: string, from: number, to: number): BusyPiece[] {
  const busy: BusyPiece[] = [];
  const clip = (kind: BusyKind, start: number, end: number, title?: string) => {
    const s = Math.max(start, from);
    const e = Math.min(end, to);
    if (e > s) busy.push({ kind, start: s, end: e, title });
  };
  for (const ev of S.events) {
    if (ev.date !== date || ev.allDay || ev.busy === false) continue;
    clip('event', ev.start, ev.end, ev.title);
  }
  for (const b of S.blocks) {
    if (b.date !== date) continue;
    clip(b.habitId != null ? 'habit' : 'block', b.start, b.end);
  }
  return busy.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The next work day after `today` (within the planning horizon) and when it starts, or null. */
export function nextWorkStart(S: SlotState, today: string): { date: string; start: number } | null {
  for (let i = 1; i <= PLAN_HORIZON_DAYS; i++) {
    const d = addDaysStr(today, i);
    const win = S.windowOn(d);
    if (win) return { date: d, start: win[0] };
  }
  return null;
}

/** The first free gap after today (within the planning horizon), or null. */
export function nextFreeAfterToday(S: SlotState, today: string): { date: string; start: number } | null {
  for (let i = 1; i <= PLAN_HORIZON_DAYS; i++) {
    const d = addDaysStr(today, i);
    const gap = rawGaps(S, d)[0];
    if (gap) return { date: d, start: gap[0] };
  }
  return null;
}

/** A due-soon task and the slot it fits in today. */
export interface FitToday {
  task: Task;
  slot: Slot;
  len: number;
}

const dueKey = (t: Task) => ({ date: toLocalDateStr(t.due_date!), min: dueMinutesOf(t) ?? 24 * 60 });

/**
 * Open tasks due within the planning horizon (slipped ones included) that
 * have no work block today, slipped first and then by due date and time, each
 * with the best-ranked suggested slot that falls today. Each pick is held
 * before the next one is placed, so two picks never overlap. Up to `max`.
 */
export function fitsToday(S: SlotState, tasks: Task[], workBlocks: Pick<WorkBlock, 'task_id' | 'date'>[], today: string, max = 2): FitToday[] {
  const blockedToday = new Set(workBlocks.filter(b => b.date === today && b.task_id != null).map(b => b.task_id!));
  const horizonEnd = addDaysStr(today, PLAN_HORIZON_DAYS - 1);
  const open = tasks
    .filter(t => !t.completed && !t.archived_at && t.due_date && !blockedToday.has(t.id))
    .map(t => ({ task: t, due: dueKey(t) }))
    .filter(x => x.due.date <= horizonEnd)
    .sort((a, b) => a.due.date.localeCompare(b.due.date) || a.due.min - b.due.min);

  const out: FitToday[] = [];
  let state = S;
  for (const { task, due } of open) {
    if (out.length >= max) break;
    const len = planMinutes(task.estimated_time);
    // Only today's slots are kept, so only today is searched (today ranks
    // first whenever it has room). A slipped task's deadline has passed, so it
    // is due by the end of today here.
    const range: PlanRange = planRange(S.now, due.date, due.min)
      ?? { until: today, due: { date: addDaysStr(today, 1), min: 0 }, hasDue: false };
    const others: SlotState = { ...state, tasks: state.tasks.filter(t => t.id !== task.id) };
    const slot = suggest(others, len, { ...range, until: today }).slots.find(s => s.date === today);
    if (!slot) continue;
    out.push({ task, slot, len });
    state = withHeld(state, [slot]);
  }
  return out;
}

/** "2h 20m", "2h", "45m", "0m". */
export function hoursMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
