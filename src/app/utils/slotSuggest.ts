/**
 * Rule-based "when to work on it" suggestions: free time = the work window −
 * busy events − kept work blocks − time held for habits still to do − time
 * held for open tasks due sooner, and a new task goes into the best gaps
 * before its deadline. No AI: every slot can be explained by these rules.
 *
 * Times are minutes from local midnight; dates are local "YYYY-MM-DD" days.
 * Everything here is pure, so the form, the calendar and the Daily brief all
 * read the same answers from the same state.
 */
import { parseLocalDate, toLocalDateStr } from './dateUtils';

/** Suggestions start and end on this grid. */
export const SLOT_STEP = 15;
/** The length planned for a task with no "How long?". */
export const DEFAULT_PLAN_MINUTES = 30;
/** How far ahead suggestions look, in days (today included). */
export const PLAN_HORIZON_DAYS = 14;
/** Without a due date, suggestions cover this many days from today. */
export const NO_DUE_DAYS = 7;
/** How many slots a task is offered. */
export const SLOT_COUNT = 3;
/** A split piece is at least this long. */
const MIN_SPLIT_MINUTES = 30;
/** Usual-time options for a habit are at least this far apart. */
const HABIT_TIME_SPACING = 120;

/** A [start, end) range of minutes on one day. */
export type Span = [number, number];

/** A moment: a local day and minutes from its midnight. */
export interface DayMinute {
  date: string;
  min: number;
}

/** Something on the calendar that may take time: an event, or a kept work block. */
export interface BusyItem {
  date: string;
  start: number;
  end: number;
  title: string;
  /** False when it leaves the time free (a declined or "Show as free" Google event). */
  busy?: boolean;
  allDay?: boolean;
}

/** A kept work block, for a task or a habit. */
export interface PlannedBlock {
  date: string;
  start: number;
  end: number;
  taskId?: number | null;
  habitId?: number | null;
}

export interface HabitInput {
  id: number;
  title: string;
  /** Minutes per day: its time goal, or DEFAULT_PLAN_MINUTES without one. */
  len: number;
  /** Its usual time, in minutes from midnight; null when it has none. */
  time: number | null;
  /** Logged today. */
  done: boolean;
}

export interface TaskInput {
  id: number;
  title: string;
  len: number;
  due: DayMinute;
  /** It already has a kept block from now on, so it holds no extra time. */
  planned: boolean;
}

/** Everything the rules read. */
export interface SlotState {
  now: DayMinute;
  /** The work window on a day as [start, end), or null on a rest day. */
  windowOn: (date: string) => Span | null;
  events: BusyItem[];
  blocks: PlannedBlock[];
  habits: HabitInput[];
  tasks: TaskInput[];
}

/** One day's free gaps once everything is held. */
export interface FreeDay {
  date: string;
  gaps: Span[];
}

/** A suggested slot. */
export interface Slot {
  date: string;
  start: number;
  end: number;
  /** Minutes free from `start` to the end of its gap. */
  gap: number;
}

const ceilStep = (m: number) => Math.ceil(m / SLOT_STEP) * SLOT_STEP;

/** "YYYY-MM-DD" `n` days after `date` (calendar days, so DST-safe). */
export function addDaysStr(date: string, n: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86_400_000);
}

/** Removes `cut` from each span. */
export function subtract(spans: Span[], cut: Span): Span[] {
  const out: Span[] = [];
  for (const [s, e] of spans) {
    if (cut[1] <= s || cut[0] >= e) { out.push([s, e]); continue; }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}

const keep = (spans: Span[]) => spans.filter(([s, e]) => e - s >= SLOT_STEP);

/** Whether a habit has a kept block on `date`, which then holds its time instead. */
const habitPlannedOn = (S: SlotState, habitId: number, date: string) =>
  S.blocks.some(b => b.habitId === habitId && b.date === date);

/**
 * Free gaps on one day before any holds: the work window minus busy timed
 * events and kept blocks, and on today minus the time already gone.
 */
export function rawGaps(S: SlotState, date: string, { ignoreNow = false }: { ignoreNow?: boolean } = {}): Span[] {
  const win = S.windowOn(date);
  if (!win) return [];
  let spans: Span[] = [[win[0], win[1]]];
  if (!ignoreNow && date === S.now.date) spans = subtract(spans, [0, ceilStep(S.now.min)]);
  if (!ignoreNow && date < S.now.date) return [];
  for (const ev of S.events) {
    if (ev.date !== date || ev.allDay || ev.busy === false) continue;
    spans = subtract(spans, [ev.start, ev.end]);
  }
  for (const b of S.blocks) if (b.date === date) spans = subtract(spans, [b.start, b.end]);
  return keep(spans);
}

/** Takes `len` minutes from the first gap that fits before `limit`; the gap's rest stays free. */
function holdEarly(spans: Span[], len: number, limit = Infinity): { spans: Span[]; placed: Span | null } {
  for (let i = 0; i < spans.length; i++) {
    const [s, e] = spans[i];
    if (Math.min(e, limit) - s >= len) {
      const out = spans.slice();
      out.splice(i, 1, ...keep([[s + len, e]]));
      return { spans: out, placed: [s, s + len] };
    }
  }
  return { spans, placed: null };
}

/** Takes `len` minutes from the end of the day's free time, across gaps when one isn't enough. */
function holdLate(spans: Span[], len: number): Span[] {
  let left = len;
  const out = spans.map(x => x.slice() as Span);
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const [s, e] = out[i];
    const take = Math.min(left, e - s);
    out[i] = [s, e - take];
    left -= take;
  }
  return keep(out);
}

