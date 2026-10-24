// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import type { MoodCheckin } from '@/app/types/mood';
import { periodContaining } from '@/app/utils/calendarReport';
import ReportTagsCard from './ReportTagsCard';

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
const october = () => periodContaining('month', new Date(2026, 9, 21));
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!;
const buttonLabelled = (label: string) => host.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

type CardProps = React.ComponentProps<typeof ReportTagsCard>;
const card = (props: Partial<CardProps> = {}) => (
  <ReportTagsCard activity={activity} byDay={byDay} period={october()} scopeLabel="this month" restDays={[]} average={3} logged={20} wide {...props} />
);

describe('ReportTagsCard', () => {
  it('labels a weekend-only tag with the days its bar averages', async () => {
    const weekends: CalendarActivity = { ...activity, completed_tasks: [3, 4, 10, 11, 17, 18].map(d => task(d, d)) };
    act(() => root.render(
      card({ activity: weekends }),
    ));
    const group = host.querySelector('g[role="button"]')!;
    expect(group.getAttribute('aria-label')).toBe('Work, 6 days: show its days over time');
    expect(host.querySelector('th[scope="row"]')!.textContent).toBe('Work, 6 days');
    expect(group.querySelectorAll('line[stroke="var(--tm-text-primary)"]')).toHaveLength(0);
    expect(host.querySelector('td')!.textContent).toContain('Too few days to tell');
    await act(async () => { group.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text()).toContain('Average on Work days');
    expect(text()).not.toContain('Average on Work days compared');
    expect([...host.querySelectorAll('svg text')].some(t => t.textContent?.startsWith('usual '))).toBe(false);
    // The timeline replaces the chart and its legend, and has no usual to mark.
    expect([...host.querySelectorAll('span')].filter(s => s.textContent === 'Your usual')).toHaveLength(0);
    expect(text()).toContain('Colored columns are days with Work; the dashed line is their average. “Work” is on 6 days');
  });

  it('labels each tag with the days it compares', () => {
    // Work is also on every weekend day, so those days off have nothing to compare with.
    const withWeekends: CalendarActivity = { ...activity, completed_tasks: days.filter(d => d % 2 || [4, 10, 18].includes(d)).map(d => task(d, d)) };
    act(() => root.render(
      card({ activity: withWeekends }),
    ));
    expect(host.querySelector('g[role="button"]')!.getAttribute('aria-label')).toBe('Work, 7 days: show its days over time');
    expect(text()).toContain('Tag, with the days compared');
    expect(host.querySelector('th[scope="row"]')!.textContent).toBe('Work, 7 days');
  });

  it('draws grouped bars per tag and opens a tag’s timeline on tap', async () => {
    const onWiden = vi.fn();
    act(() => root.render(
      card({ widen: { label: 'See 2026', onClick: onWiden } }),
    ));
    expect(text()).toContain('Your task & note tags');
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
    expect([...host.querySelectorAll('span')].filter(s => s.textContent === 'Your usual')).toHaveLength(1);
    expect(text()).toContain('Colored columns are days with Work; the two dashed lines compare their average with your usual.');
    expect(text()).toContain('That’s a clear difference: lower mood.');
    expect(host.querySelector('svg[aria-label="Your mood day by day, with Work days highlighted"]')).not.toBeNull();

    const stress = [...host.querySelectorAll('[aria-label="Feeling to show"] button')].find(b => b.textContent === 'Stress')!;
    await act(async () => { (stress as HTMLElement).click(); });
    expect(text()).toContain('Your stress, day by day, with Work days highlighted');
    expect(text()).toContain('About the same.');

    // The timeline takes the chart's place, and "All tags" brings the chart back.
    expect(host.querySelector('g[role="button"]')).toBeNull();
    await click(button('All tags'));
    expect(text()).not.toContain('day by day');
    expect(host.querySelector('g[role="button"]')).not.toBeNull();
  });

  it('says nothing is clear in a month without a clear difference', () => {
    const flat = new Map([...byDay].map(([k, c]) => [k, { ...c, mood: 3, energy: 3 }]));
    const onWiden = vi.fn();
    act(() => root.render(
      card({ byDay: flat, widen: { label: 'See 2026', onClick: onWiden } }),
    ));
    expect(text()).toContain('Nothing clear this month: one month of check-ins is rarely enough to tell a difference from chance.');
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'See 2026')!.click(); });
    expect(onWiden).toHaveBeenCalled();
  });

  it('hatches every bar on a week and points to the month', () => {
    act(() => root.render(
      card({ period: periodContaining('week', new Date(2026, 9, 14)), scopeLabel: 'last week', widen: { label: 'See October', onClick: () => {} } }),
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
      card({ activity: { ...activity, completed_tasks: [] } }),
    ));
    expect(text()).toContain('Tag your tasks and notes and, once a tag is on 5 days with a check-in, this shows how you felt on those days.');
  });

  it('swaps your tags and the check-in tags in place with its switch', async () => {
    const tagged = new Map([...byDay].map(([k, c], i) => [k, { ...c, tags: i % 2 ? [] : ['Tired'] }]));
    act(() => root.render(card({ byDay: tagged })));
    const tabs = [...host.querySelectorAll('[aria-label="Tags to show"] [role="tab"]')];
    expect(tabs.map(t => t.textContent)).toEqual(['Your task & note tags', 'Check-in tags']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('How you felt on days you worked on each tag');
    expect(host.querySelector('g[role="button"]')).not.toBeNull();

    await click(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('Tags you picked when checking in');
    expect(text()).toContain('your usual 3.0 · Okay');
    expect(text()).toContain('On the 10 days you tagged “Tired”');
    expect(host.querySelector('g[role="button"]')).toBeNull();
    expect(host.querySelector('[aria-label="Break your tags down"]')).toBeNull();

    await click(tabs[0]);
    expect(host.querySelector('g[role="button"]')).not.toBeNull();
  });

  it('lists a row of thin bars per tag on a narrow card, and swaps in the timeline on tap', async () => {
    act(() => root.render(card({ wide: false })));
    expect(host.querySelector('svg[aria-label="Mood, energy and stress on days with each tag, against your usual"]')).toBeNull();
    const row = buttonLabelled('Work, 10 days: show its days over time');
    expect(row.querySelectorAll('[data-feeling]')).toHaveLength(3);
    // Lower mood and energy than usual, harder on you; stress the same.
    expect([...row.querySelectorAll('[data-feeling]')].map(s => s.textContent)).toEqual(['◀', '◀', '']);
    expect(row.querySelector('[data-thin]')).toBeNull();
    expect(text()).toContain('Striped: too few days to tell');
    // The footnote folds on a narrow card.
    expect(host.querySelector('details summary')!.textContent).toBe('About these numbers');

    await click(row);
    expect(text()).toContain('Your mood, day by day, with Work days highlighted');
    expect(host.querySelector('[aria-label^="Work, 10 days"]')).toBeNull();
    await click(button('All tags'));
    expect(host.querySelector('[aria-label^="Work, 10 days"]')).not.toBeNull();
  });

  it('hatches every row on a narrow week card', () => {
    act(() => root.render(card({ wide: false, period: periodContaining('week', new Date(2026, 9, 14)), scopeLabel: 'last week' })));
    const bars = [...host.querySelectorAll('[data-feeling] > span:first-child')];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every(b => b.hasAttribute('data-thin'))).toBe(true);
  });

  describe('by kind of activity', () => {
    const habit = { id: 5, title: 'Inbox zero', estimated_time: null, tags: [work] };
    const event = (day: number) => ({ event_id: 1, occurrence_date: `2026-10-${String(day).padStart(2, '0')}`, date: `2026-10-${String(day).padStart(2, '0')}`, tags: [work] }) as EventOccurrence;
    // Work tasks on the Low days; a Work habit every day, so nothing to compare; Work events on days 1–10, half Low and half Good.
    const kinds: CalendarActivity = {
      ...activity,
      habits: [habit],
      habit_completions: days.map(d => ({ habit_id: 5, habit_title: 'Inbox zero', date: `2026-10-${String(d).padStart(2, '0')}`, estimated_time: null })),
      events: days.slice(0, 10).map(event),
    };
    const openKinds = async () => {
      act(() => root.render(card({ activity: kinds, wide: false })));
      await click(button('By kind of activity'));
    };
    const line = (kind: string) => host.querySelector(`[data-kind="${kind}"]`)!;

    it('leads with a sentence per kind, stated only when the difference is clear', async () => {
      await openKinds();
      expect([...host.querySelectorAll('[aria-label="Break your tags down"] button')].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      expect([...host.querySelectorAll('[aria-label="Tag to break down"] button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Work', 'true']]);
      expect(line('tasks').textContent).toContain('Doing more Work tasks is linked to a lower mood and less energy');
      expect(line('tasks').querySelector('[data-tone="clear"]')).not.toBeNull();
      // The effects are brick: harder on you.
      expect([...line('tasks').querySelectorAll('b')].filter(b => b.style.color === 'var(--tm-mood-1)').map(b => b.textContent)).toEqual(['a lower mood', 'less energy']);
      expect(line('tasks').textContent).toContain('Days you finished a task: 10 · Days you didn’t: 10');
      expect(line('notes').textContent).toContain('No Work notes this month');
      expect(line('notes').querySelector('button')!.hasAttribute('disabled')).toBe(true);
      expect(line('habits').textContent).toContain('Too few days to tell');
      expect(line('events').textContent).toContain('No clear difference');
      expect(line('events').textContent).toContain('Days with an event: 10 · Days without one: 10');
      // Bars stay folded until a line is tapped.
      expect(host.querySelector('[data-side]')).toBeNull();
    });

    it('opens a kind’s bars on tap, the days you did it always the solid, darker top bar', async () => {
      await openKinds();
      await click(line('tasks').querySelector('button')!);
      expect(line('tasks').querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
      const mood = line('tasks').querySelector('[data-feeling="mood"]')!;
      const [did, didnt] = [...mood.querySelectorAll<HTMLElement>('[data-side]')];
      expect(did.dataset.side).toBe('did');
      expect(didnt.dataset.side).toBe('didnt');
      // Low on Work task days, Good on the others: the shorter bar is still the darker one.
      expect(mood.textContent).toContain('Low');
      expect(mood.textContent).toContain('Good');
      expect(mood.textContent).toContain('Lower mood');
      expect(did.style.opacity).toBe('1');
      expect(didnt.style.opacity).toBe('0.35');
      expect(mood.getAttribute('title')).toBe('Mood: usually Low on the 10 days you finished a Work task, usually Good on the other 10 days. That’s a clear difference: on those days your mood was lower.');
      expect(line('tasks').querySelector('[data-feeling="stress"]')!.textContent).toContain('About the same');
      expect(text()).toContain('Top, solid: days you did it');
      expect(text()).toContain('Bottom, faded: days you didn’t');
      expect(text()).toContain('Striped: under 5 days on a side, too few to tell');

      // One line open at a time; a thin one's bars are striped, the top one still darker.
      await click(line('habits').querySelector('button')!);
      expect(line('tasks').querySelector('[data-side]')).toBeNull();
      const habitBar = line('habits').querySelector<HTMLElement>('[data-feeling="mood"] [data-side="did"]')!;
      expect(habitBar.hasAttribute('data-thin')).toBe(true);
      expect(habitBar.style.opacity).toBe('1');
      expect(line('habits').querySelector('[data-feeling="mood"]')!.textContent).toContain('Too few days');
    });

    it('points a week to its month', async () => {
      act(() => root.render(card({ activity: kinds, wide: false, period: periodContaining('week', new Date(2026, 9, 14)), scopeLabel: 'last week', widen: { label: 'See October', onClick: () => {} } })));
      await click(button('By kind of activity'));
      expect(text()).toContain('A week is too short to tell anything from chance. Comparisons need 5 days on each side.');
      expect(text()).not.toContain('is linked to');
    });
  });
});
