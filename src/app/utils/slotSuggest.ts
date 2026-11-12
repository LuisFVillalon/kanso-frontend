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
  /** No time goal: done any time of day, so it holds no time and gets no slot (its usual time is ignored). */
  allDay?: boolean;
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

/** The habits that take time: all-day ones (no time goal) are left out. */
const timedHabits = (S: SlotState) => S.habits.filter(h => !h.allDay);

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
  // All-day habits (no time goal) hold nothing.
  for (const day of days) {
    if (!S.windowOn(day.date)) continue;
    const open = timedHabits(S).filter(h => !(day.date === S.now.date && h.done) && !habitPlannedOn(S, h.id, day.date));
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

/** `S` with `spans` (times picked but not saved yet) held like kept blocks. */
export const withHeld = (S: SlotState, spans: { date: string; start: number; end: number }[]): SlotState =>
  spans.length ? { ...S, blocks: [...S.blocks, ...spans.map(p => ({ date: p.date, start: p.start, end: p.end }))] } : S;

/** Whichever of two ranges is due first. */
export const earlierRange = (a: PlanRange, b: PlanRange): PlanRange =>
  a.due.date < b.due.date || (a.due.date === b.due.date && a.due.min <= b.due.min) ? a : b;

/** A linked task to spread: its key, length, and its own range when it has a due date. */
export interface SpreadItem<K> {
  key: K;
  len: number;
  range?: PlanRange;
  /** A time already picked for it: its slot, which the ones after it follow. */
  fixed?: { date: string; start: number; end: number };
}

/**
 * Linked tasks in list order, each after the previous one's slot (on a later
 * day when one fits), all before the parent's due and their own. A task with
 * a picked time keeps it. Each slot counts as kept for the ones after it.
 */
export function spread<K>(S: SlotState, items: SpreadItem<K>[], range: PlanRange): { key: K; slot: Slot | null }[] {
  const S2: SlotState = { ...S, blocks: [...S.blocks] };
  const out: { key: K; slot: Slot | null }[] = [];
  let after: DayMinute = { date: S.now.date, min: 0 };
  for (const it of items) {
    let pick: Slot | null;
    if (it.fixed) {
      pick = { ...it.fixed, gap: it.fixed.end - it.fixed.start };
    } else {
      const r = it.range ? earlierRange(it.range, range) : range;
      const days = freeTime(S2, r.until, r.due);
      const c = candidates(days, it.len).filter(x => x.date > after.date || (x.date === after.date && x.start >= after.min));
      const nextDay = out.length > 0 ? c.find(x => x.date > after.date) : undefined;
      pick = nextDay ?? c[0] ?? null;
    }
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

/** Takes `len` minutes from the free time nearest `near` (on the 15-minute grid, earlier on ties). */
function holdNearest(spans: Span[], len: number, near: number): { spans: Span[]; placed: Span | null } {
  let best: Span | null = null;
  for (const [s, e] of spans) {
    const lo = ceilStep(s);
    const hi = Math.floor((e - len) / SLOT_STEP) * SLOT_STEP;
    if (hi < lo) continue;
    const start = Math.min(hi, Math.max(lo, Math.round(near / SLOT_STEP) * SLOT_STEP));
    if (!best || Math.abs(start - near) < Math.abs(best[0] - near)) best = [start, start + len];
  }
  return best ? { spans: keep(subtract(spans, best)), placed: best } : { spans, placed: null };
}

/**
 * Today's open habits. A habit keeps its usual time while that time is still
 * free after now (no busy event or kept block on it, inside work hours or
 * not, rest days included). Once the kept usual times and open tasks due
 * today are held, a habit whose usual time was taken or has passed goes in
 * the free time nearest it, and a habit without one in the first free gap
 * after now that fits. All-day habits (no time goal) aren't scheduled, so
 * they're left out.
 */
export function habitsToday(S: SlotState): HabitToday[] {
  const today = S.now.date;
  let gaps = rawGaps(S, today);
  let wholeDay = rawGaps({ ...S, windowOn: () => [0, 24 * 60] }, today, { ignoreNow: true });
  const open = timedHabits(S).filter(x => !x.done);
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
    if (slots.has(h.id) || h.time == null) continue;
    const r = holdNearest(gaps, h.len, h.time);
    gaps = r.spans;
    slots.set(h.id, { habit: h, slot: r.placed, fixed: false });
  }
  for (const h of open) {
    if (slots.has(h.id)) continue;
    const r = holdEarly(gaps, h.len);
    gaps = r.spans;
    slots.set(h.id, { habit: h, slot: r.placed, fixed: false });
  }
  return open.map(h => slots.get(h.id)!);
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

const floorStep = (m: number) => Math.floor(m / SLOT_STEP) * SLOT_STEP;
/** How far apart `allStarts` puts the starts inside one gap. */
const START_SPACING = 30;

/**
 * Every start a `len` block can take in each free gap: the gap's start on the
 * 15-minute grid, every 30 minutes after it, and the start that ends the block
 * at the gap's end. Each slot's `gap` runs to the end of its gap, as for `candidates`.
 */
export function allStarts(days: FreeDay[], len: number): Slot[] {
  const out: Slot[] = [];
  for (const day of days) {
    for (const [s, e] of day.gaps) {
      const first = ceilStep(s);
      const last = floorStep(e - len);
      if (last < first) continue;
      const starts: number[] = [];
      for (let t = first; t <= last; t += START_SPACING) starts.push(t);
      if (starts[starts.length - 1] !== last) starts.push(last);
      for (const t of starts) out.push({ date: day.date, start: t, end: t + len, gap: e - t });
    }
  }
  return out;
}

/** A day in the "Which day" strip. */
export interface DayChoice {
  date: string;
  /** A rest day: no work window. */
  off: boolean;
  /** Free minutes left that day. */
  free: number;
  /** A block of the task's length fits somewhere that day. */
  fits: boolean;
  /** The day the task is due. */
  due: boolean;
}

/** Each day in `days` (today to the range's end) for the day strip: rest days, free time, whether `len` fits, the due day. */
export function dayList(S: SlotState, days: FreeDay[], len: number, range: PlanRange): DayChoice[] {
  return days.map(d => ({
    date: d.date,
    off: !S.windowOn(d.date),
    free: freeMinutesOn(days, d.date),
    fits: allStarts([d], len).length > 0,
    due: range.hasDue && d.date === range.due.date,
  }));
}

/**
 * Up to `n` times on `date` that don't overlap, spread across the day: the
 * first start of each gap, then each gap's last start that fits, then every
 * other start on the 15-minute grid, taken in that order while they don't
 * overlap, then sorted by start.
 */
export function dayBest(days: FreeDay[], date: string, len: number, n = SLOT_COUNT): Slot[] {
  const day = days.find(d => d.date === date);
  if (!day) return [];
  const byGap = day.gaps.map(g => allStarts([{ date, gaps: [g] }], len)).filter(x => x.length > 0);
  const grid = day.gaps.flatMap(([s, e]) => {
    const out: Slot[] = [];
    for (let t = ceilStep(s); t <= floorStep(e - len); t += SLOT_STEP) out.push({ date, start: t, end: t + len, gap: e - t });
    return out;
  });
  const order = [...byGap.map(x => x[0]), ...byGap.map(x => x[x.length - 1]), ...grid];
  const out: Slot[] = [];
  for (const x of order) {
    if (out.length >= n) break;
    if (!out.some(o => overlaps(o, x))) out.push(x);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** What stops a picked time from moving further, for "Can't go earlier/later: …". */
export interface Edge {
  /**
   * An event or a habit's usual time, the time already gone today, the
   * deadline, the work day's start or end, another planned time (a kept
   * block or another pick), or time held for an untimed habit or a task due sooner.
   */
  kind: 'event' | 'habit' | 'now' | 'due' | 'workStart' | 'workEnd' | 'block' | 'held';
  title?: string;
  /** The edge, in minutes from midnight. */
  at: number;
}

/** A time on a day: a pick, a piece, or a kept block. */
type DaySpan = { date: string; start: number; end: number };

/**
 * What ends a free gap at `at` on `date`: on the `earlier` side something
 * ending there, on the `later` side something starting there. `others` are
 * the form's other picks, which count as planned time.
 */
export function blockedBy(
  S: SlotState, date: string, at: number, side: 'earlier' | 'later', range: PlanRange, others: DaySpan[] = [],
): Edge {
  const edge = (x: { start: number; end: number }) => (side === 'earlier' ? x.end === at : x.start === at);
  const ev = S.events.find(e => e.date === date && e.busy !== false && !e.allDay && edge(e));
  if (ev) return { kind: 'event', title: ev.title, at };
  const habit = timedHabits(S).find(h => h.time != null && edge({ start: h.time, end: h.time + h.len }));
  if (habit) return { kind: 'habit', title: habit.title, at };
  if (side === 'earlier' && date === S.now.date && at <= ceilStep(S.now.min)) return { kind: 'now', at };
  if (side === 'later' && range.hasDue && date === range.due.date && at >= range.due.min) return { kind: 'due', at: range.due.min };
  const win = S.windowOn(date);
  if (win && side === 'earlier' && at <= win[0]) return { kind: 'workStart', at: win[0] };
  if (win && side === 'later' && at >= win[1]) return { kind: 'workEnd', at: win[1] };
  if ([...S.blocks, ...others].some(b => b.date === date && edge(b))) return { kind: 'block', at };
  return { kind: 'held', at };
}

/** The free gap holding `pick`, with the other picks that don't overlap it taken out. Null when it isn't in one. */
export function gapOf(days: FreeDay[], pick: DaySpan, others: DaySpan[] = []): Span | null {
  const day = days.find(d => d.date === pick.date);
  if (!day) return null;
  let gaps = day.gaps;
  for (const o of others) if (o.date === pick.date && !overlaps(o, pick)) gaps = subtract(gaps, [o.start, o.end]);
  return gaps.find(([s, e]) => s <= pick.start && pick.end <= e) ?? null;
}

/**
 * Moves `pick` by `delta` minutes (±30), clamped to its free gap on the
 * 15-minute grid, so a shorter step at the edge is fine. When it can't move at
 * all, says what's in the way. Null when the pick isn't in a free gap.
 */
export function nudge(
  S: SlotState, days: FreeDay[], pick: DaySpan, delta: number, range: PlanRange, others: DaySpan[] = [],
): { pick: PlanPiece } | { blocked: Edge } | null {
  const g = gapOf(days, pick, others);
  if (!g) return null;
  const len = pick.end - pick.start;
  const start = delta < 0
    ? Math.max(ceilStep(g[0]), pick.start + delta)
    : Math.min(floorStep(g[1] - len), pick.start + delta);
  if (delta === 0 || (delta < 0 ? start >= pick.start : start <= pick.start)) {
    return { blocked: delta < 0 ? blockedBy(S, pick.date, g[0], 'earlier', range, others) : blockedBy(S, pick.date, g[1], 'later', range, others) };
  }
  return { pick: { date: pick.date, start, end: start + len } };
}

/**
 * `pick` at `len` minutes: the same start when it fits in its gap, else the
 * latest start in that gap that fits; null when `len` doesn't fit there.
 */
export function relength(days: FreeDay[], pick: DaySpan, len: number, others: DaySpan[] = []): PlanPiece | null {
  const g = gapOf(days, pick, others);
  if (!g) return null;
  if (pick.start + len <= g[1]) return { date: pick.date, start: pick.start, end: pick.start + len };
  const start = floorStep(g[1] - len);
  return start >= ceilStep(g[0]) ? { date: pick.date, start, end: start + len } : null;
}
