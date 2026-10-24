import type { EventOccurrence } from '@/app/types/event';
import type { Task } from '@/app/types/task';
import { ENERGY_LABELS, STRESS_LABELS, moodLabel } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { formatClock, occurrenceSpanOn } from '@/app/utils/eventOccurrences';

/**
 * The day report's pieces that don't need React: its opening sentence, which
 * sections start open, its header line and the "day, in order" timeline. The
 * sentence is built from the check-in and the day's counts, never by AI, so
 * mood data stays out of AI (types/mood.ts).
 */

/** Where a day sits relative to today. */
export type DayWhen = 'past' | 'today' | 'future';

export const dayWhen = (dateStr: string, todayStr: string): DayWhen =>
  dateStr < todayStr ? 'past' : dateStr === todayStr ? 'today' : 'future';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface DaySentenceInput {
  when: DayWhen;
  /** One of the user's rest days. */
  rest: boolean;
  /** The check-in's mood (1–5), null with no check-in, undefined when mood isn't shown. */
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  /** Events that weren't archived, all-day ones included. */
  events: number;
  tasksDue: number;
  /** Tasks due this day that are done. */
  tasksDueDone: number;
  /** Every task finished this day, wherever it was due. */
  tasksDone: number;
  habitsDone: number;
  notes: number;
}

export interface DaySentence {
  main: string;
  /** A short second line (energy and stress, or a nudge), if any. */
  sub: string | null;
}

/**
 * "Felt good on a full day: 4 events, 4 of 5 tasks done." with "Energy
 * steady · stress some" under it. Plain counts, no percentages, and no word
 * that judges the day: a day is full, lighter, quiet or a rest day.
 */
export function daySentence(d: DaySentenceInput): DaySentence {
  const future = d.when === 'future';
  const bits: string[] = [];
  if (d.events) bits.push(plural(d.events, 'event'));
  if (future) {
    if (d.tasksDue) bits.push(`${plural(d.tasksDue, 'task')} due`);
  } else if (d.tasksDue) {
    bits.push(`${d.tasksDueDone} of ${plural(d.tasksDue, 'task')} done`);
  } else if (d.tasksDone) {
    bits.push(`${plural(d.tasksDone, 'task')} done`);
  }
  if (!bits.length && !future) {
    if (d.habitsDone) bits.push(`${plural(d.habitsDone, 'habit')} done`);
    if (d.notes) bits.push(`${plural(d.notes, 'note')} edited`);
  }

  const hasMood = typeof d.mood === 'number';
  if (!bits.length && !hasMood) {
    if (future) return { main: 'Nothing planned for this day yet.', sub: null };
    const main = d.when === 'today' ? 'Nothing logged today yet.' : 'Nothing was logged on this day.';
    return { main, sub: d.mood === null ? 'That’s fine. You can still add how it went.' : 'That’s fine.' };
  }

  const kind = d.rest
    ? 'a rest day'
    : d.events >= 3 || d.tasksDue >= 4 ? 'a full day'
      : d.events || d.tasksDue ? 'a lighter day'
        : 'a quiet day';
  const counts = bits.length ? `: ${bits.join(', ')}.` : '.';

  if (future) return { main: `${capitalize(kind)} ahead${counts}`, sub: null };
  if (hasMood) {
    const feel = [
      d.energy ? `energy ${ENERGY_LABELS[d.energy - 1].toLowerCase()}` : null,
      d.stress ? `stress ${STRESS_LABELS[d.stress - 1].toLowerCase()}` : null,
    ].filter(Boolean).join(' · ');
    return { main: `Felt ${moodLabel(d.mood!).toLowerCase()} on ${kind}${counts}`, sub: feel ? capitalize(feel) : null };
  }
  if (d.mood === null) {
    return { main: `No check-in ${d.when === 'today' ? 'yet ' : ''}for ${kind}${counts}`, sub: 'Add how it went, any time.' };
  }
  return { main: `${capitalize(kind)}${counts}`, sub: null };
}

