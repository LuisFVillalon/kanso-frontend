// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';
import type { ProfileFields } from '@/app/hooks/useProfile';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  createWorkBlock: vi.fn(),
  deleteWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  fetchCalendarActivity: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import FreeTimeCard, { FreeTimeOverlay } from './FreeTimeCard';

const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 14, 40); // Wed Nov 11 2026, 2:40 PM
const PROFILE = { dayStartTime: '09:00', shutoffTime: '20:00', restDays: [0, 6], workHoursSet: true } as unknown as ProfileFields;

const ev = (title: string, start: string, end: string): EventOccurrence => ({
  event_id: title.length, occurrence_date: TODAY, title, description: null, tags: [], all_day: false,
  date: TODAY, end_date: TODAY, start_time: start, end_time: end, starts_at: '', ends_at: '', time_zone: 'UTC',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
});
const block = (extra: Partial<WorkBlock>): WorkBlock => ({
  id: 50, task_id: null, habit_id: null, title: '', tags: [], date: TODAY, start_time: '16:00', end_time: '18:00',
  time_zone: 'UTC', starts_at: '', ends_at: '', ...extra,
});
const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null, tags: [],
  created_date: '2026-11-01', completed_date: null, estimated_time: 0.5, ...extra,
});

const EVENTS = [ev('Office hours', '15:00:00', '15:30:00')];
const BLOCKS = [block({ id: 1, task_id: 99, start_time: '16:00', end_time: '18:00' }), block({ id: 2, habit_id: 3, start_time: '19:00', end_time: '19:30' })];
const TASKS = [task(1, 'LeetCode', { due_date: '2026-11-12' }), task(2, 'Slipped essay', { due_date: '2026-11-09' })];

let container: HTMLDivElement;
let root: Root;
let activity: { events: EventOccurrence[]; work_blocks: WorkBlock[] };

const noop = () => {};
const tools = { onExpand: noop, dragHandleProps: { onPointerDown: noop } as never };

const render = async (el: React.ReactElement) => {
  await act(async () => root.render(el));
  await act(async () => { await Promise.resolve(); });
};
const card = (extra: Partial<React.ComponentProps<typeof FreeTimeCard>> = {}) =>
  <FreeTimeCard tasks={TASKS} habits={[]} profile={PROFILE} {...tools} {...extra} />;
const text = () => container.textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  activity = { events: EVENTS, work_blocks: BLOCKS };
  let id = 100;
  api.createWorkBlock.mockReset().mockImplementation(async body => block({ id: ++id, ...body }));
  api.deleteWorkBlock.mockReset().mockResolvedValue(undefined);
  api.fetchCalendarActivity.mockReset().mockImplementation(async () => activity);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('FreeTimeCard', () => {
  it('shows pulse bars while loading', async () => {
    let resolve: (value: typeof activity) => void = () => {};
    api.fetchCalendarActivity.mockReturnValue(new Promise(r => { resolve = r; }));
    await render(card());
    expect(container.querySelector('[aria-label="Loading free time"]')).not.toBeNull();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    // Planners share one in-flight read, so let it finish before the next test.
    await act(async () => resolve(activity));
  });

  it('shows the free time left, what fills the rest, and what fits today', async () => {
    await render(card());
    expect(text()).toContain('2h 15m');
    expect(text()).toContain('free until 8:00 PM');
    expect(text()).toContain('Blocks 2h · events 30m · habits 30m');
    const chips = [...container.querySelectorAll('button[aria-label^="Plan "]')];
    expect(chips.map(c => c.textContent)).toEqual(['Slipped essay30m', 'LeetCode30m']);
  });

  it('plans a fit with one tap, then offers Undo', async () => {
    await render(card());
    const chip = container.querySelector<HTMLButtonElement>('button[aria-label^="Plan LeetCode"]')!;
    await act(async () => chip.click());
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ task_id: 1, date: TODAY }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('LeetCode');
    const undo = [...container.querySelectorAll('button')].find(b => b.textContent === 'Undo')!;
    await act(async () => undo.click());
    expect(api.deleteWorkBlock).toHaveBeenCalledWith(101);
  });

  it('says when nothing due soon needs planning', async () => {
    await render(card({ tasks: [] }));
    expect(text()).toContain('Nothing due soon needs planning');
  });

  it('says when no free time is left, with the next free slot', async () => {
    activity = { events: [ev('Lab', '14:00:00', '20:00:00')], work_blocks: [] };
    await render(card());
    expect(text()).toContain('No free time left today.');
    expect(text()).toContain('Next free: Tomorrow 9:00 AM');
  });

  it('says when the work day has ended', async () => {
    vi.setSystemTime(new Date(2026, 10, 11, 20, 30));
    await render(card());
    expect(text()).toContain('Your work day ended at 8:00 PM. Tomorrow starts at 9:00 AM.');
  });

  it('says when today is a rest day', async () => {
    vi.setSystemTime(new Date(2026, 10, 14, 11, 0)); // Saturday
    await render(card());
    expect(text()).toContain('Rest day. Your next work day starts Mon 9:00 AM.');
  });

  it('notes the default hours when work hours were never saved', async () => {
    await render(card({ profile: { ...PROFILE, workHoursSet: false } }));
    expect(text()).toContain('Using default hours');
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Set work hours')).toBe(true);
  });
});

describe('FreeTimeOverlay', () => {
  it('lists the free gaps and up to 3 fits with Plan buttons', async () => {
    const tasks = [...TASKS, task(3, 'Quiz prep', { due_date: '2026-11-13' }), task(4, 'Reading', { due_date: '2026-11-14' })];
    await render(<FreeTimeOverlay tasks={tasks} habits={[]} profile={PROFILE} />);
    expect(text()).toContain('2:45 – 3:00 PM');
    expect(text()).toContain('7:30 – 8:00 PM');
    const plans = [...container.querySelectorAll('button')].filter(b => b.textContent === 'Plan');
    expect(plans).toHaveLength(3);
  });
});
