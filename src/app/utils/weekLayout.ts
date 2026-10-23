/**
 * Pure helpers behind the calendar's week view: week arithmetic, turning
 * tasks / calendar activity into per-day timed blocks and all-day items,
 * and laying overlapping blocks out side by side.
 *
 * All positions are minutes from local midnight (0–1440) of the day column
 * the block sits in, read from local calendar fields so they stay correct
 * for the viewer's own time zone.
 */
import type { ActivityHabitCompletion, ActivityNoteSession, ActivityTask } from '@/app/types/activity';
import type { Task } from '@/app/types/task';
import { toLocalDateStr, toLocalTimeStr } from './dateUtils';

export const MINUTES_PER_DAY = 24 * 60;
/** Granularity of the click-to-create slots. */
export const SLOT_MINUTES = 30;
/** Height given to a timed task that has no estimate. */
export const DEFAULT_TASK_MINUTES = 30;
/** Height given to a completion marker, which is a single instant. */
export const COMPLETION_MARKER_MINUTES = 30;
/** Shortest block drawn, so a 2-minute note session is still clickable. */
export const MIN_BLOCK_MINUTES = 20;
/** Sessions of one note on one day closer together than this merge into one block. */
export const NOTE_MERGE_GAP_MINUTES = 30;

export type TimedEventKind = 'task' | 'completed' | 'note';
export type AllDayItemKind = 'task' | 'habit';

export interface TimedEvent {
  key: string;
  kind: TimedEventKind;
  title: string;
  /** 0 = Monday … 6 = Sunday, within the displayed week. */
  dayIndex: number;
  /** The real start/end, used for labels. */
  startMin: number;
  endMin: number;
  /** The drawn extent: real times padded to MIN_BLOCK_MINUTES, clamped to the day. */
  drawStartMin: number;
  drawEndMin: number;
  taskId?: number;
  noteId?: number;
  /** Planned tasks only: whether the task has since been completed. */
  completed?: boolean;
  /** Notes only: minutes actually spent editing within the block's range. */
  workedMin?: number;
}

export interface AllDayItem {
  key: string;
  kind: AllDayItemKind;
  title: string;
  dayIndex: number;
  taskId?: number;
  habitId?: number;
  completed?: boolean;
}

export interface PositionedEvent extends TimedEvent {
  /** Zero-based column within its overlap cluster. */
  column: number;
  /** Number of columns its overlap cluster is split into. */
  columns: number;
}

