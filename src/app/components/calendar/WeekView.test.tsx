// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { BaseTaskForm, Task } from '@/app/types/task';
import { LinkedTasksSaveError } from '@/app/utils/linkedTasks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  tasks: [] as Task[],
  addTask: vi.fn(),
  updateTask: vi.fn(),
  saveLinkedTasks: vi.fn(),
  fetchCalendarActivity: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/app/lib/backend-api', () => ({
  fetchCalendarActivity: mocks.fetchCalendarActivity,
  fetchHabitHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({
    tasks: mocks.tasks, addTask: mocks.addTask, updateTask: mocks.updateTask,
    saveLinkedTasks: mocks.saveLinkedTasks, completionSyncToken: 0,
  }),
}));
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ tags: [] }) }));
vi.mock('@/app/context/HabitsContext', () => ({
  useHabitsContext: () => ({ habits: [{ id: 5, title: 'Run' }], toggleDate: vi.fn() }),
}));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('@/app/context/NotificationsContextValue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/context/NotificationsContextValue')>()),
  useOptionalNotifications: () => ({ status: 'ready', preferences: { default_reminder_minutes: 60 } }),
}));

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

const render = async (props: React.ComponentProps<typeof WeekView> = {}) => {
  await act(async () => root.render(<WeekView {...props} />));
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
  mocks.updateTask.mockReset();
  mocks.saveLinkedTasks.mockReset();
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

// Each test renders the full 24-hour week grid in jsdom, which takes a few
// seconds on its own and well past vitest's 5s default when the full suite
// runs in parallel on a loaded machine.
describe('WeekView', { timeout: 30_000 }, () => {
  it('keeps the hour grid at its own height, or fills the parent with fill', async () => {
    const grid = () => container.querySelector<HTMLElement>('.overflow-auto.rounded-xl')!;
    await render();
    expect(grid().style.height).not.toBe('');
    expect(grid().classList.contains('flex-1')).toBe(false);

    await render({ fill: true });
    expect((container.firstElementChild as HTMLElement).classList.contains('h-full')).toBe(true);
    expect(grid().style.height).toBe('');
    expect(grid().classList.contains('flex-1')).toBe(true);
    expect(grid().classList.contains('min-h-0')).toBe(true);
  });

  it('colors each legend kind with its own week color', async () => {
    await render();
    const swatches = [...container.querySelectorAll<HTMLElement>('ul[aria-label="Legend"] li span')];
    expect(swatches.map(s => s.parentElement!.textContent)).toEqual(['Planned task', 'Completed', 'Note session', 'Habit']);
    expect(swatches.map(s => s.style.backgroundColor)).toEqual([
      'var(--tm-week-task)', 'var(--tm-week-completed)', 'var(--tm-week-note)', 'var(--tm-week-habit)',
    ]);
  });

  it('has no resize handle unless the parent takes the height', async () => {
    await render();
    expect(container.querySelector('.cursor-row-resize')).toBeNull();
    expect((container.firstElementChild as HTMLElement).style.minHeight).toBe('');
  });

  it('drags taller from the handle, with the bottom edge at the pointer', async () => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    await render({ heightPx: 900, onResize, onResizeEnd });
    expect((container.firstElementChild as HTMLElement).style.minHeight).toBe('900px');
    // The default grid keeps its height and grows into a taller box.
    expect(container.querySelector('.overflow-auto.rounded-xl')!.classList.contains('grow')).toBe(true);

    await act(async () => {
      container.querySelector('.cursor-row-resize')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: 1100 }));
    });
    // 1100 pointer − 100 top + half the handle.
    expect(onResize).toHaveBeenLastCalledWith(1004);
    expect(onResizeEnd).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: 9000 }));
      document.dispatchEvent(new PointerEvent('pointerup'));
    });
    expect(onResize).toHaveBeenLastCalledWith(2400);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
  });

  it('drags taller with a finger on a touch screen', async () => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    await render({ heightPx: 900, onResize, onResizeEnd });
    const handle = container.querySelector<HTMLElement>('.cursor-row-resize')!;
    expect(handle.classList.contains('touch-none')).toBe(true);

    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7 }));
      document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', pointerId: 7, clientY: 1200 }));
      document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', pointerId: 8, clientY: 1500 }));
      document.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 8 }));
    });
    expect(onResize).toHaveBeenLastCalledWith(1104);
    expect(onResizeEnd).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', pointerId: 7 }));
    });
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
  });

  it('loads the Monday–Sunday week containing today and plots its activity', async () => {
    mocks.tasks = [task({ id: 3, title: 'Essay', due_date: '2026-10-22', due_time: '14:00', estimated_time: 1 })];
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-10-19', '2026-10-25');
    expect(button('Planned task: Essay, 2:00 PM – 3:00 PM')).toBeTruthy();
    expect(button('Note session: Lecture notes, 9:00 AM – 10:00 AM, 1 hr worked')).toBeTruthy();
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

  it('pages across the new year without stopping, naming both years on the spanning week', async () => {
    vi.setSystemTime(new Date(2026, 11, 30, 12, 0)); // Wed 30 Dec 2026
    await render();
    const heading = () => container.querySelector('h2')!.textContent;
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2026-12-28', '2027-01-03');
    expect(heading()).toBe('Dec 28, 2026 – Jan 3, 2027');
    await act(async () => button('Next week').click());
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2027-01-04', '2027-01-10');
    expect(heading()).toBe('Jan 4–10, 2027');
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

  it('creates a task with linked tasks, and keeps the modal open to retry when they fail to save', async () => {
    mocks.tasks = [task({ id: 7, title: 'Read the posting' })];
    await render();
    await act(async () => button('Create task on Thursday, October 22 at 9:30 AM').click());
    const created = task({ id: 99, title: 'Apply' });
    mocks.addTask.mockResolvedValue(created);
    mocks.updateTask.mockResolvedValue(true);
    mocks.saveLinkedTasks
      .mockRejectedValueOnce(new LinkedTasksSaveError(created, 'Something went wrong. Please try again.'))
      .mockResolvedValueOnce(undefined);

    const d = container.ownerDocument;
    const setValue = async (input: HTMLInputElement, value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await setValue(d.querySelector<HTMLInputElement>('input[placeholder="Enter task title"]')!, 'Apply');
    const newTitle = d.querySelector<HTMLInputElement>('input[aria-labelledby="linked-new-label"]')!;
    await setValue(newTitle, 'Draft cover letter');
    await act(async () => { newTitle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const submit = () => act(async () => {
      d.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await submit();
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
    expect(mocks.saveLinkedTasks).toHaveBeenCalledWith(created, [{ title: 'Draft cover letter' }]);
    expect(d.querySelector('[role="alert"]')?.textContent).toContain("The task was created, but its linked tasks weren't saved");

    const reminder = d.querySelector<HTMLSelectElement>('select[aria-labelledby="remind-me-label"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(reminder, '15');
      reminder.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await submit();
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
    expect(mocks.updateTask).toHaveBeenCalledWith(
      99, expect.objectContaining({ title: 'Apply', due_date: '2026-10-22', reminder_minutes: 15 }),
    );
    expect(mocks.saveLinkedTasks).toHaveBeenCalledTimes(2);
    expect(d.querySelector('form')).toBeNull();
  });

  it('opens a note session in the notes page', async () => {
    await render();
    await act(async () => button('Note session: Lecture notes, 9:00 AM – 10:00 AM, 1 hr worked').click());
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