/** The day report's sections, in the order they're shown. */
export type ReportSectionKey = 'events' | 'tasks' | 'notes' | 'habits' | 'mood' | 'time';

/** Events start open everywhere; Tasks too, except on a phone, where the report stays short. */
export const defaultOpenSections = (phone: boolean): Record<ReportSectionKey, boolean> => ({
  events: true,
  tasks: !phone,
  notes: false,
  habits: false,
  mood: false,
  time: false,
});

/** A day's work window in minutes: opens, and closes (1440 = midnight), or null when it runs past midnight. */
export interface WorkWindow {
  opens: number;
  closes: number | null;
}

/** "HH:MM" work-window times as minutes: an end at 00:00 is midnight, one before the start ends the next day. */
export function workWindowFrom(start: string, end: string): WorkWindow {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const opens = toMin(start);
  const closesAt = toMin(end) === 0 && opens > 0 ? 1440 : toMin(end);
  return { opens, closes: closesAt > opens ? closesAt : null };
}

/** "8 AM", "6:30 PM" or "midnight" for minutes since midnight. */
export function minutesToClock(minutes: number): string {
  if (minutes >= 1440) return 'midnight';
  const pad = (n: number) => String(n).padStart(2, '0');
  return formatClock(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
}

/** The header line under the date: "Work day · 8 AM – 6 PM · Fall 2026" or "Rest day · Fall 2026". */
export function dayContextLine({ rest, window, term }: { rest: boolean; window: WorkWindow | null; term?: string | null }): string {
  const day = rest
    ? 'Rest day'
    : window
      ? `Work day · ${minutesToClock(window.opens)}${window.closes !== null ? ` – ${minutesToClock(window.closes)}` : ''}`
      : 'Work day';
  return term ? `${day} · ${term}` : day;
}

export type TimelineEntry =
  | { kind: 'event'; at: number; event: EventOccurrence }
  | { kind: 'task'; at: number; task: Task }
  | { kind: 'checkin'; at: number }
  | { kind: 'window'; at: number; edge: 'opens' | 'closes' };

/** Minutes since midnight of a timestamp, if it falls on `dateStr` (local time). */
export function minutesOnDay(at: string | Date | null | undefined, dateStr: string): number | null {
  // A bare "YYYY-MM-DD" carries no time of day.
  if (!at || (typeof at === 'string' && at.length <= 10)) return null;
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime()) || toLocalDateStr(d) !== dateStr) return null;
  return d.getHours() * 60 + d.getMinutes();
}

// Ties sort the window opening first and its closing last, around what happened at that minute.
const RANK: Record<TimelineEntry['kind'], number> = { window: 0, event: 1, task: 2, checkin: 3 };
const rank = (e: TimelineEntry) => (e.kind === 'window' && e.edge === 'closes' ? 4 : RANK[e.kind]);

/**
 * The day in order: timed events at their start, finished tasks at the time
 * they were finished and the check-in at the time it was logged. All-day
 * events have no place on it. The work window's edges are marked only when
 * something else is on the timeline.
 */
export function dayTimeline({ dateStr, events, tasksDone, checkinAt, window }: {
  dateStr: string;
  events: EventOccurrence[];
  tasksDone: Task[];
  checkinAt?: string | null;
  window?: WorkWindow | null;
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const event of events) {
    const span = occurrenceSpanOn(event, dateStr);
    if (span) entries.push({ kind: 'event', at: span.start, event });
  }
  for (const task of tasksDone) {
    const at = minutesOnDay(task.completed_date, dateStr);
    if (at !== null) entries.push({ kind: 'task', at, task });
  }
  const checkin = minutesOnDay(checkinAt, dateStr);
  if (checkin !== null) entries.push({ kind: 'checkin', at: checkin });
  if (entries.length && window) {
    entries.push({ kind: 'window', at: window.opens, edge: 'opens' });
    if (window.closes !== null) entries.push({ kind: 'window', at: window.closes, edge: 'closes' });
  }
  return entries.sort((a, b) => a.at - b.at || rank(a) - rank(b));
}
