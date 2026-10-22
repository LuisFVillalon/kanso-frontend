// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/app/context/AppShellContext', () => ({
  useAppShell: () => ({ profileState: { profile: { moodCheckins: { daily: false } }, loaded: true } }),
}));
vi.mock('@/app/hooks/useYearCalendarData', () => ({
  useYearCalendarData: () => ({ year: 2026, dayData: new Map(), habits: [], loading: false }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('./WeekView', () => ({ default: () => <p>week view</p> }));
vi.mock('./MonthCarousel', () => ({ default: () => <p>carousel view</p> }));
vi.mock('./DaySummaryPanel', () => ({ default: () => null }));
vi.mock('./MonthCalendar', () => ({ default: () => <p>month</p> }));
vi.mock('./DayDetailModal', () => ({ default: () => null }));
vi.mock('@/app/lib/backend-api', () => ({}));

import CalendarView from './CalendarView';
import { CALENDAR_VIEW_KEY_PREFIX } from '@/app/hooks/useCalendarViewMode';

let container: HTMLDivElement;
let root: Root;

const render = () => act(() => root.render(<CalendarView />));
const remount = () => {
  act(() => root.unmount());
  root = createRoot(container);
  render();
};
const button = (title: string) => container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
const pressed = () =>
  [...container.querySelectorAll('button[aria-pressed="true"]')].map(b => b.getAttribute('title'));

beforeEach(() => {
  auth.user = { id: 'user-1' };
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CalendarView', () => {
  it('opens on All Months on a first visit', () => {
    render();
    expect(pressed()).toEqual(['All months view']);
    expect(container.textContent).toContain('month');
  });

  it('reopens in the view the user last left it in', () => {
    render();
    act(() => button('Week view').click());
    expect(container.textContent).toContain('week view');
    expect(localStorage.getItem(`${CALENDAR_VIEW_KEY_PREFIX}:user-1`)).toBe('"week"');

    remount();
    expect(pressed()).toEqual(['Week view']);
    expect(container.textContent).toContain('week view');

    act(() => button('Carousel view').click());
    remount();
    expect(pressed()).toEqual(['Carousel view']);
  });

  it('remembers the view per account', () => {
    render();
    act(() => button('Week view').click());

    auth.user = { id: 'user-2' };
    remount();
    expect(pressed()).toEqual(['All months view']);
  });

  it('ignores a stored view it does not know, and survives unreadable storage', () => {
    localStorage.setItem(`${CALENDAR_VIEW_KEY_PREFIX}:user-1`, '"report"');
    render();
    expect(pressed()).toEqual(['All months view']);

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    remount();
    expect(pressed()).toEqual(['All months view']);
    act(() => button('Week view').click());
    expect(pressed()).toEqual(['Week view']);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('links to the Reports page instead of showing the report inline', () => {
    render();
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Reports"]')!;
    expect(link.getAttribute('href')).toBe('/reports');
    expect(button('Report view')).toBeNull();
  });
});