/**
 * Free gaps per day from today to `untilDate`, after holding time for habits
 * still to do and for open tasks due before `beforeDue` (earliest deadline
 * first, each in the soonest gap that fits before its own due). A day equal
 * to `beforeDue`'s is cut at its time.
 */
export function freeTime(S: SlotState, untilDate: string, beforeDue: DayMinute): FreeDay[] {
  const days: FreeDay[] = [];
  for (let d = S.now.date; d <= untilDate; d = addDaysStr(d, 1)) days.push({ date: d, gaps: rawGaps(S, d) });

  // Habits are daily: one with a usual time holds it; one without holds its length at the end of the day.
  for (const day of days) {
    if (!S.windowOn(day.date)) continue;
    const open = S.habits.filter(h => !(day.date === S.now.date && h.done) && !habitPlannedOn(S, h.id, day.date));
    for (const h of open) if (h.time != null) day.gaps = keep(subtract(day.gaps, [h.time, h.time + h.len]));
    for (const h of open) if (h.time == null) day.gaps = holdLate(day.gaps, h.len);
  }

  const dueBefore = (t: TaskInput) => t.due.date < beforeDue.date || (t.due.date === beforeDue.date && t.due.min < beforeDue.min);
  const sooner = S.tasks
    .filter(t => !t.planned && dueBefore(t))
    .sort((a, b) => a.due.date.localeCompare(b.due.date) || a.due.min - b.due.min);
  for (const t of sooner) {
    for (const day of days) {
      if (day.date > t.due.date) break;
      const r = holdEarly(day.gaps, t.len, day.date === t.due.date ? t.due.min : Infinity);
      if (r.placed) { day.gaps = r.spans; break; }
    }
  }

  const last = days[days.length - 1];
  if (last && last.date === beforeDue.date) {
    last.gaps = keep(last.gaps.map(([s, e]): Span => [s, Math.min(e, beforeDue.min)]));
  }
  return days;
}

/** One candidate per gap that fits `len` minutes: at the gap's start, on the 15-minute grid. */
export function candidates(days: FreeDay[], len: number): Slot[] {
  const out: Slot[] = [];
  for (const day of days) {
    for (const [s, e] of day.gaps) {
      const start = ceilStep(s);
      if (e - start >= len) out.push({ date: day.date, start, end: start + len, gap: e - start });
    }
  }
  return out;
}

/**
 * Soonest, one per day, avoiding the due day: the first slot of each day,
 * days before the due date first, soonest first (so the due day's first slot
 * comes after them); then the remaining slots in the same order, so second
 * slots on earlier days come before extra due-day slots. Up to `count`.
 */
export function rankSlots(c: Slot[], due: DayMinute, count = SLOT_COUNT): Slot[] {
  const early = (x: Slot) => x.date < due.date;
  const sorted = c.slice().sort((a, b) => Number(early(b)) - Number(early(a)) || a.date.localeCompare(b.date) || a.start - b.start);
  const pick: Slot[] = [];
  const days = new Set<string>();
  for (const x of sorted) if (!days.has(x.date)) { pick.push(x); days.add(x.date); }
  for (const x of sorted) if (pick.length < count && !pick.includes(x)) pick.push(x);
  return pick.slice(0, count);
}

/** The span suggestions for a task cover: today to its due (at most PLAN_HORIZON_DAYS), or NO_DUE_DAYS without one. */
export interface PlanRange {
  /** The last day to look at. */
  until: string;
  /** What the task is due by; with no due date, the moment the range ends. */
  due: DayMinute;
  hasDue: boolean;
}

/**
 * The range for a task due `dueDate` at `dueMin` (minutes; null for no time,
 * which is due by the end of that day). Null once the deadline has passed.
 */
