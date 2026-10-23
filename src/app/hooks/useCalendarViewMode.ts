'use client';

import { useAuth } from '@/app/context/AuthContext';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';

export type CalendarViewMode = 'week' | 'month';

export const CALENDAR_VIEW_KEY_PREFIX = 'tm-calendar-view';
const MODES: readonly CalendarViewMode[] = ['week', 'month'];
const isViewMode = (c: unknown): c is CalendarViewMode => MODES.includes(c as CalendarViewMode);

/**
 * The calendar page's last view, remembered on this device per account; Month
 * on a first visit. The retired 'carousel' and 'all' views fail isViewMode, so
 * a device that last used either reopens on Month, which replaced both.
 */
export const useCalendarViewMode = () => {
  const { user } = useAuth();
  return usePersistedPref<CalendarViewMode>(`${CALENDAR_VIEW_KEY_PREFIX}:${user?.id ?? 'anon'}`, 'month', isViewMode);
};
