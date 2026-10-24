import type { EventOccurrence } from './event';
import { Tag } from './task';

// Types matching the backend's CalendarActivity response
// (GET /get-calendar-activity). Dates are local "YYYY-MM-DD" days and times
// are local "HH:MM:SS"; completion and session timestamps are UTC ISO
// strings with a "Z" suffix, so `new Date(...)` places them correctly.

export interface ActivityTask {
  id: number;
  title: string;
  category: string | null;
  priority: number | null;
  due_date: string | null;
  due_time: string | null;
  /** Hours. */
  estimated_time: number | null;
  completed: boolean;
  completed_date: string | null;
  parent_task_id: number | null;
  tags: Tag[];
}

export interface ActivityNoteSession {
  id: number;
  note_id: number;
  note_title: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

export interface ActivityHabitCompletion {
  habit_id: number;
  habit_title: string;
  date: string;
  estimated_time: number | null;
}

/** A note with sessions in the range, and the tags it carries now. */
export interface ActivityNote {
  id: number;
  title: string;
  tags: Tag[];
}

/** A habit with check-ins in the range, and the tags it carries now. */
export interface ActivityHabit {
  id: number;
  title: string;
  /** Hours per check-in. */
  estimated_time: number | null;
  tags: Tag[];
}

export interface CalendarActivity {
  start_date: string;
  end_date: string;
  /** Tasks due on a day in the range, completed or not. */
  scheduled_tasks: ActivityTask[];
  /** Tasks completed during the range, whatever their due date. */
  completed_tasks: ActivityTask[];
  /** Closed note editing sessions that overlap the range. */
  note_sessions: ActivityNoteSession[];
  habit_completions: ActivityHabitCompletion[];
  /** The notes behind `note_sessions`. Older backends leave it out, and their notes count as untagged. */
  notes?: ActivityNote[];
  /** The habits behind `habit_completions`. Older backends leave it out, and their habits count as untagged. */
  habits?: ActivityHabit[];
  /**
   * Event occurrences in the range, by start: past ones always (archived ones
   * flagged), upcoming ones unless archived. Older backends leave it out.
   */
  events?: EventOccurrence[];
}
