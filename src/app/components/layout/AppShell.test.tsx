// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  pathname: '/calendar',
  push: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
  addNote: vi.fn(),
  tags: [] as Tag[],
  user: { id: 'u1', email: 'luis@example.com' } as { id: string; email: string } | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('@/app/context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false, demoSeeding: false, isDemo: false, signOut: mocks.signOut }),
}));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({ tasks: [], addTask: vi.fn(), updateTask: vi.fn(), saveLinkedTasks: vi.fn(), setTasks: vi.fn() }),
}));
vi.mock('@/app/context/TagsContext', () => ({
  useTagsContext: () => ({ tags: mocks.tags, addTag: vi.fn(), delTag: vi.fn(), archiveTag: vi.fn(), updateTag: vi.fn() }),
}));
vi.mock('@/app/context/HabitsContext', () => ({
  useHabitsContext: () => ({ habits: [], toggleDate: vi.fn(), refetch: vi.fn(), deleteHabit: vi.fn(), archiveHabit: vi.fn() }),
}));
vi.mock('@/app/context/NotesContext', () => ({
  useNotesContext: () => ({ addNote: mocks.addNote, removeTagFromNotes: vi.fn() }),
}));
vi.mock('@/app/hooks/useRestoreFromTrash', () => ({ useRestoreFromTrash: () => vi.fn() }));
vi.mock('@/app/lib/backend-api', () => ({ createHabit: vi.fn(), updateHabit: vi.fn(), describeError: vi.fn() }));
vi.mock('@/app/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { name: 'Luis', avatar: null }, loading: false, loaded: true, saveProfile: vi.fn() }),
}));
vi.mock('@/app/hooks/useCalendarSettings', () => ({
  useCalendarSettings: () => ({ calendarSettings: {}, loading: false, saveCalendarSettings: vi.fn() }),
}));
// Stands in for the real modals: shows which ones the shell has open.
vi.mock('@/app/components/layout/TaskManagerModals', () => ({
  default: (p: Record<string, unknown>) => (
    <output data-testid="modals">
      {['showNewTaskModal', 'showCreateTagModal', 'showEditTagModal', 'showCreateHabitModal', 'showManageHabitsModal', 'showSettings']
        .filter(k => p[k]).join(',')}
    </output>
  ),
}));
vi.mock('@/app/components/event/NewEventModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="New event"><button type="button" onClick={onClose}>Close event</button></div>
  ),
}));

import AppShell from './AppShell';

let container: HTMLDivElement;
let root: Root;

const render = () => act(() => root.render(<AppShell><p>page</p></AppShell>));
const open = () => document.querySelector('[data-testid="modals"]')?.textContent;
const press = (key: string, target: EventTarget = document.body) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
const button = (name: string) =>
  [...document.body.querySelectorAll<HTMLElement>('button, [role^="menuitem"]')].find(
    b => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name || b.textContent?.trim() === name,
  )!;
const click = (el: HTMLElement) => act(() => el.click());
const openAccountMenu = () => click(document.querySelector<HTMLElement>('nav.app-rail [aria-label="Account menu"]')!);

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  mocks.pathname = '/calendar';
  mocks.user = { id: 'u1', email: 'luis@example.com' };
  mocks.tags = [];
  mocks.addNote.mockReturnValue({ id: -1 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('opens the global modals from any page: T for a new task, Manage tags from the account menu', () => {
    render();
    press('t');
    expect(open()).toBe('showNewTaskModal');

    openAccountMenu();
    // No tags yet: Manage tags starts by creating one.
    click(button('Manage tags'));
    expect(open()).toContain('showCreateTagModal');
  });

  it("opens today's new-event form and the create-tag form from the New menu", () => {
    render();
    const newEvent = () => document.querySelector('[role="dialog"][aria-label="New event"]');
    click(button('New'));
    click(button('New event'));
    expect(newEvent()).toBeTruthy();
    click(button('Close event'));
    expect(newEvent()).toBeNull();

    click(button('New'));
    click(button('New tag'));
    expect(open()).toBe('showCreateTagModal');
  });

  it('ignores shortcuts while typing', () => {
    render();
    const input = document.createElement('input');
    container.appendChild(input);
    press('t', input);
    expect(open()).toBe('');
  });

  it('N makes a note and opens it on the Notes page when not on Home; G then a letter goes to a page', () => {
    render();
    press('n');
    expect(mocks.addNote).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/notes?id=-1');

    press('g');
    press('a');
    expect(mocks.push).toHaveBeenLastCalledWith('/archive');
  });

  it('asks before logging out, and logs out on confirm', async () => {
    render();
    openAccountMenu();
    click(button('Log out'));
    const dialog = document.body.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Are you sure you want to sign out?');
    expect(mocks.signOut).not.toHaveBeenCalled();

    click(button('Cancel'));
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();

    openAccountMenu();
    click(button('Log out'));
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find(b => b.textContent === 'Sign out')!;
    await act(async () => { confirm.click(); });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith('/login');
  });

  it('renders the page alone, with no nav or modals, when signed out', () => {
    mocks.user = null;
    render();
    expect(container.textContent).toBe('page');
    expect(document.querySelector('nav')).toBeNull();
    expect(open()).toBeUndefined();
  });
});
