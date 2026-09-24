/**
 * The doodle-mode canvas ("drawing mode" in the app UI).
 *
 * Raster-blob shape, matching what DoodleCanvas.tsx already produces via
 * `canvas.toDataURL('image/png')` — a vector/stroke-based representation
 * (undo history, per-stroke editing) would need a bigger rewrite of how the
 * canvas records strokes and is out of scope here. One drawing per user
 * (singleton), same as Profile — not a list of named drawings.
 */
export interface Drawing {
  user_id: string;
  /** A base64 PNG data URL — the exact string `canvas.toDataURL('image/png')` returns. */
  image_data_url: string;
  updated_at: string;
}
