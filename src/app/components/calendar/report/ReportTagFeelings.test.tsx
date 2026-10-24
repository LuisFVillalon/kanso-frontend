// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { periodContaining } from '@/app/utils/calendarReport';
import ReportTagFeelings from './ReportTagFeelings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const work = { id: 2, name: 'Work', color: '#64748b' };

const checkin = (period_start: string, mood: number): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start, mood, energy: mood, stress: 3,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});

const task = (id: number, day: number): ActivityTask => ({
  id, title: 'Library shift', category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
  completed: true, completed_date: new Date(2026, 9, day, 15).toISOString(), parent_task_id: null, tags: [work],
});

// Oct 1–20: every other day has a Work shift and a Low mood; the rest are Good.
const days = Array.from({ length: 20 }, (_, i) => i + 1);
const byDay = new Map(days.map(d => {
  const key = `2026-10-${String(d).padStart(2, '0')}`;
  return [key, checkin(key, d % 2 ? 2 : 4)];
}));
const activity: CalendarActivity = {
  start_date: '2026-10-01', end_date: '2026-10-31', scheduled_tasks: [], note_sessions: [], habit_completions: [],
  completed_tasks: days.filter(d => d % 2).map(d => task(d, d)),
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const text = () => host.textContent ?? '';

describe('ReportTagFeelings', () => {
  it('labels each tag with the days it compares', () => {
    // Work is also on every weekend day, so those days off have nothing to compare with.
    const withWeekends: CalendarActivity = { ...activity, completed_tasks: days.filter(d => d % 2 || [4, 10, 18].includes(d)).map(d => task(d, d)) };
    act(() => root.render(
      <ReportTagFeelings activity={withWeekends} byDay={byDay} period={periodContaining('month', new Date(2026, 9, 21))} scopeLabel="this month" restDays={[]} />,
    ));
    expect(host.querySelector('g[role="button"]')!.getAttribute('aria-label')).toBe('Work, 7 days: show its days over time');
    expect(text()).toContain('Tag, with the days compared');
    expect(host.querySelector('th[scope="row"]')!.textContent).toBe('Work, 7 days');
  });

  it('draws grouped bars per tag and opens a tag’s timeline on tap', async () => {
    const onWiden = vi.fn();
    act(() => root.render(
      <ReportTagFeelings activity={activity} byDay={byDay} period={periodContaining('month', new Date(2026, 9, 21))} scopeLabel="this month" restDays={[]} widen={{ label: 'See 2026', onClick: onWiden }} />,
    ));
    expect(text()).toContain('Tags & feelings');
    expect(text()).toContain('Mood, energy and stress on days with each tag');
    expect(text()).toContain('Average, 1 (low) to 5 (high)');
    expect(text()).toContain('10 days');
    expect(text()).toContain('Clearest this month: on “Work” days (10), lower mood than usual (2.0 vs 4.0)');
    expect(text()).toContain('Shows what went together, not what caused it.');
    // A clear difference: no "nothing clear" notice, and harder-on-you arrows.
    expect(text()).not.toContain('Nothing clear');
    expect([...host.querySelectorAll('svg text')].filter(t => t.textContent === '▼')).toHaveLength(2);

    const group = host.querySelector('g[role="button"]')!;
    expect(group.getAttribute('aria-label')).toBe('Work, 10 days: show its days over time');
    await act(async () => { group.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text()).toContain('Your mood, day by day, with Work days highlighted');
    expect(text()).toContain('Average on Work days compared');
    expect(text()).toContain('That’s a clear difference: lower mood.');
    expect(host.querySelector('svg[aria-label="Your mood day by day, with Work days highlighted"]')).not.toBeNull();

    const stress = [...host.querySelectorAll('[aria-label="Feeling to show"] button')].find(b => b.textContent === 'Stress')!;
    await act(async () => { (stress as HTMLElement).click(); });
    expect(text()).toContain('Your stress, day by day, with Work days highlighted');
    expect(text()).toContain('About the same.');

    await act(async () => { (host.querySelector('[aria-label="Close the timeline"]') as HTMLElement).click(); });
    expect(text()).not.toContain('day by day');
  });

  it('says nothing is clear in a month without a clear difference', () => {
    const flat = new Map([...byDay].map(([k, c]) => [k, { ...c, mood: 3, energy: 3 }]));
    const onWiden = vi.fn();
    act(() => root.render(
      <ReportTagFeelings activity={activity} byDay={flat} period={periodContaining('month', new Date(2026, 9, 21))} scopeLabel="this month" restDays={[]} widen={{ label: 'See 2026', onClick: onWiden }} />,
    ));
    expect(text()).toContain('Nothing clear this month: one month of check-ins is rarely enough to tell a difference from chance.');
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'See 2026')!.click(); });
    expect(onWiden).toHaveBeenCalled();
  });

  it('hatches every bar on a week and points to the month', () => {
    act(() => root.render(
      <ReportTagFeelings activity={activity} byDay={byDay} period={periodContaining('week', new Date(2026, 9, 14))} scopeLabel="last week" restDays={[]} widen={{ label: 'See October', onClick: () => {} }} />,
    ));
    expect(text()).toContain('A week is too short to tell anything from chance, so every bar is hatched.');
    expect(text()).toContain('See October');
    expect(text()).not.toContain('Clearest');
    const bars = [...host.querySelectorAll('g[role="button"] rect[rx="2"]')];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every(b => b.getAttribute('fill')?.startsWith('url(#'))).toBe(true);
    expect([...host.querySelectorAll('svg text')].some(t => t.textContent === '▼' || t.textContent === '▲')).toBe(false);
  });

  it('asks for tags when no task or note carries one', () => {
    act(() => root.render(
      <ReportTagFeelings activity={{ ...activity, completed_tasks: [] }} byDay={byDay} period={periodContaining('month', new Date(2026, 9, 21))} scopeLabel="this month" restDays={[]} />,
    ));
    expect(text()).toContain('Tag your tasks and notes and, once a tag is on 5 days with a check-in, this shows how you felt on those days.');
  });
});
