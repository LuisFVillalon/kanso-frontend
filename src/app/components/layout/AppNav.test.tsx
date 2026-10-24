// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import AppNav from './AppNav';
import { NAV_EXPANDED_KEY, useNavExpanded } from '@/app/hooks/useNavExpanded';

let container: HTMLDivElement;
let root: Root;
const makeActions = () => ({
  onNewTask: vi.fn(),
  onNewNote: vi.fn(),
  onNewHabit: vi.fn(),
  onNewEvent: vi.fn(),
  onNewTag: vi.fn(),
  onSettings: vi.fn(),
  onManageTags: vi.fn(),
  onManageHabits: vi.fn(),
  onLogout: vi.fn(),
});
let actions: ReturnType<typeof makeActions>;

// AppShell's wiring of the remembered expanded state.
const Harness: React.FC = () => {
  const [expanded, setExpanded] = useNavExpanded();
  return <AppNav expanded={expanded} onToggleExpanded={() => setExpanded(!expanded)} profileName="Luis" email="luis@example.com" {...actions} />;
};

const render = () => act(() => root.render(<Harness />));
const rail = () => container.querySelector<HTMLElement>('nav.app-rail')!;
const tabbar = () => container.querySelector<HTMLElement>('nav.app-tabbar')!;
const within = (el: ParentNode, name: string) =>
  [...el.querySelectorAll<HTMLElement>('a, button')].find(
    b => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name || b.textContent?.trim().startsWith(name),
  )!;
const click = (el: HTMLElement) => act(() => el.click());
const menu = () => container.querySelector<HTMLElement>('[role="menu"]');
const menuItem = (name: string) =>
  [...menu()!.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(b => b.textContent?.trim().startsWith(name))!;

beforeEach(() => {
  // The OS theme, for the Appearance control: light.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  mocks.pathname = '/';
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actions = makeActions();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe('AppNav', () => {
  it('marks the current page with aria-current, on the rail and the tab bar', () => {
    mocks.pathname = '/calendar';
    render();
    const current = (nav: HTMLElement) =>
      [...nav.querySelectorAll('[aria-current="page"]')].map(el => el.textContent?.trim());
    expect(rail().getAttribute('aria-label')).toBe('Main');
    expect(current(rail())).toEqual(['Calendar']);
    expect(current(tabbar())).toEqual(['Calendar']);

    mocks.pathname = '/trash';
    render();
    expect(current(rail())).toEqual(['Deleted']);
    // Reports, Archive and Recently deleted live under More on a phone.
    expect(current(tabbar())).toEqual(['More']);

    mocks.pathname = '/reports';
    render();
    expect(current(rail())).toEqual(['Reports']);
    expect(current(tabbar())).toEqual(['More']);
  });

  it('renders the rail from md up and the bottom tab bar below md', () => {
    render();
    expect(rail().className).toContain('hidden md:flex');
    expect(tabbar().className).toContain('md:hidden');
    expect([...tabbar().querySelectorAll('a, button')].map(el => el.getAttribute('aria-label') ?? el.textContent?.trim()))
      .toEqual(['Home', 'Notes', 'New', 'Calendar', 'More']);
  });

  it('expands to show full labels and keyboard hints, and remembers it', () => {
    render();
    expect(rail().hasAttribute('data-expanded')).toBe(false);
    expect(within(rail(), 'Deleted')).toBeDefined();
    click(within(rail(), 'Expand navigation'));
    expect(rail().hasAttribute('data-expanded')).toBe(true);
    expect(within(rail(), 'Calendar').textContent).toContain('G C');
    expect(within(rail(), 'Reports').textContent).toContain('G R');
    expect(within(rail(), 'Reports').getAttribute('href')).toBe('/reports');
    expect(within(rail(), 'Recently deleted')).toBeDefined();
    expect(localStorage.getItem(NAV_EXPANDED_KEY)).toBe('true');

    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(rail().hasAttribute('data-expanded')).toBe(true);
    expect(within(rail(), 'Collapse navigation').getAttribute('aria-expanded')).toBe('true');
  });

  it('runs each New menu action, closing the menu back onto its button', () => {
    render();
    const newButton = within(rail(), 'New');
    click(newButton);
    expect(newButton.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(menuItem('New task'));
    expect(menuItem('New task').getAttribute('aria-keyshortcuts')).toBe('T');
    click(menuItem('New task'));
    expect(actions.onNewTask).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(newButton);

    click(newButton);
    click(menuItem('New note'));
    click(newButton);
    click(menuItem('New event'));
    click(newButton);
    click(menuItem('New habit'));
    click(newButton);
    click(menuItem('New tag'));
    expect(actions.onNewNote).toHaveBeenCalledTimes(1);
    expect(actions.onNewEvent).toHaveBeenCalledTimes(1);
    expect(actions.onNewHabit).toHaveBeenCalledTimes(1);
    expect(actions.onNewTag).toHaveBeenCalledTimes(1);
  });

  it('runs each account menu action, and Escape closes it', () => {
    render();
    const avatar = within(rail(), 'Account menu');
    click(avatar);
    expect(menu()!.textContent).toContain('luis@example.com');
    click(menuItem('Settings'));
    click(avatar);
    click(menuItem('Manage tags'));
    click(avatar);
    click(menuItem('Manage habits'));
    click(avatar);
    click(menuItem('Log out'));
    expect(actions.onSettings).toHaveBeenCalledTimes(1);
    expect(actions.onManageTags).toHaveBeenCalledTimes(1);
    expect(actions.onManageHabits).toHaveBeenCalledTimes(1);
    expect(actions.onLogout).toHaveBeenCalledTimes(1);

    click(avatar);
    act(() => { menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(avatar);
  });

  it('sets Light or Dark from the account menu', () => {
    render();
    click(within(rail(), 'Account menu'));
    expect(menuItem('Light').getAttribute('aria-checked')).toBe('true');
    click(menuItem('Dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(menuItem('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it("opens the phone sheets: New's create actions, and More's pages and account actions", () => {
    render();
    click(within(tabbar(), 'New'));
    const sheet = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(sheet()!.getAttribute('aria-label')).toBe('Create');
    expect(document.activeElement).toBe(within(sheet()!, 'New task'));
    click(within(sheet()!, 'New habit'));
    expect(actions.onNewHabit).toHaveBeenCalledTimes(1);
    expect(sheet()).toBeNull();
    click(within(tabbar(), 'New'));
    click(within(sheet()!, 'New event'));
    expect(actions.onNewEvent).toHaveBeenCalledTimes(1);
    click(within(tabbar(), 'New'));
    click(within(sheet()!, 'New tag'));
    expect(actions.onNewTag).toHaveBeenCalledTimes(1);

    click(within(tabbar(), 'More'));
    expect([...sheet()!.querySelectorAll('a, button')].map(el => el.textContent?.trim()))
      .toEqual(['Reports', 'Archive', 'Recently deleted', 'Manage habits', 'Manage tags', 'Settings', 'Light', 'Dark', 'Log out']);
    click(within(sheet()!, 'Log out'));
    expect(actions.onLogout).toHaveBeenCalledTimes(1);
  });
});
