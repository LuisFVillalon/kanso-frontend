// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { BaseTaskForm, Task } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  tasks: [] as Task[],
  addTask: vi.fn(),
  updateTask: vi.fn(),
  fetchCalendarActivity: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/app/lib/backend-api', () => ({
  fetchCalendarActivity: mocks.fetchCalendarActivity,
  fetchHabitHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({ tasks: mocks.tasks, addTask: mocks.addTask, updateTask: mocks.updateTask, completionSyncToken: 0 }),
}));
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ tags: [] }) }));
vi.mock('@/app/context/HabitsContext', () => ({
  useHabitsContext: () => ({ habits: [{ id: 5, title: 'Run' }], toggleDate: vi.fn() }),
}));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import WeekView from './WeekView';

let container: HTMLDivElement;
let root: Root;

const task = (overrides: Partial<Task>): Task => ({
  id: 1, title: 'Task', description: '', completed: false, priority: null,
  due_date: null, due_time: null, tags: [], created_date: '2026-10-01T00:00:00',
  completed_date: null, estimated_time: null, ...overrides,
});

const activityFor = (start: string, end: string): CalendarActivity => ({
  start_date: start,
  end_date: end,
  scheduled_tasks: [],
  completed_tasks: [],
  note_sessions: [{
    id: 1, note_id: 42, note_title: 'Lecture notes', duration_seconds: 3600,
    started_at: new Date(2026, 9, 20, 9, 0).toISOString(),
    ended_at: new Date(2026, 9, 20, 10, 0).toISOString(),
  }],
  habit_completions: [{ habit_id: 5, habit_title: 'Run', date: '2026-10-21', estimated_time: null }],
});

const render = async () => {
  await act(async () => root.render(<WeekView />));
};

const button = (label: string): HTMLButtonElement => {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!el) throw new Error(`No button labelled "${label}"`);
  return el;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0)); // Wed 21 Oct 2026
  mocks.tasks = [];
  mocks.addTask.mockReset();
  mocks.push.mockReset();
  mocks.fetchCalendarActivity.mockReset().mockImplementation(async (start: string, end: string) => activityFor(start, end));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('WeekView', () => {
  it('loads the Monday–Sunday week containing today and plots its activity', async () => {
    mocks.tasks = [task({ id: 3, title: 'Essay', due_date: '2026-10-22', due_time: '14:00', estimated_time: 1 })];
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-10-19', '2026-10-25');
    expect(button('Planned task: Essay, 2:00 PM – 3:00 PM')).toBeTruthy();
    expect(button('Note session: Lecture notes, 9:00 AM – 10:00 AM')).toBeTruthy();
    expect(button('Habit completed: Run')).toBeTruthy();
  });

  it('pages to the next week and back to today', async () => {
    await render();
    await act(async () => button('Next week').click());
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2026-10-26', '2026-11-01');
    expect(container.querySelector('button[aria-label^="Note session"]')).toBeNull();
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Today')!.click());
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2026-10-19', '2026-10-25');
  });

  it('opens the New Task modal prefilled with the clicked slot and creates the task there', async () => {
    await render();
    await act(async () => button('Create task on Thursday, October 22 at 9:30 AM').click());
    const inputs = [...container.ownerDocument.querySelectorAll<HTMLInputElement>('input[type=date], input[type=time]')];
    expect(inputs.map(i => i.value)).toEqual(['2026-10-22', '09:30']);

    mocks.addTask.mockImplementation(async (form: BaseTaskForm) => {
      const created = task({ ...form, id: 99 } as Partial<Task>);
      mocks.tasks = [created, ...mocks.tasks];
      return created;
    });
    const title = container.ownerDocument.querySelector<HTMLInputElement>('input[placeholder="Enter task title"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Study group');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.ownerDocument.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mocks.addTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Study group', due_date: '2026-10-22', due_time: '09:30' }));
    await render();
    expect(button('Planned task: Study group, 9:30 AM – 10:00 AM')).toBeTruthy();
  });

  it('opens a note session in the notes page', async () => {
    await render();
    await act(async () => button('Note session: Lecture notes, 9:00 AM – 10:00 AM').click());
    expect(mocks.push).toHaveBeenCalledWith('/notes?id=42');
  });

  it('moves the single tabbable slot with the arrow keys', async () => {
    await render();
    const tabbable = () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-describedby]')].filter(b => b.tabIndex === 0);
    expect(tabbable()).toHaveLength(1);
    const start = tabbable()[0];
    expect(start.getAttribute('aria-label')).toBe('Create task on Wednesday, October 21 at 10:30 AM');
    await act(async () => {
      start.focus();
      start.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await act(async () => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Create task on Thursday, October 22 at 11:00 AM');
    expect(tabbable()).toHaveLength(1);
  });
});
