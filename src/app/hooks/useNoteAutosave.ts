'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Note } from '@/app/types/notes';

export type NoteChanges = Partial<Pick<Note, 'title' | 'content'>>;
export type NoteSaveStatus = 'saved' | 'saving' | 'error';

type SaveNote = (id: number, changes: NoteChanges) => void | Promise<boolean>;

/** Quiet period after the last keystroke before an edit is saved. */
export const AUTOSAVE_DELAY_MS = 500;

/**
 * Autosave for the note editor, with a status the toolbar can show.
 *
 * `schedule` queues a change and saves it AUTOSAVE_DELAY_MS after the last
 * one; changes queued in between merge into one save. `saveNow` (Ctrl+S, or
 * Retry after a failure) skips the wait. A save that fails keeps its changes
 * and sends them again with that note's next save, so a failed title isn't lost
 * because a later content save went through. Status is "saving" from the
 * first queued change until its save lands, then "saved" or "error".
 *
 * Switching notes (or unmounting) sends the previous note's pending changes
 * right away instead of dropping them; that save no longer drives the status,
 * which belongs to the note now on screen.
 */
export function useNoteAutosave(noteId: number | null, onSave: SaveNote) {
  const [status, setStatus] = useState<NoteSaveStatus>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const onSaveRef = useRef(onSave);
  const noteIdRef = useRef(noteId);
  const pending = useRef<{ id: number; changes: NoteChanges } | null>(null);
  // Per note: changes whose save failed and still need sending.
  const failed = useRef(new Map<number, NoteChanges>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every save and every note switch; only the newest save may set the status.
  const generation = useRef(0);
  // Per note: the newest save to carry each field; only that save decides whether the field still needs retrying.
  const carrier = useRef(new Map<number, Partial<Record<keyof NoteChanges, number>>>());

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const save = useCallback(async (id: number, changes: NoteChanges): Promise<boolean> => {
    const payload = { ...failed.current.get(id), ...changes };
    const mine = ++generation.current;
    const fields = Object.keys(payload) as (keyof NoteChanges)[];
    const carriers = carrier.current.get(id) ?? {};
    carrier.current.set(id, carriers);
    for (const field of fields) carriers[field] = mine;
    setStatus('saving');
    let ok: boolean;
    try {
      ok = (await onSaveRef.current(id, payload)) !== false;
    } catch {
      ok = false;
    }
    const remaining: NoteChanges = { ...failed.current.get(id) };
    for (const field of fields) {
      if (carriers[field] !== mine) continue;
      if (ok) delete remaining[field];
      else Object.assign(remaining, { [field]: payload[field] });
    }
    if (Object.keys(remaining).length > 0) failed.current.set(id, remaining);
    else failed.current.delete(id);
    if (mine === generation.current && pending.current?.id !== id) {
      setStatus(ok ? 'saved' : 'error');
      if (ok) setSavedAt(new Date());
    }
    return ok;
  }, []);

  const flushPending = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const queued = pending.current;
    pending.current = null;
    return queued ? save(queued.id, queued.changes) : null;
  }, [save]);

  /** Sends the outgoing note's queued edits, then starts the next note from a clean status. */
  const leaveNote = useCallback(() => {
    void flushPending();
    generation.current++;
    setStatus('saved');
    setSavedAt(null);
  }, [flushPending]);

  useEffect(() => {
    noteIdRef.current = noteId;
    return leaveNote;
  }, [noteId, leaveNote]);

  const schedule = useCallback((changes: NoteChanges) => {
    const id = noteIdRef.current;
    if (id == null) return;
    const earlier = pending.current?.id === id ? pending.current.changes : {};
    pending.current = { id, changes: { ...earlier, ...changes } };
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flushPending(); }, AUTOSAVE_DELAY_MS);
  }, [flushPending]);

  /** Saves `changes` (plus anything queued or previously failed) immediately. */
  const saveNow = useCallback((changes: NoteChanges = {}): Promise<boolean> => {
    const id = noteIdRef.current;
    if (id == null) return Promise.resolve(true);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const queued = pending.current?.id === id ? pending.current.changes : {};
    pending.current = null;
    return save(id, { ...queued, ...changes });
  }, [save]);

  return { status, savedAt, schedule, saveNow };
}