export function planRange(now: DayMinute, dueDate: string | null, dueMin: number | null): PlanRange | null {
  const horizonEnd = addDaysStr(now.date, PLAN_HORIZON_DAYS - 1);
  if (!dueDate) {
    const until = addDaysStr(now.date, NO_DUE_DAYS - 1);
    return { until, due: { date: addDaysStr(until, 1), min: 0 }, hasDue: false };
  }
  const due = { date: dueDate, min: dueMin ?? 24 * 60 };
  if (due.date < now.date || (due.date === now.date && due.min <= now.min)) return null;
  return { until: due.date < horizonEnd ? due.date : horizonEnd, due, hasDue: true };
}

/** A task's suggestions: the ranked slots plus the free days they came from. */
export function suggest(S: SlotState, len: number, range: PlanRange): { slots: Slot[]; days: FreeDay[] } {
  const days = freeTime(S, range.until, range.due);
  return { slots: rankSlots(candidates(days, len), range.due), days };
}

/** Free minutes left on `date` among `days`. */
export const freeMinutesOn = (days: FreeDay[], date: string): number =>
  (days.find(d => d.date === date)?.gaps ?? []).reduce((n, [s, e]) => n + e - s, 0);

/** A linked task to spread: its key and length. */
export interface SpreadItem<K> {
  key: K;
  len: number;
}

/**
 * Linked tasks in list order, each after the previous one's slot (on a later
 * day when one fits), all before the parent's due. Each slot counts as kept
 * for the ones after it.
 */
export function spread<K>(S: SlotState, items: SpreadItem<K>[], range: PlanRange): { key: K; slot: Slot | null }[] {
  const S2: SlotState = { ...S, blocks: [...S.blocks] };
  const out: { key: K; slot: Slot | null }[] = [];
  let after: DayMinute = { date: S.now.date, min: 0 };
  for (const it of items) {
    const days = freeTime(S2, range.until, range.due);
    const c = candidates(days, it.len).filter(x => x.date > after.date || (x.date === after.date && x.start >= after.min));
    const nextDay = out.length > 0 ? c.find(x => x.date > after.date) : undefined;
    const pick = nextDay ?? c[0] ?? null;
    out.push({ key: it.key, slot: pick });
    if (pick) {
      S2.blocks.push({ date: pick.date, start: pick.start, end: pick.end });
      after = { date: pick.date, min: pick.end };
    }
  }
  return out;
}

/** A habit still open today and where it fits. */
export interface HabitToday {
  habit: HabitInput;
  /** Its suggested time today; null when nothing fits. */
  slot: Span | null;
  /** From its usual time rather than the first free gap. */
  fixed: boolean;
}

/**
 * Today's open habits. A habit keeps its usual time while that time is still
 * free after now (no busy event or kept block on it, inside work hours or
 * not, rest days included); the rest each go in the first free gap after now that fits,
 * once the kept usual times and open tasks due today are held.
 */
export function habitsToday(S: SlotState): HabitToday[] {
  const today = S.now.date;
  let gaps = rawGaps(S, today);
  let wholeDay = rawGaps({ ...S, windowOn: () => [0, 24 * 60] }, today, { ignoreNow: true });
  const open = S.habits.filter(x => !x.done);
  const slots = new Map<number, HabitToday>();
  for (const h of open) {
    if (h.time == null) continue;
    const span: Span = [h.time, h.time + h.len];
    if (span[1] <= ceilStep(S.now.min) || !wholeDay.some(([s, e]) => s <= span[0] && span[1] <= e)) continue;
    slots.set(h.id, { habit: h, slot: span, fixed: true });
    wholeDay = subtract(wholeDay, span);
    gaps = keep(subtract(gaps, span));
  }
  const dueToday = S.tasks.filter(t => !t.planned && t.due.date === today).sort((a, b) => a.due.min - b.due.min);
  for (const t of dueToday) gaps = holdEarly(gaps, t.len, t.due.min).spans;
  for (const h of open) {
    if (slots.has(h.id)) continue;
    const r = holdEarly(gaps, h.len);
    gaps = r.spans;
    slots.set(h.id, { habit: h, slot: r.placed, fixed: false });
  }
  return open.map(h => slots.get(h.id)!);
}

/** A usual-time option for a habit, and on how many of the next work days it's free. */
export interface HabitTimeOption {
  start: number;
  end: number;
  free: number;
  of: number;
  /** The work days it isn't free on. */
  clash: string[];
}

/**
 * Usual times for a new habit of `len` minutes: the half-hour starts free on
 * the most of the next `n` work days (from tomorrow), outside the usual times
 * of the habits in `S`, earliest first on ties, up to 3 options at least two
 * hours apart.
 */
