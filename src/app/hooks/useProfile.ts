'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { fetchProfile, saveProfile as saveProfileApi } from '@/app/lib/backend-api';
import { DEFAULT_ACCENT, getStoredThemeColor, setStoredThemeColor, resetThemeColor } from '@/app/lib/theme';
import { DEFAULT_PAGE_STYLE, getStoredPageStyle, setStoredPageStyle, resetPageStyle } from '@/app/lib/pageStyle';
import { getStoredProfileAvatar, setStoredProfileAvatar } from '@/app/lib/avatar';
import { DAY_WINDOWS_KEY, DEFAULT_DAY_START, DEFAULT_DAY_END, cleanDayWindows, loadStoredDayWindows, loadStoredRestDays } from '@/app/lib/restDays';
import type { DayWindows } from '@/app/types/profile';
import { DEFAULT_MOOD_SETTINGS, moodSettings, type MoodCheckinSettings } from '@/app/types/mood';

export interface ProfileFields {
  name: string;
  avatar: string | null;
  themeAccent: string;
  pageStyle: string;
  dayStartTime: string;
  shutoffTime: string;
  restDays: number[];
  /** Weekdays with their own work window; the others use dayStartTime / shutoffTime. */
  dayWindows: DayWindows;
  layoutOrder: string[] | null;
  layoutSizes: Record<string, string> | null;
  appMode: string | null;
  dailyBriefCollapsed: boolean | null;
  dashboardView: string | null;
  notesViewMode: string | null;
  homePanels: string | null;
  moodCheckins: MoodCheckinSettings;
}

const readLocalDefaults = (): ProfileFields => ({
  name: (typeof window !== 'undefined' ? localStorage.getItem('tm_profile_name') : null) ?? ' ',
  avatar: getStoredProfileAvatar(),
  themeAccent: getStoredThemeColor() ?? DEFAULT_ACCENT,
  pageStyle: getStoredPageStyle() ?? DEFAULT_PAGE_STYLE,
  dayStartTime: (typeof window !== 'undefined' ? localStorage.getItem('tm_day_start_time') : null) ?? DEFAULT_DAY_START,
  shutoffTime: (typeof window !== 'undefined' ? localStorage.getItem('tm_call_it_a_day') : null) ?? DEFAULT_DAY_END,
  restDays: loadStoredRestDays(),
  dayWindows: loadStoredDayWindows(),
  // Not read from localStorage here — useGridOrder/usePersistedPref own
  // their own local caches independently and resolve them on their own.
  // These are purely the backend-authoritative values, populated once
  // fetchProfile() resolves.
  layoutOrder: null,
  layoutSizes: null,
  appMode: null,
  dailyBriefCollapsed: null,
  dashboardView: null,
  notesViewMode: null,
  homePanels: null,
  moodCheckins: DEFAULT_MOOD_SETTINGS,
});

/**
 * Single source of truth for the user's profile — name, avatar, appearance,
 * and daily-schedule preferences. Backend-authoritative once `fetchProfile()`
 * resolves (falling back to the localStorage cache / defaults above until
 * then, or forever if the request fails or the field was never saved by this
 * user yet — a null field from the backend just means "not saved there yet",
 * so hydration never overwrites an existing local value with it).
 *
 * Call this once (in TaskManager) and thread `profile`/`saveProfile` down to
 * whatever needs them (Settings, TimersCard, ...) rather than calling it from
 * every consumer — each call independently re-fetches from the backend.
 */
