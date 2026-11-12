// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import type { Note } from '@/app/types/notes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchCalendarActivity: vi.fn(),
  tasks: [] as Task[],
  habits: [] as Habit[],
  notes: [] as Note[],
}));

vi.mock('@/app/lib/backend-api', () => ({ fetchCalendarActivity: mocks.fetchCalendarActivity }));
vi.mock('@/app/context/TasksContext', () => ({ useTasksContext: () => ({ tasks: mocks.tasks, isLoading: false }) }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => ({ habits: mocks.habits, habitsLoading: false }) }));
vi.mock('@/app/context/NotesContext', () => ({ useNotesContext: () => ({ notes: mocks.notes, isLoading: false, archiveSyncToken: 0 }) }));

import { useYearCalendarData } from './useYearCalendarData';
import { notifyEventsChanged } from './useEventsVersion';
import { notifyActivityChanged } from './useActivityVersion';
import { dailyActivity } from '@/app/utils/calendarReport';

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
  mocks.notes = [];
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
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-01-01', '2026-12-31', { includeArchived: true });
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
    expect(mocks.fetchCalendarActivity).toHaveBeenLastCalledWith('2024-01-01', '2024-12-31', { includeArchived: true });
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
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2028-01-01', '2028-12-31', { includeArchived: true });
    expect(result.yearLoading).toBe(false);
    expect(result.dayData.has('2026-10-21')).toBe(false);
  });

  it('puts each event on its days, an overnight one on both, even for someone with no habits', async () => {
    mocks.habits = [];
    const base = {
      description: null, tags: [], all_day: false, time_zone: 'America/Los_Angeles', repeat_days: [], repeat_interval: 1,
      reminder_minutes: null, edited: false, past: false, archived: false,
    };
    mocks.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      ...activity(start, end, []),
      events: [
        { ...base, event_id: 1, occurrence_date: '2026-10-23', title: 'Lecture', date: '2026-10-23', end_date: '2026-10-23', start_time: '10:00:00', end_time: '10:50:00', starts_at: '', ends_at: '' },
        { ...base, event_id: 2, occurrence_date: '2026-10-23', title: 'Night shift', date: '2026-10-23', end_date: '2026-10-24', start_time: '22:00:00', end_time: '02:00:00', starts_at: '', ends_at: '' },
      ],
    }));
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-01-01', '2026-12-31', { includeArchived: true });
    expect(result.dayData.get('2026-10-23')!.events.map(e => e.title)).toEqual(['Lecture', 'Night shift']);
    expect(result.dayData.get('2026-10-24')!.events.map(e => e.title)).toEqual(['Night shift']);
  });

  it('reloads the year when an event changes', async () => {
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledTimes(1);
    await act(async () => notifyEventsChanged());
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledTimes(2);
  });

  // Regression: a note was listed only on the day of its last edit (its
  // updated_date), with its time from a separate per-day totals call, so an
  // earlier day lost a note as soon as it was edited again, while Reports
  // still counted that day's session.
  it('lists each note on every day it has editing time, with the same time Reports gives that day', async () => {
    const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
    const sessions: CalendarActivity['note_sessions'] = [
      { id: 1, note_id: 1, note_title: 'Lab notes', started_at: at(19, 10), ended_at: at(19, 10, 40), duration_seconds: 2400 },
      { id: 2, note_id: 1, note_title: 'Lab notes', started_at: at(21, 9), ended_at: at(21, 9, 30), duration_seconds: 1800 },
      { id: 3, note_id: 2, note_title: 'Essay', started_at: at(19, 23, 30), ended_at: at(20, 0, 30), duration_seconds: 3600 },
      { id: 4, note_id: 3, note_title: 'Archived reading', started_at: at(19, 14), ended_at: at(19, 14, 20), duration_seconds: 1200 },
    ];
    const year = (start: string, end: string): CalendarActivity => ({
      ...activity(start, end, []),
      note_sessions: sessions,
      notes: [{ id: 1, title: 'Lab notes', tags: [{ id: 7, name: 'CS', color: '#00f' }] }, { id: 2, title: 'Essay', tags: [] }, { id: 3, title: 'Archived reading', tags: [] }],
    });
    mocks.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => year(start, end));
    await render();

    const notesOn = (d: string) => result.dayData.get(d)?.notesEdited.map(n => [n.title, n.seconds]);
    expect(notesOn('2026-10-19')).toEqual([['Lab notes', 2400], ['Essay', 1800], ['Archived reading', 1200]]);
    expect(notesOn('2026-10-20')).toEqual([['Essay', 1800]]);
    expect(notesOn('2026-10-21')).toEqual([['Lab notes', 1800]]);
    expect(result.dayData.get('2026-10-19')!.notesEdited[0].tags.map(t => t.name)).toEqual(['CS']);

    const reports = dailyActivity(year('2026-10-19', '2026-10-25'), new Date(2026, 9, 19), new Date(2026, 9, 25));
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21']) {
      const seconds = result.dayData.get(d)!.notesEdited.reduce((sum, n) => sum + n.seconds, 0);
      expect(seconds).toBe(reports.get(d)!.noteSeconds);
    }
  });

  it('reloads the year when a note session closes or a past day\'s check-in changes', async () => {
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledTimes(1);
    mocks.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      ...activity(start, end, []),
      note_sessions: [{ id: 9, note_id: 1, note_title: 'Lab notes', started_at: new Date(2026, 9, 21, 11).toISOString(), ended_at: new Date(2026, 9, 21, 11, 15).toISOString(), duration_seconds: 900 }],
    }));
    await act(async () => notifyActivityChanged());
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledTimes(2);
    expect(result.dayData.get('2026-10-21')!.notesEdited.map(n => [n.title, n.seconds])).toEqual([['Lab notes', 900]]);
  });

  it('shows a live note\'s current title and tags without refetching, keeping the activity\'s for an archived note', async () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m).toISOString();
    mocks.fetchCalendarActivity.mockImplementation(async (start: string, end: string) => ({
      ...activity(start, end, []),
      note_sessions: [
        { id: 1, note_id: 1, note_title: 'Lab notes', started_at: at(10), ended_at: at(10, 40), duration_seconds: 2400 },
        { id: 2, note_id: 3, note_title: 'Archived reading', started_at: at(14), ended_at: at(14, 20), duration_seconds: 1200 },
      ],
      notes: [{ id: 1, title: 'Lab notes', tags: [{ id: 7, name: 'CS', color: '#00f' }] }, { id: 3, title: 'Archived reading', tags: [{ id: 8, name: 'Old', color: '#f00' }] }],
    }));
    mocks.notes = [{ id: -1, persistedId: 1, title: 'Lab notes', tags: [{ id: 7, name: 'CS', color: '#00f' }] } as Note];
    await render();

    mocks.notes = [{ id: -1, persistedId: 1, title: 'Lab report', tags: [{ id: 9, name: 'Physics', color: '#0f0' }] } as Note];
    await render();
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledTimes(1);
    expect(result.dayData.get('2026-10-19')!.notesEdited.map(n => [n.title, n.tags.map(t => t.name)])).toEqual([
      ['Lab report', ['Physics']],
      ['Archived reading', ['Old']],
    ]);
  });
});
