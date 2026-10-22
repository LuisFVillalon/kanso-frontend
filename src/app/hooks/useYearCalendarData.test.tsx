// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchCalendarActivity: vi.fn(),
  tasks: [] as Task[],
  habits: [] as Habit[],
}));

vi.mock('@/app/lib/backend-api', () => ({ fetchCalendarActivity: mocks.fetchCalendarActivity }));
vi.mock('@/app/context/TasksContext', () => ({ useTasksContext: () => ({ tasks: mocks.tasks, isLoading: false }) }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => ({ habits: mocks.habits, habitsLoading: false }) }));
vi.mock('@/app/context/NotesContext', () => ({ useNotesContext: () => ({ notes: [], isLoading: false }) }));

import { useYearCalendarData } from './useYearCalendarData';

const activity = (start: string, end: string, completions: CalendarActivity['habit_completions']): CalendarActivity => ({
  start_date: start,
  end_date: end,
  scheduled_tasks: [],
  completed_tasks: [],
  note_sessions: [],
  habit_completions: completions,
});

let result: ReturnType<typeof useYearCalendarData>;
const Probe: React.FC<{ year?: number; onResult: (r: typeof result) => void }> = ({ year, onResult }) => {
  onResult(useYearCalendarData(year));
  return null;
};

let container: HTMLDivElement;
let root: Root;
const render = (year?: number) => act(async () => root.render(<Probe year={year} onResult={r => { result = r; }} />));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0)); // Wed 21 Oct 2026
  mocks.tasks = [
    { id: 1, title: 'Old essay', due_date: '2024-03-04', estimated_time: 2 } as Task,
    { id: 2, title: 'Essay', due_date: '2026-10-22', estimated_time: 1 } as Task,
  ];
  mocks.habits = [{ id: 5, title: 'Run', estimated_time: 0.5, logged_today: true } as Habit];
  mocks.fetchCalendarActivity.mockReset().mockImplementation(async (start: string, end: string) =>
    activity(start, end, [{ habit_id: 5, habit_title: 'Run', date: `${start.slice(0, 4)}-03-04`, estimated_time: 0.5 }]));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useYearCalendarData', () => {
  it('loads the current year by default, keeping today in step with the habit', async () => {
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    expect(result.loading).toBe(false);
    expect(result.dayData.get('2026-03-04')!.habitsCompleted.map(h => h.id)).toEqual([5]);
    expect(result.dayData.get('2026-10-21')!.habitsCompleted.map(h => h.id)).toEqual([5]);
    expect(result.dayData.get('2026-10-22')!.tasksDue.map(t => t.id)).toEqual([2]);
    expect(result.dayData.has('2024-03-04')).toBe(false);
  });

  it('loads a past year by range, showing its tasks while its habits load', async () => {
    await render();
    let resolve!: (a: CalendarActivity) => void;
    mocks.fetchCalendarActivity.mockImplementationOnce(() => new Promise(r => { resolve = r; }));

    await render(2024);
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2024-01-01', '2024-12-31');
    expect(result.loading).toBe(false);
    expect(result.yearLoading).toBe(true);
    expect(result.dayData.get('2024-03-04')!.tasksDue.map(t => t.id)).toEqual([1]);
    expect(result.dayData.get('2024-03-04')!.habitsCompleted).toEqual([]);
    expect(result.dayData.has('2026-10-22')).toBe(false);

    await act(async () => resolve(activity('2024-01-01', '2024-12-31', [
      { habit_id: 5, habit_title: 'Run', date: '2024-03-04', estimated_time: 0.5 },
    ])));
    expect(result.yearLoading).toBe(false);
    expect(result.dayData.get('2024-03-04')!.habitsCompleted.map(h => h.id)).toEqual([5]);
    expect(result.dayData.get('2024-03-04')!.estimatedHours).toBe(2.5);
  });

  it('loads a future year too', async () => {
    await render(2028);
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2028-01-01', '2028-12-31');
    expect(result.yearLoading).toBe(false);
    expect(result.dayData.has('2026-10-21')).toBe(false);
  });
});
