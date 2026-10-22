/**
 * "invalid" means Canvas rejected the token or feed link, or the token
 * expired: the user has to reconnect.
 */
export type CanvasStatus = 'active' | 'invalid' | 'error';

/**
 * How Canvas is connected: a personal access token, or the private, read-only
 * calendar feed link (Canvas → Calendar → Calendar Feed), which needs no
 * school approval but carries only the user's own due dates.
 */
export type CanvasConnectionType = 'token' | 'feed';

/**
 * What a connection can show. A token can show everything; the calendar
 * feed only upcoming items and tasks added from them: no missing or graded
 * work, courses, modules, assignments, announcements or submission status.
 * All false while not connected.
 */
export interface CanvasCapabilities {
  /** GET /canvas/overview's upcoming list. */
  upcoming: boolean;
  /** Its missing and recently_graded lists. */
  missing: boolean;
  recently_graded: boolean;
  /** GET /canvas/courses (grades), and a course's modules and assignments. */
  courses: boolean;
  modules: boolean;
  assignments: boolean;
  announcements: boolean;
  /** Add to tasks, and the linked-task sync of due dates. */
  link_tasks: boolean;
  /** The linked-task sync reports whether an assignment was submitted. */
  submission_status: boolean;
}

export type CanvasCapability = keyof CanvasCapabilities;

/**
 * The masked Canvas connection, as the /canvas/connection routes return it
 * (kanso-backend app/schemas/canvas_schema.py). Never carries the token or
 * the feed link itself.
 */
export interface CanvasConnection {
  connected: boolean;
  status: CanvasStatus | null;
  /** Null when not connected; a backend from before the calendar feed leaves it out (a token). */
  connection_type?: CanvasConnectionType | null;
  /** Left out by a backend from before the calendar feed, where everything is a token's. */
  capabilities?: CanvasCapabilities;
  /** Normalized "https://host". */
  base_url: string | null;
  /** The token's last 4 characters, or for a feed its code's. */
  token_last4: string | null;
  /** A feed's link with its code cut to the last 4: "https://host/feeds/calendars/user_…xxxx.ics". */
  feed_url_masked?: string | null;
  canvas_user_id: number | null;
  canvas_user_name: string | null;
  /** ISO timestamps from here on, null when unknown or never. */
  token_expires_at: string | null;
  hidden_course_ids: number[];
  created_at: string | null;
  updated_at: string | null;
  last_synced_at: string | null;
  last_error_at: string | null;
}

/** One of the user's Canvas courses, as listed under "Courses to show". */
export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string | null;
}

/** The codes the Canvas routes send as their error detail. */
export type CanvasErrorCode =
  | 'canvas_url_invalid'
  | 'canvas_not_canvas'
  | 'canvas_token_invalid'
  | 'canvas_feed_url_invalid'
  | 'canvas_feed_invalid'
  | 'canvas_forbidden'
  | 'canvas_account_changed'
  | 'canvas_unavailable'
  | 'canvas_not_connected'
  | 'canvas_not_configured';

// ── Panel data ───────────────────────────────────────────────────────────────
// The trimmed shapes the /canvas read routes return (kanso-backend
// app/schemas/canvas_schema.py). Dates are ISO timestamps; every html_url is
// an https link on the school's own Canvas host, or null.

export type CanvasReadErrorCode =
  | 'canvas_busy'
  | 'canvas_course_hidden'
  | 'canvas_course_not_found'
  | 'canvas_feed_invalid'
  | 'canvas_not_supported';

/** Freshness fields every read route sends with its data. */
export interface CanvasReadMeta {
  /** When the backend fetched the data from Canvas, for "Synced 3 min ago". */
  fetched_at: string;
  /** Canvas is rate-limiting the token, so this is the last data fetched. */
  busy: boolean;
  /** Canvas couldn't be reached or is busy, so this is older than usual. */
  stale: boolean;
  /** Read-only sample data, for demo sandboxes. */
  sample: boolean;
}

export type CanvasItemKind = 'assignment' | 'quiz' | 'discussion' | 'page' | 'event' | 'note' | 'other';

/** The user's own submission for an item. */
export interface CanvasSubmission {
  submitted: boolean;
  missing: boolean;
  late: boolean;
  graded: boolean;
  excused: boolean;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  graded_at: string | null;
}

/** Something with a due date: an assignment, quiz, discussion, page, event or planner note. */
export interface CanvasItem {
  id: number;
  kind: CanvasItemKind;
  title: string;
  course_id: number | null;
  course_name: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string | null;
  submission: CanvasSubmission | null;
  /** The Canvas assignment behind a planner quiz or discussion, when the backend sends it. */
  assignment_id?: number | null;
}

/** A course's assignment; quizzes are assignments too, with kind "quiz". */
export interface CanvasAssignment extends CanvasItem {
  unlock_at: string | null;
  lock_at: string | null;
  quiz_id: number | null;
  submission_types: string[];
}

/** An active course with its current grade, as the home-page panel lists it. */
export interface CanvasCourseSummary extends CanvasCourse {
  term: string | null;
  html_url: string | null;
  /** The instructor hides the course total: show "Hidden by instructor". */
  grades_hidden: boolean;
  current_score: number | null;
  current_grade: string | null;
  grading_period: string | null;
  period_score: number | null;
  period_grade: string | null;
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  /** Canvas's item type: Assignment, Quiz, Page, File, Discussion, ExternalUrl, ExternalTool or SubHeader. */
  type: string;
  html_url: string | null;
  indent: number;
  locked: boolean;
  due_at: string | null;
  points_possible: number | null;
  requirement: { type: string; min_score: number | null; completed: boolean } | null;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number | null;
  /** locked, unlocked, started or completed; null when the course doesn't track progress. */
  state: string | null;
  unlock_at: string | null;
  completed_at: string | null;
  require_sequential_progress: boolean;
  items: CanvasModuleItem[];
  /** False when Canvas left a long module's items out and they weren't fetched. */
  items_complete: boolean;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  /** Plain text, cut short server-side. */
  message: string;
  posted_at: string | null;
  author: string | null;
  read: boolean | null;
  course_id: number | null;
  html_url: string | null;
}

export interface CanvasOverview extends CanvasReadMeta {
  start: string;
  end: string;
  /** Due in [start, end), soonest first. */
  upcoming: CanvasItem[];
  /** Past due and not submitted. */
  missing: CanvasItem[];
  /** Graded, due in the 7 days before start, newest first. */
  recently_graded: CanvasItem[];
}

export interface CanvasCourses extends CanvasReadMeta {
  courses: CanvasCourseSummary[];
}

export interface CanvasModules extends CanvasReadMeta {
  course_id: number;
  modules: CanvasModule[];
}

export interface CanvasAssignments extends CanvasReadMeta {
  course_id: number;
  assignments: CanvasAssignment[];
}

export interface CanvasAnnouncements extends CanvasReadMeta {
  announcements: CanvasAnnouncement[];
}

/** One open task added from Canvas, after POST /canvas/linked-tasks/sync. */
export interface CanvasLinkedTaskSync {
  task_id: number;
  /** False when Canvas couldn't be read for it, so the task was left alone. */
  synced: boolean;
  /** Canvas shows the assignment submitted: offer to complete the task. */
  submitted: boolean;
  due_at: string | null;
  /** The backend moved the task's due date and time to due_at. */
  due_changed: boolean;
}
