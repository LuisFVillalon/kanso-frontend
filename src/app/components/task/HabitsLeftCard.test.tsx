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

describe('Habits left today', () => {
  it('shows each habit done, or with its suggested time and a Plan button', async () => {
    await act(async () => root.render(<HabitsLeftCard habits={HABITS} planner={plannerWith()} />));
    const items = [...container.querySelectorAll('li')].map(li => li.textContent);
    expect(items[0]).toContain('Done');
    expect(items[1]).toContain('11:30 AM');
    expect(items[1]).toContain('Plan');
    expect(items[2]).toContain('1:00 PM');
  });

  it('plans every habit left in one tap, says so, and Undo takes the blocks off again', async () => {
    await act(async () => root.render(<HabitsLeftCard habits={HABITS} planner={plannerWith()} />));
    await act(async () => buttonByText('Plan my habits')!.click());
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 2, date: '2026-11-11', start_time: '11:30', end_time: '12:00' }));
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ habit_id: 3, date: '2026-11-11', start_time: '13:00', end_time: '13:30' }));
    expect(container.textContent).toContain("Planned Read 20 pages at 11:30 AM and Spanish practice at 1:00 PM. They're on your calendar.");
    await act(async () => buttonByText('Undo')!.click());
    expect(api.deleteWorkBlock.mock.calls.map(c => c[0])).toEqual([101, 102]);
    expect(container.textContent).not.toContain('Planned Read 20 pages');
  });

  it('Undo after a failed delete only retries the blocks still there', async () => {
    await act(async () => root.render(<HabitsLeftCard habits={HABITS} planner={plannerWith()} />));
    await act(async () => buttonByText('Plan my habits')!.click());
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
    await act(async () => buttonByText('Plan my habits')!.click());
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
    await act(async () => buttonByText('Plan my habits')!.click());
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