export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<ProfileFields>(readLocalDefaults);
  const [loading, setLoading] = useState(false);
  // Whether the first fetchProfile() has settled (either way), so anything
  // timed off the profile (the mood check-ins) doesn't act on the local defaults.
  const [loaded, setLoaded] = useState(false);
  // The name every saveProfileField request carries, since the endpoint
  // requires one: the newest name sent so far, so a later save of another
  // field can't put back the name an earlier, still-unanswered save replaced.
  const savedName = useRef(profile.name);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const p = await fetchProfile();
        if (!p) return;
        savedName.current = p.name;
        setProfile(prev => ({
          ...prev,
          name: p.name,
          shutoffTime: p.shutoff_time ?? prev.shutoffTime,
          avatar: p.avatar ?? prev.avatar,
          themeAccent: p.theme_accent ?? prev.themeAccent,
          pageStyle: p.page_style ?? prev.pageStyle,
          dayStartTime: p.day_start_time ?? prev.dayStartTime,
          restDays: p.rest_days ?? prev.restDays,
          // Absent from servers that don't have the field yet; null there means none.
          dayWindows: p.day_windows === undefined ? prev.dayWindows : cleanDayWindows(p.day_windows),
          layoutOrder: p.layout_order ?? prev.layoutOrder,
          layoutSizes: p.layout_sizes ?? prev.layoutSizes,
          appMode: p.app_mode ?? prev.appMode,
          dailyBriefCollapsed: p.daily_brief_collapsed ?? prev.dailyBriefCollapsed,
          dashboardView: p.dashboard_view ?? prev.dashboardView,
          notesViewMode: p.notes_view_mode ?? prev.notesViewMode,
          homePanels: p.home_panels ?? prev.homePanels,
          moodCheckins: moodSettings(p.mood_checkins),
        }));
        localStorage.setItem('tm_profile_name', p.name);
        if (p.shutoff_time) localStorage.setItem('tm_call_it_a_day', p.shutoff_time);
        if (p.day_start_time) localStorage.setItem('tm_day_start_time', p.day_start_time);
        if (p.rest_days) localStorage.setItem('tm_rest_days', JSON.stringify(p.rest_days));
        if (p.day_windows !== undefined) localStorage.setItem(DAY_WINDOWS_KEY, JSON.stringify(cleanDayWindows(p.day_windows)));
        if (p.avatar) setStoredProfileAvatar(p.avatar);
        if (p.theme_accent) setStoredThemeColor(p.theme_accent);
        if (p.page_style) setStoredPageStyle(p.page_style);
      } catch {
        // keep localStorage/default fallback
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    };
    load();
  }, [user]);

  const saveProfile = useCallback(async (next: ProfileFields): Promise<{ ok: boolean; error?: string }> => {
    try {
      await saveProfileApi({
        name: next.name,
        shutoff_time: next.shutoffTime,
        avatar: next.avatar,
        theme_accent: next.themeAccent,
        page_style: next.pageStyle,
        day_start_time: next.dayStartTime,
        rest_days: next.restDays,
        day_windows: next.dayWindows,
        layout_order: next.layoutOrder,
        layout_sizes: next.layoutSizes,
        app_mode: next.appMode,
        daily_brief_collapsed: next.dailyBriefCollapsed,
        dashboard_view: next.dashboardView,
        notes_view_mode: next.notesViewMode,
        home_panels: next.homePanels,
        mood_checkins: next.moodCheckins,
      });

      localStorage.setItem('tm_profile_name', next.name);
      localStorage.setItem('tm_day_start_time', next.dayStartTime);
      localStorage.setItem('tm_call_it_a_day', next.shutoffTime);
      localStorage.setItem('tm_rest_days', JSON.stringify(next.restDays));
      localStorage.setItem(DAY_WINDOWS_KEY, JSON.stringify(next.dayWindows));
      setStoredProfileAvatar(next.avatar);
      if (next.themeAccent === DEFAULT_ACCENT) resetThemeColor();
      else setStoredThemeColor(next.themeAccent);
      if (next.pageStyle === DEFAULT_PAGE_STYLE) resetPageStyle();
      else setStoredPageStyle(next.pageStyle);

      savedName.current = next.name;
      setProfile(next);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to save profile.' };
    }
  }, []);

  /**
   * Saves only the fields in `patch` (Settings' autosave), plus the current
   * name. Throws when the save fails, leaving the profile as it was.
   */
  const saveProfileField = useCallback(async (patch: Partial<ProfileFields>): Promise<void> => {
    const previousName = savedName.current;
    if (patch.name !== undefined) savedName.current = patch.name;
    const body: Parameters<typeof saveProfileApi>[0] = { name: savedName.current };
    if (patch.shutoffTime !== undefined) body.shutoff_time = patch.shutoffTime;
    if (patch.avatar !== undefined) body.avatar = patch.avatar;
    if (patch.themeAccent !== undefined) body.theme_accent = patch.themeAccent;
    if (patch.pageStyle !== undefined) body.page_style = patch.pageStyle;
    if (patch.dayStartTime !== undefined) body.day_start_time = patch.dayStartTime;
    if (patch.restDays !== undefined) body.rest_days = patch.restDays;
    if (patch.dayWindows !== undefined) body.day_windows = patch.dayWindows;
    if (patch.moodCheckins !== undefined) body.mood_checkins = patch.moodCheckins;
    try {
      await saveProfileApi(body);
    } catch (err) {
      if (patch.name !== undefined && savedName.current === patch.name) savedName.current = previousName;
      throw err;
    }

    if (patch.name !== undefined) localStorage.setItem('tm_profile_name', patch.name);
    if (patch.dayStartTime !== undefined) localStorage.setItem('tm_day_start_time', patch.dayStartTime);
    if (patch.shutoffTime !== undefined) localStorage.setItem('tm_call_it_a_day', patch.shutoffTime);
    if (patch.restDays !== undefined) localStorage.setItem('tm_rest_days', JSON.stringify(patch.restDays));
    if (patch.dayWindows !== undefined) localStorage.setItem(DAY_WINDOWS_KEY, JSON.stringify(patch.dayWindows));
    if (patch.avatar !== undefined) setStoredProfileAvatar(patch.avatar);
    if (patch.themeAccent !== undefined) {
      if (patch.themeAccent === DEFAULT_ACCENT) resetThemeColor();
      else setStoredThemeColor(patch.themeAccent);
    }
    if (patch.pageStyle !== undefined) {
      if (patch.pageStyle === DEFAULT_PAGE_STYLE) resetPageStyle();
      else setStoredPageStyle(patch.pageStyle);
    }
    setProfile(prev => ({ ...prev, ...patch }));
  }, []);

  return { profile, loading, loaded, saveProfile, saveProfileField };
}
