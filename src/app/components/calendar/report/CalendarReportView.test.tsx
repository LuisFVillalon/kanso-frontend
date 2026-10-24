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
  fetchEventReport: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
const auth = vi.hoisted(() => ({ user: { id: 'user-1' } }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
const habitsContext = vi.hoisted(() => ({ habits: [] }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => habitsContext }));
// The open tab lives in the URL: read it from window.location, and re-render on pushState like Next does.
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const listeners = new Set<() => void>();
  const pushState = window.history.pushState.bind(window.history);
  window.history.pushState = (...args: Parameters<History['pushState']>) => {
    pushState(...args);
    listeners.forEach(listener => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  };
});

import CalendarReportView from './CalendarReportView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (period_start: string, mood: number): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});


const emptyEventReport = (start: string, end: string) => ({
  start_date: start, end_date: end, event_count: 0, archived_count: 0, total_minutes: 0,
  window_minutes: 5 * 840, event_window_minutes: 0, free_minutes: 5 * 840, free_pct: 100,
  busiest_day: null, by_tag: [], by_day: [], by_week: [], by_month: [],
});

beforeEach(() => {
  window.history.replaceState(null, '', '/reports');
  vi.useFakeTimers({ toFake: ['Date'] });
  // Wednesday: the week is Oct 19–25, three days in.
  vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
  api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: {} });
  api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
    start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [],
  }));
  api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), checkin('2026-10-01', 2)]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
  api.fetchEventReport.mockImplementation(async (start: string, end: string) => emptyEventReport(start, end));
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
const tab = (name: string) => [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === name)!;
const openTab = (name: string) => click(tab(name));
const openPatterns = () => click([...document.querySelectorAll('[aria-label="Mood view"] button')].find(b => b.textContent === 'Patterns')!);

