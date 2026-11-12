// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviousActivity } from '@/app/hooks/usePreviousActivity';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import { periodContaining, shiftPeriod, type ReportPeriod } from '@/app/utils/calendarReport';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import type { PaceMetric } from '@/app/utils/pace';
import ReportPace from './ReportPace';

vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workDays: WorkDaySettings = { restDays: [0, 6], dayStartTime: '09:00', shutoffTime: '17:00', dayWindows: {} };

const activity = (parts: Partial<CalendarActivity> = {}): CalendarActivity => ({
  start_date: '2025-01-01', end_date: '2026-12-31',
  scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [], events: [],
  ...parts,
});

const task = (id: number, completed: Date): ActivityTask => ({
  id, title: `Task ${id}`, category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
  completed: true, completed_date: completed.toISOString(), parent_task_id: null, tags: [],
});

const session = (id: number, start: Date, minutes: number) => ({
  id, note_id: 1, note_title: 'Notes', started_at: start.toISOString(),
  ended_at: new Date(start.getTime() + minutes * 60000).toISOString(), duration_seconds: minutes * 60,
});

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

// This week (Mon Nov 9 – Wed Nov 11): 3 tasks and 30m in notes.
const thisWeek = activity({
  completed_tasks: [task(1, day(2026, 11, 9)), task(2, day(2026, 11, 10)), task(3, day(2026, 11, 11, 9))],
  habit_completions: [{ habit_id: 1, habit_title: 'Run', date: '2026-11-10', estimated_time: null }],
  note_sessions: [session(1, day(2026, 11, 10, 8), 30)],
});
// Last week to Wednesday: 1 task and 1h in notes, then 2 more tasks later in the week.
const lastWeek = activity({
  completed_tasks: [task(4, day(2026, 11, 3)), task(5, day(2026, 11, 6)), task(6, day(2026, 11, 7))],
  note_sessions: [session(2, day(2026, 11, 4, 8), 60)],
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Wednesday Nov 11 2026, 5 PM.
  vi.setSystemTime(new Date(2026, 10, 11, 17));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const loaded = (period: ReportPeriod, a: CalendarActivity | null, state: 'ready' | 'loading' | 'error' = 'ready'): PreviousActivity => ({
  period: shiftPeriod(period, -1),
  activity: state === 'ready' ? a : null,
  loading: state === 'loading',
  error: state === 'error',
});

const Harness: React.FC<{ period: ReportPeriod; current: CalendarActivity; previous: PreviousActivity }> = ({ period, current, previous }) => {
  const [metric, setMetric] = useState<PaceMetric>('done');
  return <ReportPace period={period} activity={current} previous={previous} workDays={workDays} metric={metric} onMetric={setMetric} />;
};

const render = async (period: ReportPeriod, current: CalendarActivity, previous: PreviousActivity) => {
  await act(async () => {
    root.render(<Harness period={period} current={current} previous={previous} />);
  });
};

const text = () => container.textContent ?? '';
const chips = () => [...container.querySelectorAll('[aria-label="Compare"] button')];
const chip = (name: string) => chips().find(b => b.textContent?.startsWith(name))!;
const chartLabel = () => container.querySelector('[data-testid="pace-chart"]')?.getAttribute('aria-label');
const tableRows = () => [...container.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(c => c.textContent));
const verdict = () => container.querySelector('[data-testid="pace-verdict"]')?.textContent;
const legend = () => [...container.querySelectorAll('.ml-auto > span')].map(s => s.textContent);

describe('ReportPace', () => {
  const week = periodContaining('week', new Date(2026, 10, 11));

  it('shows each metric’s value and its change from last week, and the line for the picked chip', async () => {
    await render(week, thisWeek, loaded(week, lastWeek));
    // The arrows are hidden from screen readers, which read "up" and "down".
    expect(chips().map(b => b.textContent)).toEqual([
      'Done4▲ up 3', 'Tasks3▲ up 2', 'Habits1▲ up 1', 'Note time30m▼ down 30m', 'Events0m=',
    ]);
    expect(chip('Done').getAttribute('aria-pressed')).toBe('true');
    expect(verdict()).toBe('Ahead of last week: 4 done by Wednesday, against 1 by last Wednesday');
    expect(legend()).toEqual(['This week', 'Last week']);
    expect(chartLabel()).toBe('Done: running total this week against last week');
    expect(tableRows()).toEqual([
      ['Monday, November 9', '1', '0'],
      ['Tuesday, November 10', '3', '1'],
      ['Wednesday, November 11', '4', '1'],
    ]);
    expect(container.querySelector('[data-testid="pace-last"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pace-today"]')).not.toBeNull();
    expect(text()).toContain('Last week ended at 3. Compared at the same point in the week; events count only up to now.');

    await act(async () => (chip('Note time') as HTMLButtonElement).click());
    expect(chip('Note time').getAttribute('aria-pressed')).toBe('true');
    expect(chartLabel()).toBe('Note time: running total this week against last week');
    expect(verdict()).toBe('Behind last week: 30m in notes by Wednesday, against 1h by last Wednesday');
    expect(tableRows().map(r => r.slice(1))).toEqual([['0m', '0m'], ['30m', '0m'], ['30m', '1h']]);
  });

  it('says equal with "=" and "Level with"', async () => {
    const same = activity({ completed_tasks: [task(7, day(2026, 11, 2))] });
    const one = activity({ completed_tasks: [task(8, day(2026, 11, 9))] });
    await render(week, one, loaded(week, same));
    expect(chip('Done').textContent).toBe('Done1=');
    expect(verdict()).toMatch(/^Level with last week: 1 done by Wednesday/);
  });

  it('shows this week alone for a new user, with nothing to compare yet', async () => {
    await render(week, thisWeek, loaded(week, activity()));
    expect(chips().map(b => b.textContent)).toEqual(['Done4', 'Tasks3', 'Habits1', 'Note time30m', 'Events0m']);
    expect(verdict()).toBe('4 done this week · nothing last week to compare with yet');
    expect(legend()).toEqual(['This week']);
    expect(container.querySelector('[data-testid="pace-last"]')).toBeNull();
    expect(container.querySelector('[data-testid="pace-last-dot"]')).toBeNull();
    expect(text()).toContain('Comparisons start next week. Events count only up to now.');
  });

  it('shows the empty box when neither week has anything', async () => {
    await render(week, activity(), loaded(week, activity()));
    expect(text()).toContain('Nothing done yet this week or last week. Tasks, habits, notes and events will show up here as you go.');
    expect(chips()).toHaveLength(0);
    expect(container.querySelector('[data-testid="pace-chart"]')).toBeNull();
  });

  it('names the years in a year’s legend and verdict', async () => {
    const year = periodContaining('year', new Date(2026, 10, 11));
    const prev = activity({ completed_tasks: [task(9, day(2025, 3, 1)), task(10, day(2025, 12, 1))] });
    await render(year, thisWeek, loaded(year, prev));
    expect(legend()).toEqual(['2026', '2025']);
    expect(verdict()).toBe('Ahead of 2025: 4 done by this point, against 1 by this time in 2025');
    expect(text()).toContain('2025 ended at 2.');
    // January to November, the last at today's total against last year's same point.
    expect(tableRows()).toHaveLength(11);
    expect(tableRows()[10]).toEqual(['November', '4', '1']);
  });

  it('draws no today marker for a finished week, and compares whole totals', async () => {
    const last = shiftPeriod(week, -1);
    const before = activity({ completed_tasks: [task(11, day(2026, 10, 28))] });
    await render(last, lastWeek, loaded(last, before));
    expect(container.querySelector('[data-testid="pace-today"]')).toBeNull();
    expect(verdict()).toBe('Ahead of the week before: 3 done in Nov 2–8, 2026, against 1 in Oct 26 – Nov 1, 2026');
    expect(tableRows()).toHaveLength(7);
    expect(text()).toContain('The week before ended at 1. Compared over the whole week.');
  });

  it('shows this week alone when last week fails to load', async () => {
    await render(week, thisWeek, loaded(week, null, 'error'));
    expect(chips().map(b => b.textContent)).toEqual(['Done4', 'Tasks3', 'Habits1', 'Note time30m', 'Events0m']);
    expect(verdict()).toBe('4 done this week');
    expect(text()).toContain('Couldn’t load last week.');
    expect(container.querySelector('[data-testid="pace-last"]')).toBeNull();
  });
});
