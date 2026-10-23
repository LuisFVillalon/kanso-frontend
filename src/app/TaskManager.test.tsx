// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  describeError: (_: unknown, fallback: string) => fallback,
  syncCanvasLinkedTasks: vi.fn(),
  fetchCanvasConnection: vi.fn(),
  CanvasTaskExistsError: class extends Error {},
}));
vi.mock('@/app/lib/backend-api', () => api);

const auth = vi.hoisted(() => ({ isDemo: false, user: { id: 'u1' }, dataUserId: 'u1', signOut: vi.fn() }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));

const linkedTask: Task = {
  id: 1, title: 'Problem Set 6', description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-21', completed_date: null, canvas_assignment_id: 9876,
};
const tasksContext = vi.hoisted(() => ({
  tasks: [] as Task[], isLoading: false, toggleComplete: vi.fn(), completeWithLinked: vi.fn(), addTask: vi.fn(),
  discardTask: vi.fn(), deleteTask: vi.fn(), archiveTask: vi.fn(), updateTask: vi.fn(), saveLinkedTasks: vi.fn(),
  refreshTasks: vi.fn(), setTasks: vi.fn(), pendingTaskIds: new Set<number>(), completionSyncToken: 0,
}));
vi.mock('@/app/context/TasksContext', () => ({ useTasksContext: () => tasksContext }));
vi.mock('@/app/context/TagsContext', () => ({
  useTagsContext: () => ({ tags: [], tagsLoading: false, setTags: vi.fn(), addTag: vi.fn(), delTag: vi.fn(), archiveTag: vi.fn(), updateTag: vi.fn() }),
}));
vi.mock('@/app/context/HabitsContext', () => ({
  useHabitsContext: () => ({
    habits: [], habitsLoading: false, toggle: vi.fn(), toggleDate: vi.fn(), pendingHabitIds: new Set(), refetch: vi.fn(),
    deleteHabit: vi.fn(), archiveHabit: vi.fn(), syncToken: 0,
  }),
}));
vi.mock('@/app/context/NotesContext', () => ({
  useNotesContext: () => ({
    notes: [], isLoading: false, addNote: vi.fn(), deleteNote: vi.fn(), archiveNote: vi.fn(), updateNote: vi.fn(),
    discardDraft: vi.fn(), pendingNoteIds: new Set(), removeTagFromNotes: vi.fn(), archiveSyncToken: 0,
  }),
}));
vi.mock('@/app/context/AppShellContext', () => ({
  useAppShell: () => ({
    profileState: { profile: { name: '', avatar: null }, loading: false, loaded: true, saveProfile: vi.fn() },
    calendarSettingsState: { calendarSettings: {}, loading: false, saveCalendarSettings: vi.fn() },
    openNewTask: vi.fn(), createNote: vi.fn(), openNewHabit: vi.fn(), openEditTask: vi.fn(), openSettings: vi.fn(),
    openManageTags: vi.fn(), openManageHabits: vi.fn(), openHabitHistory: vi.fn(), requestLogout: vi.fn(),
    settingsClosedToken: 0, registerNoteOpener: vi.fn(),
  }),
}));