/** Local midnight `n` days after `date` (DST-safe: steps calendar days, not 24h). */
export const addDays = (date: Date, n: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** Local midnight of the Monday starting the week that contains `date`. */
export const startOfWeek = (date: Date): Date =>
  addDays(date, -((date.getDay() + 6) % 7));

/** The seven local-midnight days of the week starting `weekStart`. */
export const weekDays = (weekStart: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** "HH:MM" or "HH:MM:SS" → minutes from midnight; null when unparseable. */
export const parseTimeToMinutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/** Minutes from midnight → "HH:MM", the shape the task form's time input takes. */
export const minutesToTimeStr = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Rounds `minutes` down to the nearest multiple of `step`. */
export const snapMinutes = (minutes: number, step = SLOT_MINUTES): number =>
  Math.floor(minutes / step) * step;

/** Short wall-clock label like "9:30 AM" for minutes from midnight. */
export const formatMinutes = (minutes: number): string => {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const minutesOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/** Pads a real [start, end) to at least `minLength` drawn minutes without leaving the day. */
const drawExtent = (startMin: number, endMin: number, minLength = MIN_BLOCK_MINUTES) => {
  const drawEndMin = Math.min(MINUTES_PER_DAY, Math.max(endMin, startMin + minLength));
  const drawStartMin = Math.max(0, Math.min(startMin, drawEndMin - minLength));
  return { drawStartMin, drawEndMin };
};

type ScheduledTask = Pick<Task, 'id' | 'title' | 'due_date' | 'due_time' | 'estimated_time' | 'completed'>;

interface BuildWeekEventsInput {
  weekStart: Date;
  /** Tasks with a due date; those due outside the week are ignored. */
  scheduledTasks: ScheduledTask[];
  completedTasks: Pick<ActivityTask, 'id' | 'title' | 'completed_date'>[];
  noteSessions: ActivityNoteSession[];
  habitCompletions: ActivityHabitCompletion[];
}

/**
 * Places everything for one week into day columns:
 * - planned tasks at their due time, sized by estimated_time (hours), or in
 *   the all-day row when they have a date but no time;
 * - completed tasks as a marker at their completion instant;
 * - note sessions as blocks from start to end, split at midnight when a
 *   session runs into the next day, with each note's sessions on a day
 *   merged when they are close together (see buildNoteBlocks);
 * - habit completions in the all-day row, since they carry no time.
 */
export function buildWeekEvents({
  weekStart,
  scheduledTasks,
  completedTasks,
  noteSessions,
  habitCompletions,
}: BuildWeekEventsInput): { timed: TimedEvent[]; allDay: AllDayItem[] } {
  const days = weekDays(weekStart);
  const dayIndexByDate = new Map(days.map((d, i) => [toLocalDateStr(d), i]));
  const timed: TimedEvent[] = [];
  const allDay: AllDayItem[] = [];

  for (const task of scheduledTasks) {
    if (!task.due_date) continue;
    const dayIndex = dayIndexByDate.get(toLocalDateStr(task.due_date));
    if (dayIndex === undefined) continue;
    const timeStr = task.due_time instanceof Date ? toLocalTimeStr(task.due_time) : task.due_time;
    const startMin = timeStr ? parseTimeToMinutes(timeStr) : null;
    if (startMin === null) {
      allDay.push({ key: `task-${task.id}`, kind: 'task', title: task.title, dayIndex, taskId: task.id, completed: task.completed });
      continue;
    }
    const estimate = task.estimated_time ? Math.round(task.estimated_time * 60) : DEFAULT_TASK_MINUTES;
    const endMin = Math.min(MINUTES_PER_DAY, startMin + estimate);
    timed.push({
      key: `task-${task.id}`, kind: 'task', title: task.title, dayIndex, startMin, endMin,
      ...drawExtent(startMin, endMin), taskId: task.id, completed: task.completed,
    });
  }

  for (const task of completedTasks) {
    if (!task.completed_date) continue;
    const at = new Date(task.completed_date);
    if (isNaN(at.getTime())) continue;
    const dayIndex = dayIndexByDate.get(toLocalDateStr(at));
    if (dayIndex === undefined) continue;
    const startMin = minutesOfDay(at);
    timed.push({
      key: `completed-${task.id}`, kind: 'completed', title: task.title, dayIndex, startMin, endMin: startMin,
      ...drawExtent(startMin, startMin, COMPLETION_MARKER_MINUTES), taskId: task.id,
    });
  }

  timed.push(...buildNoteBlocks(noteSessions, days));

  for (const completion of habitCompletions) {
    const dayIndex = dayIndexByDate.get(completion.date);
    if (dayIndex === undefined) continue;
    allDay.push({
      key: `habit-${completion.habit_id}-${completion.date}`, kind: 'habit', title: completion.habit_title,
      dayIndex, habitId: completion.habit_id,
    });
  }

  return { timed, allDay };
}

interface NoteSegment {
  noteId: number;
  title: string;
  sessionId: number;
  dayIndex: number;
  /** Real instants, clipped to the day. */
  startMs: number;
  endMs: number;
}

/**
 * Turns note sessions into one block per run of work on a note: each session
 * is split at local midnight, then a note's pieces on the same day merge when
 * the gap from one's end to the next's start is under NOTE_MERGE_GAP_MINUTES
 * (overlapping ones always merge). A merged block spans the earliest start to
 * the latest end, and `workedMin` counts the time covered by its sessions,
 * without counting overlaps twice.
 */
export function buildNoteBlocks(noteSessions: ActivityNoteSession[], days: Date[]): TimedEvent[] {
  const segments: NoteSegment[] = [];
  for (const session of noteSessions) {
    const start = new Date(session.started_at);
    const end = new Date(session.ended_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) continue;
    days.forEach((day, dayIndex) => {
      const nextDay = addDays(day, 1);
      if (end < day || start >= nextDay) return;
      // A session ending exactly at midnight belongs to the day before.
      if (end.getTime() === day.getTime() && start < day) return;
      segments.push({
        noteId: session.note_id, title: session.note_title || 'Untitled note', sessionId: session.id, dayIndex,
        startMs: Math.max(start.getTime(), day.getTime()), endMs: Math.min(end.getTime(), nextDay.getTime()),
      });
    });
  }

  segments.sort((a, b) => a.noteId - b.noteId || a.dayIndex - b.dayIndex || a.startMs - b.startMs);
  const maxGapMs = NOTE_MERGE_GAP_MINUTES * 60_000;
  const blocks: TimedEvent[] = [];
  let run: NoteSegment[] = [];
  let runEndMs = 0;

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0];
    const day = days[first.dayIndex];
    const dayMs = day.getTime();
    // Sorted by start, so a running end mark is enough to skip overlaps.
    let workedMs = 0;
    let coveredTo = -Infinity;
    for (const s of run) {
      workedMs += Math.max(0, s.endMs - Math.max(s.startMs, coveredTo));
      coveredTo = Math.max(coveredTo, s.endMs);
    }
    const startMin = first.startMs === dayMs ? 0 : minutesOfDay(new Date(first.startMs));
    const endMin = runEndMs === addDays(day, 1).getTime() ? MINUTES_PER_DAY : minutesOfDay(new Date(runEndMs));
    blocks.push({
      key: `note-${first.sessionId}-${first.dayIndex}`, kind: 'note', title: first.title,
      dayIndex: first.dayIndex, startMin, endMin, ...drawExtent(startMin, endMin),
      noteId: first.noteId, workedMin: Math.round(workedMs / 60_000),
    });
    run = [];
  };

  for (const segment of segments) {
    const prev = run[run.length - 1];
    if (!prev || prev.noteId !== segment.noteId || prev.dayIndex !== segment.dayIndex || segment.startMs - runEndMs >= maxGapMs) {
      flush();
      runEndMs = segment.endMs;
    }
    run.push(segment);
    runEndMs = Math.max(runEndMs, segment.endMs);
  }
  flush();
  return blocks;
}

/**
 * Splits one day's blocks into side-by-side columns wherever they overlap
 * (by drawn extent), like Google Calendar: each run of transitively
 * overlapping blocks shares a column count, and each block takes the
 * leftmost column free at its start.
 */
export function layoutDayEvents(events: TimedEvent[]): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.drawStartMin - b.drawStartMin || b.drawEndMin - a.drawEndMin || a.key.localeCompare(b.key),
  );
  const result: PositionedEvent[] = [];
  let cluster: PositionedEvent[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const e of cluster) e.columns = columnEnds.length;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const event of sorted) {
    if (event.drawStartMin >= clusterEnd) flush();
    let column = columnEnds.findIndex(end => end <= event.drawStartMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(event.drawEndMin);
    } else {
      columnEnds[column] = event.drawEndMin;
    }
    cluster.push({ ...event, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, event.drawEndMin);
  }
  flush();
  return result;
}

