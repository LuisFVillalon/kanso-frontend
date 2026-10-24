// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent, EventOccurrence } from '@/app/types/event';

const api = vi.hoisted(() => ({
  fetchTasks: vi.fn(),
  fetchNotes: vi.fn(),
  fetchTags: vi.fn(),
  fetchHabits: vi.fn(),
  fetchEvents: vi.fn(),
  fetchArchivedEventOccurrences: vi.fn(),
  setEventArchived: vi.fn(),
  deleteEvent: vi.fn(),
}));
const restoreFromTrash = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
const eventsChanged = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
vi.mock('@/app/hooks/useRestoreFromTrash', () => ({ useRestoreFromTrash: () => restoreFromTrash }));
vi.mock('@/app/hooks/useEventsVersion', () => ({ notifyEventsChanged: eventsChanged }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));
vi.mock('@/app/context/TasksContext', () => ({ useTasksContext: () => ({ restoreTasks: vi.fn(), setTasks: vi.fn() }) }));
vi.mock('@/app/context/NotesContext', () => ({ useNotesContext: () => ({ restoreNote: vi.fn(), removeTagFromNotes: vi.fn() }) }));
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ restoreTag: vi.fn() }) }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => ({ restoreHabit: vi.fn(), refetch: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import ArchiveView from './ArchiveView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const yoga: CalendarEvent = {
  id: 4, title: 'Intro yoga', description: null, tags: [{ id: 3, name: 'Health', color: '#22c55e' }], all_day: false,
  start_date: '2026-08-29', end_date: '2026-12-12', start_time: '09:00:00', end_time: '10:00:00', time_zone: 'America/Los_Angeles',
  repeat_days: [6], repeat_interval: 1, reminder_minutes: null, split_from_id: null, created_date: '2026-08-20T00:00:00Z',
  archived_at: '2026-10-10T18:00:00Z', deleted_at: null,
};

const cancelledClass: EventOccurrence = {
  event_id: 9, occurrence_date: '2026-10-28', title: 'PSY 101 Lecture', description: 'Class cancelled', tags: [], all_day: false,
  date: '2026-10-28', end_date: '2026-10-28', start_time: '14:00:00', end_time: '15:15:00',
  starts_at: '2026-10-28T21:00:00Z', ends_at: '2026-10-28T22:15:00Z', time_zone: 'America/Los_Angeles',
  repeat_days: [1, 3], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchTasks.mockResolvedValue([]);
  api.fetchNotes.mockResolvedValue([]);
  api.fetchTags.mockResolvedValue([]);
  api.fetchHabits.mockResolvedValue([]);
  api.fetchEvents.mockResolvedValue([yoga]);
  api.fetchArchivedEventOccurrences.mockResolvedValue([cancelledClass]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const render = () => act(async () => { root.render(<ArchiveView />); });
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const tab = (name: string) => [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent?.startsWith(name))!;
const titles = () => [...document.querySelectorAll('li h3')].map(h => h.textContent);
const rowOf = (title: string) => [...document.querySelectorAll('li')].find(li => li.querySelector('h3')?.textContent === title)!;
const buttonIn = (el: Element, name: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(name))!;

describe('ArchiveView events', () => {
  it('lists archived series and single archived dates under Events', async () => {
    await render();
    expect(api.fetchEvents).toHaveBeenCalledWith(true);
    expect(tab('Events').textContent).toBe('Events2');
    await click(tab('Events'));
    expect(titles()).toEqual(['Intro yoga', 'PSY 101 Lecture']);
    expect(document.body.textContent).toContain('Series');
    expect(document.body.textContent).toContain('Single dates');
    const series = rowOf('Intro yoga').textContent;
    expect(series).toContain('Weekly on Sat · 9:00 – 10:00 AM · Aug 29, 2026 – Dec 12, 2026');
    expect(series).toContain('Its past dates still show on your calendars');
    expect(series).toContain('Health');
    const single = rowOf('PSY 101 Lecture').textContent;
    expect(single).toContain('Wed, Oct 28, 2026 only · 2:00 – 3:15 PM');
    expect(single).toContain('Class cancelled');
  });

  it('restores a whole series, and a single date on its own', async () => {
    api.setEventArchived.mockResolvedValue(yoga);
    await render();
    await click(tab('Events'));
    await click(buttonIn(rowOf('Intro yoga'), 'Restore'));
    expect(api.setEventArchived).toHaveBeenCalledWith(4, false, 'all', undefined);
    expect(showToast).toHaveBeenCalledWith('Event restored. Its upcoming dates are back on your calendars.', 'success');
    await click(buttonIn(rowOf('PSY 101 Lecture'), 'Restore'));
    expect(api.setEventArchived).toHaveBeenCalledWith(9, false, 'this', '2026-10-28');
    expect(eventsChanged).toHaveBeenCalledTimes(2);
    expect(titles()).toEqual([]);
    expect(document.body.textContent).toContain('No archived events');
  });

  it('deletes a series after warning that its past dates go too, with Undo', async () => {
    api.deleteEvent.mockResolvedValue(yoga);
    await render();
    await click(tab('Events'));
    await click(buttonIn(rowOf('Intro yoga'), 'Delete'));
    expect(document.body.textContent).toContain('with every date it was on, past ones too');
    await click([...document.querySelectorAll('.modal-panel button')].find(b => b.textContent === 'Delete')!);
    expect(api.deleteEvent).toHaveBeenCalledWith(4, 'all', undefined);
    expect(titles()).toEqual(['PSY 101 Lecture']);
    const [message, kind, action] = showToast.mock.calls.at(-1)!;
    expect([message, kind]).toEqual(['Event moved to Recently deleted. You can restore it for 30 days.', 'info']);
    await act(async () => { await action.onClick(); });
    expect(restoreFromTrash).toHaveBeenCalledWith('event', 4, undefined, null);
    expect(titles()).toEqual(['Intro yoga', 'PSY 101 Lecture']);
  });
});
