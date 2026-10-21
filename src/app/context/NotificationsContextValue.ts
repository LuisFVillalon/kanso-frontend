'use client';

// The notifications context on its own, apart from NotificationsProvider and
// the API and auth modules it pulls in, so forms that only read it (the task
// form's "Remind me") render without them.

import { createContext, useContext } from 'react';
import type {
  AppNotification,
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from '@/app/types/notification';

/**
 * `unavailable`: the API refused the feature for this user (an older
 * backend, or an account it won't serve), so the bell hides and polling stops.
 */
export type NotificationsStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  status: NotificationsStatus;
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  dismiss: (ids: string[]) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Null until loaded (or when the API refuses them). */
  preferences: NotificationPreferences | null;
  /** True when the last preferences load failed; `loadPreferences` retries. */
  preferencesError: boolean;
  loadPreferences: () => Promise<void>;
  savePreferences: (changes: NotificationPreferencesUpdate) => Promise<NotificationPreferences>;
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return ctx;
}

/** The notifications context, or null outside its provider (e.g. a form rendered on its own). */
export function useOptionalNotifications(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}
