import { useContext, useEffect, useMemo, useState } from 'react';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import { AppShellContext } from '@/app/context/AppShellContext';
import { useEventsVersion } from '@/app/hooks/useEventsVersion';
import { useWorkBlocksVersion } from '@/app/hooks/useWorkBlocksVersion';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';
import { DEFAULT_DAY_END, DEFAULT_DAY_START, dayWindowOn } from '@/app/lib/restDays';
import { parseLocalDate, toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';
import { timeToMinutes } from '@/app/utils/eventOccurrences';
import {
  DEFAULT_PLAN_MINUTES, PLAN_HORIZON_DAYS, addDaysStr,
  type BusyItem, type HabitInput, type PlannedBlock, type SlotState, type Span, type TaskInput,
} from '@/app/utils/slotSuggest';

const DEFAULT_REST_DAYS = [0, 6];
const HH_MM = /^\d{1,2}:\d{2}/;

/** Minutes from midnight of an "HH:MM[:SS]" time, or null. */
export const minutesOf = (time: string | null | undefined): number | null =>
  time && HH_MM.test(time) ? timeToMinutes(time.slice(0, 5)) : null;

/** A length in hours (a task's estimate, a habit's goal) as planned minutes: 30 without one. */
export const planMinutes = (hours: number | null | undefined): number =>
  hours != null && hours > 0 ? Math.max(15, Math.round((hours * 60) / 15) * 15) : DEFAULT_PLAN_MINUTES;

type WorkDay = Pick<ProfileFields, 'dayStartTime' | 'shutoffTime' | 'restDays'> & Partial<Pick<ProfileFields, 'dayWindows'>>;

/** The work window on a local day as [start, end) minutes (one past midnight is cut at midnight), or null on a rest day. */
export function windowFor(profile: WorkDay | null | undefined) {
  const restDays = profile?.restDays ?? DEFAULT_REST_DAYS;
  const start = profile?.dayStartTime ?? DEFAULT_DAY_START;
  const end = profile?.shutoffTime ?? DEFAULT_DAY_END;
  return (date: string): Span | null => {
    const weekday = parseLocalDate(date).getDay();
    if (restDays.includes(weekday)) return null;
    const w = dayWindowOn(weekday, start, end, profile?.dayWindows ?? {});
    const s = minutesOf(w.start) ?? minutesOf(DEFAULT_DAY_START)!;
    const e = minutesOf(w.end) ?? minutesOf(DEFAULT_DAY_END)!;
    return [s, e > s ? e : 24 * 60];
  };
}

/** An event's busy pieces, one per local day it covers (cut at midnight). All-day and archived ones take no time. */
export function eventBusyItems(o: EventOccurrence): BusyItem[] {
  if (o.archived) return [];
  const start = minutesOf(o.start_time);
  const end = minutesOf(o.end_time);
  if (o.all_day || start === null || end === null) return [{ date: o.date, start: 0, end: 0, title: o.title, allDay: true }];
  const busy = o.busy !== false;
  const last = o.end_date && o.end_date > o.date ? o.end_date : o.date;
  if (last === o.date) return [{ date: o.date, start, end: end > start ? end : 24 * 60, title: o.title, busy }];
  const out: BusyItem[] = [{ date: o.date, start, end: 24 * 60, title: o.title, busy }];
  for (let d = addDaysStr(o.date, 1); d <= last; d = addDaysStr(d, 1)) {
    out.push({ date: d, start: 0, end: d === last ? end : 24 * 60, title: o.title, busy });
  }
  return out.filter(x => x.end > x.start);
}

/** A work block as the rules read it. */
export const blockSpan = (b: WorkBlock): PlannedBlock => {
  const start = minutesOf(b.start_time) ?? 0;
  const end = minutesOf(b.end_time) ?? start;
  return { date: b.date, start, end: end > start ? end : 24 * 60, taskId: b.task_id, habitId: b.habit_id };
};

const dueDateOf = (t: Pick<Task, 'due_date'>) => (t.due_date ? toLocalDateStr(t.due_date) : null);
export const dueMinutesOf = (t: Pick<Task, 'due_time'>): number | null =>
  t.due_time instanceof Date ? minutesOf(toLocalTimeStr(t.due_time)) : minutesOf(t.due_time);

interface BuildInput {
  now: Date;
  profile: WorkDay | null | undefined;
  tasks: Task[];
  habits: Habit[];
  events: EventOccurrence[];
  workBlocks: WorkBlock[];
  /** Tasks left out of the holds: the one being planned. */
  excludeTaskIds?: number[];
}

/** The rules' state from the app's data. */
export function buildSlotState({ now, profile, tasks, habits, events, workBlocks, excludeTaskIds = [] }: BuildInput): SlotState {
  const today = toLocalDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = workBlocks.map(blockSpan);
  const exclude = new Set(excludeTaskIds);
  const plannedIds = new Set(blocks
    .filter(b => b.taskId != null && (b.date > today || (b.date === today && b.end > nowMin)))
    .map(b => b.taskId!));
  const taskInputs: TaskInput[] = tasks.flatMap(t => {
    const date = dueDateOf(t);
    if (t.completed || t.archived_at || !date || exclude.has(t.id)) return [];
    return [{ id: t.id, title: t.title, len: planMinutes(t.estimated_time), due: { date, min: dueMinutesOf(t) ?? 24 * 60 }, planned: plannedIds.has(t.id) }];
  });
  const habitInputs: HabitInput[] = habits.filter(h => !h.archived_at).map(h => ({
    id: h.id, title: h.title, len: planMinutes(h.estimated_time), time: minutesOf(h.planned_time), done: !!h.logged_today,
  }));
  return {
    now: { date: today, min: nowMin },
    windowOn: windowFor(profile),
    events: events.flatMap(eventBusyItems),
    blocks,
    habits: habitInputs,
    tasks: taskInputs,
  };
}

// Views that ask at the same time (the form, the calendar, the brief) share
// one read of the planning horizon; each keeps its own last answer after.
const inFlight = new Map<string, Promise<CalendarActivity>>();

function loadHorizon(today: string, key: string): Promise<CalendarActivity> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  let request: Promise<CalendarActivity>;
  try {
    request = fetchCalendarActivity(today, addDaysStr(today, PLAN_HORIZON_DAYS - 1));
  } catch (err) {
    request = Promise.reject(err);
  }
  request = request.finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** The current time, refreshed every minute. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export interface SlotPlanner {
  state: SlotState;
  /** Events over the planning horizon (from today), for names and the strip. */
  events: EventOccurrence[];
  /** Kept work blocks over the planning horizon. */
  workBlocks: WorkBlock[];
  /** False while the work day has never been saved, so the suggestions use the defaults. */
  workHoursSet: boolean;
  today: string;
}

interface UseSlotPlannerInput {
  /** Off until it's needed (say, until the task has a title), so nothing loads early. */
  enabled: boolean;
  tasks: Task[];
  habits: Habit[];
  /** The work day to plan in; the app shell's profile when left out. */
  profile?: ProfileFields | null;
  excludeTaskIds?: number[];
  /** Extra things that should reload the horizon when they change (e.g. a task or habit save). */
  reloadKey?: string | number;
}

/**
 * What the suggestion rules need, from now to PLAN_HORIZON_DAYS ahead: the
 * work windows, events and kept work blocks (GET /get-calendar-activity), the
 * habits and the open tasks. Null until the calendar has loaded, or when it
 * can't be: the callers then leave suggestions out.
 */
export function useSlotPlanner({ enabled, tasks, habits, profile, excludeTaskIds, reloadKey = '' }: UseSlotPlannerInput): SlotPlanner | null {
  const shellProfile = useContext(AppShellContext)?.profileState.profile;
  const workDay = profile ?? shellProfile ?? null;
  const now = useMinute();
  const today = toLocalDateStr(now);
  const eventsVersion = useEventsVersion();
  const blocksVersion = useWorkBlocksVersion();
  const key = `${today}|${eventsVersion}|${blocksVersion}|${reloadKey}`;
  const [loaded, setLoaded] = useState<{ key: string; activity: CalendarActivity } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadHorizon(today, key)
      .then(activity => { if (!cancelled) setLoaded({ key, activity }); })
      .catch(err => console.error('[useSlotPlanner] Failed to load the calendar:', err));
    return () => { cancelled = true; };
  }, [enabled, today, key]);

  // While a reload is in flight the last one stands in, so rows don't flicker.
  const activity = loaded?.activity ?? null;
  const excludeKey = (excludeTaskIds ?? []).join(',');
  return useMemo(() => {
    if (!enabled || !activity) return null;
    const events = activity.events ?? [];
    const workBlocks = activity.work_blocks ?? [];
    return {
      state: buildSlotState({ now, profile: workDay, tasks, habits, events, workBlocks, excludeTaskIds: excludeKey ? excludeKey.split(',').map(Number) : [] }),
      events,
      workBlocks,
      workHoursSet: workDay?.workHoursSet ?? true,
      today,
    };
  }, [enabled, activity, now, workDay, tasks, habits, excludeKey, today]);
}
