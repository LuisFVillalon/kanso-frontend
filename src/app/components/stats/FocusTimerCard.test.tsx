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

import FocusTimerCard, { FocusOverlay, mmss, upNextTask } from './FocusTimerCard';
import { CLAIM_SETTLE_MS, resetFocusTimerForTests } from '@/app/hooks/useFocusTimer';

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
const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"]');
const menuRows = () => [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
/** The task the picker shows as picked. */
const pickedTitle = async () => {
  await act(async () => trigger().click());
  const title = menuRows().find(r => r.getAttribute('aria-checked') === 'true')?.textContent;
  await act(async () => trigger().click());
  return title;
};
const pickTask = async (title: string) => {
  await act(async () => trigger().click());
  await act(async () => menuRows().find(r => r.textContent === title)!.click());
};

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
    await act(async () => trigger().click());
    expect(menuRows().map(o => o.textContent)).toEqual(['HW 7', 'Quiz prep', 'No task']);
    expect(menuRows()[0].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(menuRows()[0]);
  });

  it('opens an on-theme menu that keys, picks, and closes', async () => {
    const tasks = [task(1, 'Quiz prep', { due_date: '2026-11-12' }), task(2, 'Lab report', { due_date: '2026-11-13' })];
    await render(<FocusTimerCard tasks={tasks} {...tools} />);
    expect(container.querySelector('select')).toBeNull();
    await act(async () => trigger().click());
    // Portaled out of the tile, which clips its overflow.
    expect(container.contains(menu())).toBe(false);
    expect(menu()!.className).toContain('menu-pop');
    await act(async () => menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('Lab report');
    await act(async () => (document.activeElement as HTMLElement).click());
    expect(menu()).toBeNull();
    expect(trigger().textContent).toContain('Lab report');
    expect(document.activeElement).toBe(trigger());
    await act(async () => trigger().click());
    await act(async () => menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menu()).toBeNull();
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
    await act(async () => { await vi.advanceTimersByTimeAsync(CLAIM_SETTLE_MS); });
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
    await pickTask('Lab report');
    await render(<FocusTimerCard tasks={tasks} {...tools} />);
    expect(await pickedTitle()).toBe('Lab report');
    await act(async () => button('Start')!.click());
    expect(JSON.parse(localStorage.getItem('tm-focus-timer')!).taskId).toBe(2);
  });

  it.each([
    ['completed', [task(1, 'Quiz prep', { due_date: '2026-11-12' }), task(2, 'Lab report', { due_date: '2026-11-13', completed: true })]],
    ['deleted', [task(1, 'Quiz prep', { due_date: '2026-11-12' })]],
  ])('falls back to the default once the picked task is %s', async (_, later) => {
    const tasks = [task(1, 'Quiz prep', { due_date: '2026-11-12' }), task(2, 'Lab report', { due_date: '2026-11-13' })];
    await render(<FocusOverlay tasks={tasks} />);
    await pickTask('Lab report');
    await render(<FocusTimerCard tasks={later} {...tools} />);
    expect(text()).toContain('Quiz prep');
    expect(await pickedTitle()).toBe('Quiz prep');
    await act(async () => button('Start')!.click());
    expect(JSON.parse(localStorage.getItem('tm-focus-timer')!).taskId).toBe(1);
  });

  it("doesn't turn the default it fell back to into a pick when a session starts", async () => {
    const tasks = [task(1, 'Quiz prep', { due_date: '2026-11-12' }), task(2, 'Lab report', { due_date: '2026-11-13' }), task(3, 'HW 3', { due_date: '2026-11-20' })];
    await render(<FocusOverlay tasks={tasks} />);
    await pickTask('Lab report');
    const later = tasks.map(t => (t.id === 2 ? { ...t, completed: true } : t));
    await render(<FocusTimerCard tasks={later} {...tools} />);
    expect(await pickedTitle()).toBe('Quiz prep');
    await act(async () => button('Start')!.click());
    await act(async () => button('Stop')!.click());
    act(() => root.unmount());
    root = createRoot(container);
    workBlocks = [block({ task_id: 3, start_time: '14:30', end_time: '15:30' })];
    await render(<FocusTimerCard tasks={later} {...tools} />);
    expect(await pickedTitle()).toBe('HW 3');
  });

  it("lists today's sessions, without the work-block explainer", async () => {
    localStorage.setItem('tm-focus-log', JSON.stringify({
      date: TODAY,
      sessions: [{ taskId: null, start: new Date(2026, 10, 11, 9, 0).getTime(), end: new Date(2026, 10, 11, 9, 25).getTime(), ms: 25 * MIN }],
    }));
    await render(<FocusOverlay tasks={[]} />);
    expect(text()).toContain('9:00 AM');
    expect(text()).toContain('25m');
    expect(text()).toContain('No task');
    expect(text()).not.toContain('saved as work blocks');
    expect(container.querySelector('a[href="/calendar"]')).toBeNull();
  });

  it('shows the empty state with no sessions', async () => {
    await render(<FocusOverlay tasks={[]} />);
    expect(text()).toContain('None yet today');
  });
});

describe('custom lengths', () => {
  const customButton = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Custom length"]')!;
  const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Custom length"]');
  const typeMinutes = async (v: string) => {
    const input = dialog()!.querySelector('input')!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  };

  it('adds a length, picks it, and keeps it for next time', async () => {
    await render(<FocusTimerCard tasks={[]} {...tools} />);
    await act(async () => customButton().click());
    expect(document.activeElement).toBe(dialog()!.querySelector('input'));
    await typeMinutes('45');
    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('45:00');
    expect(customButton().getAttribute('aria-label')).toBe('Custom length (now 45 min)');
    expect(customButton().textContent).toBe('45m');
    expect(JSON.parse(localStorage.getItem('tm-focus-custom')!)).toEqual([45]);

    // Back to a preset: 45 is still offered in the "+" dialog.
    await act(async () => button('25m')!.click());
    expect(customButton().textContent).toBe('25m');
    await act(async () => customButton().click());
    const saved = [...dialog()!.querySelectorAll('button')].find(b => b.textContent === '45 min')!;
    await act(async () => saved.click());
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('45:00');
    // Its presets too, for a tile too narrow to show them.
    await act(async () => customButton().click());
    await act(async () => [...dialog()!.querySelectorAll('button')].find(b => b.textContent === '90m')!.click());
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('1:30:00');
  });

  it('turns down a length out of bounds', async () => {
    await render(<FocusTimerCard tasks={[]} {...tools} />);
    await act(async () => customButton().click());
    await typeMinutes('0');
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');
    await typeMinutes('241');
    expect(dialog()).not.toBeNull();
    expect(localStorage.getItem('tm-focus-custom')).toBeNull();
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('25:00');
  });

  it('removes a saved length', async () => {
    localStorage.setItem('tm-focus-custom', JSON.stringify([15, 45]));
    await render(<FocusTimerCard tasks={[]} {...tools} />);
    await act(async () => customButton().click());
    await act(async () => dialog()!.querySelector<HTMLButtonElement>('[aria-label="Remove 15 min"]')!.click());
    expect(JSON.parse(localStorage.getItem('tm-focus-custom')!)).toEqual([45]);
    expect(dialog()!.textContent).not.toContain('15 min');
  });

  it("can't change the length while running", async () => {
    await render(<FocusTimerCard tasks={[]} {...tools} />);
    await act(async () => button('Start')!.click());
    expect(customButton().disabled).toBe(true);
  });
});
