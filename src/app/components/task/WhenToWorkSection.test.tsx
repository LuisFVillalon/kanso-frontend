// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseTaskForm, LinkedTaskRef, Task } from '@/app/types/task';
import type { EventOccurrence } from '@/app/types/event';
import { AppShellContext, type AppShellValue } from '@/app/context/AppShellContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  fetchCalendarActivity: vi.fn(),
  createWorkBlock: vi.fn(),
  deleteWorkBlock: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import NewTaskModal, { type AfterTaskSave } from './NewTaskModal';

const ev = (title: string, date: string, start: string, end: string): EventOccurrence => ({
  event_id: title.length, occurrence_date: date, title, description: null, tags: [], all_day: false,
  date, end_date: date, start_time: start, end_time: end, starts_at: '', ends_at: '', time_zone: 'UTC',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
});

// Wed Nov 11 2026: a lecture, a study group and a library shift.
const EVENTS = [
  ev('COMM 103 lecture', '2026-11-11', '10:00:00', '11:15:00'),
  ev('Study group', '2026-11-11', '12:00:00', '13:00:00'),
  ev('Shift at the library', '2026-11-11', '14:00:00', '17:00:00'),
];

const task = (extra: Partial<Task> = {}): Task => ({
  id: 99, title: 'Read ch. 7', description: '', completed: false, priority: null, due_date: '2026-11-16', due_time: '10:00',
  tags: [], created_date: '2026-11-11', completed_date: null, ...extra,
});

type Submit = (e: React.FormEvent, linked?: LinkedTaskRef[], created?: Task, afterSave?: AfterTaskSave) => Promise<void>;

let container: HTMLDivElement;
let root: Root;

function Harness({ initial, onSubmit }: { initial: Partial<BaseTaskForm>; onSubmit: Submit }) {
  const [form, setForm] = useState({
    id: 0, title: 'Read ch. 7', description: '', priority: null, due_date: '2026-11-16', due_time: '10:00',
    tags: [], category: null, estimated_time: 1, created_date: '', ...initial,
  } as BaseTaskForm);
  return (
    <NewTaskModal
      isOpen onClose={() => {}} newTask={form} onTaskChange={setForm} tags={[]} onToggleTag={() => {}}
      onSubmit={onSubmit} activeTaskCount={0} usedPriorityLevels={[]} allTasks={[]} habits={[]}
    />
  );
}

const render = async (initial: Partial<BaseTaskForm>, onSubmit: Submit, workHoursSet = true) => {
  const profile = {
    dayStartTime: '09:00', shutoffTime: '19:00', restDays: [0, 6], dayWindows: { 5: { start: '09:00', end: '17:00' } }, workHoursSet,
  };
  const shell = { profileState: { profile }, openSettings: vi.fn() } as unknown as AppShellValue;
  await act(async () => root.render(<AppShellContext.Provider value={shell}><Harness initial={initial} onSubmit={onSubmit} /></AppShellContext.Provider>));
  // The rows wait for the due date and length to settle.
  await act(async () => { await new Promise(r => setTimeout(r, 350)); });
};

