'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { NotificationsContext, type NotificationsContextValue, type NotificationsStatus } from './NotificationsContextValue';
import {
  ApiError,
  describeError,
  dismissNotifications,
  fetchNotificationPreferences,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  updateNotificationPreferences,
} from '@/app/lib/backend-api';
import type { AppNotification, NotificationPreferences, NotificationPreferencesUpdate } from '@/app/types/notification';
import {
  createNotificationDeduper,
  sortNewestFirst,
  startVisiblePolling,
  summarizeFresh,
} from '@/app/utils/notifications';

/** About once a minute: alerts fire on the minute at the earliest. */
export const POLL_INTERVAL_MS = 60_000;
// Focus and visibilitychange fire together on returning to the tab.
const MIN_REFRESH_GAP_MS = 5_000;

const REFUSED_STATUSES = new Set([401, 403, 404]);
const isRefusal = (err: unknown) => err instanceof ApiError && REFUSED_STATUSES.has(err.status);

/**
 * In-app notifications: polls GET /get-notifications while the tab is
 * visible, toasts notifications that are new this session, and keeps read
 * and dismissed state optimistic. Mounted inside AppDataProvider, which keys
 * it on the signed-in user, so a different account starts from scratch.
 */
export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dataUserId } = useAuth();
  const showToast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [status, setStatus] = useState<NotificationsStatus>('loading');
  const [panelOpen, setPanelOpen] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const deduper = useRef(createNotificationDeduper());
  // Read/dismissed locally but maybe not yet on the server: a poll that
  // lands before the POST must not flip them back.
  const locallyRead = useRef(new Set<string>());
  const locallyDismissed = useRef(new Set<string>());
  const inFlight = useRef(false);

  // The toast's View button reads these through refs so `refresh`, and with
  // it the polling loop, never restarts on navigation.
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  useEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;
  }, [pathname, router]);

  const applyLocalState = useCallback((list: AppNotification[]) => sortNewestFirst(
    list
      .filter(n => !locallyDismissed.current.has(n.id))
      .map(n => (locallyRead.current.has(n.id) ? { ...n, read: true } : n)),
  ), []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const list = applyLocalState(await fetchNotifications());
      setNotifications(list);
      setStatus('ready');
      const message = summarizeFresh(deduper.current.takeFresh(list));
      if (message) {
        showToast(message, 'info', {
          label: 'View',
          onClick: () => {
            if (pathnameRef.current !== '/') routerRef.current.push('/');
            setPanelOpen(true);
          },
        });
      }
    } catch (err) {
      if (isRefusal(err)) {
        setStatus('unavailable');
      } else {
        console.error('Failed to load notifications:', err);
        setStatus(prev => (prev === 'unavailable' ? prev : 'error'));
      }
    } finally {
      inFlight.current = false;
    }
  }, [applyLocalState, showToast]);

  const enabled = !!dataUserId && status !== 'unavailable';
  useEffect(() => {
    if (!enabled) return;
    return startVisiblePolling(() => { void refresh(); }, {
      intervalMs: POLL_INTERVAL_MS,
      minGapMs: MIN_REFRESH_GAP_MS,
    });
  }, [enabled, refresh]);

  // Preferences feed the task form's "Default (2 h)" label and the Settings
  // section; loaded once the notifications themselves proved available.
  const [preferencesError, setPreferencesError] = useState(false);
  const loadPreferences = useCallback(async () => {
    setPreferencesError(false);
    try {
      setPreferences(await fetchNotificationPreferences());
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
      setPreferencesError(true);
    }
  }, []);
  const prefsRequested = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || prefsRequested.current) return;
    prefsRequested.current = true;
    void loadPreferences();
  }, [status, loadPreferences]);

  const markRead = useCallback((ids: string[]) => {
    const unread = ids.filter(id => !locallyRead.current.has(id));
    if (unread.length === 0) return;
    unread.forEach(id => locallyRead.current.add(id));
    setNotifications(prev => applyLocalState(prev));
    markNotificationsRead(unread).catch(err => {
      console.error('Failed to mark notifications read:', err);
      // No toast for a background save: the item stays read on screen
      // until the next poll brings back the server's state.
      unread.forEach(id => locallyRead.current.delete(id));
    });
  }, [applyLocalState]);

  const markAllRead = useCallback(() => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    unread.forEach(id => locallyRead.current.add(id));
    setNotifications(prev => applyLocalState(prev));
    markAllNotificationsRead().catch(err => {
      console.error('Failed to mark all notifications read:', err);
      unread.forEach(id => locallyRead.current.delete(id));
      setNotifications(prev => prev.map(n => (unread.includes(n.id) ? { ...n, read: false } : n)));
      showToast(describeError(err, "Couldn't mark your notifications read. Please try again."));
    });
  }, [notifications, applyLocalState, showToast]);

  const dismiss = useCallback((ids: string[]) => {
    const removed = notifications.filter(n => ids.includes(n.id));
    if (removed.length === 0) return;
    ids.forEach(id => locallyDismissed.current.add(id));
    setNotifications(prev => applyLocalState(prev));
    dismissNotifications(ids).catch(err => {
      console.error('Failed to dismiss notifications:', err);
      ids.forEach(id => locallyDismissed.current.delete(id));
      setNotifications(prev => sortNewestFirst([...prev, ...removed.filter(r => !prev.some(n => n.id === r.id))]));
      showToast(describeError(err, "Couldn't dismiss the notification. Please try again."));
    });
  }, [notifications, applyLocalState, showToast]);

  const savePreferences = useCallback(async (changes: NotificationPreferencesUpdate) => {
    const saved = await updateNotificationPreferences(changes);
    setPreferences(saved);
    // Switching a type off or moving quiet hours changes what's listed now.
    void refresh();
    return saved;
  }, [refresh]);

  const value = useMemo<NotificationsContextValue>(() => ({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    status,
    refresh,
    markRead,
    markAllRead,
    dismiss,
    panelOpen,
    setPanelOpen,
    preferences,
    preferencesError,
    loadPreferences,
    savePreferences,
  }), [
    notifications, status, refresh, markRead, markAllRead, dismiss, panelOpen,
    preferences, preferencesError, loadPreferences, savePreferences,
  ]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};
