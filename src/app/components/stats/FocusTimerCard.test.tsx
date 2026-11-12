// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  createWorkBlock: vi.fn(),
  deleteWorkBlock: vi.fn(),
  updateWorkBlock: vi.fn(),
  fetchCalendarActivity: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
const setView = vi.hoisted(() => vi.fn());
vi.mock('@/app/hooks/useCalendarViewMode', () => ({ useCalendarViewMode: () => ['month', setView] }));

import FocusTimerCard, { FocusOverlay, mmss, upNextTask } from './FocusTimerCard';
import { resetFocusTimerForTests } from '@/app/hooks/useFocusTimer';

const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 14, 40);
const MIN = 60_000;

const block = (extra: Partial<WorkBlock>): WorkBlock => ({
  id: 50, task_id: null, habit_id: null, title: '', tags: [], date: TODAY, start_time: '14:30', end_time: '15:30',
  time_zone: 'UTC', starts_at: '', ends_at: '', ...extra,
});
const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null, tags: [],
  created_date: '2026-11-01', completed_date: null, estimated_time: 1, ...extra,
});

let container: HTMLDivElement;
let root: Root;
let workBlocks: WorkBlock[];

const noop = () => {};
const tools = { onExpand: noop, dragHandleProps: { onPointerDown: noop } as never };
const text = () => container.textContent ?? '';
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label);

const render = async (el: React.ReactElement) => {
  await act(async () => root.render(el));
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetFocusTimerForTests();
  workBlocks = [];
  let id = 100;
  api.createWorkBlock.mockReset().mockImplementation(async body => block({ id: ++id, title: 'HW 7', ...body }));
  api.fetchCalendarActivity.mockReset().mockImplementation(async () => ({ events: [], work_blocks: workBlocks }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetFocusTimerForTests();
  vi.useRealTimers();
});

describe('upNextTask', () => {
  const tasks = [
    task(1, 'Due soonest', { due_date: '2026-11-12' }),
    task(2, 'Slipped', { due_date: '2026-11-08' }),
    task(3, 'Planned now'),
    task(4, 'Planned later'),
  ];

  it("picks the task whose work block today covers now", () => {
    const blocks = [block({ task_id: 4, start_time: '16:00', end_time: '17:00' }), block({ task_id: 3, start_time: '14:30', end_time: '15:30' })];
    expect(upNextTask(tasks, blocks, NOW)?.title).toBe('Planned now');
  });

  it('else the one whose block starts next today', () => {
    const blocks = [block({ task_id: 4, start_time: '16:00', end_time: '17:00' }), block({ task_id: 3, start_time: '10:00', end_time: '11:00' })];
    expect(upNextTask(tasks, blocks, NOW)?.title).toBe('Planned later');
  });

  it('else the soonest-due open task, slipped first', () => {
    expect(upNextTask(tasks, [], NOW)?.title).toBe('Slipped');
  });

  it('else none', () => {
    expect(upNextTask([task(1, 'Done', { completed: true, due_date: TODAY })], [], NOW)).toBeNull();
  });
});

describe('mmss', () => {
  it('reads minutes and seconds, and hours past an hour', () => {
    expect(mmss(25 * MIN)).toBe('25:00');
    expect(mmss(90 * MIN)).toBe('1:30:00');
    expect(mmss(0)).toBe('00:00');
  });
});

describe('FocusTimerCard', () => {
  it('works with no open tasks: "Anything", "None yet today", and Start', async () => {
    await render(<FocusTimerCard tasks={[]} {...tools} />);
    expect(text()).toContain('Anything (no task picked)');
    expect(text()).toContain('None yet today');
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('25:00');
    await act(async () => button('Start')!.click());
    expect(button('Pause')).toBeDefined();
    expect(button('Stop')).toBeDefined();
    await act(async () => button('Pause')!.click());
    expect(button('Resume')).toBeDefined();
  });

  it('defaults to the task up next and offers the next open tasks, then No task', async () => {
    workBlocks = [block({ task_id: 3, start_time: '14:30', end_time: '15:30' })];
    const tasks = [task(1, 'Quiz prep', { due_date: '2026-11-12' }), task(3, 'HW 7')];
    await render(<FocusTimerCard tasks={tasks} {...tools} />);
    expect(text()).toContain('HW 7');
    const options = [...container.querySelectorAll('option')].map(o => o.textContent);
    expect(options).toEqual(['HW 7', 'Quiz prep', 'No task']);
  });

  it('locks the lengths while running and saves the session when it ends', async () => {
    const tasks = [task(7, 'HW 7', { due_date: '2026-11-12' })];
    await render(<FocusTimerCard tasks={tasks} {...tools} />);
    await act(async () => button('50m')!.click());
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('50:00');
    await act(async () => button('Start')!.click());
    expect(button('25m')!.disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(12 * MIN); });
    await act(async () => button('Stop')!.click());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ task_id: 7, start_time: '14:40', end_time: '14:52' }));
    expect(text()).toContain('Saved 12m to HW 7');
    expect(button('Undo')).toBeDefined();
    expect(text()).toContain('Today 12m · 1');
  });
});

describe('FocusOverlay', () => {
  it('shares its task pick with the tile, so Start on the tile uses it', async () => {
    const tasks = [task(1, 'Quiz prep', { due_date: '2026-11-12' }), task(2, 'Lab report', { due_date: '2026-11-13' })];
    await render(<FocusOverlay tasks={tasks} />);
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await render(<FocusTimerCard tasks={tasks} {...tools} />);
    expect(container.querySelector('select')!.value).toBe('2');
    await act(async () => button('Start')!.click());
    expect(JSON.parse(localStorage.getItem('tm-focus-timer')!).taskId).toBe(2);
  });

  it("lists today's sessions and links to the calendar's week view", async () => {
    localStorage.setItem('tm-focus-log', JSON.stringify({
      date: TODAY,
      sessions: [{ taskId: null, start: new Date(2026, 10, 11, 9, 0).getTime(), end: new Date(2026, 10, 11, 9, 25).getTime(), ms: 25 * MIN }],
    }));
    await render(<FocusOverlay tasks={[]} />);
    expect(text()).toContain('9:00 AM');
    expect(text()).toContain('25m');
    expect(text()).toContain('No task');
    const link = container.querySelector<HTMLAnchorElement>('a[href="/calendar"]')!;
    link.addEventListener('click', e => e.preventDefault());
    act(() => link.click());
    expect(setView).toHaveBeenCalledWith('week');
  });

  it('shows the empty state with no sessions', async () => {
    await render(<FocusOverlay tasks={[]} />);
    expect(text()).toContain('None yet today');
  });
});
