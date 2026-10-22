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
const yearData = vi.hoisted(() => vi.fn());
vi.mock('@/app/hooks/useYearCalendarData', () => ({ useYearCalendarData: yearData }));
vi.mock('./WeekView', () => ({ default: () => <p>week view</p> }));
vi.mock('./DaySummaryPanel', () => ({
  default: ({ date }: { date: Date | null }) => <p data-testid="summary">{date ? date.toDateString() : 'no day'}</p>,
}));
vi.mock('./MonthCalendar', () => ({
  default: ({ year, month, onSelectDay }: { year: number; month: number; onSelectDay: (d: Date) => void }) => (
    <button type="button" data-testid="month" onClick={() => onSelectDay(new Date(year, month, 1))}>
      month {year}-{month + 1}
    </button>
  ),
}));
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
const months = () => [...container.querySelectorAll('[data-testid="month"]')].map(m => m.textContent);
const labelled = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const todayButton = () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Today');
const button = (title: string) => container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
const pressed = () =>
  [...container.querySelectorAll('button[aria-pressed="true"]')].map(b => b.getAttribute('title'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0)); // Wed 21 Oct 2026
  yearData.mockReset().mockImplementation((year: number) => ({
    dayData: new Map(), habits: [], loading: false, yearLoading: year !== 2026,
  }));
  auth.user = { id: 'user-1' };
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
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

  it('has no Reports link — reports live on their own page', () => {
    render();
    expect(container.querySelector('a[href="/reports"]')).toBeNull();
    expect(container.querySelector('[aria-label="Reports"]')).toBeNull();
  });

  it('pages All Months through past and future years and back to this year', () => {
    render();
    expect(months()).toHaveLength(12);
    expect(months()[0]).toBe('month 2026-1');
    expect(todayButton()).toBeUndefined();

    act(() => labelled('Previous year').click());
    act(() => labelled('Previous year').click());
    expect(container.querySelector('h2')!.textContent).toBe('2024');
    expect(months()[0]).toBe('month 2024-1');
    expect(yearData).toHaveBeenLastCalledWith(2024);
    expect(container.querySelector('[aria-label="Loading 2024 habits"]')).toBeTruthy();

    act(() => todayButton()!.click());
    act(() => labelled('Next year').click());
    expect(months()[11]).toBe('month 2027-12');
    expect(yearData).toHaveBeenLastCalledWith(2027);

    act(() => todayButton()!.click());
    expect(months()[0]).toBe('month 2026-1');
    expect(todayButton()).toBeUndefined();
  });

  it('steps the carousel across year boundaries and keeps the year in the header', () => {
    render();
    act(() => button('Carousel view').click());
    expect(months()).toEqual(['month 2026-10']);
    expect(container.querySelector('[data-testid="summary"]')!.textContent).toBe('Wed Oct 21 2026');

    for (let i = 0; i < 3; i++) act(() => labelled('Next month').click());
    expect(months()).toEqual(['month 2027-1']);
    expect(container.querySelector('h2')!.textContent).toBe('2027');
    expect(yearData).toHaveBeenLastCalledWith(2027);
    // Today's summary isn't in 2027's data, so the picked day is cleared.
    expect(container.querySelector('[data-testid="summary"]')!.textContent).toBe('no day');

    act(() => labelled('Previous month').click());
    expect(months()).toEqual(['month 2026-12']);
    act(() => labelled('Previous year').click());
    expect(months()).toEqual(['month 2025-12']);

    act(() => todayButton()!.click());
    expect(months()).toEqual(['month 2026-10']);
    expect(container.querySelector('[data-testid="summary"]')!.textContent).toBe('Wed Oct 21 2026');
  });

  it('reopens a remembered view on the current year, not a previously browsed one', () => {
    render();
    act(() => button('Carousel view').click());
    act(() => labelled('Previous year').click());
    expect(months()).toEqual(['month 2025-10']);

    remount();
    expect(pressed()).toEqual(['Carousel view']);
    expect(months()).toEqual(['month 2026-10']);
  });
});
