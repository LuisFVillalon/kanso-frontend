/** Alert types the backend computes (kanso-backend app/schemas/notification_schema.py). */
export type NotificationType =
  | 'due_today' | 'task_reminder' | 'final_warning' | 'overdue' | 'habit_reminder'
  | 'mood_reminder' | 'mood_missed';

/** One in-app notification, as GET /get-notifications returns it. */
export interface AppNotification {
  /** Deterministic: "{type}:{subject}:{occurrence}", e.g. "overdue:task-12:2026-10-20T16:00". */
  id: string;
  /** A `NotificationType`, or a type added server-side after this build. */
  type: string;
  title: string;
  body: string;
  /** When it was delivered (UTC, `Z` suffix). */
  fire_at: string;
  task_ids: number[];
  habit_ids: number[];
  /**
   * The local days ("YYYY-MM-DD") a mood notification is about: the day to
   * check in for a `mood_reminder`, the days without a check-in for a
   * `mood_missed`. Absent on other types and from older servers.
   */
  dates?: string[];
  read: boolean;
}

export interface NotificationPreferences {
  /** Every type the server knows, true unless switched off. */
  types: Record<string, boolean>;
  /** Local "HH:MM", or null when quiet hours are off. Set as a pair. */
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  default_reminder_minutes: number;
  /** How long before "Call it a day" the mood reminder comes, in minutes (1 to 1439, under a day). Absent from older servers. */
  mood_reminder_minutes?: number;
}

/** PATCH /update-notification-preferences: only the fields given change. */
export interface NotificationPreferencesUpdate {
  types?: Record<string, boolean>;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  /** null restores the built-in default (120). */
  default_reminder_minutes?: number | null;
  mood_reminder_minutes?: number;
}
