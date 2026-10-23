'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  archiveEndedTerm,
  archiveTerm,
  deleteArchivedTerm,
  deleteEndedTerm,
  deleteNextTerm,
  fetchArchivedTerms,
  fetchCalendarSettings,
  fetchTermRollover,
  saveNextTerm,
  updateCalendarSettings,
  updateTermRollover,
} from '@/app/lib/backend-api';
import { calendarTermPeriods } from '@/app/lib/termPeriods';
import { AppShellContext } from '@/app/context/AppShellContext';
import type { ArchivedTerm, CalendarSettings, TermDates, TermPeriod, TermRollover } from '@/app/types/calendar';
import { toLocalDateStr } from '@/app/utils/dateUtils';

/**
 * Placeholder term shown until the user saves their own: the current month
 * plus the next two, so a new account never opens on a term that's already
 * over. Mirrors the backend's default in calendar_crud.py.
 */
export function defaultTermSettings(): CalendarSettings {
  const now = new Date();
  return {
    id: 0,
    title: 'Term Tracker',
    start_date: toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    end_date: toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 3, 0)),
  };
}

const byStart = (a: ArchivedTerm, b: ArchivedTerm) =>
  a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id - b.id;

/** Milliseconds from `now` until the next local midnight. */
const msUntilMidnight = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

/**
 * Single source of truth for Term Tracker (the `calendar_settings` table),
 * the terms archived from it and what happens when it ends (the queued next
 * term and the auto-archive switch) — call this once (in AppShell) and
 * thread `calendarSettings`/`saveCalendarSettings` down to whatever needs
 * them (Settings, the dashboard widget, ...) rather than calling it from
 * every consumer, so a save in one place is immediately reflected everywhere
 * else. Mirrors useProfile.ts. `terms` is what the month calendars draw (see
 * useCalendarTerms).
 *
 * The server rolls the term over when these are read on a day after the
 * current term's end date, so they're read again when the local day changes
 * (at midnight, or on coming back to the tab): the queued next term then
 * shows up as the current one without the user doing anything.
 */
export function useCalendarSettings(user: User | null) {
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(defaultTermSettings);
  const [archivedTerms, setArchivedTerms] = useState<ArchivedTerm[]>([]);
  /** Null until it loads, or when it couldn't. */
  const [rollover, setRollover] = useState<TermRollover | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedDay = useRef<string | null>(null);
  const generation = useRef(0);

  /** Reads the current term, the archived terms and the rollover again, all after the server's rollover. */
  const reload = useCallback(async () => {
    const run = ++generation.current;
    const current = () => run === generation.current;
    loadedDay.current = toLocalDateStr(new Date());
    await Promise.all([
      (async () => {
        try {
          const data = await fetchCalendarSettings();
          // None (e.g. archived automatically with nothing queued): back to the placeholder.
          if (current()) setCalendarSettings(data ?? defaultTermSettings());
        } catch {
          // network / auth error — keep showing what's there
        } finally {
          if (current()) setLoading(false);
        }
      })(),
      (async () => {
        try {
          const data = await fetchArchivedTerms();
          if (current()) setArchivedTerms(data);
        } catch {
          // network / auth error — the calendars just show no archived terms
        }
      })(),
      (async () => {
        try {
          const data = await fetchTermRollover();
          if (current()) setRollover(data);
        } catch {
          // network / auth error — Settings leaves the next term alone
        }
      })(),
    ]);
  }, []);

  useEffect(() => {
    if (!user) return;
    const loads = generation;
    void reload();
    // Responses still on their way after this are dropped.
    return () => { loads.current++; };
  }, [user, reload]);

  // A new local day may have ended the current term: read again so the
  // server rolls it over.
  useEffect(() => {
    if (!user) return;
    const reloadIfNewDay = () => {
      if (document.visibilityState === 'visible' && loadedDay.current !== toLocalDateStr(new Date())) void reload();
    };
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      timer = setTimeout(() => { reloadIfNewDay(); scheduleMidnight(); }, msUntilMidnight(new Date()) + 1000);
    };
    scheduleMidnight();
    document.addEventListener('visibilitychange', reloadIfNewDay);
    window.addEventListener('focus', reloadIfNewDay);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', reloadIfNewDay);
      window.removeEventListener('focus', reloadIfNewDay);
    };
  }, [user, reload]);

  const saveCalendarSettings = useCallback(async (changes: Partial<Omit<CalendarSettings, 'id'>>): Promise<CalendarSettings> => {
    const updated = await updateCalendarSettings(changes);
    setCalendarSettings(updated);
    return updated;
  }, []);

  /**
   * Archives the current term. The tracker goes back to the placeholder
   * until a new term is saved, or the queued next term takes over (read
   * again, since the server promotes it on the next read).
   */
  const archiveCurrentTerm = useCallback(async (): Promise<ArchivedTerm> => {
    const archived = await archiveTerm();
    setArchivedTerms(prev => [...prev, archived].sort(byStart));
    setCalendarSettings(defaultTermSettings());
    if (rollover?.next_term) await reload();
    return archived;
  }, [rollover, reload]);

  const removeArchivedTerm = useCallback(async (id: number): Promise<void> => {
    await deleteArchivedTerm(id);
    setArchivedTerms(prev => prev.filter(t => t.id !== id));
  }, []);

  /** Queues (or replaces) the next term. If the current term has already ended, it takes over right away. */
  const saveQueuedNextTerm = useCallback(async (term: TermDates): Promise<void> => {
    setRollover(await saveNextTerm(term));
    await reload();
  }, [reload]);

  const removeNextTerm = useCallback(async (): Promise<void> => {
    setRollover(await deleteNextTerm());
  }, []);

  /** Turns auto-archive on or off; on, a term that has already ended is archived right away. */
  const setAutoArchive = useCallback(async (on: boolean): Promise<void> => {
    setRollover(await updateTermRollover(on));
    if (on) await reload();
  }, [reload]);

  /** Archives the ended term the next term replaced. */
  const archiveReplacedTerm = useCallback(async (): Promise<ArchivedTerm> => {
    const archived = await archiveEndedTerm();
    setArchivedTerms(prev => [...prev, archived].sort(byStart));
    setRollover(prev => prev && { ...prev, ended_term: null });
    return archived;
  }, []);

  /** Drops the ended term the next term replaced, without archiving it. */
  const dropReplacedTerm = useCallback(async (): Promise<void> => {
    setRollover(await deleteEndedTerm());
  }, []);

  const terms = useMemo(() => calendarTermPeriods(calendarSettings, archivedTerms), [calendarSettings, archivedTerms]);

  return {
    calendarSettings, loading, saveCalendarSettings, archivedTerms, archiveCurrentTerm, removeArchivedTerm, terms,
    rollover, saveQueuedNextTerm, removeNextTerm, setAutoArchive, archiveReplacedTerm, dropReplacedTerm,
  };
}

/** What happens when the term ends, and the actions on it, as threaded down to Settings. */
export type TermRolloverControls = Pick<
  ReturnType<typeof useCalendarSettings>,
  'rollover' | 'saveQueuedNextTerm' | 'removeNextTerm' | 'setAutoArchive' | 'archiveReplacedTerm' | 'dropReplacedTerm'
>;

const NO_TERMS: TermPeriod[] = [];

/**
 * The term periods for the month calendars, from the app shell's
 * useCalendarSettings. Outside the shell (e.g. a component rendered on its
 * own in a test) there are none.
 */
export function useCalendarTerms(): TermPeriod[] {
  return useContext(AppShellContext)?.calendarSettingsState.terms ?? NO_TERMS;
}