describe('CalendarReportView mood', () => {
  it('adds the Mood tile and keeps the week summary to the week', async () => {
    await render();
    // The week before too, which the Mood over time summary compares with.
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-12', '2026-10-25');
    expect(text()).toContain('1 of 3 days logged');
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
    await openTab('Mood');
    expect(text()).not.toContain('4 weeks');
    expect(text()).not.toContain('28 days');
    expect(text()).toContain('Mood over time');
  });

  it('ignores check-ins from before the week', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-15', 4), checkin('2026-10-01', 2)]);
    await render();
    expect(text()).toContain('Nothing recorded for this week');
  });

  it('shows the mood error instead of the empty state when check-ins fail to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchMoodCheckins.mockRejectedValue(new Error('offline'));
    await render();
    expect(text()).not.toContain('Nothing recorded');
    expect(text()).toContain('Couldn’t load check-ins');
    await openTab('Mood');
    expect(text()).toContain('Couldn’t load your mood check-ins.');
    expect(buttonLabelled(/^Try again$/)).toBeDefined();
  });

  it('always shows mood, even from a profile still saved with the old "Show mood in reports" off', async () => {
    api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { show_in_reports: false } });
    api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      start_date: start, end_date: end, scheduled_tasks: [], note_sessions: [], habit_completions: [],
      completed_tasks: [{
        id: 1, title: 'Task', category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
        completed: true, completed_date: '2026-10-20T18:00:00Z', parent_task_id: null, tags: [],
      }],
    }));
    await render();
    expect(text()).toContain('1 task finished');
    expect(api.fetchMoodCheckins).toHaveBeenCalled();
    expect(text()).toContain('days logged');
    expect(text()).toContain('Mood comes from your daily check-ins');
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
  });

  it('edits a logged day and logs a hollow one', async () => {
    await render();
    await openTab('Mood');
    await click(buttonLabelled(/^Tuesday, October 20: Mood Good/));
    expect(text()).toContain('Edit check-in · Tue, Oct 20');
    await click(buttonLabelled(/^Cancel$/));

    await click(buttonLabelled(/^Monday, October 19: no check-in/));
    expect(text()).toContain('Daily check-in');
    expect(text()).toContain('Monday, October 19');
    // Future days have no dot to click.
    expect(buttonLabelled(/^Thursday, October 22/)).toBeUndefined();
  });

  it('points a week to its Month report for mood patterns', async () => {
    await render();
    expect(api.fetchCalendarActivity).toHaveBeenCalledWith('2026-10-19', '2026-10-25', { includeArchived: true });
    await openTab('Mood');
    expect(text()).not.toContain('Patterns in your mood show up');
    await openPatterns();
    expect(text()).not.toContain('Mood & your activity');
    expect(text()).toContain('What tends to go with your mood, energy and stress');
    expect(text()).toContain('Your task & note tags');
    expect(text()).toContain('A week is too short to tell anything from chance');
    await click(buttonLabelled(/^See October$/));
    expect(container.querySelector('#calendar-report-heading')?.textContent).toBe('October 2026');
    expect(text()).toContain('Mood & your activity');
  });

  it('answers “Can’t tell yet” for every feeling below 5 check-in days a side', async () => {
    await render();
    await openTab('Mood');
    await click(buttonLabelled(/^Month$/));
    expect(text()).toContain('Patterns in your mood show up after about 10 days with a check-in — 2 so far this month.');
    await openPatterns();
    expect(text()).toContain('What tends to go with your mood, energy and stress');
    expect(text()).toContain('2 days with a check-in this month');
    expect(text()).toContain('What stood out');
    expect(text()).toContain('Too few days to tell anything yet: each side of a comparison needs 5 days with a check-in, and you have 2 days this month.');
    expect(text()).toContain('Mood & your activity');
    expect(text()).toContain('How is your mood on days you finish more tasks?');
    expect(text()).toContain('Can’t tell yet');
    expect(text()).toContain('Your tasks barely changed from day to day');
    expect(container.querySelector('svg[aria-label="No line yet: not enough to compare"]')).not.toBeNull();
    // One Tags & moments card beside it, opening on your own tags; its switch swaps in the Moments in place.
    expect(text()).toContain('Tags & moments');
    expect([...document.querySelector('[aria-label="Pattern to show"]')!.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Activity', 'Tags & moments']);
    expect(tab('Your task & note tags').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('How is your mood on days with each tag?');
    await openTab('Moments');
    expect(tab('Moments').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('How is your mood on days you pick each moment?');
    expect(text()).not.toContain('How is your mood on days with each tag?');
    expect(text()).toContain('Mood & your activity');
    // The Overview says the same as the activity card.
    await openTab('Productivity');
    expect(buttonLabelled(/^Mood & your activity/).getAttribute('aria-label')).toBe(
      'Mood & your activity: Too few days to tell anything yet: each side of a comparison needs 5 days with a check-in, and you have 2 days this month.',
    );
    expect(text()).toContain('Check in more · 2 days so far');
  });

  it('answers mood, energy and stress by one rule, opening on the clearest finding', async () => {
    // 20 check-ins over Oct 2–21: mood rises with the habits checked off that day, and "Exercised" is on the Good and Great days.
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 2).padStart(2, '0')}`);
    api.fetchMoodCheckins.mockResolvedValue(days.map((d, i) => ({ ...checkin(d, (i % 5) + 1), id: i + 1, stress: 3, tags: i % 5 >= 3 ? ['Exercised'] : [] })));
    api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [],
      habit_completions: days.flatMap((d, i) => Array.from({ length: i % 5 }, (_, h) => ({ habit_id: h + 1, habit_title: `Habit ${h}`, date: d, estimated_time: null }))),
    }));
    await render();
    await openTab('Mood');
    await click(buttonLabelled(/^Month$/));
    await openPatterns();
    const summary = [...container.querySelectorAll('.card-glass')].find(c => c.textContent?.startsWith('What stood out'))!;
    expect(summary.textContent).toContain('Your mood was maybe higher on days with more habits checked off');
    expect(summary.textContent).toContain('Your mood was maybe higher on days you picked “Exercised”');
    expect(summary.textContent).toContain('Too early to be sure · 12 days vs 8 other');
    expect(summary.textContent).toContain('Everything else was about the same.');

    // The activity card opens on its finding: Habits, with mood picked, and a line from quieter to busier days.
    const pressed = (label: string) => [...document.querySelectorAll(`[aria-label="${label}"] [aria-pressed="true"]`)].map(b => b.textContent);
    expect(pressed('Compare with')).toEqual(['Habits']);
    expect(text()).toContain('How is your mood on days you check off more habits?');
    expect(container.querySelector('svg[aria-label^="Mood averaged "]')?.getAttribute('aria-label'))
      .toMatch(/^Mood averaged 4\.\d \((Good|Great)\) on days with 2\+ habits and 1\.\d \((Rough|Low)\) on days with 0–1 habits\.$/);
    // Stress never changed, so every row reads about the same for it.
    await click([...document.querySelectorAll('[aria-label="Feeling to show"]')][0].querySelectorAll('button')[2]);
    expect(text()).toContain('How is your stress on days you check off more habits?');
    expect(text()).toContain('Your stress was about the same on days with more habits checked off');
    // Energy was never logged.
    await click([...document.querySelectorAll('[aria-label="Feeling to show"]')][0].querySelectorAll('button')[1]);
    expect(text()).toContain('No energy logged in your check-ins yet');
    // Tasks never varied.
    await click([...document.querySelectorAll('[aria-label="Compare with"] button')].find(b => b.textContent === 'Tasks')!);
    expect(text()).toContain('Your tasks barely changed from day to day');
    expect(text()).not.toMatch(/\b(better|worse)\b/);
    expect(text()).not.toMatch(/ρ|Spearman/);

    // The Tags & moments card opens on the Moments, its finding picked with its numbers.
    expect(tab('Moments').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('How is your mood on days you pick each moment?');
    expect(buttonLabelled(/^Exercised, 8 days: Maybe higher$/).getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain('Your mood was maybe higher on days you picked “Exercised”. Too early to be sure · 8 days vs 12 other. Mood averaged');

    // The Overview gives the activity card's answer in the same words, with the whole sentence on hover.
    await openTab('Productivity');
    expect(text()).toContain('Habits · Maybe higher mood');
    const link = buttonLabelled(/^Mood & your activity/);
    const full = 'Your mood was maybe higher on days with more habits checked off · Too early to be sure · 12 days vs 8 other';
    expect(link.getAttribute('aria-label')).toBe(`Mood & your activity: ${full}`);
    expect(link.querySelector('[title]')?.getAttribute('title')).toBe(full);
  });

  it('opens on a finding past the first 8 rows with its row shown and picked', async () => {
    // Nine moments on every day outrank "Exercised", the only one with a finding.
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 2).padStart(2, '0')}`);
    const always = Array.from({ length: 9 }, (_, k) => `Always ${k + 1}`);
    api.fetchMoodCheckins.mockResolvedValue(days.map((d, i) => ({ ...checkin(d, (i % 5) + 1), id: i + 1, tags: [...always, ...(i % 5 >= 3 ? ['Exercised'] : [])] })));
    await render();
    await openTab('Mood');
    await click(buttonLabelled(/^Month$/));
    await openPatterns();
    expect(tab('Moments').getAttribute('aria-selected')).toBe('true');
    expect(buttonLabelled(/^Always 8, 20 days: /)).toBeDefined();
    expect(buttonLabelled(/^Exercised, 8 days: Maybe higher$/).getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain('Your mood was maybe higher on days you picked “Exercised”. Too early to be sure · 8 days vs 12 other. Mood averaged');
    expect(text()).toContain('Showing 9 of 10.');
    // Tapped again it stays listed, until another row is picked.
    await click(buttonLabelled(/^Exercised, 8 days: /));
    expect(buttonLabelled(/^Exercised, 8 days: /).getAttribute('aria-pressed')).toBe('false');
    await click(buttonLabelled(/^Always 1, 20 days: /));
    expect(buttonLabelled(/^Exercised, 8 days: /)).toBeUndefined();
    expect(text()).toContain('Showing 8 of 10.');
  });

  it('shows a tag row’s numbers under the list on tap, one row at a time', async () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 2).padStart(2, '0')}`);
    api.fetchMoodCheckins.mockResolvedValue(days.map((d, i) => ({
      ...checkin(d, (i % 5) + 1), id: i + 1, tags: i % 5 >= 3 ? ['Exercised'] : i % 5 <= 1 ? ['Tired'] : i === 2 ? ['Exam'] : [],
    })));
    await render();
    await openTab('Mood');
    await click(buttonLabelled(/^Month$/));
    await openPatterns();
    await openTab('Moments');

    const exercised = buttonLabelled(/^Exercised, 8 days: /);
    const tired = buttonLabelled(/^Tired, 8 days: /);
    const exam = buttonLabelled(/^Exam, 1 day: /);
    expect(tired.getAttribute('aria-label')).toBe('Tired, 8 days: Maybe lower');
    expect(exam.getAttribute('aria-label')).toBe('Exam, 1 day: Can’t tell yet');
    const caption = () => container.querySelector('p[aria-live="polite"]')?.textContent;

    await click(tired);
    expect(tired.getAttribute('aria-pressed')).toBe('true');
    expect(exercised.getAttribute('aria-pressed')).toBe('false');
    expect(caption()).toMatch(/^Your mood was maybe lower on days you picked “Tired”\. Too early to be sure · 8 days vs 12 other\. Mood averaged 1\.\d \((Rough|Low)\) on days you picked “Tired” and/);

    await click(exam);
    expect(tired.getAttribute('aria-pressed')).toBe('false');
    expect(caption()).toBe('Can’t tell yet for Exam. Needs 5 days on each side · only 1 so far. Mood averaged 3.0 (Okay) on days you picked “Exam” and 2.8 (Okay) on other days.');

    await click(exam);
    expect(caption()).toContain('Moments are what you pick when you check in.');
  });

  it('opens a month from the year chart', async () => {
    await render();
    await openTab('Mood');
    await click(buttonLabelled(/^Year$/));
    await click(buttonLabelled(/^October: typical mood 3\.0/));
    expect(container.querySelector('#calendar-report-heading')?.textContent).toBe('October 2026');
  });

  describe('mood, energy and stress over time', () => {
    const full = (period_start: string, mood: number, energy: number | null, stress: number | null): MoodCheckin =>
      ({ ...checkin(period_start, mood), energy, stress });
    const dots = (series: string) => [...container.querySelectorAll(`[data-series="${series}"]`)] as HTMLElement[];
    const tooltip = () => container.querySelector('[aria-label="Mood, energy and stress over time"] > [aria-hidden="true"].z-30');
    const pointerDown = async (el: Element, pointerType: string) => {
      await act(async () => {
        const event = new MouseEvent('pointerdown', { bubbles: true });
        Object.defineProperty(event, 'pointerType', { value: pointerType });
        el.dispatchEvent(event);
      });
    };

    it('stacks three rows on one axis, each with its own words, leaving gaps where energy and stress were skipped', async () => {
      api.fetchMoodCheckins.mockResolvedValue([full('2026-10-19', 2, 1, 5), full('2026-10-20', 4, null, null), full('2026-10-21', 5, 5, 1)]);
      await render();
      await openTab('Mood');
      expect(text()).toContain('A week of ups and downs.');
      expect(container.querySelector('[data-gap-day]')).toBeNull();
      for (const word of ['Rough', 'Okay', 'Great', 'Drained', 'Steady', 'Charged', 'Calm', 'Some', 'Maxed']) expect(text()).toContain(word);
      expect(dots('mood').map(d => d.dataset.day)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
      // A skipped energy or stress is a gap, never a zero.
      expect(dots('energy').map(d => d.dataset.day)).toEqual(['2026-10-19', '2026-10-21']);
      expect(dots('stress').map(d => d.dataset.day)).toEqual(['2026-10-19', '2026-10-21']);
      expect(buttonLabelled(/^Monday, October 19: Mood Low · Energy Drained · Stress Maxed\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/^Tuesday, October 20: Mood Good\. Edit$/)).toBeDefined();
      // One column per day spans all three rows, so the week has one button per day so far.
      expect(container.querySelectorAll('[aria-label="Mood, energy and stress over time"] > button')).toHaveLength(3);
    });

    it('sums the period up above the chart and numbers each note once on it', async () => {
      api.fetchMoodCheckins.mockResolvedValue([full('2026-10-19', 2, 1, 5), full('2026-10-20', 4, 3, 2), full('2026-10-21', 5, 5, 1)]);
      await render();
      await openTab('Mood');
      expect(text()).toContain('A week of ups and downs.');
      const notes = [...container.querySelectorAll('ol li')].map(li => li.textContent);
      expect(notes).toEqual(['1Best day: Wednesday (Great). Hardest: Monday (Low, with stress Maxed).']);
      expect(container.querySelector('[data-mark="best"]')).not.toBeNull();
      expect(container.querySelector('[data-mark="hardest"]')).not.toBeNull();
      // Its number shows once on the chart and once by its note.
      const chart = container.querySelector('[aria-label="Mood, energy and stress over time"]')!;
      expect([...chart.querySelectorAll('span')].filter(el => el.textContent === '1' && !el.children.length)).toHaveLength(1);
      expect(text()).toContain('Based on 3 check-ins over 3 days so far. Shows what happened together, not what caused it.');
    });

    it('compares with the week before and explains the chart’s marks on request', async () => {
      const before = ['12', '13', '14', '15', '16', '17', '18'].map(d => full(`2026-10-${d}`, 2, 2, 4));
      api.fetchMoodCheckins.mockResolvedValue([...before, full('2026-10-19', 5, 4, 1), full('2026-10-20', 5, 4, 1), full('2026-10-21', 5, 4, 2)]);
      await render();
      await openTab('Mood');
      expect(text()).toContain('A brighter week than the week before.');
      expect([...container.querySelectorAll('ol li')].map(li => li.textContent)).toEqual(['1A brighter week than the week before: mood averaged 5.0, up from 2.0.']);
      expect(text()).toContain('Last week avg 2.0');
      // The week before only feeds the comparison: its days aren't on this week's chart.
      expect(dots('mood').map(d => d.dataset.day)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);

      const explain = buttonLabelled(/^Explain this chart$/);
      expect(explain.getAttribute('aria-expanded')).toBe('false');
      await click(explain);
      const panel = container.querySelector('[role="dialog"][aria-label="About this chart"]')!;
      expect(explain.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(panel);
      expect([...panel.querySelectorAll('li')].map(li => li.textContent)).toEqual([
        'Headline: Compares 3 check-ins with 7 from the week before.',
        'Dot = one day',
        'Line joins your days',
        'Dashed line = last week’s average',
        'Want to see what might be behind this? See Patterns',
      ]);
      expect(panel.textContent).not.toContain('Numbers');
      expect(panel.textContent).not.toContain('Why it matters');

      await act(async () => { panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(container.querySelector('[aria-label="About this chart"]')).toBeNull();
      expect(document.activeElement).toBe(explain);

      await click(explain);
      await click(buttonLabelled(/^See Patterns$/));
      expect(window.location.search).toBe('?view=mood&mood=patterns');
    });

    it('nudges for more check-ins until a week has 3, and explains its hollow dots', async () => {
      await render();
      await openTab('Mood');
      expect(text()).toContain('Check in a few more days to see a pattern — 1 of 3 so far.');
      expect(text()).not.toContain('Why it matters');
      expect(text()).not.toContain('not what caused it');
      expect(container.querySelector('ol')).toBeNull();
      await click(buttonLabelled(/^Explain this chart$/));
      const rows = [...container.querySelectorAll('[aria-label="About this chart"] li')].map(li => li.textContent);
      expect(rows).toEqual([
        'Headline: Patterns show after 3 check-ins; you have 1.',
        'Dot = one day',
        'Hollow dot = no check-in. Tap it to log that day',
        'Want to see what might be behind this? See Patterns',
      ]);
      await click(buttonLabelled(/^Close$/));
      expect(container.querySelector('[aria-label="About this chart"]')).toBeNull();
    });

    it('lights a day up in all three rows and lists its values', async () => {
      api.fetchMoodCheckins.mockResolvedValue([full('2026-10-19', 2, 1, 5), full('2026-10-20', 4, null, null)]);
      await render();
      await openTab('Mood');
      expect(tooltip()).toBeNull();
      expect(container.querySelector('[data-gap-day]')?.getAttribute('data-gap-day')).toBe('2026-10-21');

      await act(async () => { buttonLabelled(/^Monday, October 19:/).focus(); });
      expect(container.querySelector('[data-active-column]')?.getAttribute('data-active-column')).toBe('2026-10-19');
      expect(tooltip()?.textContent).toContain('Monday, October 19');
      expect(tooltip()?.textContent).toContain('MoodLow');
      expect(tooltip()?.textContent).toContain('EnergyDrained');
      expect(tooltip()?.textContent).toContain('StressMaxed');
      expect(dots('mood')[0].firstElementChild?.className).toContain('scale-150');
      expect(dots('stress')[0].firstElementChild?.className).toContain('scale-150');

      await act(async () => { buttonLabelled(/^Tuesday, October 20:/).focus(); });
      expect(tooltip()?.textContent).toContain('EnergyNot recorded');
      expect(tooltip()?.textContent).toContain('StressNot recorded');
    });

    it('shows a day on the first tap and edits it on the second', async () => {
      api.fetchMoodCheckins.mockResolvedValue([full('2026-10-20', 4, 3, 2)]);
      await render();
      await openTab('Mood');
      const day = buttonLabelled(/^Tuesday, October 20:/);
      await pointerDown(day, 'touch');
      await act(async () => { (day as HTMLElement).focus(); });
      await click(day);
      expect(text()).not.toContain('Edit check-in');
      expect(tooltip()?.textContent).toContain('Tap again: edit');
      await pointerDown(day, 'touch');
      await click(day);
      expect(text()).toContain('Edit check-in · Tue, Oct 20');
    });

    it('loads a year as two requests, one per year, and compares this year with the last', async () => {
      const lastYear = Array.from({ length: 12 }, (_, i) => full(`2025-${String(i + 1).padStart(2, '0')}-10`, 2, 2, 4));
      const thisYear = Array.from({ length: 12 }, (_, i) => full(`2026-${String((i % 9) + 1).padStart(2, '0')}-${10 + Math.floor(i / 9)}`, 5, 4, 1));
      api.fetchMoodCheckins.mockImplementation(async (start: string) => (start.startsWith('2025') ? lastYear : thisYear));
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));
      const calls = api.fetchMoodCheckins.mock.calls.slice(-2);
      expect(calls).toEqual([['2025-01-01', '2025-12-31'], ['2026-01-01', '2026-12-31']]);
      expect(text()).toContain('A brighter year than 2025.');
      expect(dots('mood').length).toBeGreaterThan(0);
    });

    it('draws each row’s 7-day trend on a month', async () => {
      const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 5).padStart(2, '0')}`);
      api.fetchMoodCheckins.mockResolvedValue(days.map((d, i) => full(d, 3, 4, i % 2 ? 2 : null)));
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Month$/));
      expect(text()).toContain('7-day trend');
      const paths = [...container.querySelectorAll('[aria-label="Mood, energy and stress over time"] svg path')].map(p => p.getAttribute('d') ?? '');
      expect(paths).toHaveLength(3);
      for (const d of paths) expect(d).toMatch(/^M/);
    });

    it('cautions on each year row that has fewer than 8 days in the month', async () => {
      const sept = Array.from({ length: 8 }, (_, i) => full(`2026-09-${String(i + 1).padStart(2, '0')}`, 4, i < 3 ? 4 : null, 2));
      api.fetchMoodCheckins.mockResolvedValue(sept);
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));
      await act(async () => { buttonLabelled(/^September:/).focus(); });
      const rows = [...(tooltip()?.querySelectorAll('li') ?? [])].map(li => li.textContent);
      expect(rows).toHaveLength(3);
      expect(rows[1]).toContain('only 3 days');
      expect(rows[0]).not.toContain('only');
      expect(rows[2]).not.toContain('only');
    });

    it('fades the year’s months with fewer than 8 days', async () => {
      const sept = Array.from({ length: 8 }, (_, i) => full(`2026-09-${String(i + 1).padStart(2, '0')}`, 4, 4, 2));
      api.fetchMoodCheckins.mockResolvedValue([...sept, full('2026-10-20', 2, 2, 4)]);
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));
      expect(text()).toContain('Fewer than 8 days');
      expect(text()).toContain('How the month felt');
      const opacity = (series: string, day: string) => dots(series).find(d => d.dataset.day === day)?.style.opacity;
      for (const series of ['mood', 'energy', 'stress']) {
        expect(opacity(series, '2026-09')).toBe('1');
        expect(opacity(series, '2026-10')).toBe('0.35');
      }
      expect(buttonLabelled(/^September: typical mood 4\.0 across 8 days\. Typical energy 4\.0 across 8 days\. Typical stress 2\.0 across 8 days\. Open September$/)).toBeDefined();
    });
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
      await openTab('Mood');
      await click(buttonLabelled(/^Month$/));
      expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-09-01', '2026-11-01');

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
      await openTab('Mood');
      await click(buttonLabelled(/^Month$/));
      await click(buttonLabelled(/^Previous month$/));
      expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-09-01', '2026-11-01');
      await click(buttonLabelled(/^Week of Oct 26: Okay/));
      expect(text()).toContain('2 of 7');
    });

    it('keeps the Mood section for a weekly check-in with no daily ones', async () => {
      api.fetchMoodCheckins.mockResolvedValue([week('2026-10-19', 5, { highlight: 'Shipped it' })]);
      await render();
      await openTab('Mood');
      expect(text()).not.toContain('Nothing recorded');
      expect(text()).not.toContain('No mood check-ins');
      expect(text()).toContain('Mood over time');
      expect(text()).toContain('No daily check-ins this week.');
      expect(buttonLabelled(/^Week of Oct 19: Great · “Shipped it”\. Edit$/)).toBeDefined();
    });

    it('keeps the Year view’s Months in a word with only monthly check-ins', async () => {
      api.fetchMoodCheckins.mockResolvedValue([month('2026-09-01', 2, 'Grind')]);
      await render();
      await openTab('Mood');
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
      await openTab('Mood');
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
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));
      expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2025-01-01', '2025-12-31');
      expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-01-01', '2026-12-31');

      expect(text()).toContain('Monthly check-in');
      expect(buttonLabelled(/^September: typical mood 3\.0 across 1 day\. Monthly check-in: Low · “Grind”\. Open September$/)).toBeDefined();
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
      await openTab('Mood');
      expect(text()).not.toContain('Weekly check-ins');
      await click(buttonLabelled(/^Year$/));
      expect(text()).not.toContain('Months in a word');
    });

    it('offers to log the week when weekly check-ins are on', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { weekly: true } });
      await render();
      await openTab('Mood');
      expect(text()).toContain('No weekly check-in yet — it’s asked on Sunday.');
      await click(buttonLabelled(/^Log it$/));
      expect(text()).toContain('Weekly check-in');
      expect(text()).toContain('Week of Oct 19–25');
    });
    it('lists every week of the month so far and logs a past one', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { weekly: true } });
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), week('2026-10-12', 5)]);
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...week(body.period_start, body.mood), ...body }));
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Month$/));

      // Sep 28 runs into October; Oct 26 hasn't begun.
      expect(buttonLabelled(/^Week of Sep 28: no weekly check-in\. Log it$/)).toBeDefined();
      expect(buttonLabelled(/^Week of Oct 5: no weekly check-in\. Log it$/)).toBeDefined();
      expect(buttonLabelled(/^Week of Oct 12: Great\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/^Week of Oct 19: no weekly check-in\. Log it$/)).toBeDefined();
      expect(buttonLabelled(/^Week of Oct 26/)).toBeUndefined();

      await click(buttonLabelled(/^Week of Oct 5: no weekly check-in/));
      expect(text()).toContain('Week of Oct 5–11');
      await click(buttonLabelled(/^Okay$/));
      await click(buttonLabelled(/^Save check-in$/));
      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'week', period_start: '2026-10-05', mood: 3 }));
      expect(buttonLabelled(/^Week of Oct 5: Okay\. Edit$/)).toBeDefined();
    });

    it('lists only logged weeks of a month while weekly check-ins are off', async () => {
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), week('2026-10-12', 5)]);
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Month$/));
      expect(buttonLabelled(/^Week of Oct 12: Great\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/no weekly check-in/)).toBeUndefined();
    });

    it('offers each month of the year so far and logs a past one', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { monthly: true } });
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), month('2026-09-01', 2, 'Grind')]);
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...month(body.period_start, body.mood, null), ...body }));
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));

      expect(buttonLabelled(/^January: no monthly check-in\. Log it$/)).toBeDefined();
      expect(buttonLabelled(/^September: Low, “Grind”\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/^October: no monthly check-in\. Log it$/)).toBeDefined();
      expect(buttonLabelled(/^November: no monthly check-in/)).toBeUndefined();

      await click(buttonLabelled(/^March: no monthly check-in/));
      expect(text()).toContain('Monthly check-in');
      expect(text()).toContain('March 2026');
      await click(buttonLabelled(/^Good$/));
      await click(buttonLabelled(/^Save check-in$/));
      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'month', period_start: '2026-03-01', mood: 4 }));
      expect(buttonLabelled(/^March: Good\. Edit$/)).toBeDefined();
    });

    it('lists no unlogged months while monthly check-ins are off', async () => {
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-10-20', 4), month('2026-09-01', 2, 'Grind')]);
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));
      expect(buttonLabelled(/^September: Low, “Grind”\. Edit$/)).toBeDefined();
      expect(buttonLabelled(/no monthly check-in/)).toBeUndefined();
    });

    it('edits a monthly check-in from its ◇ on the year', async () => {
      api.fetchMoodCheckins.mockResolvedValue([checkin('2026-09-10', 3), month('2026-09-01', 2, 'Grind')]);
      await render();
      await openTab('Mood');
      await click(buttonLabelled(/^Year$/));
      await click(buttonLabelled(/^September monthly check-in: Low · “Grind”\. Edit$/));
      expect(text()).toContain('Edit monthly check-in');
      expect(text()).toContain('September 2026');
    });
    it('offers the weeks of a month with no check-ins of any kind, and logs one', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { weekly: true } });
      api.fetchMoodCheckins.mockResolvedValue([]);
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...week(body.period_start, body.mood), ...body }));
      await render();
      await click(buttonLabelled(/^Month$/));
      await click(buttonLabelled(/^Previous month$/));
      expect(text()).toContain('Nothing recorded for last month');
      expect(buttonLabelled(/no weekly check-in/)).toBeUndefined();
      await openTab('Tasks');
      expect(text()).toContain('Nothing recorded for last month');
      expect(buttonLabelled(/no weekly check-in/)).toBeUndefined();
      await openTab('Mood');
      expect(text()).toContain('Nothing recorded for last month');
      expect(text()).toContain('No mood check-ins last month');
      expect(buttonLabelled(/^Week of Aug 31: no weekly check-in\. Log it$/)).toBeDefined();
      expect(buttonLabelled(/^Week of Sep 28: no weekly check-in\. Log it$/)).toBeDefined();

      await click(buttonLabelled(/^Week of Sep 14: no weekly check-in/));
      await click(buttonLabelled(/^Good$/));
      await click(buttonLabelled(/^Save check-in$/));
      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'week', period_start: '2026-09-14', mood: 4 }));
      expect(text()).toContain('Mood over time');
      expect(buttonLabelled(/^Week of Sep 14: Good\. Edit$/)).toBeDefined();

      // Undo still works once the first check-in ends the empty state.
      api.deleteMoodCheckin.mockResolvedValue(undefined);
      await click(buttonLabelled(/^Undo$/));
      expect(api.deleteMoodCheckin).toHaveBeenCalledWith(20);
      expect(buttonLabelled(/^Week of Sep 14: no weekly check-in\. Log it$/)).toBeDefined();
    });

    it('drops the first "Saved" Undo once that week is edited, after the empty state ends', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { weekly: true } });
      api.fetchMoodCheckins.mockResolvedValue([]);
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...week(body.period_start, body.mood), ...body }));
      await render();
      await click(buttonLabelled(/^Month$/));
      await click(buttonLabelled(/^Previous month$/));
      await openTab('Mood');
      await click(buttonLabelled(/^Week of Sep 14: no weekly check-in/));
      await click(buttonLabelled(/^Good$/));
      await click(buttonLabelled(/^Save check-in$/));
      expect(text()).toContain('Saved · Good');

      await click(buttonLabelled(/^Week of Sep 14: Good\. Edit$/));
      await click(buttonLabelled(/^Low$/));
      await click(buttonLabelled(/^Save changes$/));
      expect(text()).toContain('Check-in updated.');
      expect(text()).not.toContain('Saved · Good');
      expect([...document.body.querySelectorAll('button')].filter(b => b.textContent === 'Undo')).toHaveLength(1);
      expect(api.deleteMoodCheckin).not.toHaveBeenCalled();
    });

    it('offers the months of a year with no check-ins of any kind, and logs one', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { monthly: true } });
      api.fetchMoodCheckins.mockResolvedValue([]);
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...month(body.period_start, body.mood, null), ...body }));
      await render();
      await click(buttonLabelled(/^Year$/));
      await click(buttonLabelled(/^Previous year$/));
      await openTab('Mood');
      expect(text()).toContain('Nothing recorded for last year');
      expect(text()).toContain('No mood check-ins last year');
      expect(buttonLabelled(/^December: no monthly check-in\. Log it$/)).toBeDefined();

      await click(buttonLabelled(/^June: no monthly check-in/));
      await click(buttonLabelled(/^Okay$/));
      await click(buttonLabelled(/^Save check-in$/));
      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'month', period_start: '2025-06-01', mood: 3 }));
      expect(text()).toContain('Months in a word');
      expect(buttonLabelled(/^June: Okay\. Edit$/)).toBeDefined();
    });

    it('offers to log a past week with no check-ins of any kind', async () => {
      api.fetchProfile.mockResolvedValue({ name: 'Sam', mood_checkins: { weekly: true } });
      api.fetchMoodCheckins.mockResolvedValue([]);
      await render();
      await click(buttonLabelled(/^Previous week$/));
      await openTab('Mood');
      expect(text()).toContain('No weekly check-in for this week.');
      await click(buttonLabelled(/^Log it$/));
      expect(text()).toContain('Week of Oct 12–18');
    });
  });
});

