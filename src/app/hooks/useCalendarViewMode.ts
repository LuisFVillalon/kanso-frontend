'use client';

import { useAuth } from '@/app/context/AuthContext';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';

export type CalendarViewMode = 'week' | 'carousel' | 'all';

export const CALENDAR_VIEW_KEY_PREFIX = 'tm-calendar-view';
const MODES: readonly CalendarViewMode[] = ['week', 'carousel', 'all'];
const isViewMode = (c: unknown): c is CalendarViewMode => MODES.includes(c as CalendarViewMode);

/** The calendar page's last view, remembered on this device per account; All Months on a first visit. */
export const useCalendarViewMode = () => {
  const { user } = useAuth();
  return usePersistedPref<CalendarViewMode>(`${CALENDAR_VIEW_KEY_PREFIX}:${user?.id ?? 'anon'}`, 'all', isViewMode);
};
