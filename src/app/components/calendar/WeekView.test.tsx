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
  taskEditSyncToken: 0,
  tagSyncToken: 0,
  habitEditSyncToken: 0,
  noteTagSyncToken: 0,
  fetchCalendarActivity: vi.fn(),
  fetchEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventArchived: vi.fn(),
  deleteEvent: vi.fn(),
  restoreEvent: vi.fn(),
  updateGoogleEventTags: vi.fn(),
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
  updateGoogleEventTags: mocks.updateGoogleEventTags,
  describeError: (_err: unknown, fallback: string) => fallback,
}));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({
    tasks: mocks.tasks, addTask: mocks.addTask, updateTask: mocks.updateTask,
    saveLinkedTasks: mocks.saveLinkedTasks, completionSyncToken: 0, taskEditSyncToken: mocks.taskEditSyncToken,
  }),
}));
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ tags: [CLASS_TAG], tagSyncToken: mocks.tagSyncToken }) }));
vi.mock('@/app/context/HabitsContext', () => ({
  useHabitsContext: () => ({ habits: [{ id: 5, title: 'Run' }], toggleDate: vi.fn(), editSyncToken: mocks.habitEditSyncToken }),
}));
vi.mock('@/app/context/NotesContext', () => ({ useNotesContext: () => ({ tagSyncToken: mocks.noteTagSyncToken }) }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('@/app/context/NotificationsContextValue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/context/NotificationsContextValue')>()),
  useOptionalNotifications: () => ({ status: 'ready', preferences: { default_reminder_minutes: 60 } }),
}));