const rows = () => [...document.querySelectorAll<HTMLButtonElement>('[data-slot-row]')];
const submitButton = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const submit = () => act(async () => {
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

/** A parent handler like the app's: create the task, then run the plan step. */
const creating = (made = task()): Submit => vi.fn(async (e, _linked, created, afterSave) => {
  e.preventDefault();
  if (afterSave) await afterSave(created ?? made);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 11, 20));
  api.fetchCalendarActivity.mockReset().mockImplementation(async (start: string, end: string) => ({
    start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [], events: EVENTS,
  }));
  api.createWorkBlock.mockReset().mockImplementation(async body => ({ id: 1, ...body }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('When to work on it', () => {
  it('suggests the soonest free hour on each day before the due date, with why', async () => {
    await render({}, creating());
    expect(rows().map(r => r.textContent)).toEqual([
      'Today1:00 – 2:00 PMSoonestbetween Study group and Shift at the library',
      'Tomorrow9:00 – 10:00 AMstart of your work day',
      'Fri, Nov 139:00 – 10:00 AMstart of your work day',
    ]);
    expect(rows().every(r => r.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(submitButton().textContent).toBe('Create Task');
  });

  it('turns Create into "Create & plan" when a row is picked, and makes a block for each pick', async () => {
    const onSubmit = creating();
    await render({}, onSubmit);
    await act(async () => rows()[0].click());
    await act(async () => rows()[2].click());
    expect(rows()[0].getAttribute('aria-pressed')).toBe('true');
    expect(submitButton().textContent).toBe('Create & plan');
    await submit();
    expect(api.createWorkBlock).toHaveBeenCalledTimes(2);
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 99, date: '2026-11-11', start_time: '13:00', end_time: '14:00',
    }));
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ task_id: 99, date: '2026-11-13', start_time: '09:00', end_time: '10:00' }));
  });

  it('keeps the task when a block fails, and retries just that one', async () => {
    const onSubmit = creating();
    api.createWorkBlock.mockRejectedValueOnce(new Error('offline'));
    await render({}, onSubmit);
    await act(async () => rows()[0].click());
    await submit();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("The task was created, but one planned time didn't make it onto your calendar");
    expect(submitButton().textContent).toBe('Try again');
    await submit();
    // The second try updates the task it made rather than creating another.
    expect(vi.mocked(onSubmit).mock.calls[1][2]).toMatchObject({ id: 99 });
    expect(api.createWorkBlock).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('plans 30 minutes when "How long?" is skipped, and offers only today when it is due today', async () => {
    await render({ due_date: '2026-11-11', due_time: '19:00', estimated_time: null }, creating());
    expect(document.body.textContent).toContain('Due today · 3 hr 30 min free left');
    expect(rows().map(r => r.textContent?.slice(0, 22))).toEqual(['Today11:30 AM – 12:00 ', 'Today1:00 – 1:30 PMrig', 'Today5:00 – 5:30 PMrig']);
  });

  it('offers to split it or go past work hours when nothing fits before it is due', async () => {
    await render({ due_date: '2026-11-11', due_time: '19:00', estimated_time: 3 }, creating());
    expect(document.body.textContent).toContain('No free 3 hr before Today · 7:00 PM.');
    const [split, after] = rows();
    expect(split.textContent).toContain('Split it');
    expect(split.textContent).toContain('Today 11:30 AM – 12:00 PM + Today 1:00 – 2:00 PM + Today 5:00 – 6:30 PM');
    // Past work hours would end after it's due.
    expect(after).toBeUndefined();
    await act(async () => split.click());
    await submit();
    expect(api.createWorkBlock).toHaveBeenCalledTimes(3);
  });

  it('says when the work day has never been set', async () => {
    await render({}, creating(), false);
    expect(document.body.textContent).toContain("You haven't set your work day, so these use 8 AM – 10 PM, Monday to Friday.");
  });

  it('shows nothing once the deadline has passed', async () => {
    await render({ due_date: '2026-11-10', due_time: '10:00' }, creating());
    expect(document.querySelector('[data-when-to-work]')).toBeNull();
  });

  it('spreads linked tasks with "Plan all", and makes their blocks once they exist', async () => {
    const child = task({ id: 120, title: 'Find sources', parent_task_id: 99, due_date: null, due_time: null });
    const onSubmit: Submit = vi.fn(async (e, _linked, created, afterSave) => {
      e.preventDefault();
      if (afterSave) await afterSave(created ?? task(), [child]);
    });
    await render({ due_date: '2026-11-17', due_time: '23:59' }, onSubmit);
    const d = document;
    const newTitle = d.querySelector<HTMLInputElement>('input[aria-labelledby="linked-new-label"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(newTitle, 'Find sources');
      newTitle.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { newTitle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const pill = () => d.querySelector<HTMLButtonElement>('[data-slot-pill]')!;
    // 30 minutes, the first free time today.
    expect(pill().textContent).toBe('Today 11:30 AM');
    await act(async () => [...d.querySelectorAll('button')].find(b => b.textContent?.includes('Plan all 1'))!.click());
    expect(pill().getAttribute('aria-label')).toContain('Planned Today 11:30 AM');
    expect(submitButton().textContent).toBe('Create & plan 1');
    await submit();
    expect(api.createWorkBlock).toHaveBeenCalledWith(expect.objectContaining({ task_id: 120, date: '2026-11-11', start_time: '11:30', end_time: '12:00' }));
  });

  it('places a block on any free time from "Other time…"', async () => {
    await render({}, creating());
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Other time…')!.click());
    const strip = document.querySelector('[data-free-time-strip]')!;
    const free = strip.querySelector<HTMLButtonElement>('button[aria-label^="Free Today 5:00 – 7:00 PM"]')!;
    await act(async () => free.click());
    expect(rows().at(-1)!.textContent).toContain('5:00 – 6:00 PM');
    expect(rows().at(-1)!.textContent).toContain('your pick');
    expect(submitButton().textContent).toBe('Create & plan');
  });
});
