import type { Tag } from './task';

// Types matching the backend's Google Calendar API. Everything is read-only
// from Google's side: kanso imports events and never writes back.

/** GET /google-calendar/status, also returned by POST /google-calendar/sync. */
export interface GoogleCalendarStatus {
  /** False until the Google OAuth keys are set on the server; nothing offers to connect then. */
  configured: boolean;
  connected: boolean;
  /** The connected Google account. */
  email: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

/** One of the user's Google calendars, from GET /google-calendar/calendars. */
export interface GoogleCalendarEntry {
  id: string;
  name: string;
  color: string | null;
  /** Whether its events show in kanso. */
  selected: boolean;
  /** The tag its events get unless one has its own. */
  default_tag: Tag | null;
}

/** PATCH /google-calendar/calendars/{id}: only the fields sent change. */
export interface GoogleCalendarUpdate {
  selected?: boolean;
  default_tag_id?: number | null;
}
