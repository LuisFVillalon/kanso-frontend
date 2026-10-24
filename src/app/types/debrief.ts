import type { EventOccurrence, EventTagMinutes } from './event';

export interface DebriefTag {
  id: number;
  name: string;
  color: string | null;
}

export interface DebriefTaskItem {
  id: number;
  title: string;
  category: string | null;
  priority: number | null;
  due_date: string | null;
  due_time: string | null;
  estimated_time: number | null;
  tags: DebriefTag[];
}

interface HabitDebriefStatus {
  id: number;
  title: string;
  current_streak: number;
  max_streak: number;
  logged_today: boolean;
  estimated_time: number | null;
  tags: DebriefTag[];
}

interface DebriefNoteItem {
  id: number;
  title: string;
  minutes: number;
  tags: DebriefTag[];
}

interface WorkloadCapacity {
  is_rest_day: boolean;
  /** Today's work window; null without a day start and "Call it a day". Absent from older servers. */
  window_minutes?: number | null;
  /** Minutes of the window today's events take, overlaps counted once; archived and all-day events take none. */
  event_minutes?: number;
  /** What the window leaves for tasks once events are out: window_minutes - event_minutes. */
  available_minutes: number | null;
  committed_minutes: number;
  /** available_minutes - committed_minutes, at least 0: free in the window after events and tasks due. */
  free_minutes?: number | null;
  utilization_pct: number | null;
  is_overcommitted: boolean;
}

type FocusNextReason = 'high_priority' | 'upcoming_high_effort';

export interface FocusNextItem {
  task_id: number;
  title: string;
  priority: number | null;
  due_date: string | null;
  estimated_time: number | null;
  reason: FocusNextReason;
}

export interface DailyDebriefReport {
  report_date: string;
  overdue_tasks: DebriefTaskItem[];
  due_today_tasks: DebriefTaskItem[];
  completed_today_tasks: DebriefTaskItem[];
  notes_worked_today: DebriefNoteItem[];
  habit_status: HabitDebriefStatus[];
  workload: WorkloadCapacity;
  focus_next: FocusNextItem[];
  /** Today's events in start order, as the calendar shows them (past archived ones flagged). Absent from older servers. */
  events_today?: EventOccurrence[];
  /** The ones that have ended by now, archived ones left out: today's activity. */
  passed_events_today?: EventOccurrence[];
  /** Today's event minutes per tag, archived ones left out, for the time allocation bar. */
  event_minutes_by_tag?: EventTagMinutes[];
  passed_event_minutes_by_tag?: EventTagMinutes[];
}
