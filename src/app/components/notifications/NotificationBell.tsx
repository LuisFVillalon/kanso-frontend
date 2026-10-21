'use client';

import React, { useEffect, useRef } from 'react';
import {
  AlarmClock, AlertTriangle, Bell, BellRing, CheckCheck, Loader2, Repeat, Sun, X,
} from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { useNotifications } from '@/app/context/NotificationsContextValue';
import { useTasksContext } from '@/app/context/TasksContext';
import type { AppNotification } from '@/app/types/notification';
import { formatRelativeTime } from '@/app/utils/notifications';

const TYPE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  due_today:      { icon: Sun,           color: 'var(--tm-accent)' },
  task_reminder:  { icon: BellRing,      color: 'var(--tm-accent)' },
  final_warning:  { icon: AlarmClock,    color: 'var(--tm-warning)' },
  overdue:        { icon: AlertTriangle, color: 'var(--tm-danger)' },
  habit_reminder: { icon: Repeat,        color: 'var(--tm-success)' },
};
const FALLBACK_ICON = { icon: Bell, color: 'var(--tm-accent)' };

interface NotificationBellProps {
  /** Opens one task, e.g. in the edit modal. */
  onOpenTask: (taskId: number) => void;
  /** Opens the habits a reminder is about. */
  onOpenHabits: (habitIds: number[]) => void;
}

/**
 * Bell with an unread count; opens a panel listing notifications newest
 * first. Hidden while signed out and when the API refuses notifications
 * (see NotificationsStatus), so the demo can't break on it.
 */
const NotificationBell: React.FC<NotificationBellProps> = ({ onOpenTask, onOpenHabits }) => {
  const { dataUserId } = useAuth();
  const {
    notifications, unreadCount, status, refresh, markRead, markAllRead, dismiss, panelOpen, setPanelOpen,
  } = useNotifications();
  const { tasks } = useTasksContext();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPanelOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen, setPanelOpen]);

  if (!dataUserId || status === 'unavailable') return null;

  const togglePanel = () => {
    if (!panelOpen) void refresh();
    setPanelOpen(!panelOpen);
  };

  const openTask = (n: AppNotification, taskId: number) => {
    markRead([n.id]);
    setPanelOpen(false);
    onOpenTask(taskId);
  };

  const openItem = (n: AppNotification) => {
    if (n.task_ids.length === 1) return openTask(n, n.task_ids[0]);
    markRead([n.id]);
    if (n.habit_ids.length > 0) {
      setPanelOpen(false);
      onOpenHabits(n.habit_ids);
    }
    // Several tasks: the item stays open so one can be picked from its chips.
  };

  const taskTitle = (id: number) => tasks.find(t => t.id === id)?.title;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        title="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-full transition-colors text-text-muted hover:text-text-primary"
        style={{ backgroundColor: 'var(--tm-surface-raised)' }}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[0.625rem] font-bold leading-[1.125rem] text-center"
            style={{ backgroundColor: 'var(--tm-danger)', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="card menu-panel-open fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] z-50 flex flex-col max-h-[70vh]"
          style={{ boxShadow: 'var(--tm-shadow-lg)' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-text-primary">Notifications</h2>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          </div>

          <div className="overflow-y-auto scrollbar-custom flex-1">
            {notifications.length === 0 ? (
              status === 'loading' ? (
                <div className="flex justify-center py-8 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading notifications" />
                </div>
              ) : status === 'error' ? (
                <div className="px-4 py-8 text-center text-sm text-text-secondary">
                  <p>Couldn&apos;t load your notifications.</p>
                  <button type="button" onClick={() => void refresh()} className="mt-2 font-medium text-accent hover:underline">
                    Try again
                  </button>
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-text-muted">You&apos;re all caught up.</p>
              )
            ) : (
              <ul>
                {notifications.map(n => {
                  const { icon: Icon, color } = TYPE_ICON[n.type] ?? FALLBACK_ICON;
                  const chips = n.task_ids.length > 1
                    ? n.task_ids.flatMap(id => {
                        const title = taskTitle(id);
                        return title ? [{ id, title }] : [];
                      })
                    : [];
                  return (
                    <li
                      key={n.id}
                      className="group relative flex gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0 hover:bg-[var(--tm-surface-raised)] transition-colors"
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className="block w-full text-left"
                        >
                          <span className={`flex items-center gap-1.5 text-sm text-text-primary ${n.read ? '' : 'font-semibold'}`}>
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--tm-accent)' }}>
                                <span className="sr-only">Unread: </span>
                              </span>
                            )}
                            <span className="truncate">{n.title}</span>
                          </span>
                          <span className="block text-xs text-text-secondary mt-0.5">{n.body}</span>
                          <span className="block text-[0.6875rem] text-text-muted mt-1">
                            <time dateTime={n.fire_at}>{formatRelativeTime(n.fire_at)}</time>
                          </span>
                        </button>
                        {chips.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {chips.map(({ id, title }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => openTask(n, id)}
                                className="chip max-w-full truncate hover:underline"
                                style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
                              >
                                <span className="truncate">{title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => dismiss([n.id])}
                        aria-label={`Dismiss: ${n.title}`}
                        title="Dismiss"
                        className="self-start p-1 -m-1 rounded text-text-muted hover:text-text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {status === 'error' && notifications.length > 0 && (
            <p className="px-4 py-2 text-xs text-text-muted border-t border-border-subtle">
              Couldn&apos;t refresh just now. Showing the last list.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
