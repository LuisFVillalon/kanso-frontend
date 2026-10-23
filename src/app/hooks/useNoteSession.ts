'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Note } from '@/app/types/notes';
import { supabase } from '@/app/lib/supabase';
import { startNoteSession, endNoteSession, endNoteSessionKeepalive, fetchNoteTimeSpent } from '@/app/lib/backend-api';

/**
 * Tracks how long a note is open in the editor by opening a session on the
 * backend (`note_sessions`: started_at/ended_at) once the note has a real
 * backend id, and closing it whenever the note stops being actively viewed —
 * on note switch, unmount, the tab being backgrounded, or the tab closing.
 * Returns `pastSeconds`, the sum of all *closed* sessions for this note
 * when it opened, and `visitSeconds()`, the time the tab has been visible
 * since then.
 *
 * A brand-new note is a local-only draft (negative temp `id`, see
 * useNotes.ts) until the user's first edit persists it — by design, so
 * opening-and-not-touching a note never creates a row. The timer follows the
 * same rule: it doesn't start on a draft, and starts exactly when that first
 * edit lands (`note.persistedId` is stamped at that moment), not merely when
 * the note is opened.
 */
export function useNoteSession(note: Note | null) {
  const effectiveNoteId = note == null ? null : note.id >= 0 ? note.id : note.persistedId ?? null;

  // Keyed by note id so a stale total from the previously open (or
  // not-yet-persisted) note never flashes while the current one loads.
  const [fetched, setFetched] = useState<{ noteId: number; totalSeconds: number } | null>(null);
  // This visit's visible time: closed segments in `ms`, plus the open one since `since`.
  const visit = useRef<{ ms: number; since: number | null }>({ ms: 0, since: null });

  useEffect(() => {
    if (effectiveNoteId == null) return;

    let torndown = false;

    // A monotonic counter identifying the current begin/end cycle. Bumped by
    // every begin *and* every end, so a start request that resolves after
    // its cycle has already been superseded (e.g. the user backgrounded and
    // re-foregrounded the tab twice before the first /start round-trip
    // returned) can tell it's stale and close itself immediately instead of
    // being adopted as "the" current session — the fix for a start/end race
    // that could otherwise leak an open session on the server forever.
    let generation = 0;
    let currentSessionId: number | null = null;
    let accessToken: string | null = null;
    visit.current = { ms: 0, since: document.visibilityState === 'hidden' ? null : Date.now() };

    const beginSession = () => {
      const myGeneration = ++generation;

      supabase.auth.getSession().then(({ data }) => {
        accessToken = data.session?.access_token ?? null;
      });

      startNoteSession(effectiveNoteId)
        .then(session => {
          if (myGeneration !== generation) {
            // Superseded before the request came back — never got adopted,
            // so nothing else will close it. Close it now.
            endNoteSession(session.id).catch(() => {});
            return;
          }
          currentSessionId = session.id;
        })
        .catch(() => {});
    };

    const endSession = (keepalive: boolean) => {
      generation++; // invalidate any begin() still in flight for this cycle
      const id = currentSessionId;
      currentSessionId = null;
      if (id == null) return;
      if (keepalive) endNoteSessionKeepalive(id, accessToken);
      else endNoteSession(id).catch(() => {});
    };

    beginSession();

    fetchNoteTimeSpent(effectiveNoteId)
      .then(totalSeconds => { if (!torndown) setFetched({ noteId: effectiveNoteId, totalSeconds }); })
      .catch(() => {});

    // Primary signal: reliable across browsers/mobile (unlike beforeunload),
    // and fires on tab close *and* on merely backgrounding the tab — which
    // is also correct here, since idle background time shouldn't count as
    // time spent on the note. Coming back to the foreground opens a fresh
    // segment.
    const handleVisibilityChange = () => {
      const { ms, since } = visit.current;
      if (document.visibilityState === 'hidden') {
        if (since != null) visit.current = { ms: ms + Date.now() - since, since: null };
        endSession(true);
      } else {
        if (since == null) visit.current = { ms, since: Date.now() };
        beginSession();
      }
    };
    // Fallback for the actual unload path in case visibilitychange doesn't
    // fire first (still best-effort — a hard crash/force-quit can't be
    // caught client-side by any event).
    const handlePageHide = () => endSession(true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      torndown = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      endSession(false);
      visit.current = { ms: 0, since: null };
    };
  }, [effectiveNoteId]);

  const visitSeconds = useCallback(() => {
    const { ms, since } = visit.current;
    return Math.round((ms + (since == null ? 0 : Date.now() - since)) / 1000);
  }, []);

  const pastSeconds = effectiveNoteId != null && fetched?.noteId === effectiveNoteId ? fetched.totalSeconds : 0;
  return { pastSeconds, visitSeconds };
}
