'use client';

/**
 * Settings' autosave: every change saves itself, and each page shows
 * "Saving…", "Saved" or "Couldn't save · Retry" for its own fields.
 *
 * useSaveTracker keeps that per-page status. Each save is tracked under a
 * field key, so a failed field stays reported as failed (and retryable)
 * until a newer save of that same field settles, even if other fields on
 * the page save fine in between. Saves of one field run one after another,
 * so the last change made is always the last one sent and committed.
 *
 * useFieldAutosave holds the unsaved edits over the committed values
 * (`value` = committed + edits) and sends one field per save. Text saves
 * after a pause; toggles and swatches save at once. An edit only leaves the
 * overlay once the save of that exact value succeeds, so a slow save never
 * overwrites newer typing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** How long typing pauses before a text field saves. */
export const AUTOSAVE_DEBOUNCE_MS = 600;
/** How long "Saved" stays up after the last save on a page. */
const SAVED_VISIBLE_MS = 2500;

export type SaveStatus = 'saving' | 'saved' | 'error';

/** Tracks one save of `key` on the current page; resolves true when it succeeded. */
export type TrackSave = (key: string, run: () => Promise<unknown>) => Promise<boolean>;

interface PageBook {
  inFlight: number;
  /** The newest attempt per field key, so a stale outcome can't overwrite a newer one. */
  attempt: Map<string, number>;
  failed: Map<string, () => Promise<unknown>>;
  /** The newest save per field key; the next save of that key waits for it to settle. */
  queue: Map<string, Promise<unknown>>;
}

export function useSaveTracker<P extends string>() {
  const [statuses, setStatuses] = useState<Partial<Record<P, SaveStatus>>>({});
  const books = useRef(new Map<P, PageBook>());
  const hideTimers = useRef(new Map<P, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = hideTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const publish = useCallback((page: P) => {
    const book = books.current.get(page)!;
    const status: SaveStatus = book.failed.size > 0 ? 'error' : book.inFlight > 0 ? 'saving' : 'saved';
    setStatuses(prev => ({ ...prev, [page]: status }));
    clearTimeout(hideTimers.current.get(page));
    if (status === 'saved') {
      hideTimers.current.set(page, setTimeout(() => {
        setStatuses(prev => {
          if (prev[page] !== 'saved') return prev;
          const next = { ...prev };
          delete next[page];
          return next;
        });
      }, SAVED_VISIBLE_MS));
    }
  }, []);

  const track = useCallback(async (page: P, key: string, run: () => Promise<unknown>): Promise<boolean> => {
    let book = books.current.get(page);
    if (!book) {
      book = { inFlight: 0, attempt: new Map(), failed: new Map(), queue: new Map() };
      books.current.set(page, book);
    }
    const attempt = (book.attempt.get(key) ?? 0) + 1;
    book.attempt.set(key, attempt);
    book.failed.delete(key);
    book.inFlight += 1;
    publish(page);
    const turn = (book.queue.get(key) ?? Promise.resolve()).then(run);
    book.queue.set(key, turn.catch(() => {}));
    let ok = true;
    try {
      await turn;
    } catch {
      ok = false;
      if (book.attempt.get(key) === attempt) book.failed.set(key, run);
    } finally {
      book.inFlight -= 1;
      publish(page);
    }
    return ok;
  }, [publish]);

  /** Runs every failed save on `page` again. */
  const retry = useCallback((page: P) => {
    const book = books.current.get(page);
    if (!book) return;
    for (const [key, run] of [...book.failed]) void track(page, key, run);
  }, [track]);

  return { statuses, track, retry };
}

interface SetOptions {
  /** Wait for a pause before saving (text, time and date inputs). */
  debounce?: boolean;
  /** Keep the edit on screen without saving it (e.g. a cleared date input). */
  skipSave?: boolean;
}

export function useFieldAutosave<T extends object>(
  committed: T,
  save: (patch: Partial<T>) => Promise<unknown>,
) {
  const [edits, setEdits] = useState<Partial<T>>({});
  const editsRef = useRef<Partial<T>>({});
  const committedRef = useRef(committed);
  useEffect(() => { committedRef.current = committed; }, [committed]);
  const timers = useRef(new Map<keyof T, () => void>());
  const timerIds = useRef(new Map<keyof T, ReturnType<typeof setTimeout>>());

  const writeEdits = useCallback((next: Partial<T>) => {
    editsRef.current = next;
    setEdits(next);
  }, []);

  const commit = useCallback((track: TrackSave, key: keyof T) => {
    timers.current.delete(key);
    timerIds.current.delete(key);
    void track(String(key), async () => {
      if (!(key in editsRef.current)) return;
      const value = editsRef.current[key];
      await save({ [key]: value } as Partial<T>);
      // Drop the edit only if nothing newer was typed while this saved.
      if (key in editsRef.current && editsRef.current[key] === value) {
        const next = { ...editsRef.current };
        delete next[key];
        writeEdits(next);
      }
    });
  }, [save, writeEdits]);

  const set = useCallback(<K extends keyof T>(track: TrackSave, key: K, value: T[K], { debounce = false, skipSave = false }: SetOptions = {}) => {
    writeEdits({ ...editsRef.current, [key]: value });
    clearTimeout(timerIds.current.get(key));
    if (skipSave) {
      timers.current.delete(key);
      timerIds.current.delete(key);
      return;
    }
    if (!debounce) {
      commit(track, key);
      return;
    }
    const fire = () => commit(track, key);
    timers.current.set(key, fire);
    timerIds.current.set(key, setTimeout(fire, AUTOSAVE_DEBOUNCE_MS));
  }, [commit, writeEdits]);

  /** Saves every edit still waiting for its pause, now (e.g. on close). */
  const flush = useCallback(() => {
    timerIds.current.forEach(clearTimeout);
    const pending = [...timers.current.values()];
    pending.forEach(fire => fire());
  }, []);

  /** Forgets every edit that hasn't saved, showing the committed values again. */
  const reset = useCallback(() => {
    timerIds.current.forEach(clearTimeout);
    timers.current.clear();
    timerIds.current.clear();
    writeEdits({});
  }, [writeEdits]);

  /** The newest value of `key`, for callbacks that run after later edits (Undo). */
  const get = useCallback(<K extends keyof T>(key: K): T[K] => (
    key in editsRef.current ? editsRef.current[key] as T[K] : committedRef.current[key]
  ), []);

  useEffect(() => {
    const ids = timerIds.current;
    return () => ids.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => ({ ...committed, ...edits }) as T, [committed, edits]);
  return { value, set, get, flush, reset };
}
