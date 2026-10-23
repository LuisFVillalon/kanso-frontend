'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  archiveTerm,
  deleteArchivedTerm,
  fetchArchivedTerms,
  fetchCalendarSettings,
  updateCalendarSettings,
} from '@/app/lib/backend-api';
import { calendarTermPeriods } from '@/app/lib/termPeriods';
import { AppShellContext } from '@/app/context/AppShellContext';
import type { ArchivedTerm, CalendarSettings, TermPeriod } from '@/app/types/calendar';
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

/**
 * Single source of truth for Term Tracker (the `calendar_settings` table) and
 * the terms archived from it — call this once (in AppShell) and thread
 * `calendarSettings`/`saveCalendarSettings` down to whatever needs them
 * (Settings, the dashboard widget, ...) rather than calling it from every
 * consumer, so a save in one place is immediately reflected everywhere else.
 * Mirrors useProfile.ts. `terms` is what the month calendars draw (see
 * useCalendarTerms).
 */
export function useCalendarSettings(user: User | null) {
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(defaultTermSettings);
  const [archivedTerms, setArchivedTerms] = useState<ArchivedTerm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchCalendarSettings();
        if (!cancelled && data !== null) setCalendarSettings(data);
      } catch {
        // network / auth error — keep showing defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const loadArchived = async () => {
      try {
        const data = await fetchArchivedTerms();
        if (!cancelled) setArchivedTerms(data);
      } catch {
        // network / auth error — the calendars just show no archived terms
      }
    };
    load();
    loadArchived();
    return () => { cancelled = true; };
  }, [user]);

  const saveCalendarSettings = useCallback(async (changes: Partial<Omit<CalendarSettings, 'id'>>): Promise<CalendarSettings> => {
    const updated = await updateCalendarSettings(changes);
    setCalendarSettings(updated);
    return updated;
  }, []);

  /** Archives the current term; the tracker goes back to the placeholder until a new term is saved. */
  const archiveCurrentTerm = useCallback(async (): Promise<ArchivedTerm> => {
    const archived = await archiveTerm();
    setArchivedTerms(prev => [...prev, archived].sort(byStart));
    setCalendarSettings(defaultTermSettings());
    return archived;
  }, []);

  const removeArchivedTerm = useCallback(async (id: number): Promise<void> => {
    await deleteArchivedTerm(id);
    setArchivedTerms(prev => prev.filter(t => t.id !== id));
  }, []);

  const terms = useMemo(() => calendarTermPeriods(calendarSettings, archivedTerms), [calendarSettings, archivedTerms]);

  return { calendarSettings, loading, saveCalendarSettings, archivedTerms, archiveCurrentTerm, removeArchivedTerm, terms };
}

const NO_TERMS: TermPeriod[] = [];

/**
 * The term periods for the month calendars, from the app shell's
 * useCalendarSettings. Outside the shell (e.g. a component rendered on its
 * own in a test) there are none.
 */
export function useCalendarTerms(): TermPeriod[] {
  return useContext(AppShellContext)?.calendarSettingsState.terms ?? NO_TERMS;
}
