// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import type { Habit } from '@/app/types/habit';
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

import HabitsLeftCard from './HabitsLeftCard';
import PlanConflictCallouts from './PlanConflictCallout';
import { buildSlotState, type SlotPlanner } from '@/app/hooks/useSlotPlanner';

const NOW = new Date(2026, 10, 11, 11, 20); // Wed Nov 11 2026, 11:20 AM
const PROFILE = { dayStartTime: '09:00', shutoffTime: '19:00', restDays: [0, 6] };

const ev = (title: string, date: string, start: string, end: string, extra: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: title.length, occurrence_date: date, title, description: null, tags: [], all_day: false,
  date, end_date: date, start_time: start, end_time: end, starts_at: '', ends_at: '', time_zone: 'UTC',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false, ...extra,
});
const EVENTS = [
  ev('COMM 103 lecture', '2026-11-11', '10:00:00', '11:15:00'),
  ev('Study group', '2026-11-11', '12:00:00', '13:00:00'),
  ev('Shift at the library', '2026-11-11', '14:00:00', '17:00:00'),
];
const habit = (id: number, title: string, extra: Partial<Habit> = {}): Habit => ({
  id, title, current_streak: 3, max_streak: 5, logged_today: false, tags: [], estimated_time: 0.5, ...extra,
});
const HABITS = [habit(1, 'Morning run', { logged_today: true }), habit(2, 'Read 20 pages'), habit(3, 'Spanish practice')];
const block = (extra: Partial<WorkBlock>): WorkBlock => ({
  id: 50, task_id: null, habit_id: null, title: '', tags: [], date: '2026-11-11', start_time: '11:30', end_time: '12:00',
  time_zone: 'UTC', starts_at: '', ends_at: '', ...extra,
});

const plannerWith = ({ habits = HABITS, events = EVENTS, workBlocks = [] as WorkBlock[], tasks = [] as Task[] } = {}): SlotPlanner => ({
  state: buildSlotState({ now: NOW, profile: PROFILE as never, tasks, habits, events, workBlocks }),
  events, workBlocks, workHoursSet: true, today: '2026-11-11',
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  let id = 100;
  api.createWorkBlock.mockReset().mockImplementation(async body => block({ id: ++id, ...body }));
  api.deleteWorkBlock.mockReset().mockResolvedValue(undefined);
  api.updateWorkBlock.mockReset().mockImplementation(async (blockId: number, body) => block({ id: blockId, ...body }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const buttonByText = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
/** Plan my habits, then the review's "Plan N habits" without changing anything. */
const planAll = async () => {
  await act(async () => buttonByText('Plan my habits')!.click());
  const go = [...container.querySelectorAll('button')].find(b => /^Plan \d+ habits?$/.test(b.textContent?.trim() ?? ''))!;
  await act(async () => go.click());
};

describe('Habits left today', () => {
  it('shows each habit done, or with its suggested time and a Plan button', async () => {
    await act(async () => root.render(<HabitsLeftCard habits={HABITS} planner={plannerWith()} />));
    const items = [...container.querySelectorAll('li')].map(li => li.textContent);
    expect(items[0]).toContain('Done');
    expect(items[1]).toContain('11:30 AM');
    expect(items[1]).toContain('Plan');
    expect(items[2]).toContain('1:00 PM');
  });

  it('plans every habit left from the review, says so, and Undo takes the blocks off again', async () => {
    await act(async () => root.render(<HabitsLeftCard habits={HABITS} planner={plannerWith()} />));
    await planAll();
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 2, date: '2026-11-11', start_time: '11:30', end_time: '12:00' }));
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 3, date: '2026-11-11', start_time: '13:00', end_time: '13:30' }));
    expect(container.textContent).toContain("Planned Read 20 pages at 11:30 AM and Spanish practice at 1:00 PM. They're on your calendar.");
    await act(async () => buttonByText('Undo')!.click());
    expect(api.deleteWorkBlock.mock.calls.map(c => c[0])).toEqual([101, 102]);
    expect(container.textContent).not.toContain('Planned Read 20 pages');
  });

  it('Undo after a failed delete only retries the blocks still there', async () => {
    await act(async () => root.render(<HabitsLeftCard habits={HABITS} planner={plannerWith()} />));
    await planAll();
    api.deleteWorkBlock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    await act(async () => buttonByText('Undo')!.click());
    expect(container.textContent).toContain("Couldn't undo that.");
    expect(container.textContent).toContain('Planned Spanish practice at 1:00 PM.');
    await act(async () => buttonByText('Undo')!.click());
    expect(api.deleteWorkBlock.mock.calls.map(c => c[0])).toEqual([101, 102, 102]);
    expect(container.textContent).not.toContain('Planned Spanish practice');
  });

  it('suggests a free time after now for a habit whose usual time has passed', async () => {
    const habits = [habit(2, 'Read 20 pages', { planned_time: '09:00' })];
    await act(async () => root.render(<HabitsLeftCard habits={habits} planner={plannerWith({ habits })} />));
    expect(container.querySelector('li')!.textContent).toContain('11:30 AM');
    await planAll();
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 2, start_time: '11:30', end_time: '12:00' }));
  });

  it('shows a planned habit as planned, and a usual time as its chip', async () => {
    const habits = [habit(2, 'Read 20 pages', { planned_time: '18:00' }), habit(3, 'Spanish practice')];
    const planner = plannerWith({ habits, workBlocks: [block({ id: 7, habit_id: 3, title: 'Spanish practice', start_time: '17:00', end_time: '17:30' })] });
    await act(async () => root.render(<HabitsLeftCard habits={habits} planner={planner} />));
    const items = [...container.querySelectorAll('li')].map(li => li.textContent);
    expect(items[0]).toContain('6:00 PM');
    expect(items[1]).toContain('Planned 5:00 PM');
    expect(buttonByText('Plan my habits')).toBeTruthy();
  });
});

