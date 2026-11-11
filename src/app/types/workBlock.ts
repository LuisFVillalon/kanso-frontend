import type { Tag } from './task';

// Types matching the backend's work blocks API: time set aside on the
// calendar to work on a task (or, for one day, to do a habit), apart from the
// task's due date. Dates are local "YYYY-MM-DD", times local "HH:MM", and
// instants UTC with a "Z". Kept apart from events, so Reports and event
// reminders never count them.

export interface WorkBlock {
  id: number;
  /** Exactly one of task_id and habit_id is set. */
  task_id: number | null;
  habit_id: number | null;
  /** The task's or habit's title and tags, as they are now. */
  title: string;
  tags: Tag[];
  date: string;
  start_time: string;
  end_time: string;
  time_zone: string;
  starts_at: string;
  ends_at: string;
}

/** POST /create-work-block: for a task or a habit. */
export type WorkBlockCreate = ({ task_id: number; habit_id?: never } | { habit_id: number; task_id?: never }) & {
  date: string;
  start_time: string;
  end_time: string;
  time_zone: string;
};

/** PUT /update-work-block/{id}: a move or a resize. */
export interface WorkBlockUpdate {
  date: string;
  start_time: string;
  end_time: string;
}
