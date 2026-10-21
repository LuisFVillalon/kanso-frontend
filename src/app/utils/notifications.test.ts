// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@/app/types/notification';
import {
  createNotificationDeduper,
  formatLeadTime,
  formatRelativeTime,
  moodCheckinDates,
  startVisiblePolling,
  summarizeFresh,
} from './notifications';

const notification = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
  id, type: 'task_reminder', title: `Title ${id}`, body: '', fire_at: '2026-10-20T16:00:00Z',
  task_ids: [], habit_ids: [], read: false, ...overrides,
});

describe('createNotificationDeduper', () => {
  it('returns each unread notification once per session', () => {
    const deduper = createNotificationDeduper();
    expect(deduper.takeFresh([notification('a'), notification('b')]).map(n => n.id)).toEqual(['a', 'b']);
    expect(deduper.takeFresh([notification('a'), notification('b')])).toEqual([]);
    expect(deduper.takeFresh([notification('c'), notification('a')]).map(n => n.id)).toEqual(['c']);
  });

  it('never returns read notifications, even the first time they appear', () => {
    const deduper = createNotificationDeduper();
    expect(deduper.takeFresh([notification('a', { read: true })])).toEqual([]);
  });

  it('marks read notifications seen, so they stay quiet if they come back unread', () => {
    const deduper = createNotificationDeduper();
    deduper.takeFresh([notification('a', { read: true })]);
    expect(deduper.takeFresh([notification('a')])).toEqual([]);
  });
});

describe('summarizeFresh', () => {
  it('shows nothing for no fresh notifications', () => {
    expect(summarizeFresh([])).toBeNull();
  });

  it("shows a lone notification's own title", () => {
    expect(summarizeFresh([notification('a', { title: 'Essay is due in 2 hours' })])).toBe('Essay is due in 2 hours');
  });

  it('summarises several as one count', () => {
    expect(summarizeFresh([notification('a'), notification('b'), notification('c')])).toBe('You have 3 new notifications.');
  });
});

describe('formatLeadTime', () => {
  it.each([
    [15, '15 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [1440, '1 day'],
    [2 * 1440 + 180, '2 days 3 h'],
    [10080, '7 days'],
  ])('%i minutes reads as %s', (minutes, label) => {
    expect(formatLeadTime(minutes)).toBe(label);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date(2026, 9, 20, 18, 0);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it('reads recent times in minutes and hours', () => {
    expect(formatRelativeTime(ago(0), now)).toBe('just now');
    expect(formatRelativeTime(ago(5), now)).toBe('5 min ago');
    expect(formatRelativeTime(ago(180), now)).toBe('3 h ago');
  });

  it('reads older times in calendar days', () => {
    expect(formatRelativeTime(new Date(2026, 9, 19, 9, 0).toISOString(), now)).toBe('yesterday');
    expect(formatRelativeTime(new Date(2026, 9, 16, 9, 0).toISOString(), now)).toBe('4 days ago');
    expect(formatRelativeTime(new Date(2026, 9, 1, 9, 0).toISOString(), now)).toBe('Oct 1');
  });
});

describe('startVisiblePolling', () => {
  let visibility: DocumentVisibilityState;
  const setVisibility = (next: DocumentVisibilityState) => {
    visibility = next;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const start = () => {
    const run = vi.fn();
    const stop = startVisiblePolling(run, { intervalMs: 60_000, minGapMs: 5_000 });
    return { run, stop };
  };

  it('runs at once and then every interval while visible', () => {
    const { run, stop } = start();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(120_000);
    expect(run).toHaveBeenCalledTimes(4);
    stop();
  });

  it('stops while hidden and runs again on return', () => {
    const { run, stop } = start();
    vi.advanceTimersByTime(10_000);
    setVisibility('hidden');
    vi.advanceTimersByTime(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('runs on window focus, but not twice within the minimum gap', () => {
    const { run, stop } = start();
    window.dispatchEvent(new Event('focus'));
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    window.dispatchEvent(new Event('focus'));
    expect(run).toHaveBeenCalledTimes(2);
    // Coming back to the tab fires visibilitychange and focus together.
    vi.advanceTimersByTime(30_000);
    setVisibility('hidden');
    setVisibility('visible');
    window.dispatchEvent(new Event('focus'));
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not start while the page is hidden', () => {
    visibility = 'hidden';
    const { run, stop } = start();
    vi.advanceTimersByTime(5 * 60_000);
    expect(run).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does nothing after it is stopped', () => {
    const { run, stop } = start();
    stop();
    vi.advanceTimersByTime(5 * 60_000);
    setVisibility('hidden');
    setVisibility('visible');
    window.dispatchEvent(new Event('focus'));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('moodCheckinDates', () => {
  it("gives a reminder's own day", () => {
    expect(moodCheckinDates(notification('a', { type: 'mood_reminder', dates: ['2026-10-20'] }))).toEqual(['2026-10-20']);
  });

  it('falls back to the local day a reminder fired when the server sends no dates', () => {
    const fired = new Date(2026, 9, 20, 17, 0);
    expect(moodCheckinDates(notification('a', { type: 'mood_reminder', fire_at: fired.toISOString() }))).toEqual(['2026-10-20']);
  });

  it('lists missed days newest first, without repeats or malformed dates', () => {
    const n = notification('a', { type: 'mood_missed', dates: ['2026-10-17', '2026-10-19', 'yesterday', '2026-10-18', '2026-10-19'] });
    expect(moodCheckinDates(n)).toEqual(['2026-10-19', '2026-10-18', '2026-10-17']);
  });

  it('has nothing for missed days without dates, or for other types', () => {
    expect(moodCheckinDates(notification('a', { type: 'mood_missed' }))).toEqual([]);
    expect(moodCheckinDates(notification('a', { dates: ['2026-10-20'] }))).toEqual([]);
  });
});
