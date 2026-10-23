// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/app/hooks/useDailyMood', () => ({ useDailyMood: () => false }));
const yearData = vi.hoisted(() => vi.fn());
vi.mock('@/app/hooks/useYearCalendarData', () => ({ useYearCalendarData: yearData }));
vi.mock('./WeekView', () => ({ default: () => <p>week view</p> }));
vi.mock('./DaySummaryPanel', () => ({
  default: ({ date }: { date: Date | null }) => <p data-testid="summary">{date ? date.toDateString() : 'no day'}</p>,
}));
vi.mock('./MonthCalendar', () => ({
  default: ({ year, month, onSelectDay, selectedDate, onNavigate }: {
    year: number; month: number; onSelectDay: (d: Date) => void; selectedDate?: Date | null; onNavigate?: (d: Date) => void;
  }) => (
    <div>
      <button type="button" data-testid="month" data-selected={selectedDate ? selectedDate.toDateString() : ''} onClick={() => onSelectDay(new Date(year, month, 1))}>
        month {year}-{month + 1}
      </button>
      <button type="button" data-testid="navigate" onClick={() => onNavigate?.(new Date(year, month + 1, 2))}>navigate</button>
    </div>
  ),
}));
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
  [...container.querySelectorAll('button[title][aria-pressed="true"]')].map(b => b.getAttribute('title'));
const summary = () => container.querySelector('[data-testid="summary"]')!.textContent;
const stripMonth = (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label^="${name} "]`)!;

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
  it('opens on Month on a first visit, with today picked', () => {
    render();
    expect(pressed()).toEqual(['Month view']);
    expect(months()).toEqual(['month 2026-10']);
    expect(summary()).toBe('Wed Oct 21 2026');
    expect(container.querySelector('[data-testid="month"]')!.getAttribute('data-selected')).toBe('Wed Oct 21 2026');
    expect(button('Carousel view')).toBeNull();
    expect(button('All months view')).toBeNull();
  });

  it('reopens in the view the user last left it in', () => {
    render();
    act(() => button('Week view').click());
    expect(container.textContent).toContain('week view');
    expect(localStorage.getItem(`${CALENDAR_VIEW_KEY_PREFIX}:user-1`)).toBe('"week"');

    remount();
    expect(pressed()).toEqual(['Week view']);
    expect(container.textContent).toContain('week view');

    act(() => button('Month view').click());
    remount();
    expect(pressed()).toEqual(['Month view']);
  });

  it('remembers the view per account', () => {
    render();
    act(() => button('Week view').click());

    auth.user = { id: 'user-2' };
    remount();
    expect(pressed()).toEqual(['Month view']);
  });

  it.each(['carousel', 'all'])('opens Month for a device that last used the retired %s view', legacy => {
    localStorage.setItem(`${CALENDAR_VIEW_KEY_PREFIX}:user-1`, JSON.stringify(legacy));
    render();
    expect(pressed()).toEqual(['Month view']);
    expect(months()).toEqual(['month 2026-10']);
  });

  it('ignores a stored view it does not know, and survives unreadable storage', () => {
    localStorage.setItem(`${CALENDAR_VIEW_KEY_PREFIX}:user-1`, '"report"');
    render();
    expect(pressed()).toEqual(['Month view']);

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    remount();
    expect(pressed()).toEqual(['Month view']);
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

  it('pages through past and future years and back to today', () => {
    render();
    expect(todayButton()).toBeUndefined();

    act(() => labelled('Previous year').click());
    act(() => labelled('Previous year').click());
    expect(container.querySelector('h2')!.textContent).toBe('2024');
    expect(months()).toEqual(['month 2024-10']);
    expect(stripMonth('January').getAttribute('aria-label')).toMatch(/^January 2024/);
    expect(yearData).toHaveBeenLastCalledWith(2024);
    expect(container.querySelector('[aria-label="Loading 2024 habits"]')).toBeTruthy();
    expect(summary()).toBe('no day');

    act(() => todayButton()!.click());
    act(() => labelled('Next year').click());
    expect(months()).toEqual(['month 2027-10']);
    expect(yearData).toHaveBeenLastCalledWith(2027);

    act(() => todayButton()!.click());
    expect(months()).toEqual(['month 2026-10']);
    expect(summary()).toBe('Wed Oct 21 2026');
    expect(todayButton()).toBeUndefined();
  });

  it('steps months across year boundaries and keeps the year in the header', () => {
    render();
    for (let i = 0; i < 3; i++) act(() => labelled('Next month').click());
    expect(months()).toEqual(['month 2027-1']);
    expect(container.querySelector('h2')!.textContent).toBe('2027');
    expect(yearData).toHaveBeenLastCalledWith(2027);

    act(() => labelled('Previous month').click());
    expect(months()).toEqual(['month 2026-12']);
    act(() => labelled('Previous year').click());
    expect(months()).toEqual(['month 2025-12']);

    act(() => todayButton()!.click());
    expect(months()).toEqual(['month 2026-10']);
    expect(summary()).toBe('Wed Oct 21 2026');
  });

  it('drops the picked day when paging to another month in the same year', () => {
    render();
    act(() => labelled('Next month').click());
    expect(months()).toEqual(['month 2026-11']);
    expect(summary()).toBe('no day');
    expect(todayButton()).toBeDefined();

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="month"]')!.click());
    expect(summary()).toBe('Sun Nov 01 2026');
  });

  it('focuses a month from the year strip, and picks a day from it', () => {
    render();
    expect(stripMonth('October').getAttribute('aria-pressed')).toBe('true');

    act(() => stripMonth('March').click());
    expect(months()).toEqual(['month 2026-3']);
    expect(stripMonth('March').getAttribute('aria-pressed')).toBe('true');
    expect(stripMonth('October').getAttribute('aria-pressed')).toBe('false');
    expect(summary()).toBe('no day');

    act(() => container.querySelector<HTMLElement>('[data-date="2026-06-15"]')!.click());
    expect(months()).toEqual(['month 2026-6']);
    expect(summary()).toBe('Mon Jun 15 2026');
  });

  it('follows keyboard movement into another month', () => {
    render();
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="navigate"]')!.click());
    expect(months()).toEqual(['month 2026-11']);
    expect(summary()).toBe('Mon Nov 02 2026');
    expect(stripMonth('November').getAttribute('aria-pressed')).toBe('true');
  });

  it('reopens a remembered view on the current month, not a previously browsed one', () => {
    render();
    act(() => labelled('Previous year').click());
    expect(months()).toEqual(['month 2025-10']);

    remount();
    expect(pressed()).toEqual(['Month view']);
    expect(months()).toEqual(['month 2026-10']);
  });
});