// Only the Canvas panel is on screen, standing in for its rows' "Add to tasks" and its refresh button.
// The panels offered, on and on a phone are listed on the wrapper, with a button for a phone's pick.
vi.mock('@/app/components/common/PanelCarousel', async importOriginal => ({
  ...(await importOriginal<object>()),
  default: ({ renderPanel, available, value, phoneValue, onPhoneChange, order, onOrderChange }: {
    renderPanel: (key: 'canvas', opts: { widthPct: number }) => React.ReactNode;
    available: string[];
    value: string;
    phoneValue: string;
    onPhoneChange: (next: 'notes') => void;
    order: string[];
    onOrderChange: (next: string[]) => void;
  }) => (
    <div data-available={available.join(',')} data-value={value} data-phone={phoneValue} data-order={order.join(',')}>
      <button type="button" data-phone-pick onClick={() => onPhoneChange('notes')} />
      <button type="button" data-reorder onClick={() => onOrderChange(['canvas', 'tasks', 'notes'])} />
      {renderPanel('canvas', { widthPct: 50 })}
    </div>
  ),
}));
vi.mock('@/app/components/canvas/CanvasPanel', () => ({
  default: ({ addToTasks, onRefresh }: { addToTasks?: unknown; onRefresh?: () => void }) => (
    <>
      {addToTasks ? <button>Add to tasks</button> : null}
      <button onClick={() => onRefresh?.()}>Refresh</button>
    </>
  ),
}));
const { Empty } = vi.hoisted(() => ({ Empty: () => null }));
vi.mock('@/app/components/task/TasksPanel', () => ({ default: Empty }));
vi.mock('@/app/components/notes/NotesPanel', () => ({
  default: Empty,
  isNoteOrder: (c: unknown) => c === 'newest' || c === 'oldest',
}));
vi.mock('@/app/components/layout/CalendarAndStats', () => ({ default: Empty }));
vi.mock('@/app/components/calendar/WeekView', () => ({ default: Empty }));
vi.mock('@/app/components/task/TaskDebriefPanel', () => ({ default: () => <div data-testid="daily-brief" /> }));
vi.mock('@/app/components/mood/PeriodMoodCheckins', () => ({ default: Empty }));
vi.mock('@/app/components/mood/DayMoodCheckin', async importOriginal => ({
  ...(await importOriginal<object>()),
  DayClosedMoodReminder: ({ profileLoaded }: { profileLoaded: boolean }) => <div data-testid="mood-reminder" data-loaded={String(profileLoaded)} />,
}));
vi.mock('@/app/components/doodle/DoodleCanvas', () => ({ default: Empty }));
vi.mock('@/app/components/doodle/DoodleToolbar', () => ({ default: Empty }));
vi.mock('@/app/components/common/ModeSwitcher', () => ({ default: Empty }));
vi.mock('@/app/components/notifications/NotificationBell', () => ({ default: Empty }));
vi.mock('@/app/components/common/ProfileAvatar', () => ({ default: Empty }));
vi.mock('@/app/components/common/DragHandle', () => ({ default: Empty }));
vi.mock('@/app/components/common/KeyPressMoment', async importOriginal => ({
  ...(await importOriginal<object>()),
  default: Empty,
}));

import TaskManager from './TaskManager';

let root: Root;
let container: HTMLDivElement;
const buttonNamed = (name: string) => [...container.querySelectorAll('button')].find(b => b.textContent === name);
const availablePanels = () => container.querySelector('[data-available]')!.getAttribute('data-available');

const render = async () => {
  await act(async () => root.render(<TaskManager />));
};

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
  tasksContext.tasks = [linkedTask];
  api.syncCanvasLinkedTasks.mockResolvedValue([]);
  api.fetchCanvasConnection.mockResolvedValue({ connected: true });
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
  localStorage.clear();
  auth.isDemo = false;
});

describe('TaskManager Canvas panel', () => {
  it('offers Add to tasks and syncs linked tasks for a signed-in user', async () => {
    await render();
    expect(buttonNamed('Add to tasks')).toBeDefined();
    expect(api.syncCanvasLinkedTasks).toHaveBeenCalledTimes(1);
  });

  it('gives a demo user no Add to tasks and never syncs linked tasks, even on refresh', async () => {
    auth.isDemo = true;
    await render();
    expect(buttonNamed('Add to tasks')).toBeUndefined();
    await act(async () => buttonNamed('Refresh')!.click());
    expect(api.syncCanvasLinkedTasks).not.toHaveBeenCalled();
  });
});

