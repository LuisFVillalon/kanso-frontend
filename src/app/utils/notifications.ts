import type { AppNotification } from '@/app/types/notification';
import { toLocalDateStr } from '@/app/utils/dateUtils';

/** The backend's cap on a task's (or the default) reminder lead: one week. */
export const REMINDER_MINUTES_MAX = 7 * 24 * 60;

/** The backend's built-in default lead, used until preferences load. */
export const DEFAULT_REMINDER_MINUTES = 120;

/** Leads offered as one-click choices, in minutes. */
export const REMINDER_PRESETS = [15, 30, 60, 120, 24 * 60];

/** The backend always sends a final warning this long before a task is due. */
export const FINAL_WARNING_MINUTES = 30;

/** The mood reminder's lead choices, in minutes before "Call it a day". */
export const MOOD_REMINDER_MINUTES = [60, 30];
export const DEFAULT_MOOD_REMINDER_MINUTES = 60;

const isMoodType = (type: string) => type === 'mood_reminder' || type === 'mood_missed';

/**
 * The days a mood notification offers to check in for, newest first: its
 * `dates`, or for a reminder from a server that sends none, the local day it
 * fired. Empty for every other type.
 */
export function moodCheckinDates(n: AppNotification): string[] {
  if (!isMoodType(n.type)) return [];
  const dates = [...new Set((n.dates ?? []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().reverse();
  if (dates.length === 0 && n.type === 'mood_reminder') return [toLocalDateStr(new Date(n.fire_at))];
  return dates;
}

/** "15 min", "1 h", "1 h 30 min", "1 day", "2 days 3 h". */
export function formatLeadTime(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) parts.push(`${hours} h`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(' ') || '0 min';
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86_400_000,
  );
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Newest first by delivery time. The server already sorts; this keeps local merges in order. */
export function sortNewestFirst(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => new Date(b.fire_at).getTime() - new Date(a.fire_at).getTime());
}

/**
 * Remembers which notifications this session has already shown, so each
 * poll toasts only unread ones that are new. Everything a poll returns is
 * marked seen, read or not, so a notification read on another device and
 * then (impossibly) unread again never toasts late.
 */
export function createNotificationDeduper() {
  const seen = new Set<string>();
  return {
    /** The unread notifications in `list` not seen before; marks all of `list` seen. */
    takeFresh(list: AppNotification[]): AppNotification[] {
      const fresh = list.filter(n => !n.read && !seen.has(n.id));
      list.forEach(n => seen.add(n.id));
      return fresh;
    },
  };
}

/**
 * The one toast to show for a poll's fresh notifications: the notification
 * itself when there is one, a count when there are several (so the first
 * load after a night away doesn't stack a toast per alert), else nothing.
 */
export function summarizeFresh(fresh: AppNotification[]): string | null {
  if (fresh.length === 0) return null;
  if (fresh.length === 1) return fresh[0].title;
  return `You have ${fresh.length} new notifications.`;
}

/**
 * Runs `run` now and then every `intervalMs` while the page is visible:
 * the timer stops while the tab is hidden, and returning to the tab (or
 * focusing the window) runs it again at once. Focus and visibilitychange
 * usually fire together, so a run within `minGapMs` of the last is skipped.
 * Returns a function that stops it all.
 */
export function startVisiblePolling(
  run: () => void,
  { intervalMs, minGapMs }: { intervalMs: number; minGapMs: number },
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastRun = -Infinity;

  const tick = () => {
    lastRun = Date.now();
    run();
  };
  const tickIfStale = () => {
    if (Date.now() - lastRun >= minGapMs) tick();
  };
  const startTimer = () => {
    if (timer === null) timer = setInterval(tick, intervalMs);
  };
  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      tickIfStale();
      startTimer();
    } else {
      stopTimer();
    }
  };

  if (document.visibilityState === 'visible') {
    tick();
    startTimer();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', tickIfStale);

  return () => {
    stopTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', tickIfStale);
  };
}
