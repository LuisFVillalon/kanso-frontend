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
  CanvasTaskExistsError: class extends Error {},
}));
vi.mock('@/app/lib/backend-api', () => api);

const auth = vi.hoisted(() => ({ isDemo: false, user: { id: 'u1' }, signOut: vi.fn() }));
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
vi.mock('@/app/components/common/PanelCarousel', async importOriginal => ({
  ...(await importOriginal<object>()),
  default: ({ renderPanel }: { renderPanel: (key: 'canvas', opts: { widthPct: number }) => React.ReactNode }) =>
    <>{renderPanel('canvas', { widthPct: 50 })}</>,
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
vi.mock('@/app/components/task/TaskDebriefPanel', () => ({ default: Empty }));
vi.mock('@/app/components/mood/MoodNudge', () => ({ default: Empty }));
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

const render = async () => {
  await act(async () => root.render(<TaskManager />));
};

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
  tasksContext.tasks = [linkedTask];
  api.syncCanvasLinkedTasks.mockResolvedValue([]);
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
