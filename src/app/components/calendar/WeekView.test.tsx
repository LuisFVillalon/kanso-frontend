// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { BaseTaskForm, Task } from '@/app/types/task';
import { LinkedTasksSaveError } from '@/app/utils/linkedTasks';
import { AppShellContext, type AppShellValue } from '@/app/context/AppShellContext';
import type { ProfileFields } from '@/app/hooks/useProfile';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { CLASS_TAG } = vi.hoisted(() => ({ CLASS_TAG: { id: 4, name: 'CS 460', color: '#3b82f6' } }));

const mocks = vi.hoisted(() => ({
  tasks: [] as Task[],
  addTask: vi.fn(),
  updateTask: vi.fn(),
  saveLinkedTasks: vi.fn(),
  fetchCalendarActivity: vi.fn(),
  fetchEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventArchived: vi.fn(),
  deleteEvent: vi.fn(),
  restoreEvent: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/app/lib/backend-api', () => ({
  fetchCalendarActivity: mocks.fetchCalendarActivity,
  fetchHabitHistory: vi.fn().mockResolvedValue([]),
  fetchEvent: mocks.fetchEvent,
  createEvent: mocks.createEvent,
  updateEvent: mocks.updateEvent,
  setEventArchived: mocks.setEventArchived,
  deleteEvent: mocks.deleteEvent,
  restoreEvent: mocks.restoreEvent,
  describeError: (_err: unknown, fallback: string) => fallback,
}));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({
    tasks: mocks.tasks, addTask: mocks.addTask, updateTask: mocks.updateTask,
    saveLinkedTasks: mocks.saveLinkedTasks, completionSyncToken: 0,
  }),
}));
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ tags: [CLASS_TAG] }) }));
vi.mock('@/app/context/HabitsContext', () => ({
  useHabitsContext: () => ({ habits: [{ id: 5, title: 'Run' }], toggleDate: vi.fn() }),
}));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('@/app/context/NotificationsContextValue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/context/NotificationsContextValue')>()),
  useOptionalNotifications: () => ({ status: 'ready', preferences: { default_reminder_minutes: 60 } }),
}));

import WeekView from './WeekView';
import type { CalendarEvent, EventOccurrence } from '@/app/types/event';

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

/** The UTC instant of a local day and "HH:MM:SS" time. */
const instant = (date: string, time: string | null) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
};

/** A Mon/Wed/Fri lecture occurrence, 2:00–2:50 PM on Wed Oct 21 (later than the tests' noon) unless overridden. */
const occurrence = (overrides: Partial<EventOccurrence> = {}): EventOccurrence => {
  const o: EventOccurrence = {
    event_id: 30, occurrence_date: '2026-10-21', title: 'CS 460 Lecture', description: 'Room 201', tags: [CLASS_TAG],
    all_day: false, date: '2026-10-21', end_date: '2026-10-21', start_time: '14:00:00', end_time: '14:50:00',
    starts_at: '', ends_at: '',
    time_zone: 'America/Los_Angeles', repeat_days: [1, 3, 5], repeat_interval: 1, reminder_minutes: null,
    edited: false, past: false, archived: false, ...overrides,
  };
  return {
    ...o,
    starts_at: overrides.starts_at ?? instant(o.date, o.start_time),
    ends_at: overrides.ends_at ?? (o.all_day ? instant(o.end_date, null) : instant(o.end_date, o.end_time)),
  };
};

const series = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 30, title: 'CS 460 Lecture', description: 'Room 201', tags: [CLASS_TAG], all_day: false,
  start_date: '2026-08-24', end_date: '2026-12-11', start_time: '14:00:00', end_time: '14:50:00',
  time_zone: 'America/Los_Angeles', repeat_days: [1, 3, 5], repeat_interval: 1, reminder_minutes: null,
  split_from_id: null, created_date: '2026-08-01T00:00:00Z', archived_at: null, deleted_at: null, ...overrides,
});

/** The week's activity with these events added. */
const withEvents = (events: EventOccurrence[]) =>
  mocks.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({ ...activityFor(start, end), events }));

const setInput = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

/** A button anywhere in the document (popovers and modals are portaled to <body>) whose text is `text`. */
const buttonByText = (text: string): HTMLButtonElement => {
  const el = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text);
  if (!el) throw new Error(`No button reading "${text}"`);
  return el;
};