/** How one day column shows the user's work window (Settings → Work day and rest). */
export interface WorkDayMarks {
  /** The day is one of the user's rest days. */
  rest: boolean;
  /** [start, end) minute ranges of the day outside any work window. */
  off: [number, number][];
  /** Minute the day's own window opens, or null on a rest day. */
  opensAt: number | null;
  /** Minutes a window closes on this day, earliest first: the previous day's when it ran past midnight, then the day's own. */
  closesAt: number[];
}

/** A day's work window as [start, end) minutes; an end at or before the start runs past midnight. */
export type WindowMinutes = [number, number];

/**
 * Where the work window falls on `day`: on each day that isn't a rest day it
 * opens and closes at that weekday's window from `windowOn` (0=Sun..6=Sat).
 * A window that ends at or before it starts runs past midnight, so its tail
 * (and its close) lands on the next day, rest day or not. One that ends at
 * midnight closes at the bottom of its own day.
 */
export function workDayMarks(day: Date, restDays: number[], windowOn: (weekday: number) => WindowMinutes): WorkDayMarks {
  const span = (weekday: number) => {
    const [startMin, endTime] = windowOn(weekday);
    const endMin = endTime === 0 && startMin > 0 ? MINUTES_PER_DAY : endTime;
    return { startMin, endMin, pastMidnight: endMin <= startMin };
  };
  const weekday = day.getDay();
  const previousWeekday = (weekday + 6) % 7;
  const rest = restDays.includes(weekday);
  const previousRest = restDays.includes(previousWeekday);
  const { startMin, endMin, pastMidnight } = span(weekday);
  const previous = span(previousWeekday);
  // The previous day's window running into this one, if it does.
  const spill = previous.pastMidnight && !previousRest ? previous.endMin : null;

  const windows: [number, number][] = [];
  if (spill !== null) windows.push([0, spill]);
  if (!rest) windows.push([startMin, pastMidnight ? MINUTES_PER_DAY : endMin]);

  const off: [number, number][] = [];
  let from = 0;
  for (const [start, end] of windows) {
    if (start > from) off.push([from, start]);
    from = Math.max(from, end);
  }
  if (from < MINUTES_PER_DAY) off.push([from, MINUTES_PER_DAY]);

  return {
    rest,
    off,
    opensAt: rest ? null : startMin,
    closesAt: [
      ...(spill === null ? [] : [spill]),
      ...(!rest && !pastMidnight ? [endMin] : []),
    ],
  };
}
