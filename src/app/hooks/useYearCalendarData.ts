import { useEffect, useMemo, useState } from 'react';
import { useTasksContext } from '@/app/context/TasksContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useNotesContext } from '@/app/context/NotesContext';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import { Habit } from '@/app/types/habit';
import { Task } from '@/app/types/task';
import { Note } from '@/app/types/notes';
import type { EventOccurrence } from '@/app/types/event';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { occurrenceDays } from '@/app/utils/eventOccurrences';
import { useEventsVersion } from './useEventsVersion';

export interface DayData {
  dateStr: string; // YYYY-MM-DD
  habitsCompleted: Habit[];
  tasksDue: Task[];
  tasksCompleted: Task[];
  estimatedHours: number;
  notesEdited: Note[];
  /** Events on the day in start order: past ones (archived ones flagged) and upcoming ones that aren't archived. */
  events: EventOccurrence[];
}

interface YearActivityResult {
  /** The year this result answers, so a previous year's logs never paint onto the one being loaded. */
  year: number;
  logged: Map<number, Set<string>>;
  events: EventOccurrence[];
}

/**
 * Aggregates tasks/habits/notes/events into a per-day map for Jan 1 – Dec 31
 * of `year` (the current year by default). Habit completions and event
 * occurrences come from GET /get-calendar-activity for that whole year — one
 * ranged request that works for any past or future year, unlike
 * fetchHabitHistory's "past N days from today" window, which the backend caps
 * at 365 days. It reloads when events change (see useEventsVersion).
 *
 * `loading` only covers the first load; while a different year's habit
 * completions and events load, `yearLoading` is set and the tasks/notes for
 * the new year already show.
 */
export function useYearCalendarData(year: number = new Date().getFullYear()) {
  const { tasks, isLoading: tasksLoading } = useTasksContext();
  const { habits, habitsLoading } = useHabitsContext();
  const { notes, isLoading: notesLoading } = useNotesContext();

  const [yearActivity, setYearActivity] = useState<YearActivityResult | null>(null);
  const eventsVersion = useEventsVersion();

  useEffect(() => {
    if (habitsLoading) return;

    let cancelled = false;
    const todayStr = toLocalDateStr(new Date());

    // Fetched even without habits: the year's events come from the same call.
    fetchCalendarActivity(`${year}-01-01`, `${year}-12-31`)
      .then(activity => {
        if (cancelled) return;
        const map = new Map<number, Set<string>>(habits.map(h => [h.id, new Set<string>()]));
        for (const { habit_id, date } of activity.habit_completions) map.get(habit_id)?.add(date);
        // "Today" is tracked authoritatively on the habit object itself
        // (see useHabits/HabitHistoryModal) — keep this map in agreement.
        if (todayStr.startsWith(`${year}-`)) {
          for (const habit of habits) {
            const set = map.get(habit.id)!;
            if (habit.logged_today) set.add(todayStr);
            else set.delete(todayStr);
          }
        }
        setYearActivity({ year, logged: map, events: activity.events ?? [] });
      })
      .catch(err => {
        console.error('[useYearCalendarData] Failed to fetch the year\'s activity:', err);
        if (!cancelled) setYearActivity({ year, logged: new Map(), events: [] });
      });

    return () => { cancelled = true; };
    // habits.length is a reasonable proxy for habit set identity here — a
    // full deep dependency on `habits` would re-fetch the year on every
    // logged_today toggle, which is unnecessary since that override is
    // applied locally above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitsLoading, habits.length, year, eventsVersion]);

  const ready = yearActivity?.year === year ? yearActivity : null;
  const habitLogged = ready?.logged ?? null;
  const yearEvents = ready?.events ?? null;

  const dayData = useMemo(() => {
    const map = new Map<string, DayData>();
    const yearPrefix = `${year}-`;

    const ensure = (dateStr: string): DayData => {
      let d = map.get(dateStr);
      if (!d) {
        d = { dateStr, habitsCompleted: [], tasksDue: [], tasksCompleted: [], estimatedHours: 0, notesEdited: [], events: [] };
        map.set(dateStr, d);
      }
      return d;
    };

    for (const task of tasks) {
      if (!task.due_date) continue;
      const dateStr = toLocalDateStr(task.due_date);
      if (!dateStr.startsWith(yearPrefix)) continue;
      const d = ensure(dateStr);
      d.tasksDue.push(task);
      d.estimatedHours += task.estimated_time ?? 0;
    }

    for (const task of tasks) {
      if (!task.completed || !task.completed_date) continue;
      const dateStr = toLocalDateStr(task.completed_date);
      if (!dateStr.startsWith(yearPrefix)) continue;
      ensure(dateStr).tasksCompleted.push(task);
    }

    for (const note of notes) {
      const dateStr = toLocalDateStr(new Date(note.updated_date));
      if (!dateStr.startsWith(yearPrefix)) continue;
      ensure(dateStr).notesEdited.push(note);
    }

    for (const habit of habits) {
      const logged = habitLogged?.get(habit.id);
      if (!logged) continue;
      for (const dateStr of logged) {
        if (!dateStr.startsWith(yearPrefix)) continue;
        const d = ensure(dateStr);
        d.habitsCompleted.push(habit);
        d.estimatedHours += habit.estimated_time ?? 0;
      }
    }

    for (const occurrence of yearEvents ?? []) {
      for (const dateStr of occurrenceDays(occurrence)) {
        if (dateStr.startsWith(yearPrefix)) ensure(dateStr).events.push(occurrence);
      }
    }

    return map;
  }, [tasks, notes, habits, habitLogged, yearEvents, year]);

  return {
    year,
    dayData,
    habits,
    loading: tasksLoading || notesLoading || habitsLoading || yearActivity === null,
    yearLoading: habitLogged === null,
  };
}