export function habitTime(S: SlotState, len: number, n = 5): { picks: HabitTimeOption[]; dates: string[] } {
  const dates: string[] = [];
  for (let d = addDaysStr(S.now.date, 1), i = 0; dates.length < n && i < PLAN_HORIZON_DAYS; d = addDaysStr(d, 1), i++) {
    if (S.windowOn(d)) dates.push(d);
  }
  if (dates.length === 0) return { picks: [], dates };
  const lo = Math.min(...dates.map(d => S.windowOn(d)![0]));
  const hi = Math.max(...dates.map(d => S.windowOn(d)![1]));
  const gapsByDate = new Map(dates.map(d => [d, S.habits.reduce(
    (g, h) => (h.time == null || habitPlannedOn(S, h.id, d) ? g : keep(subtract(g, [h.time, h.time + h.len]))),
    rawGaps(S, d, { ignoreNow: true }),
  )]));
  const scores: HabitTimeOption[] = [];
  for (let t = Math.ceil(lo / 30) * 30; t + len <= hi; t += 30) {
    let free = 0;
    const clash: string[] = [];
    for (const d of dates) {
      if (gapsByDate.get(d)!.some(([s, e]) => s <= t && t + len <= e)) free++; else clash.push(d);
    }
    scores.push({ start: t, end: t + len, free, of: dates.length, clash });
  }
  scores.sort((a, b) => b.free - a.free || a.start - b.start);
  const picks: HabitTimeOption[] = [];
  for (const s of scores) {
    if (s.free === 0) break;
    if (picks.every(p => Math.abs(p.start - s.start) >= HABIT_TIME_SPACING)) picks.push(s);
    if (picks.length === 3) break;
  }
  return { picks, dates };
}

/**
 * After a plan's time is taken: free slots nearest the original (same day
 * first, then the closest day, then the closest start), before the deadline.
 * Pass a state without the taken block itself.
 */
export function resuggest(S: SlotState, len: number, range: PlanRange, orig: { date: string; start: number }, count = 3): Slot[] {
  const days = freeTime(S, range.until, range.due);
  const dayGap = (d: string) => Math.abs(daysBetween(orig.date, d));
  return candidates(days, len)
    .sort((a, b) => dayGap(a.date) - dayGap(b.date) || Math.abs(a.start - orig.start) - Math.abs(b.start - orig.start))
    .slice(0, count);
}

/** One piece of a split plan. */
export interface PlanPiece {
  date: string;
  start: number;
  end: number;
}

/** No single gap fits: the soonest gaps of 30 minutes or more, in order, until `len` is covered; null if they can't. */
export function splitFill(days: FreeDay[], len: number): PlanPiece[] | null {
  const pieces: PlanPiece[] = [];
  let left = len;
  for (const day of days) {
    for (const [s0, e] of day.gaps) {
      const s = ceilStep(s0);
      if (left <= 0 || e - s < MIN_SPLIT_MINUTES) continue;
      const take = Math.min(left, e - s);
      pieces.push({ date: day.date, start: s, end: s + take });
      left -= take;
    }
  }
  return left > 0 ? null : pieces;
}

/**
 * Right after the work window: the first work day from today whose window
 * closes with `len` minutes left before midnight (and before the due), and no
 * busy event or block in the way. Null when none does.
 */
export function afterWorkHours(S: SlotState, len: number, range: PlanRange): PlanPiece | null {
  for (let d = S.now.date; d <= range.until; d = addDaysStr(d, 1)) {
    const win = S.windowOn(d);
    if (!win) continue;
    let start = ceilStep(win[1]);
    if (d === S.now.date) start = Math.max(start, ceilStep(S.now.min));
    const end = start + len;
    if (end > 24 * 60) continue;
    if (d === range.due.date && end > range.due.min) continue;
    const clashes = [
      ...S.events.filter(e => e.date === d && !e.allDay && e.busy !== false),
      ...S.blocks.filter(b => b.date === d),
    ].some(x => x.start < end && start < x.end);
    if (!clashes) return { date: d, start, end };
  }
  return null;
}

/** Why a slot is offered: the events around it, or what's left of its gap. */
export function slotReason(slot: Pick<Slot, 'date' | 'start' | 'end' | 'gap'>, S: SlotState, due: DayMinute | null, clock: (min: number) => string): string {
  const evs = S.events.filter(e => e.date === slot.date && e.busy !== false && !e.allDay);
  const after = evs.find(e => e.end === slot.start);
  const before = evs.find(e => e.start === slot.end);
  const win = S.windowOn(slot.date);
  if (after && before) return `between ${after.title} and ${before.title}`;
  if (after) return `right after ${after.title}`;
  if (before) return `right before ${before.title}`;
  if (due && slot.date === due.date) return "the day it's due";
  if (win && slot.start === win[0]) return 'start of your work day';
  if (win && slot.end === win[1]) return 'end of your work day';
  return `free until ${clock(slot.start + slot.gap)}`;
}

/** Whether two ranges on the same day overlap. */
export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;
