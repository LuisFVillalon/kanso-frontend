/** "invalid" means Canvas rejected the token or it expired: the user has to reconnect. */
export type CanvasStatus = 'active' | 'invalid' | 'error';

/**
 * The masked Canvas connection, as the /canvas/connection routes return it
 * (kanso-backend app/schemas/canvas_schema.py). Never carries the token itself.
 */
export interface CanvasConnection {
  connected: boolean;
  status: CanvasStatus | null;
  /** Normalized "https://host". */
  base_url: string | null;
  token_last4: string | null;
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
  | 'canvas_forbidden'
  | 'canvas_account_changed'
  | 'canvas_unavailable'
  | 'canvas_not_connected'
  | 'canvas_not_configured';
