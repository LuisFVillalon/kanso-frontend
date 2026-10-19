import { Tag } from './task';

export interface Note {
  id: number;
  title: string;
  content: string;       // Tiptap HTML output via editor.getHTML()
  tags: Tag[];
  created_date: string;  // ISO string — matches task date convention
  updated_date: string;
  /** Supabase Auth UUID — set server-side, never supplied by the client. */
  user_id?: string | null;
  /** When the note was archived; null while active. */
  archived_at?: string | null;
  /**
   * Set once a draft note (negative temp `id` — see useNotes.ts) is first
   * persisted by an edit. The temp id is kept as `id` for the rest of the
   * session, so this is the only way to learn the real backend id without
   * an id swap. Undefined for notes that were never a local draft.
   */
  persistedId?: number;
}

export interface NoteSession {
  id: number;
  note_id: number;
  started_at: string;
  ended_at: string | null;
}