const dialog = (label: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`);

type Schedule = Pick<ProfileFields, 'dayStartTime' | 'shutoffTime' | 'restDays'> & Partial<Pick<ProfileFields, 'dayWindows'>>;

const DEFAULT_SCHEDULE: Schedule = { dayStartTime: '08:00', shutoffTime: '22:00', restDays: [0, 6] };

/** WeekView inside an app shell whose profile carries this work schedule. */
const renderWithSchedule = async (schedule: Schedule, props: React.ComponentProps<typeof WeekView> = {}) => {
  const shell = { profileState: { profile: schedule } } as unknown as AppShellValue;
  await act(async () => root.render(<AppShellContext.Provider value={shell}><WeekView {...props} /></AppShellContext.Provider>));
};

const render = (props: React.ComponentProps<typeof WeekView> = {}) => renderWithSchedule(DEFAULT_SCHEDULE, props);

/** Each day header's screen-reader description of its work schedule, Sunday first. */
const daySchedules = () => [...container.querySelectorAll('.sr-only')]
  .map(el => el.textContent)
  .filter(text => /^(Work|Rest) day/.test(text ?? ''));

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
  for (const fn of [mocks.fetchEvent, mocks.createEvent, mocks.updateEvent, mocks.setEventArchived, mocks.deleteEvent, mocks.restoreEvent]) {
    fn.mockReset().mockResolvedValue(series());
  }
  localStorage.clear();
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
    const swatches = [...container.querySelectorAll<HTMLElement>('ul[aria-label="Legend"] li span')].slice(0, 4);
    expect(swatches.map(s => s.parentElement!.textContent)).toEqual(['Planned task', 'Completed', 'Note session', 'Habit']);
    expect(swatches.map(s => s.style.backgroundColor)).toEqual([
      'var(--tm-week-task)', 'var(--tm-week-completed)', 'var(--tm-week-note)', 'var(--tm-week-habit)',
    ]);
  });

  it('shows rest days and when the work window opens and closes', async () => {
    await render();
    // Weekends off, 8 AM to 10 PM.
    expect(daySchedules()).toEqual([
      'Rest day',
      ...Array(5).fill('Work day, work window opens at 8:00 AM, closes at 10:00 PM'),
      'Rest day',
    ]);
    const columns = [...container.querySelectorAll<HTMLElement>('[data-rest-day]')];
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelectorAll('[data-window-edge]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-window-edge="opens"]')).toHaveLength(5);
    expect([...container.querySelectorAll('[data-window-edge]')].slice(0, 2).map(e => e.textContent)).toEqual(['Opens 8:00 AM', 'Closes 10:00 PM']);
    const legend = [...container.querySelectorAll('ul[aria-label="Legend"] li')].map(li => li.textContent);
    expect(legend.slice(4)).toEqual(['Event (tag color)', 'Past', 'Archived', 'Clash', 'Outside work hours', 'Rest day']);

    await renderWithSchedule({ dayStartTime: '09:30', shutoffTime: '17:00', restDays: [3] });
    expect(daySchedules()[3]).toBe('Rest day');
    expect(daySchedules()[0]).toBe('Work day, work window opens at 9:30 AM, closes at 5:00 PM');
  });

  it("follows the app shell profile's work schedule as it changes", async () => {
    await renderWithSchedule({ dayStartTime: '08:00', shutoffTime: '22:00', restDays: [0, 6] });
    expect(container.querySelectorAll('[data-rest-day]')).toHaveLength(2);

    await renderWithSchedule({ dayStartTime: '18:00', shutoffTime: '02:00', restDays: [1] });
    expect(daySchedules()).toEqual([
      'Work day, work window closes at 2:00 AM, opens at 6:00 PM',
      'Rest day, work window closes at 2:00 AM',
      'Work day, work window opens at 6:00 PM',
      ...Array(4).fill('Work day, work window closes at 2:00 AM, opens at 6:00 PM'),
    ]);
    expect(container.querySelectorAll('[data-rest-day]')).toHaveLength(1);
  });

  it("opens and closes each day at that day's own window", async () => {
    await renderWithSchedule({
      dayStartTime: '08:00', shutoffTime: '22:00', restDays: [0, 6],
      dayWindows: { '1': { start: '10:00', end: '16:00' }, '5': { start: '09:00', end: '13:00' } },
    });
    expect(daySchedules()).toEqual([
      'Rest day',
      'Work day, work window opens at 10:00 AM, closes at 4:00 PM',
      ...Array(3).fill('Work day, work window opens at 8:00 AM, closes at 10:00 PM'),
      'Work day, work window opens at 9:00 AM, closes at 1:00 PM',
      'Rest day',
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

  it('loads the Sunday–Saturday week containing today and plots its activity', async () => {
    mocks.tasks = [task({ id: 3, title: 'Essay', due_date: '2026-10-22', due_time: '14:00', estimated_time: 1 })];
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-10-18', '2026-10-24');
    expect(button('Planned task: Essay, 2:00 PM – 3:00 PM')).toBeTruthy();
    expect(button('Note session: Lecture notes, 9:00 AM – 10:00 AM, 1 hr worked')).toBeTruthy();
    expect(button('Habit completed: Run')).toBeTruthy();
  });

  it('pages to the next week and back to today', async () => {
    await render();
    await act(async () => button('Next week').click());
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2026-10-25', '2026-10-31');
    expect(container.querySelector('button[aria-label^="Note session"]')).toBeNull();
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Today')!.click());
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2026-10-18', '2026-10-24');
  });

  it('pages across the new year without stopping, naming both years on the spanning week', async () => {
    vi.setSystemTime(new Date(2026, 11, 30, 12, 0)); // Wed 30 Dec 2026
    await render();
    const heading = () => container.querySelector('h2')!.textContent;
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2026-12-27', '2027-01-02');
    expect(heading()).toBe('Dec 27, 2026 – Jan 2, 2027');
    await act(async () => button('Next week').click());
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2027-01-03', '2027-01-09');
    expect(heading()).toBe('Jan 3–9, 2027');
  });

  it('opens a task quick-add on a clicked slot, and saves the task at that time', async () => {
    await render();
    await act(async () => button('Add a task or event on Thursday, October 22 at 9:30 AM').click());
    const quick = dialog('New task')!;
    expect(quick.textContent).toContain('Thu, Oct 22 · due 9:30 AM · 30 min estimate');
    expect(quick.querySelector('[aria-pressed="true"]')!.textContent).toContain('Task');
    // The slot's range stays highlighted while the quick-add is open.
    expect(container.querySelector('[data-grid-selection]')!.textContent).toBe('9:30 AM – 10:00 AM');

    mocks.addTask.mockResolvedValue(task({ id: 99 }));
    await setInput(quick.querySelector<HTMLInputElement>('input[name="quick-title"]')!, 'Pick up prescription');
    await act(async () => buttonByText('Save').click());
    expect(mocks.addTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Pick up prescription', due_date: '2026-10-22', due_time: '09:30', estimated_time: 0.5,
    }));
    expect(dialog('New task')).toBeNull();
  });

  it('opens the New Task modal from the quick-add prefilled with the clicked slot and creates the task there', async () => {
    await render();
    await act(async () => button('Add a task or event on Thursday, October 22 at 9:30 AM').click());
    await act(async () => buttonByText('More options').click());
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
    await act(async () => button('Add a task or event on Thursday, October 22 at 9:30 AM').click());
    await act(async () => buttonByText('More options').click());
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
    expect(mocks.saveLinkedTasks).toHaveBeenCalledWith(created, [expect.objectContaining({ title: 'Draft cover letter' })]);
    expect(d.querySelector('[role="alert"]')?.textContent).toContain("The task was created, but its linked tasks weren't saved");

    // The task's own reminder: the first "Remind me" on the form (the new linked task has its own below).
    const remindLabel = [...d.querySelectorAll('label')].find(l => l.textContent === 'Remind me')!;
    const reminder = d.querySelector<HTMLSelectElement>(`select[aria-labelledby="${remindLabel.id}"]`)!;
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
    expect(start.getAttribute('aria-label')).toBe('Add a task or event on Wednesday, October 21 at 10:30 AM');
    await act(async () => {
      start.focus();
      start.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await act(async () => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add a task or event on Thursday, October 22 at 11:00 AM');
    expect(tabbable()).toHaveLength(1);
  });
  describe('events', () => {
    it('draws events in their tag color beside tasks, past and archived ones styled, and marks a task during one', async () => {
      mocks.tasks = [task({ id: 3, title: 'Review notes', due_date: '2026-10-21', due_time: '14:30', estimated_time: 1 })];
      withEvents([
        occurrence({ occurrence_date: '2026-10-19', date: '2026-10-19', end_date: '2026-10-19', past: true }),
        occurrence({ occurrence_date: '2026-10-20', date: '2026-10-20', end_date: '2026-10-20', past: true, archived: true, title: 'PSY 101', repeat_days: [] }),
        occurrence(),
      ]);
      await render();
      const block = button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM');
      expect(block.style.borderLeft).toBe('3px solid rgb(59, 130, 246)');
      expect(block.style.backgroundColor).toContain('#3b82f6 20%');
      expect(button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM, past').style.opacity).toBe('0.78');
      const archived = button('Event: PSY 101, 2:00 PM – 2:50 PM, archived');
      expect(archived.style.borderLeft).toBe('3px dashed rgb(59, 130, 246)');
      expect(archived.querySelector('.line-through')!.textContent).toBe('PSY 101');
      // The task planned during the live lecture gets the clash ring; it sits beside the event, not under it.
      const clashing = button('Planned task: Review notes, 2:30 PM – 3:30 PM, during CS 460 Lecture');
      expect(clashing.style.outline).toBe('2px solid var(--tm-warning)');
      expect(clashing.style.width).toBe('calc(50% - 4px)');
    });

    it('splits an event that runs past midnight across both days, and puts all-day events in the all-day row', async () => {
      withEvents([
        occurrence({
          event_id: 31, title: 'Night shift', repeat_days: [], date: '2026-10-22', end_date: '2026-10-23',
          occurrence_date: '2026-10-22', start_time: '22:00:00', end_time: '02:00:00',
        }),
        occurrence({ event_id: 32, title: 'MATH midterm', all_day: true, start_time: null, end_time: null, repeat_days: [], date: '2026-10-23', end_date: '2026-10-23', occurrence_date: '2026-10-23' }),
      ]);
      await render();
      const pieces = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Event: Night shift"]')];
      expect(pieces.map(p => p.getAttribute('aria-label'))).toEqual([
        'Event: Night shift, 10:00 PM – 2:00 AM, runs past midnight',
        'Event: Night shift, 10:00 PM – 2:00 AM, from the day before',
      ]);
      expect(pieces.map(p => p.closest('[data-day-column]')!.getAttribute('data-day-column'))).toEqual(['4', '5']);
      expect(pieces[1].textContent).toContain('Until 2:00 AM');
      expect(button('Event: MATH midterm, all day')).toBeTruthy();
    });

    it('drags out a range to make an event there, repeating weekly until the end of term', async () => {
      const shell = {
        profileState: { profile: DEFAULT_SCHEDULE },
        calendarSettingsState: { calendarSettings: { id: 1, title: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' } },
      } as unknown as AppShellValue;
      await act(async () => root.render(<AppShellContext.Provider value={shell}><WeekView /></AppShellContext.Provider>));

      // Fri the 23rd, 4:00 PM down to 5:30 PM (48 px an hour, the column's top at 0 in jsdom).
      const slot = button('Add a task or event on Friday, October 23 at 4:00 PM');
      await act(async () => {
        slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientY: 16 * 48 + 5 }));
        window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientY: 17 * 48 }));
        window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientY: 17.5 * 48 }));
        window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', clientY: 17.5 * 48 }));
      });
      const quick = dialog('New event')!;
      expect(quick).toBeTruthy();
      expect(quick.textContent).toContain('Fri, Oct 23 · 4:00 PM – 5:30 PM');
      expect(quick.textContent).toContain('Repeat every Friday until Dec 11');

      await setInput(quick.querySelector<HTMLInputElement>('input[name="quick-title"]')!, 'Hike prep');
      await act(async () => buttonByText('CS 460').click());
      await act(async () => quick.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      const fetchesBefore = mocks.fetchCalendarActivity.mock.calls.length;
      await act(async () => buttonByText('Save').click());
      expect(mocks.createEvent).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Hike prep', tags: [{ name: 'CS 460', color: '#3b82f6' }], all_day: false,
        start_date: '2026-10-23', end_date: '2026-12-11', start_time: '16:00', end_time: '17:30',
        repeat_days: [5], repeat_interval: 1, reminder_minutes: null,
      }));
      // The week reloads to show it.
      expect(mocks.fetchCalendarActivity.mock.calls.length).toBeGreaterThan(fetchesBefore);
    });

    it('opens the quick-add from a slot after a drag that ended elsewhere', async () => {
      await render();
      const slot = button('Add a task or event on Friday, October 23 at 4:00 PM');
      await act(async () => {
        slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientY: 16 * 48 + 5 }));
        window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientY: 17 * 48 }));
        window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', clientY: 17 * 48 }));
      });
      expect(dialog('New event')).toBeTruthy();
      await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      expect(dialog('New event')).toBeNull();
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

      // Enter on a focused button fires its click, with no pointerdown first.
      await act(async () => slot.click());
      expect(dialog('New task')).toBeTruthy();
    });

    it("switches a click's quick-add to an event", async () => {
      await render();
      await act(async () => button('Add a task or event on Thursday, October 22 at 9:30 AM').click());
      await act(async () => buttonByText('Event').click());
      const quick = dialog('New event')!;
      await setInput(quick.querySelector<HTMLInputElement>('input[name="quick-title"]')!, 'Office hours');
      await act(async () => buttonByText('Save').click());
      expect(mocks.addTask).not.toHaveBeenCalled();
      expect(mocks.createEvent).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Office hours', start_date: '2026-10-22', start_time: '09:30', end_time: '10:00', repeat_days: [],
      }));
    });

    it('opens an event card, and deletes just this occurrence of a repeating event', async () => {
      withEvents([occurrence()]);
      await render();
      await act(async () => button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM').click());
      const card = dialog('Event: CS 460 Lecture')!;
      expect(card.textContent).toContain('Wednesday, October 21 · 2:00 PM – 2:50 PM');
      expect(card.textContent).toContain('Weekly on Mon, Wed and Fri');
      expect(card.textContent).toContain('Room 201');

      await act(async () => buttonByText('Delete').click());
      expect(document.body.textContent).toContain('Delete repeating event');
      expect(document.querySelector<HTMLInputElement>('input[value="this"]')!.checked).toBe(true);
      await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find(b => b.textContent === 'Delete')!.click());
      expect(mocks.deleteEvent).toHaveBeenCalledWith(30, 'this', '2026-10-21');
    });

    it('archives this and following occurrences by default from the card', async () => {
      withEvents([occurrence()]);
      await render();
      await act(async () => button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM').click());
      await act(async () => buttonByText('Archive').click());
      expect(document.querySelector<HTMLInputElement>('input[value="following"]')!.checked).toBe(true);
      await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find(b => b.textContent === 'Archive')!.click());
      expect(mocks.setEventArchived).toHaveBeenCalledWith(30, true, 'following', '2026-10-21');
    });

    it('restores an archived occurrence, the whole series when the series was archived', async () => {
      withEvents([occurrence({ past: true, archived: true })]);
      mocks.fetchEvent.mockResolvedValue(series({ archived_at: '2026-10-22T00:00:00Z' }));
      await render();
      await act(async () => button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM, archived').click());
      await act(async () => buttonByText('Restore').click());
      expect(mocks.setEventArchived).toHaveBeenCalledWith(30, false, 'all');
    });

    it('edits a repeating event, asking which occurrences the change is for', async () => {
      withEvents([occurrence()]);
      await render();
      await act(async () => button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM').click());
      await act(async () => buttonByText('Edit').click());
      expect(mocks.fetchEvent).toHaveBeenCalledWith(30);
      const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. CS 460 Lecture"]')!;
      expect(title.value).toBe('CS 460 Lecture');
      expect(document.body.textContent).toContain('Every Mon, Wed and Fri · 2:00 PM – 2:50 PM · Aug 24 – Dec 11');

      await setInput(title, 'CS 460 Midterm');
      await act(async () => {
        document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(document.body.textContent).toContain('Save repeating event');
      await act(async () => document.querySelector<HTMLInputElement>('input[value="all"]')!.click());
      await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find(b => b.textContent === 'Save' && b.type === 'button')!.click());
      expect(mocks.updateEvent).toHaveBeenCalledWith(30, { title: 'CS 460 Midterm' }, 'all', '2026-10-21');
    });

    it('only lets a change to how it repeats apply to this and following, or all', async () => {
      withEvents([occurrence()]);
      await render();
      await act(async () => button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM').click());
      await act(async () => buttonByText('Edit').click());
      await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Tuesday"]')!.click());
      await act(async () => {
        document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(document.querySelector<HTMLInputElement>('input[value="this"]')!.disabled).toBe(true);
      expect(document.querySelector<HTMLInputElement>('input[value="following"]')!.checked).toBe(true);
      await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find(b => b.textContent === 'Save' && b.type === 'button')!.click());
      expect(mocks.updateEvent).toHaveBeenCalledWith(30, { repeat_days: [1, 2, 3, 5] }, 'following', '2026-10-21');
    });
  });
});