import WeekView from './WeekView';
import { WEEK_LEGEND } from './WeekGrid';
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
  mocks.taskEditSyncToken = 0;
  mocks.tagSyncToken = 0;
  mocks.habitEditSyncToken = 0;
  mocks.noteTagSyncToken = 0;
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

  it('has one tag-color entry in the legend instead of an entry per kind', async () => {
    await render();
    const legend = [...container.querySelectorAll('ul[aria-label="Legend"] li')].map(li => li.textContent);
    expect(legend).toEqual(['Colored by tag', 'Past event', 'Archived', 'Clash', 'Outside work hours or rest day']);
  });

  it('colors tasks, notes and habits by their first tag, and untagged ones like an untagged event', async () => {
    const red = { id: 1, name: 'Red', color: '#ef4444' };
    const green = { id: 2, name: 'Green', color: '#22c55e' };
    mocks.tasks = [
      task({ id: 1, title: 'Tagged', due_date: '2026-10-21', due_time: '09:00:00', tags: [red, green] }),
      task({ id: 2, title: 'Plain', due_date: '2026-10-22', due_time: '09:00:00' }),
    ];
    mocks.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      ...activityFor(start, end),
      notes: [{ id: 42, title: 'Lecture notes', tags: [green] }],
      habits: [{ id: 5, title: 'Run', estimated_time: null, tags: [red] }],
    }));
    await render();
    const styleOf = (label: string) => container.querySelector<HTMLElement>(`[aria-label^="${label}"]`)!.getAttribute('style')!;
    expect(styleOf('Planned task: Tagged')).toContain('#ef4444');
    expect(styleOf('Planned task: Plain')).toContain('var(--tm-pencil)');
    expect(styleOf('Note session: Lecture notes')).toContain('#22c55e');
    expect(styleOf('Habit completed: Run')).toContain('#ef4444');
  });

  it.each(['taskEditSyncToken', 'tagSyncToken', 'habitEditSyncToken', 'noteTagSyncToken'] as const)('recolors a completed block after a saved tag change (%s)', async token => {
    const completedIn = (color: string) => async (start: string, end: string) => ({
      ...activityFor(start, end),
      completed_tasks: [{
        id: 1, title: 'Read', completed_date: new Date(2026, 9, 20, 9, 0).toISOString(),
        tags: [{ id: 1, name: 'Tag', color }],
      }],
    });
    const completedStyle = () => container.querySelector('[aria-label^="Completed task: Read"]')!.getAttribute('style')!;

    mocks.fetchCalendarActivity.mockImplementation(completedIn('#ef4444'));
    await render();
    expect(completedStyle()).toContain('#ef4444');

    mocks.fetchCalendarActivity.mockImplementation(completedIn('#22c55e'));
    mocks[token] = 1;
    await render();
    expect(completedStyle()).toContain('#22c55e');
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
    const offHours = [...container.querySelectorAll<HTMLElement>('[data-off-hours]')].map(e => e.style.background);
    expect(offHours.length).toBeGreaterThan(columns.length);
    expect(new Set(offHours).size).toBe(1);
    expect(WEEK_LEGEND.at(-1)?.swatch.background).toBe(offHours[0]);

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
    const newEventButton = () => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'New event');
    const eventFormTimes = () => [...document.querySelectorAll<HTMLInputElement>('input[type=date], input[type=time]')].map(i => i.value);

    it('opens New event today from the next full hour, or on a browsed week at its first day and the day start', async () => {
      await render();
      await act(async () => newEventButton()!.click());
      expect(eventFormTimes()).toEqual(['2026-10-21', '13:00', '14:00']);
      await act(async () => buttonByText('Cancel').click());

      await act(async () => button('Next week').click());
      await act(async () => newEventButton()!.click());
      expect(eventFormTimes()).toEqual(['2026-10-25', '08:00', '09:00']);
    });

    it('leaves out the New event button when newEventButton is false', async () => {
      await render({ newEventButton: false });
      expect(newEventButton()).toBeUndefined();
    });

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

    describe('dragging an event on the grid', () => {
      // Day columns 100 px wide side by side, Sunday first; the grid's top at 0, 48 px an hour.
      beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          const day = this.dataset.dayColumn;
          if (day === undefined) return new DOMRect(0, 0, 0, 0);
          return new DOMRect(Number(day) * 100, 0, 100, 24 * 48);
        });
      });
      afterEach(() => vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore());

      const lecture = 'Event: CS 460 Lecture, 2:00 PM – 2:50 PM';
      /** Presses `el` at (x, y), moves to each point, and lets go at the last, with the click a browser fires after. */
      const drag = (el: HTMLElement, from: [number, number], ...to: [number, number][]) => act(async () => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientX: from[0], clientY: from[1] }));
        for (const [clientX, clientY] of to) window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX, clientY }));
        const [clientX, clientY] = to[to.length - 1];
        window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', clientX, clientY }));
        el.click();
      });
      const scopeButton = (text: string) =>
        [...document.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find(b => b.textContent === text && b.type === 'button')!;

      it('moves a one-off event to a new time without asking, and the click that ends the drag opens nothing', async () => {
        withEvents([occurrence({ repeat_days: [] })]);
        await render();
        // Wed is column 3; grab at 2:10 PM and drop an hour later.
        await drag(button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM'), [350, 14 * 48 + 8], [350, 15 * 48 + 8]);
        expect(mocks.updateEvent).toHaveBeenCalledWith(30, { start_time: '15:00', end_time: '15:50' }, 'all', '2026-10-21');
        expect(document.body.textContent).not.toContain('Save repeating event');
        expect(dialog('Event: CS 460 Lecture')).toBeNull();
      });

      it('asks which occurrences a moved time is for on a repeating event', async () => {
        withEvents([occurrence()]);
        await render();
        await drag(button(lecture), [350, 14 * 48 + 8], [350, 13 * 48 + 8]);
        expect(document.body.textContent).toContain('Save repeating event');
        expect(container.querySelector('[data-moving-event]')!.textContent).toContain('1:00 PM – 1:50 PM');
        await act(async () => document.querySelector<HTMLInputElement>('input[value="following"]')!.click());
        await act(async () => scopeButton('Save').click());
        expect(mocks.updateEvent).toHaveBeenCalledWith(30, { start_time: '13:00', end_time: '13:50' }, 'following', '2026-10-21');
      });

      it('moves just this occurrence to another day, and puts it back when the question is cancelled', async () => {
        withEvents([occurrence()]);
        await render();
        // Over to Thursday (column 4), same time.
        await drag(button(lecture), [350, 14 * 48 + 8], [450, 14 * 48 + 8]);
        expect(document.querySelector<HTMLInputElement>('input[value="this"]')!.checked).toBe(true);
        expect(document.querySelector<HTMLInputElement>('input[value="following"]')!.disabled).toBe(true);
        await act(async () => scopeButton('Cancel').click());
        expect(mocks.updateEvent).not.toHaveBeenCalled();
        expect(container.querySelector('[data-moving-event]')).toBeNull();

        await drag(button(lecture), [350, 14 * 48 + 8], [450, 14 * 48 + 8]);
        await act(async () => scopeButton('Save').click());
        expect(mocks.updateEvent).toHaveBeenCalledWith(30, { date: '2026-10-22' }, 'this', '2026-10-21');
      });

      it('changes when it ends by dragging its bottom edge', async () => {
        withEvents([occurrence({ repeat_days: [] })]);
        await render();
        const handle = button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM').querySelector<HTMLElement>('[data-resize-handle]')!;
        await drag(handle, [350, 14 * 48 + 40], [350, 15.5 * 48 + 2]);
        expect(mocks.updateEvent).toHaveBeenCalledWith(30, { end_time: '15:30' }, 'all', '2026-10-21');
      });

      it('drags an imported Google event the same way', async () => {
        withEvents([occurrence({ event_id: -30, title: 'Team sync', tags: [], repeat_days: [], source: 'google', repeating: true })]);
        await render();
        await drag(button('Google Calendar event: Team sync, 2:00 PM – 2:50 PM'), [350, 14 * 48 + 8], [350, 16 * 48 + 8]);
        await act(async () => scopeButton('Save').click());
        expect(mocks.updateEvent).toHaveBeenCalledWith(-30, { start_time: '16:00', end_time: '16:50' }, 'this', '2026-10-21');
      });

      describe('one that runs past midnight', () => {
        const nightShift = (overrides: Partial<EventOccurrence> = {}) => occurrence({
          event_id: 31, title: 'Night shift', repeat_days: [], date: '2026-10-22', end_date: '2026-10-23',
          occurrence_date: '2026-10-22', start_time: '22:00:00', end_time: '02:00:00', ...overrides,
        });
        const first = 'Event: Night shift, 10:00 PM – 2:00 AM, runs past midnight';
        const second = 'Event: Night shift, 10:00 PM – 2:00 AM, from the day before';

        it('moves the whole event from its first piece, keeping its length past midnight', async () => {
          withEvents([nightShift()]);
          await render();
          // Thu is column 4; grab at 10:10 PM and drop an hour later.
          await drag(button(first), [450, 22 * 48 + 8], [450, 23 * 48 + 8]);
          expect(mocks.updateEvent).toHaveBeenCalledWith(31, { start_time: '23:00', end_time: '03:00' }, 'all', '2026-10-22');
        });

        it('moves the whole event from its piece on the next day', async () => {
          withEvents([nightShift()]);
          await render();
          // Fri is column 5; grab at 1:00 AM and drop two hours earlier, so it starts at 8 PM Thursday.
          await drag(button(second), [550, 1 * 48], [550, -1 * 48]);
          expect(mocks.updateEvent).toHaveBeenCalledWith(31, { start_time: '20:00', end_time: '00:00' }, 'all', '2026-10-22');
        });

        it('draws the moved copy on both days while a repeating one asks which occurrences', async () => {
          withEvents([nightShift({ repeat_days: [4] })]);
          await render();
          await drag(button(first), [450, 22 * 48 + 8], [450, 23 * 48 + 8]);
          expect(document.body.textContent).toContain('Save repeating event');
          const copies = [...container.querySelectorAll('[data-moving-event]')];
          expect(copies.map(c => c.closest('[data-day-column]')!.getAttribute('data-day-column'))).toEqual(['4', '5']);
          expect(copies[0].textContent).toContain('11:00 PM – 3:00 AM');
          await act(async () => scopeButton('Save').click());
          expect(mocks.updateEvent).toHaveBeenCalledWith(31, { start_time: '23:00', end_time: '03:00' }, 'this', '2026-10-22');
        });

        it('moves a same-day event so that it ends on the next day', async () => {
          withEvents([occurrence({ repeat_days: [] })]);
          await render();
          await drag(button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM'), [350, 14 * 48 + 8], [350, 23.5 * 48 + 8]);
          expect(mocks.updateEvent).toHaveBeenCalledWith(30, { start_time: '23:30', end_time: '00:20' }, 'all', '2026-10-21');
        });

        it('changes when it ends from the bottom edge of its last piece only', async () => {
          withEvents([nightShift()]);
          await render();
          expect(button(first).querySelector('[data-resize-handle]')).toBeNull();
          const handle = button(second).querySelector<HTMLElement>('[data-resize-handle]')!;
          await drag(handle, [550, 2 * 48], [550, 3.5 * 48]);
          expect(mocks.updateEvent).toHaveBeenCalledWith(31, { end_time: '03:30' }, 'all', '2026-10-22');
        });
      });

      it('leaves archived events alone', async () => {
        withEvents([occurrence({ repeat_days: [], past: true, archived: true })]);
        await render();
        const archived = button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM, archived');
        expect(archived.querySelector('[data-resize-handle]')).toBeNull();
        await drag(archived, [350, 14 * 48 + 8], [350, 16 * 48 + 8]);
        expect(mocks.updateEvent).not.toHaveBeenCalled();
      });

      it('leaves touch alone, so a finger scrolls the grid', async () => {
        withEvents([occurrence({ repeat_days: [] })]);
        await render();
        await act(async () => {
          button('Event: CS 460 Lecture, 2:00 PM – 2:50 PM').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0, clientX: 350, clientY: 680 }));
          window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 350, clientY: 900 }));
          window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: 350, clientY: 900 }));
        });
        expect(mocks.updateEvent).not.toHaveBeenCalled();
      });
    });

    describe('imported from Google Calendar', () => {
      const imported = (overrides: Partial<EventOccurrence> = {}) => occurrence({
        event_id: -30, title: 'Team sync', tags: [], repeat_days: [], source: 'google', ...overrides,
      });
      const label = 'Google Calendar event: Team sync, 2:00 PM – 2:50 PM';

      const scopeButton = (text: string) =>
        [...document.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find(b => b.textContent === text && b.type === 'button')!;
      const submitForm = () => act(async () => {
        document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      it('shows on the grid with the Google mark and opens with edit, archive and delete', async () => {
        withEvents([imported()]);
        await render();
        expect(button(label).querySelector('[data-google-mark]')).not.toBeNull();
        await act(async () => button(label).click());
        const card = dialog('Event: Team sync')!;
        const actions = [...card.querySelectorAll('button')].map(b => b.textContent?.trim());
        expect(actions).toEqual(expect.arrayContaining(['Edit', 'Archive', 'Delete']));
        expect(card.textContent).toContain('Changes stay in kanso');
      });

      it('edits a one-off one in the form without loading a series or asking, leaving out how it repeats', async () => {
        withEvents([imported()]);
        await render();
        await act(async () => button(label).click());
        await act(async () => buttonByText('Edit').click());
        expect(mocks.fetchEvent).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('From Google Calendar. Changes stay in kanso');
        expect(document.querySelector('select[id$="-repeat"]')).toBeNull();
        expect(document.querySelector('select[id$="-reminder"]')).toBeNull();

        const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. CS 460 Lecture"]')!;
        await setInput(title, 'Team sync (moved)');
        await submitForm();
        expect(document.body.textContent).not.toContain('Save repeating event');
        expect(mocks.updateEvent).toHaveBeenCalledWith(-30, { title: 'Team sync (moved)' }, 'all', '2026-10-21');
        expect(mocks.updateGoogleEventTags).not.toHaveBeenCalled();
      });

      it('asks which instances an edit of a repeating one is for, and saves its tags through their own endpoint', async () => {
        mocks.updateGoogleEventTags.mockReset().mockResolvedValue(undefined);
        withEvents([imported({ repeating: true })]);
        await render();
        await act(async () => button(label).click());
        await act(async () => buttonByText('Edit').click());
        const form = document.querySelector('form')!;
        await setInput(form.querySelector<HTMLInputElement>('input[placeholder="e.g. CS 460 Lecture"]')!, 'Team sync v2');
        await act(async () => [...form.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'CS 460')!.click());
        await submitForm();
        expect(document.body.textContent).toContain('Save repeating event');
        for (const scope of ['this', 'following', 'all']) {
          expect(document.querySelector<HTMLInputElement>(`input[value="${scope}"]`)!.disabled).toBe(false);
        }
        await act(async () => document.querySelector<HTMLInputElement>('input[value="following"]')!.click());
        await act(async () => scopeButton('Save').click());
        expect(mocks.updateEvent).toHaveBeenCalledWith(-30, { title: 'Team sync v2' }, 'following', '2026-10-21');
        expect(mocks.updateGoogleEventTags).toHaveBeenCalledWith(-30, [CLASS_TAG.id], false, 'following');
      });

      it('moves just this instance of a repeating one to a new date', async () => {
        withEvents([imported({ repeating: true })]);
        await render();
        await act(async () => button(label).click());
        await act(async () => buttonByText('Edit').click());
        await setInput(document.querySelector<HTMLInputElement>('input[type="date"]')!, '2026-10-22');
        await submitForm();
        expect(document.querySelector<HTMLInputElement>('input[value="following"]')!.disabled).toBe(true);
        expect(document.body.textContent).toContain('A new date moves just this event.');
        expect(document.body.textContent).not.toContain('change the days it repeats on');
        await act(async () => scopeButton('Save').click());
        expect(mocks.updateEvent).toHaveBeenCalledWith(-30, { date: '2026-10-22' }, 'this', '2026-10-21');
      });

      it('archives and deletes a repeating one asking which instances', async () => {
        withEvents([imported({ repeating: true })]);
        await render();
        await act(async () => button(label).click());
        await act(async () => buttonByText('Archive').click());
        expect(document.body.textContent).toContain('Archive repeating event');
        await act(async () => document.querySelector<HTMLInputElement>('input[value="all"]')!.click());
        await act(async () => scopeButton('Archive').click());
        expect(mocks.setEventArchived).toHaveBeenCalledWith(-30, true, 'all', '2026-10-21');

        await act(async () => button(label).click());
        await act(async () => buttonByText('Delete').click());
        expect(document.body.textContent).toContain('Delete repeating event');
        await act(async () => scopeButton('Delete').click());
        expect(mocks.deleteEvent).toHaveBeenCalledWith(-30, 'this', '2026-10-21');
      });

      it('asks which instances a Restore of a repeating one brings back, defaulting to this one', async () => {
        withEvents([imported({ repeating: true, past: true, archived: true })]);
        await render();
        await act(async () => button(`${label}, archived`).click());
        await act(async () => buttonByText('Restore').click());
        expect(document.body.textContent).toContain('Restore repeating event');
        expect(document.querySelector<HTMLInputElement>('input[value="this"]')!.checked).toBe(true);
        expect(mocks.setEventArchived).not.toHaveBeenCalled();
        await act(async () => document.querySelector<HTMLInputElement>('input[value="all"]')!.click());
        await act(async () => scopeButton('Restore').click());
        expect(mocks.fetchEvent).not.toHaveBeenCalled();
        expect(mocks.setEventArchived).toHaveBeenCalledWith(-30, false, 'all', '2026-10-21');
      });

      it('restores nothing when the Restore question is cancelled', async () => {
        withEvents([imported({ repeating: true, past: true, archived: true })]);
        await render();
        await act(async () => button(`${label}, archived`).click());
        await act(async () => buttonByText('Restore').click());
        await act(async () => scopeButton('Cancel').click());
        expect(mocks.setEventArchived).not.toHaveBeenCalled();
      });

      it('restores an archived one on its own, without loading a series', async () => {
        withEvents([imported({ past: true, archived: true })]);
        await render();
        await act(async () => button(`${label}, archived`).click());
        await act(async () => buttonByText('Restore').click());
        expect(mocks.fetchEvent).not.toHaveBeenCalled();
        expect(mocks.setEventArchived).toHaveBeenCalledWith(-30, false, 'this', '2026-10-21');
      });

      it('keeps the card open while its tag question is', async () => {
        mocks.updateGoogleEventTags.mockReset().mockResolvedValue(undefined);
        withEvents([imported({ repeating: true })]);
        await render();
        await act(async () => button(label).click());
        await act(async () => buttonByText('CS 460').click());
        const panel = document.querySelector('.modal-panel')!;
        await act(async () => { panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
        await act(async () => document.querySelector<HTMLInputElement>('input[value="following"]')!.click());
        expect(dialog('Event: Team sync')).not.toBeNull();
        await act(async () => scopeButton('Save').click());
        expect(mocks.updateGoogleEventTags).toHaveBeenCalledWith(-30, [CLASS_TAG.id], false, 'following');
        expect(dialog('Event: Team sync')).not.toBeNull();

        // Escape on the question closes only the question.
        await act(async () => buttonByText('CS 460').click());
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
        expect(document.body.textContent).not.toContain('Save repeating event');
        expect(dialog('Event: Team sync')).not.toBeNull();
      });

      it("doesn't mark a task during one Google leaves free as a clash", async () => {
        mocks.tasks = [task({ id: 9, title: 'Essay', due_date: '2026-10-21', due_time: '14:15:00', estimated_time: 0.5 })];
        withEvents([imported({ busy: false })]);
        await render();
        expect(container.querySelector('button[aria-label^="Planned task: Essay"]')!.getAttribute('aria-label')).not.toContain('during');
        expect(button(`${label}, free`)).toBeTruthy();
      });

      it('starts the tag picks fresh when another event opens over the card', async () => {
        mocks.updateGoogleEventTags.mockReset().mockResolvedValue(undefined);
        const other = imported({ event_id: -31, title: 'Standup', start_time: '16:00:00', end_time: '16:50:00' });
        withEvents([imported(), other]);
        await render();
        await act(async () => button(label).click());
        await act(async () => buttonByText('CS 460').click());
        expect(mocks.updateGoogleEventTags).toHaveBeenLastCalledWith(-30, [CLASS_TAG.id], false);

        await act(async () => button('Google Calendar event: Standup, 4:00 PM – 4:50 PM').click());
        expect(dialog('Event: Standup')).not.toBeNull();
        expect(buttonByText('CS 460').getAttribute('aria-pressed')).toBe('false');
        await act(async () => buttonByText('CS 460').click());
        expect(mocks.updateGoogleEventTags).toHaveBeenLastCalledWith(-31, [CLASS_TAG.id], false);
      });

      it("updates the open card and the block's color once a tag saves, without a reload", async () => {
        mocks.updateGoogleEventTags.mockReset().mockResolvedValue(undefined);
        withEvents([imported()]);
        await render();
        await act(async () => button(label).click());
        withEvents([imported({ tags: [CLASS_TAG] })]);
        await act(async () => buttonByText('CS 460').click());
        expect(mocks.updateGoogleEventTags).toHaveBeenCalledWith(-30, [CLASS_TAG.id], false);
        expect(buttonByText('CS 460').getAttribute('aria-pressed')).toBe('true');
        expect(button(label).style.borderLeft).toContain('rgb(59, 130, 246)');
      });
    });
  });
});