describe('Plans that lost their time', () => {
  it("offers today's free time when an event takes a habit's usual time, as a block for today only", async () => {
    const habits = [habit(3, 'Spanish practice', { planned_time: '13:00' })];
    const office = ev('Office hours', '2026-11-11', '13:00:00', '13:45:00');
    const planner = plannerWith({ habits, events: [...EVENTS, office] });
    await act(async () => root.render(<PlanConflictCallouts planner={planner} tasks={[]} habits={habits} />));
    expect(container.textContent).toContain('Office hours takes 1:00 PM today, your usual time for Spanish practice. Today only: 11:30 AM – 12:00 PM?');
    await act(async () => buttonByText('Do it at 11:30 AM')!.click());
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 3, date: '2026-11-11', start_time: '11:30', end_time: '12:00' }));
  });

  it('lists a habit with no time goal as "All day", with no time or Plan, and Plan my habits skips it', async () => {
    const habits = [habit(4, 'Drink water', { estimated_time: null, planned_time: '11:30', current_streak: 6 }), habit(2, 'Read 20 pages')];
    await act(async () => root.render(<HabitsLeftCard habits={habits} planner={plannerWith({ habits })} />));
    const [water, read] = [...container.querySelectorAll('li')];
    expect(water.textContent).toContain('Drink water');
    expect(water.textContent).toContain('6');
    expect(water.textContent).toContain('All day');
    expect(water.textContent).not.toMatch(/AM|PM|Plan/);
    expect(water.querySelector('[aria-label="Mark done: Drink water"]')).not.toBeNull();
    // Its old usual time holds nothing, so the other habit gets 11:30.
    expect(read.textContent).toContain('11:30 AM');
    await planAll();
    expect(api.createWorkBlock).toHaveBeenCalledTimes(1);
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 2, start_time: '11:30', end_time: '12:00' }));
  });

  it('has no Plan my habits when only all-day habits are left, and shows "All day" before the calendar loads', async () => {
    const habits = [habit(4, 'Drink water', { estimated_time: null, planned_time: '09:00' })];
    await act(async () => root.render(<HabitsLeftCard habits={habits} planner={plannerWith({ habits })} />));
    expect(buttonByText('Plan my habits')).toBeUndefined();
    await act(async () => root.render(<HabitsLeftCard habits={habits} planner={null} />));
    expect(container.querySelector('li')!.textContent).toContain('All day');
  });

  it("doesn't ask about an all-day habit whose old usual time an event takes", async () => {
    const habits = [habit(4, 'Drink water', { estimated_time: null, planned_time: '13:00' })];
    const office = ev('Office hours', '2026-11-11', '13:00:00', '13:45:00');
    const planner = plannerWith({ habits, events: [...EVENTS, office] });
    await act(async () => root.render(<PlanConflictCallouts planner={planner} tasks={[]} habits={habits} />));
    expect(container.textContent).not.toContain('Office hours takes');
    expect(buttonByText('Do it at 11:30 AM')).toBeUndefined();
  });

  it('gives a habit whose usual time is taken the same time on the card and in the callout', async () => {
    const habits = [habit(3, 'Spanish practice', { planned_time: '18:00' })];
    const club = ev('Club meeting', '2026-11-11', '18:00:00', '18:30:00');
    const planner = plannerWith({ habits, events: [...EVENTS, club] });
    await act(async () => root.render(<>
      <HabitsLeftCard habits={habits} planner={planner} />
      <PlanConflictCallouts planner={planner} tasks={[]} habits={habits} />
    </>));
    expect(container.querySelector('li')!.textContent).toContain('5:30 PM');
    expect(container.textContent).toContain('Today only: 5:30 – 6:00 PM?');
    await planAll();
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 3, start_time: '17:30', end_time: '18:00' }));
  });

  it('offers the nearest free time that day for a habit block an event now covers', async () => {
    const office = ev('Office hours', '2026-11-11', '13:00:00', '13:45:00');
    const workBlocks = [block({ id: 61, habit_id: 3, title: 'Spanish practice', start_time: '13:00', end_time: '13:30' })];
    const planner = plannerWith({ events: [...EVENTS, office], workBlocks });
    await act(async () => root.render(<PlanConflictCallouts planner={planner} tasks={[]} habits={HABITS} />));
    expect(container.textContent).toContain('Office hours takes 1:00 PM today, your plan for Spanish practice. Today only: 11:30 AM – 12:00 PM?');
    await act(async () => buttonByText('Do it at 11:30 AM')!.click());
    expect(api.updateWorkBlock).toHaveBeenCalledWith(61, { date: '2026-11-11', start_time: '11:30', end_time: '12:00' });
    await act(async () => buttonByText('Skip')!.click());
    expect(container.textContent).not.toContain('Office hours takes');
  });

  it("doesn't ask about a completed task's block", async () => {
    const tasks = [{
      id: 9, title: 'Read ch. 7', description: '', completed: true, priority: null, due_date: '2026-11-16', due_time: '10:00',
      tags: [], created_date: '', completed_date: null, estimated_time: 1,
    } as Task];
    const advisor = ev('Advisor meeting', '2026-11-12', '12:00:00', '12:30:00');
    const workBlocks = [block({ id: 60, task_id: 9, title: 'Read ch. 7', date: '2026-11-12', start_time: '12:00', end_time: '13:00' })];
    const planner = plannerWith({ habits: [], tasks, events: [...EVENTS, advisor], workBlocks });
    await act(async () => root.render(<PlanConflictCallouts planner={planner} tasks={tasks} habits={[]} />));
    expect(container.querySelector('[data-plan-conflicts]')).toBeNull();
  });

  it('offers the nearest free time for a task block an event now covers, and Keep it stops asking', async () => {
    const tasks = [{
      id: 9, title: 'Read ch. 7', description: '', completed: false, priority: null, due_date: '2026-11-16', due_time: '10:00',
      tags: [], created_date: '', completed_date: null, estimated_time: 1,
    } as Task];
    const advisor = ev('Advisor meeting', '2026-11-12', '12:00:00', '12:30:00');
    const workBlocks = [block({ id: 60, task_id: 9, title: 'Read ch. 7', date: '2026-11-12', start_time: '12:00', end_time: '13:00' })];
    const planner = plannerWith({ habits: [], tasks, events: [...EVENTS, advisor], workBlocks });
    await act(async () => root.render(<PlanConflictCallouts planner={planner} tasks={tasks} habits={[]} />));
    expect(container.textContent).toContain('Advisor meeting now covers part of your plan for Read ch. 7 (Tomorrow, 12:00 – 1:00 PM).');
    expect(container.textContent).toContain('Nearest free 1 hr: Tomorrow, 12:30 – 1:30 PM.');
    await act(async () => buttonByText('Move to Tomorrow 12:30 PM')!.click());
    expect(api.updateWorkBlock).toHaveBeenCalledWith(60, { date: '2026-11-12', start_time: '12:30', end_time: '13:30' });

    await act(async () => buttonByText('Keep it')!.click());
    expect(container.textContent).not.toContain('Advisor meeting now covers');
  });
});

