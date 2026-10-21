// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import { AppShellContext, type AppShellValue } from '@/app/context/AppShellContext';
import { useProfile } from '@/app/hooks/useProfile';
import type { MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  fetchCalendarActivity: vi.fn(),
  fetchMoodCheckins: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  fetchMoodTags: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
const auth = vi.hoisted(() => ({ user: { id: 'user-1' } }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
const habitsContext = vi.hoisted(() => ({ habits: [] }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => habitsContext }));

import CalendarReportView from './CalendarReportView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (period_start: string, mood: number): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});

const showMood = (show: boolean) =>
  api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { show_in_reports: show } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Wednesday: the week is Oct 19–25, three days in.
  vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
  showMood(true);
  api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
    start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [],
  }));
  api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), checkin('2026-10-01', 2)]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const ProfileShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const profileState = useProfile(auth.user as Parameters<typeof useProfile>[0]);
  return <AppShellContext.Provider value={{ profileState } as AppShellValue}>{children}</AppShellContext.Provider>;
};

const render = async () => {
  await act(async () => {
    root.render(<ToastProvider><ProfileShell><CalendarReportView /></ProfileShell></ToastProvider>);
  });
};

const text = () => document.body.textContent ?? '';
const buttonLabelled = (pattern: RegExp) =>
  [...document.body.querySelectorAll('button')].find(b => pattern.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('CalendarReportView mood', () => {
  it('adds the Mood tile and widens the week summary to 4 weeks', async () => {
    await render();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-09-24', '2026-10-25');
    expect(text()).toContain('1 of 3 days logged');
    expect(text()).toContain('Using 4 weeks — one week is too short');
    // The Check-ins card averages Good and Low over the 28 days to today.
    expect(text()).toContain('2 of 28 days logged');
    expect(text()).toContain('Mood over time');
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
  });

  it('keeps the Mood section for a week with check-ins only in the earlier weeks', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-15', 4), checkin('2026-10-01', 2)]);
    await render();
    expect(text()).not.toContain('Nothing recorded');
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
    expect(text()).toContain('Using 4 weeks — one week is too short');
    expect(text()).toContain('2 of 28 days logged');
    expect(text()).toContain('Mood over time');
  });

  it('shows the mood error instead of the empty state when check-ins fail to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchMoodCheckins.mockRejectedValue(new Error('offline'));
    await render();
    expect(text()).not.toContain('Nothing recorded');
    expect(text()).toContain('Couldn’t load check-ins');
    expect(text()).toContain('Couldn’t load your mood check-ins.');
    expect(buttonLabelled(/^Try again$/)).toBeDefined();
  });

  it('leaves mood out when "Show mood in reports" is off', async () => {
    showMood(false);
    api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      start_date: start, end_date: end, scheduled_tasks: [], note_sessions: [], habit_completions: [],
      completed_tasks: [{
        id: 1, title: 'Task', category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
        completed: true, completed_date: '2026-10-20T18:00:00Z', parent_task_id: null, tags: [],
      }],
    }));
    await render();
    expect(text()).toContain('1 task finished');
    expect(text()).not.toContain('Mood over time');
    expect(text()).not.toContain('Mood & your activity');
    expect(text()).not.toContain('days logged');
    expect(container.querySelector('.lg\\:grid-cols-6')).toBeNull();
    expect(container.querySelector('.lg\\:grid-cols-5')).not.toBeNull();
  });

  it('edits a logged day and logs a hollow one', async () => {
    await render();
    await click(buttonLabelled(/^Tuesday, October 20: Mood Good/));
    expect(text()).toContain('Edit check-in · Tue, Oct 20');
    await click(buttonLabelled(/^Cancel$/));

    await click(buttonLabelled(/^Monday, October 19: no check-in/));
    expect(text()).toContain('Daily check-in');
    expect(text()).toContain('Monday, October 19');
    // Future days have no dot to click.
    expect(buttonLabelled(/^Thursday, October 22/)).toBeUndefined();
  });

  it('shows "Not enough data" for mood and activity below 10 check-ins', async () => {
    await render();
    // The week's activity reaches back over the same 4 weeks as its mood summary.
    expect(api.fetchCalendarActivity).toHaveBeenCalledWith('2026-09-24', '2026-10-25', { includeArchived: true });
    expect(text()).toContain('Mood & your activity');
    expect(text()).toContain('Not enough data');
    expect(text()).toContain('2 days with a check-in');
    expect(text()).toContain('Patterns between mood and tasks show up after about 10 days with a check-in — 2 so far in the last 4 weeks.');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');
    expect(text()).toContain('Tags & mood');
  });

  it('describes how mood moved with habits, and averages mood by tag', async () => {
    // 20 check-ins over Oct 2–21: mood rises with the habits checked off that day.
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 2).padStart(2, '0')}`);
    api.fetchMoodCheckins.mockResolvedValue(days.map((d, i) => ({ ...checkin(d, (i % 5) + 1), id: i + 1, tags: i % 5 >= 3 ? ['Exercised'] : [] })));
    api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [],
      habit_completions: days.flatMap((d, i) => Array.from({ length: i % 5 }, (_, h) => ({ habit_id: h + 1, habit_title: `Habit ${h}`, date: d, estimated_time: null }))),
    }));
    await render();
    expect(text()).toContain('20 days with a check-in');
    // Tasks never varied.
    expect(text()).toContain('Your number of tasks completed barely changed');

    await click(buttonLabelled(/^Habits$/));
    expect(text()).toContain('In the last 4 weeks, your mood tended to be higher on days with more habits checked off.');
    expect(text()).toContain('Based on 20 days, so treat it as a hint.');
    expect(text()).toContain('Moderate link');
    expect(text()).toContain('↑ together');
    expect(text()).toContain('Shows what tends to move together — not what causes what.');
    expect(text()).toContain('ρ = 1.00');

    await click(buttonLabelled(/^Day by day$/));
    expect(container.querySelector('svg[aria-label="Habits completed per day with mood"]')).not.toBeNull();

    // Exercised is on the Good and Great days: 8 of them.
    expect(text()).toContain('Exercised');
    expect(text()).toContain('average mood 4.5');
    expect(text()).toContain('8 days');
  });

  it('opens a month from the year chart', async () => {
    await render();
    await click(buttonLabelled(/^Year$/));
    await click(buttonLabelled(/^October: average mood 3\.0/));
    expect(container.querySelector('#calendar-report-heading')?.textContent).toBe('October 2026');
  });

  describe('weekly and monthly check-ins', () => {
    const week = (period_start: string, mood: number, more: Partial<MoodCheckin> = {}): MoodCheckin =>
      ({ ...checkin(period_start, mood), id: 20, period_kind: 'week', ...more });
    const month = (period_start: string, mood: number, word: string | null): MoodCheckin =>
      ({ ...checkin(period_start, mood), id: 30, period_kind: 'month', word });

    it('draws each week as a dashed span on the month and lists it under Check-ins', async () => {
      api.fetchMoodCheckins.mockResolvedValue([
        checkin('2026-10-20', 4),
        checkin('2026-10-12', 4), // shares its Monday with the week below
        week('2026-10-12', 5, { workload: 2, highlight: 'Finished the proposal' }),
        week('2026-09-28', 2),
      ]);
      await render();
      await click(buttonLabelled(/^Month$/));
      expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-09-25', '2026-11-01');

      expect(buttonLabelled(/^Weekly check-in\. Week of Oct 12: Great · Too much workload · “Finished the proposal”\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/^Weekly check-in\. Week of Sep 28: Low\. Edit$/)).toBeDefined();
      expect(text()).toContain('Weekly check-ins');
      // Weekly check-ins never count as days.
      expect(text()).toContain('2 of 21 days logged');

      await click(buttonLabelled(/^Week of Oct 12: Great/));
      expect(text()).toContain('Edit weekly check-in');
      expect(text()).toContain('Week of Oct 12–18');
      await click(buttonLabelled(/^Cancel$/));

      // The legend names the spans but is not a toggle; the spans stay drawn.
      expect(buttonLabelled(/^Weekly check-in$/)).toBeUndefined();
      expect(buttonLabelled(/^Weekly check-in\. Week of Oct 12/)).toBeDefined();
    });

    it('counts the days of a week that runs into the next month', async () => {
      vi.setSystemTime(new Date(2026, 10, 3, 20, 0));
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-27', 4), checkin('2026-11-01', 2), week('2026-10-26', 3)]);
      await render();
      await click(buttonLabelled(/^Month$/));
      await click(buttonLabelled(/^Previous month$/));
      expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-09-25', '2026-11-01');
      await click(buttonLabelled(/^Week of Oct 26: Okay/));
      expect(text()).toContain('2 of 7');
    });

    it('keeps the Mood section for a weekly check-in with no daily ones', async () => {
      api.fetchMoodCheckins.mockResolvedValue([week('2026-10-19', 5, { highlight: 'Shipped it' })]);
      await render();
      expect(text()).not.toContain('Nothing recorded');
      expect(text()).not.toContain('No mood check-ins');
      expect(text()).toContain('Mood over time');
      expect(text()).toContain('No daily check-ins in the last 4 weeks.');
      expect(buttonLabelled(/^Week of Oct 19: Great · “Shipped it”\. Edit$/)).toBeDefined();
    });

    it('keeps the Year view’s Months in a word with only monthly check-ins', async () => {
      api.fetchMoodCheckins.mockResolvedValue([month('2026-09-01', 2, 'Grind')]);
      await render();
      await click(buttonLabelled(/^Year$/));
      expect(text()).not.toContain('No mood check-ins');
      expect(text()).toContain('Months in a word');
      expect(buttonLabelled(/^September: Low, “Grind”\. Edit$/)).toBeDefined();
    });

    it('still shows the empty state with no check-ins of any kind', async () => {
      api.fetchMoodCheckins.mockResolvedValue([]);
      await render();
      await click(buttonLabelled(/^Month$/));
      expect(text()).toContain('Nothing recorded');
    });

    it('replaces only the edited week, not the day that shares its Monday', async () => {
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-12', 4), week('2026-10-12', 5)]);
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...week('2026-10-12', body.mood), ...body }));
      await render();
      await click(buttonLabelled(/^Month$/));
      await click(buttonLabelled(/^Week of Oct 12: Great/));
      await click(buttonLabelled(/^Low$/));
      await click(buttonLabelled(/^Save changes$/));

      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'week', period_start: '2026-10-12', mood: 2 }));
      expect(buttonLabelled(/^Week of Oct 12: Low/)).toBeDefined();
      expect(buttonLabelled(/^Monday, October 12: Mood Good/)).toBeDefined();
    });

    it('marks monthly check-ins on the year and puts their words under Check-ins', async () => {
      api.fetchMoodCheckins.mockResolvedValue([
        checkin('2026-10-20', 4),
        checkin('2026-09-10', 3),
        month('2026-09-01', 2, 'Grind'),
        month('2026-10-01', 4, null),
      ]);
      await render();
      await click(buttonLabelled(/^Year$/));
      expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-01-01', '2026-12-31');

      expect(text()).toContain('Monthly check-in');
      expect(buttonLabelled(/^September: average mood 3\.0 across 1 day\. Monthly check-in: Low · “Grind”\. Open September$/)).toBeDefined();
      expect(text()).toContain('Months in a word');
      expect(text()).not.toContain('Weekly check-ins');
      expect(buttonLabelled(/^September: Low, “Grind”\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/^October: Good\. Edit$/)).toBeDefined();

      await click(buttonLabelled(/^September: Low, “Grind”\. Edit$/));
      expect(text()).toContain('Edit monthly check-in');
      expect(text()).toContain('September 2026');
    });

    it('leaves the lists out while those check-ins are off and none exist', async () => {
      await render();
      expect(text()).not.toContain('Weekly check-ins');
      await click(buttonLabelled(/^Year$/));
      expect(text()).not.toContain('Months in a word');
    });

    it('offers to log the week when weekly check-ins are on', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { show_in_reports: true, weekly: true } });
      await render();
      expect(text()).toContain('No weekly check-in yet — it’s asked on Sunday.');
      await click(buttonLabelled(/^Log it$/));
      expect(text()).toContain('Weekly check-in');
      expect(text()).toContain('Week of Oct 19–25');
    });
  });
});
