import type { Tag } from './task';

// Types matching the backend's events API (kanso-backend
// app/schemas/event_schema.py). Dates are "YYYY-MM-DD", times are local
// "HH:MM[:SS]" wall-clock times, and instants are UTC with a "Z".
//
// Named CalendarEvent rather than Event so it isn't mixed up with the DOM's
// Event, or with the week grid's TimedEvent (any block on the grid).

/** Which occurrences of a repeating event an edit, archive or delete applies to. */
export type EditScope = 'this' | 'following' | 'all';

/** A tag as sent on create/update: matched to the user's tags by name, like a task's. */
export interface EventTagInput {
  name: string;
  color?: string;
}

/** POST /create-event. */
export interface CalendarEventCreate {
  title: string;
  description?: string | null;
  tags: EventTagInput[];
  all_day: boolean;
  /** The first day; for a repeating event, the first day it can repeat on. */
  start_date: string;
  /** The last day a repeating event can repeat on; null repeats forever. Ignored for a one-off event. */
  end_date: string | null;
  /** Required unless all_day. An end before the start runs past midnight; an end equal to the start is refused. */
  start_time: string | null;
  end_time: string | null;
  /** The browser's IANA zone, e.g. America/Los_Angeles. */
  time_zone: string;
  /** Weekdays to repeat on, 0=Sun..6=Sat (as the profile's rest_days); empty for a one-off event. */
  repeat_days: number[];
  /** Every this many weeks, 1–52 (2 is biweekly), counting Sunday-to-Saturday weeks from start_date's. */
  repeat_interval: number;
  /** Minutes before each occurrence to remind, 0–10080; null is no reminder (not "the default", as on tasks). */
  reminder_minutes: number | null;
}

/**
 * PUT /update-event/{id}: only the fields sent change. With scope=this only
 * title, description, tags, all_day, start_time, end_time and date apply;
 * `date` moves that one occurrence (or a one-off event) to another day.
 */
export type CalendarEventUpdate = Partial<CalendarEventCreate> & { date?: string };

/** An event series, as the API returns it. */
export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  tags: Tag[];
  all_day: boolean;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  time_zone: string;
  repeat_days: number[];
  repeat_interval: number;
  reminder_minutes: number | null;
  /** Set on the series a "this and following" change split off. */
  split_from_id: number | null;
  created_date: string;
  /** Set while the whole series is archived. */
  archived_at: string | null;
  /** Set while the series is in the trash. */
  deleted_at: string | null;
}

/** One occurrence of an event, as placed on the caller's calendar (GET /get-calendar-activity `events`). */
export interface EventOccurrence {
  event_id: number;
  /** The day the series' rule puts it on, in the series' zone. Pass it back as occurrence_date for scope=this/following. */
  occurrence_date: string;
  title: string;
  description: string | null;
  tags: Tag[];
  all_day: boolean;
  /** The local day it starts and ends on; end_date is the next day when it runs past midnight. */
  date: string;
  end_date: string;
  /** Local times; null for an all-day event. */
  start_time: string | null;
  end_time: string | null;
  /** UTC instants; an all-day event spans its day's midnights. */
  starts_at: string;
  ends_at: string;
  time_zone: string;
  repeat_days: number[];
  repeat_interval: number;
  reminder_minutes: number | null;
  /** Changed or moved on its own. */
  edited: boolean;
  /** Ended before the server's now. */
  past: boolean;
  /** Archived, on its own or with its series. */
  archived: boolean;
}

/** Event minutes under one tag; an event with several tags counts in full under each. */
export interface EventTagMinutes {
  /** null for events without a tag. */
  tag: Tag | null;
  minutes: number;
  count: number;
}

export interface EventReportDay {
  date: string;
  count: number;
  /** Event minutes on the day; an event past midnight counts on both days. */
  minutes: number;
  is_rest_day: boolean;
  /** The work window's length, 0 on a rest day. */
  window_minutes: number;
  /** Window minutes events took; overlapping events count once. */
  event_window_minutes: number;
  /** window_minutes − event_window_minutes. */
  free_minutes: number;
}

export interface EventReportPeriod {
  /** A Sunday for weeks, the 1st for months. */
  start: string;
  count: number;
  minutes: number;
}

/** GET /get-event-report: what the calendar shows over a range, past archived occurrences included. */
export interface EventReport {
  start_date: string;
  end_date: string;
  event_count: number;
  /** Past archived occurrences in the range. */
  archived_count: number;
  /** All-day events count but add no minutes. */
  total_minutes: number;
  /** Every day's work window added up (rest days add none). */
  window_minutes: number;
  event_window_minutes: number;
  /** The time left in the work windows over the period after events. */
  free_minutes: number;
  /** free_minutes as a share of window_minutes (0–100), or null with no work hours. */
  free_pct: number | null;
  busiest_day: EventReportDay | null;
  by_tag: EventTagMinutes[];
  by_day: EventReportDay[];
  by_week: EventReportPeriod[];
  by_month: EventReportPeriod[];
}