describe('TaskManager home panels', () => {
  it('offers Canvas when it is connected', async () => {
    await render();
    expect(api.fetchCanvasConnection).toHaveBeenCalledTimes(1);
    expect(availablePanels()).toBe('tasks,notes,canvas');
  });

  it('offers Canvas when it is connected with the calendar feed', async () => {
    api.fetchCanvasConnection.mockResolvedValue({ connected: true, connection_type: 'feed' });
    await render();
    expect(availablePanels()).toBe('tasks,notes,canvas');
  });

  it('leaves Canvas out when it is not connected', async () => {
    api.fetchCanvasConnection.mockResolvedValue({ connected: false });
    await render();
    expect(availablePanels()).toBe('tasks,notes');
  });

  it('keeps a saved Canvas pair while the connection check fails', async () => {
    localStorage.setItem('tm-home-panels', JSON.stringify('canvas,tasks'));
    api.fetchCanvasConnection.mockRejectedValue(new Error('offline'));
    await render();
    expect(availablePanels()).toBe('tasks,notes,canvas');
  });

  it("remembers a phone's pick on this device, apart from the wide screen's panels", async () => {
    localStorage.setItem('tm-home-panels', JSON.stringify('tasks,notes,canvas'));
    await render();
    const carousel = container.querySelector('[data-available]')!;
    expect(carousel.getAttribute('data-value')).toBe('tasks,notes,canvas');
    expect(carousel.getAttribute('data-phone')).toBe('tasks');
    await act(async () => container.querySelector<HTMLElement>('[data-phone-pick]')!.click());
    expect(carousel.getAttribute('data-phone')).toBe('notes');
    expect(localStorage.getItem('tm-home-phone-panel:u1')).toBe('"notes"');
    expect(localStorage.getItem('tm-home-panels')).toBe('"tasks,notes,canvas"');
  });

  it('remembers the panels\' order on this device, starting from Tasks, Notes, Canvas', async () => {
    await render();
    const carousel = container.querySelector('[data-available]')!;
    expect(carousel.getAttribute('data-order')).toBe('tasks,notes,canvas');
    await act(async () => container.querySelector<HTMLElement>('[data-reorder]')!.click());
    expect(carousel.getAttribute('data-order')).toBe('canvas,tasks,notes');
    expect(localStorage.getItem('tm-home-panel-order:u1')).toBe('["canvas","tasks","notes"]');
    expect(localStorage.getItem('tm-home-panels')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.querySelector('[data-available]')!.getAttribute('data-order')).toBe('canvas,tasks,notes');
  });

  it('ignores a saved order that isn\'t every panel once', async () => {
    localStorage.setItem('tm-home-panel-order:u1', JSON.stringify(['notes', 'notes', 'tasks']));
    await render();
    expect(container.querySelector('[data-available]')!.getAttribute('data-order')).toBe('tasks,notes,canvas');
  });

  it('offers the sample Canvas data to a demo user without checking a connection', async () => {
    auth.isDemo = true;
    await render();
    expect(api.fetchCanvasConnection).not.toHaveBeenCalled();
    expect(availablePanels()).toBe('tasks,notes,canvas');
  });
});

describe('TaskManager widgets area', () => {
  const tab = (name: string) => [...container.querySelectorAll('[role="tab"]')].find(t => (t.getAttribute('aria-label') ?? t.textContent) === name)!;

  it('switches between the widgets and the week calendar and remembers the choice per user', async () => {
    await render();
    expect(tab('Widgets').getAttribute('aria-selected')).toBe('true');
    await act(async () => (tab('Week') as HTMLElement).click());
    expect(tab('Week').getAttribute('aria-selected')).toBe('true');
    expect(localStorage.getItem('tm-home-widgets-view:u1')).toBe('"week"');
  });
});

describe('TaskManager mood reminder', () => {
  it('sits directly above the Daily Brief', async () => {
    await render();
    const reminder = container.querySelector('[data-testid="mood-reminder"]')!;
    expect(reminder.getAttribute('data-loaded')).toBe('true');
    expect(reminder.nextElementSibling).toBe(container.querySelector('[data-testid="daily-brief"]'));
  });
});
