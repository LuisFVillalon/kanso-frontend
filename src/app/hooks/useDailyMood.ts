'use client';

import { useOptionalNotifications } from '@/app/context/NotificationsContextValue';

/**
 * Whether daily mood check-ins are on: the Notifications "Mood check-in
 * reminder" switch (the `mood_reminder` type), which turns on both the
 * reminder and logging the day's mood from the Daily Brief and the calendar.
 * null until the notification settings load. On by default, so it is also on
 * when they can't load or the notifications feature isn't there at all.
 */
export function useDailyMood(): boolean | null {
  const notifications = useOptionalNotifications();
  if (!notifications) return true;
  const { preferences, preferencesError, status } = notifications;
  if (preferences) return preferences.types.mood_reminder !== false;
  if (preferencesError || status === 'unavailable' || status === 'error') return true;
  return null;
}