// The habit-time board's sample day: Thu Nov 12 2026, work day 9 AM – 7 PM.
describe('Changing the times before planning', () => {
  const DAY = '2026-11-12';
  const DAY_EVENTS = [
    ev('BIO 210 lecture', DAY, '11:30:00', '12:45:00'),
    ev('Library shift', DAY, '14:00:00', '17:00:00'),
    ev('Dinner with Sam', DAY, '19:30:00', '20:30:00'),
  ];
  const DAY_HABITS = [
    habit(1, 'Workout', { estimated_time: 1.5 }),
    habit(2, 'Leetcode', { estimated_time: 1 }),
    habit(3, 'Read', { estimated_time: 0.5 }),
    habit(4, 'Eat healthy', { estimated_time: null }),
  ];
  const dayPlanner = (now: Date, workBlocks: WorkBlock[] = []): SlotPlanner => ({
    state: buildSlotState({ now, profile: PROFILE as never, tasks: [], habits: DAY_HABITS, events: DAY_EVENTS, workBlocks }),
    events: DAY_EVENTS, workBlocks, workHoursSet: true, today: DAY,
  });
  const MORNING = new Date(2026, 10, 12, 8, 40);
  const LATE = new Date(2026, 10, 12, 16, 50);

  const byLabel = <T extends HTMLElement = HTMLElement>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`);
  const setTime = async (label: string, value: string) => {
    const input = byLabel<HTMLInputElement>(label)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const row = (id: number) => container.querySelector(`[data-review-row="${id}"]`)!;
  const render = async (now: Date, workBlocks: WorkBlock[] = []) => {
    vi.setSystemTime(now);
    await act(async () => root.render(<HabitsLeftCard habits={DAY_HABITS} planner={dayPlanner(now, workBlocks)} />));
  };

  it('opens a review from Plan my habits and books nothing until "Plan 3 habits", at the reviewed times', async () => {
    await render(MORNING);
    const chips = [...container.querySelectorAll('li')].map(li => li.textContent);
    expect(chips[0]).toContain('9:00 AM');
    expect(chips[1]).toContain('10:30 AM');
    expect(chips[2]).toContain('12:45 PM');

    await act(async () => buttonByText('Plan my habits')!.click());
    expect(container.textContent).toContain('Plan today’s habits');
    expect(container.textContent).toContain('Nothing is booked until you do.');
    expect(row(1).textContent).toContain('9:00 – 10:30 AM · right before Leetcode');
    expect(row(2).textContent).toContain('between Workout and BIO 210 lecture');
    expect(container.querySelector('[data-review-row="4"]')).toBeNull();
    expect(api.createWorkBlock).not.toHaveBeenCalled();

    // A typed time that clashes says with what, offers the nearest fix, and holds the plan back.
    await setTime('Leetcode start time', '11:45');
    expect(row(2).textContent).toContain('Clashes with BIO 210 lecture (11:30 AM – 12:45 PM).');
    expect(row(2).querySelector('[role="alert"]')).not.toBeNull();
    const plan3 = buttonByText('Plan 3 habits')!;
    expect(plan3.getAttribute('aria-disabled')).toBe('true');
    expect(container.textContent).toContain('Fix the time above first.');
    await act(async () => plan3.click());
    expect(api.createWorkBlock).not.toHaveBeenCalled();
    await act(async () => buttonByText('Use 10:30 AM')!.click());
    expect(byLabel<HTMLInputElement>('Leetcode start time')!.value).toBe('10:30');
    expect(container.textContent).not.toContain('Fix the time above first.');

    // › jumps to the next free start, past Leetcode, the lecture, Read and the shift.
    expect(byLabel('Earlier free time: 8:45 AM')).not.toBeNull();
    await act(async () => byLabel<HTMLButtonElement>('Later free time: 5:00 PM')!.click());
    expect(row(1).textContent).toContain('5:00 – 6:30 PM');

    await act(async () => buttonByText('Plan 3 habits')!.click());
    expect(api.createWorkBlock.mock.calls.map(c => [c[0].habit_id, c[0].start_time, c[0].end_time])).toEqual([
      [1, '17:00', '18:30'], [2, '10:30', '11:30'], [3, '12:45', '13:15'],
    ]);
    expect(container.textContent).toContain('Planned Workout at 5:00 PM, Leetcode at 10:30 AM and Read at 12:45 PM.');
    expect(container.querySelector('[data-habit-review]')).toBeNull();
  });

  it('still books a single row in one tap with its Plan link', async () => {
    await render(MORNING);
    await act(async () => byLabel<HTMLButtonElement>('Plan Workout at 9:00 AM')!.click());
    expect(container.querySelector('[data-habit-review]')).toBeNull();
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 1, start_time: '09:00', end_time: '10:30' }));
  });

  it("opens the review from a habit's time chip with that habit's field focused", async () => {
    await render(MORNING);
    const chip = byLabel<HTMLButtonElement>("Change Leetcode's time, now 10:30 AM")!;
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    await act(async () => chip.click());
    expect(document.activeElement).toBe(byLabel('Leetcode start time'));
  });

  it('leaves an unticked habit out for today', async () => {
    await render(MORNING);
    await act(async () => buttonByText('Plan my habits')!.click());
    await act(async () => byLabel<HTMLInputElement>('Plan Read today')!.click());
    expect(row(3).textContent).toContain('Not today');
    expect(byLabel<HTMLInputElement>('Read start time')!.disabled).toBe(true);
    await act(async () => buttonByText('Plan 2 habits')!.click());
    expect(api.createWorkBlock.mock.calls.map(c => c[0].habit_id)).toEqual([1, 2]);
  });

  it('Cancel and Esc discard the changes and give focus back to what opened the review', async () => {
    await render(MORNING);
    const chip = byLabel<HTMLButtonElement>("Change Workout's time, now 9:00 AM")!;
    await act(async () => chip.click());
    await setTime('Workout start time', '17:00');
    await act(async () => buttonByText('Cancel')!.click());
    expect(container.querySelector('[data-habit-review]')).toBeNull();
    expect(document.activeElement).toBe(byLabel("Change Workout's time, now 9:00 AM"));

    await act(async () => buttonByText('Plan my habits')!.click());
    expect(byLabel<HTMLInputElement>('Workout start time')!.value).toBe('09:00');
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-habit-review]')).toBeNull();
    expect(document.activeElement).toBe(buttonByText('Plan my habits'));
    expect(api.createWorkBlock).not.toHaveBeenCalled();
  });

  it('late in the day, Find a time on a "No free time left" row opens the review at the first evening time', async () => {
    await render(LATE);
    const leetcode = [...container.querySelectorAll('li')][1];
    expect(leetcode.textContent).toContain('No free time left');
    await act(async () => buttonByText('Find a time')!.click());
    expect(byLabel<HTMLInputElement>('Leetcode start time')!.value).toBe('20:30');
    expect(byLabel<HTMLInputElement>('Plan Leetcode today')!.checked).toBe(true);
    expect(row(2).textContent).toContain('8:30 – 9:30 PM');
    expect(document.activeElement).toBe(byLabel('Leetcode start time'));
    await act(async () => buttonByText('Plan 3 habits')!.click());
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 2, start_time: '20:30', end_time: '21:30' }));
  });

  it('moves a planned habit from its pill, sending only the new time', async () => {
    const planned = block({ id: 77, habit_id: 1, title: 'Workout', date: DAY, start_time: '09:00', end_time: '10:30' });
    await render(MORNING, [planned]);
    await act(async () => byLabel<HTMLButtonElement>('Move Workout, planned at 9:00 AM')!.click());
    expect(container.textContent).toContain('Move planned habits');
    expect(document.activeElement).toBe(byLabel('Workout start time'));
    await setTime('Workout start time', '18:00');
    await act(async () => buttonByText('Move to 6:00 PM')!.click());
    expect(api.updateWorkBlock).toHaveBeenCalledWith(77, { date: DAY, start_time: '18:00', end_time: '19:30' });
    expect(container.textContent).toContain('Moved Workout to 6:00 PM');
  });

  it('"Change times" after a plan moves just the habits that changed', async () => {
    await render(MORNING);
    await planAll();
    await act(async () => buttonByText('Change times')!.click());
    expect(container.textContent).toContain('Move planned habits');
    await setTime('Read start time', '13:15');
    await act(async () => buttonByText('Save times')!.click());
    expect(api.updateWorkBlock).toHaveBeenCalledTimes(1);
    expect(api.updateWorkBlock).toHaveBeenCalledWith(103, { date: DAY, start_time: '13:15', end_time: '13:45' });
    expect(container.textContent).toContain('Planned Workout at 9:00 AM, Leetcode at 10:30 AM and Read at 1:15 PM.');
    // Undo still takes off every block it made.
    await act(async () => buttonByText('Undo')!.click());
    expect(api.deleteWorkBlock.mock.calls.map(c => c[0])).toEqual([101, 102, 103]);
  });
});