describe('CalendarReportView tabs', () => {
  const withHabits = () => api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
    start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [],
    habit_completions: ['2026-10-19', '2026-10-20'].map(date => ({ habit_id: 1, habit_title: 'Meditate', date, estimated_time: 0.5 })),
  }));

  const tabs = (list: string) => [...document.querySelectorAll(`[role="tablist"][aria-label="${list}"] [role="tab"]`)].map(t => t.textContent);

  it('opens on Productivity › Overview: tiles, activity, highlights and the time-by-tag bar', async () => {
    withHabits();
    await render();
    expect(tabs('Report sections')).toEqual(['Productivity', 'Mood', 'Time', 'Events']);
    expect(tabs('Productivity view')).toEqual(['Overview', 'Tasks', 'Notes', 'Habits']);
    expect(tab('Productivity').getAttribute('aria-selected')).toBe('true');
    expect(tab('Overview').getAttribute('aria-selected')).toBe('true');
    const panel = document.getElementById('report-views-tabpanel')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(`${tab('Productivity').id} ${tab('Overview').id}`);
    expect(container.querySelector('.lg\\:grid-cols-6')).not.toBeNull();
    expect(text()).toContain('Activity by day');
    expect(text()).toContain('Highlights');
    expect(text()).toContain('Current streak');
    expect(text()).not.toContain('Longest streak');
    // A week's mood is its average; patterns wait for the Month report.
    expect(text()).toContain('Good 4.0 · 1 of 3 days logged');
    expect(text()).not.toContain('Mood & your activity');
    expect(buttonLabelled(/^Where your time went: 1h estimated and tracked this week/)).toBeDefined();
    expect(text()).not.toContain('Mood over time');
    expect(text()).not.toContain('Busiest days');
  });

  it('opens a tile’s tab and puts it in the URL', async () => {
    withHabits();
    await render();
    await click(buttonLabelled(/^Habits22 check-ins$/));
    expect(window.location.search).toBe('?view=habits');
    expect(tab('Productivity').getAttribute('aria-selected')).toBe('true');
    expect(tab('Habits').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('Each square is a day.');
    // Mon and Tue are done, Wed isn't, and Thu–Sun are still to come.
    expect(container.querySelectorAll('[title$=": done"]')).toHaveLength(2);
    expect(container.querySelectorAll('[title$=": not done"]')).toHaveLength(1);

    await openTab('Overview');
    expect(window.location.search).toBe('');
  });

  it('opens the tab and mood view a link names', async () => {
    window.history.replaceState(null, '', '/reports?view=mood&mood=patterns');
    await render();
    expect(tab('Mood').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('A week is too short to tell anything from chance');
    await click(buttonLabelled(/^Month$/));
    expect(text()).toContain('Mood & your activity');
    expect(text()).not.toContain('Mood over time');

    await click([...document.querySelectorAll('[aria-label="Mood view"] button')].find(b => b.textContent === 'Over time')!);
    expect(window.location.search).toBe('?view=mood');
    expect(text()).toContain('Mood over time');
  });

  it('keeps the tab when the period changes', async () => {
    await render();
    await openTab('Notes');
    expect(text()).toContain('Note time by day');
    await click(buttonLabelled(/^Year$/));
    expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('Note time by month');
    expect(window.location.search).toBe('?view=notes');
  });

  it('opens Tasks and Time from the highlights and the share bar', async () => {
    withHabits();
    await render();
    await click(buttonLabelled(/^Busiest day/));
    expect(tab('Tasks').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('Planned vs done');
    expect(text()).toContain('Busiest days');
    // Note time is the Notes tab's chart, so Tasks has no metric switch.
    expect(container.querySelector('[aria-label="Chart metric"]')).toBeNull();

    await openTab('Overview');
    expect(container.querySelector('[aria-label="Chart metric"]')).not.toBeNull();
    await click(buttonLabelled(/^Where your time went: /));
    expect(tab('Time').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[aria-label="Measure"]')).not.toBeNull();
    // Time has one view, so no views switch; the panel is named by its tab alone.
    expect(document.querySelector('[aria-label="Productivity view"]')).toBeNull();
    expect(document.querySelector('[aria-label="Mood view"]')).toBeNull();
    expect(document.getElementById('report-views-tabpanel')!.getAttribute('aria-labelledby')).toBe(tab('Time').id);
  });

  it('reopens each tab on the view it was left on', async () => {
    await render();
    await openTab('Notes');
    await openTab('Mood');
    expect(window.location.search).toBe('?view=mood');
    expect(tabs('Mood view')).toEqual(['Over time', 'Patterns']);
    await openPatterns();
    await openTab('Time');
    expect(window.location.search).toBe('?view=time');
    await openTab('Productivity');
    expect(window.location.search).toBe('?view=notes');
    expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
    await openTab('Mood');
    expect(window.location.search).toBe('?view=mood&mood=patterns');
  });

  it('moves between the tabs and between the views with the arrow keys', async () => {
    await render();
    const key = (el: Element, k: string) => act(async () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    });
    await key(tab('Overview'), 'ArrowRight');
    expect(window.location.search).toBe('?view=tasks');
    expect(document.activeElement).toBe(tab('Tasks'));
    await key(tab('Tasks'), 'End');
    expect(window.location.search).toBe('?view=habits');
    await key(tab('Productivity'), 'ArrowLeft');
    expect(window.location.search).toBe('?view=events');
    expect(document.activeElement).toBe(tab('Events'));
    await key(tab('Events'), 'ArrowLeft');
    expect(window.location.search).toBe('?view=time');
    await key(tab('Time'), 'Home');
    expect(window.location.search).toBe('?view=habits');
  });

  describe('Events', () => {
    const day = (date: string, minutes: number, window: number, eventWindow: number, count = minutes > 0 ? 1 : 0) => ({
      date, count, minutes, is_rest_day: window === 0, window_minutes: window,
      event_window_minutes: eventWindow, free_minutes: window - eventWindow,
    });
    const weekReport = (start: string, end: string) => ({
      ...emptyEventReport(start, end),
      event_count: 4,
      archived_count: 1,
      total_minutes: 310,
      window_minutes: 4200,
      event_window_minutes: 1280,
      free_minutes: 2920,
      free_pct: 69.5,
      busiest_day: day('2026-10-21', 170, 840, 170, 2),
      by_tag: [
        { tag: { id: 1, name: 'CS 460', color: '#8b5cf6' }, minutes: 200, count: 3 },
        { tag: null, minutes: 110, count: 1 },
      ],
      by_day: [
        day('2026-10-19', 50, 840, 50), day('2026-10-20', 0, 840, 0), day('2026-10-21', 170, 840, 170, 2),
        day('2026-10-22', 90, 840, 90), day('2026-10-23', 0, 840, 0), day('2026-10-24', 0, 0, 0), day('2026-10-25', 0, 0, 0),
      ],
    });

    it('shows the period’s events, their time by tag and day, and the free time in plain words', async () => {
      api.fetchEventReport.mockImplementation(async (start: string, end: string) => weekReport(start, end));
      await render();
      await openTab('Events');
      expect(window.location.search).toBe('?view=events');
      expect(api.fetchEventReport).toHaveBeenLastCalledWith('2026-10-19', '2026-10-25');
      // Events has one view, so no views switch.
      expect(document.querySelector('[aria-label="Productivity view"]')).toBeNull();
      expect(text()).toContain('Events4');
      expect(text()).toContain('1 of them archived');
      expect(text()).toContain('Time in events5h 10m');
      expect(text()).toContain('Busiest dayWed, Oct 212h 50m in 2 events');
      expect(text()).toContain('Free in work hours48h 40m70% of your work hours left after events');
      expect(text()).toContain('Free time left in your work hours: 48h 40m, 70% of your work hours.');
      expect(text()).toContain('CS 460');
      expect(text()).toContain('No tag');
      expect(text()).toContain('Event time by day');
      // The weekend has no work hours.
      expect(container.querySelectorAll('[title$=": rest"]')).toHaveLength(2);
      expect(container.querySelector('[title="Mon, Oct 19: 13h 10m free of 14h work hours; events took 50m"]')).not.toBeNull();
    });

    it('counts events per week in a month', async () => {
      api.fetchEventReport.mockImplementation(async (start: string, end: string) => weekReport(start, end));
      window.history.replaceState(null, '', '/reports?view=events');
      await render();
      await click(buttonLabelled(/^Month$/));
      expect(api.fetchEventReport).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31');
      expect(text()).toContain('Events per week');
      expect(container.querySelector('[title="Oct 19 – 25: 4 events, 5h 10m"]')).not.toBeNull();
    });

    it('says when there are no events, without waiting on the other reports', async () => {
      api.fetchCalendarActivity.mockImplementation(() => new Promise(() => {}));
      window.history.replaceState(null, '', '/reports?view=events');
      await render();
      expect(text()).toContain('No events this week');
      expect(text()).toContain('Free time left in your work hours: 70h, 100% of your work hours.');
    });
  });

  it('opens an old link to a tab in its new group', async () => {
    window.history.replaceState(null, '', '/reports?view=tasks');
    await render();
    expect(tab('Productivity').getAttribute('aria-selected')).toBe('true');
    expect(tab('Tasks').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('Planned vs done');
  });

  it('opens Mood Patterns from a month’s Mood & your activity highlight, and Over time from the week’s Mood', async () => {
    await render();
    await click(buttonLabelled(/^MoodGood 4\.0 · 1 of 3 days logged$/));
    expect(window.location.search).toBe('?view=mood');

    await openTab('Productivity');
    expect(window.location.search).toBe('');
    await click(buttonLabelled(/^Month$/));
    await click(buttonLabelled(/^Mood & your activity/));
    expect(window.location.search).toBe('?view=mood&mood=patterns');
    expect(tab('Mood').getAttribute('aria-selected')).toBe('true');
    expect(text()).not.toContain('Mood over time');
  });

  it('adds no history entry for the tab or mood view already open', async () => {
    await render();
    await openTab('Mood');
    const length = window.history.length;
    await openTab('Mood');
    await click([...document.querySelectorAll('[aria-label="Mood view"] button')].find(b => b.textContent === 'Over time')!);
    expect(window.history.length).toBe(length);
    await openPatterns();
    expect(window.history.length).toBe(length + 1);
    await openPatterns();
    expect(window.history.length).toBe(length + 1);
  });

  it('falls back to Productivity › Overview for an unknown view', async () => {
    window.history.replaceState(null, '', '/reports?view=bogus');
    await render();
    expect(tab('Productivity').getAttribute('aria-selected')).toBe('true');
    expect(tab('Overview').getAttribute('aria-selected')).toBe('true');
  });
});

describe('CalendarReportView tag charts', () => {
  const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
  const math = { id: 2, name: 'MATH 254', color: '#7A5AD0' };
  const health = { id: 3, name: 'Health', color: '#3B9A5A' };
  const task = (id: number, completed_date: string, tags: typeof cs[]) => ({
    id, title: `Task ${id}`, category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
    completed: true, completed_date, parent_task_id: null, tags,
  });
  beforeEach(() => {
    api.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      start_date: start, end_date: end, scheduled_tasks: [],
      completed_tasks: [task(1, '2026-10-20T18:00:00Z', [cs, math]), task(2, '2026-10-20T19:00:00Z', [cs]), task(3, '2026-10-21T18:00:00Z', [])],
      note_sessions: [{ id: 1, note_id: 7, note_title: 'Lecture', started_at: '2026-10-21T16:00:00Z', ended_at: '2026-10-21T16:45:00Z', duration_seconds: 2700 }],
      habit_completions: ['2026-10-19', '2026-10-20'].map(date => ({ habit_id: 4, habit_title: 'Run', date, estimated_time: 0.5 })),
      notes: [{ id: 7, title: 'Lecture', tags: [math] }],
      habits: [{ id: 4, title: 'Run', estimated_time: 0.5, tags: [health] }],
    }));
  });

  const legend = () => [...document.querySelectorAll('[aria-label="Tags"] button')].map(b => b.textContent);
  const segments = () => [...container.querySelectorAll<HTMLElement>('[data-tag]')];

  it('charts only tasks on Tasks, by tag, and highlights a tapped tag', async () => {
    await render();
    await openTab('Tasks');
    expect(text()).toContain('Tasks done by day');
    expect(text()).not.toContain('Activity by day');
    expect(legend()).toEqual(['CS 4601.5 tasks', 'MATH 2540.5 tasks', 'Untagged1 task']);
    expect(text()).toContain('Only tasks count here');
    expect(text()).toContain('A task with several tags is split evenly between them');
    // No habit or note colors: every segment is one of the tasks' tags.
    expect(new Set(segments().map(s => s.dataset.tag))).toEqual(new Set(['tag:1', 'tag:2', 'untagged']));

    await click([...document.querySelectorAll('[aria-label="Tags"] button')][0]);
    expect(document.querySelector('[aria-label="Tags"] button[aria-pressed="true"]')!.textContent).toContain('CS 460');
    expect(text()).toContain('CS 460: 1.5 tasks · 50% of the total');
    expect(segments().filter(s => s.style.opacity === '0.2').map(s => s.dataset.tag).sort()).toEqual(['tag:2', 'untagged']);
    await click([...document.querySelectorAll('[aria-label="Tags"] button')][0]);
    expect(document.querySelector('[aria-label="Tags"] button[aria-pressed="true"]')).toBeNull();
  });

  it('splits note time and habit check-ins by their own tags', async () => {
    await render();
    await openTab('Notes');
    expect(text()).toContain('Note time by day');
    expect(legend()).toEqual(['MATH 25445m']);
    await openTab('Habits');
    expect(text()).toContain('Habit check-ins by day');
    expect(legend()).toEqual(['Health2 check-ins']);
    expect(text()).toContain('Each square is a day.');
    await click(buttonLabelled(/^Year$/));
    expect(text()).toContain('Habit check-ins by month');
  });

  it('keeps the Overview chart of tasks and habits', async () => {
    await render();
    expect(text()).toContain('Activity by day');
    expect(container.querySelector('[aria-label="Chart metric"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Tags"]')).toBeNull();
  });
});
