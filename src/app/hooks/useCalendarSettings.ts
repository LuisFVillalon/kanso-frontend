'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { fetchCalendarSettings, updateCalendarSettings } from '@/app/lib/backend-api';
import type { CalendarSettings } from '@/app/types/calendar';
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

/**
 * Single source of truth for Term Tracker (the `calendar_settings` table) —
 * call this once (in TaskManager) and thread `calendarSettings`/
 * `saveCalendarSettings` down to whatever needs them (Settings, the
 * dashboard widget, ...) rather than calling it from every consumer, so a
 * save in one place is immediately reflected everywhere else. Mirrors
 * useProfile.ts.
 */
export function useCalendarSettings(user: User | null) {
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(defaultTermSettings);
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
    load();
    return () => { cancelled = true; };
  }, [user]);

  const saveCalendarSettings = useCallback(async (changes: Partial<Omit<CalendarSettings, 'id'>>): Promise<CalendarSettings> => {
    const updated = await updateCalendarSettings(changes);
    setCalendarSettings(updated);
    return updated;
  }, []);

  return { calendarSettings, loading, saveCalendarSettings };
}
