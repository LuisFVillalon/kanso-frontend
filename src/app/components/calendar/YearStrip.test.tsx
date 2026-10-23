// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import YearStrip from './YearStrip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const day = (tasks: number, habits = 0): DayData => ({
  tasksDue: Array.from({ length: tasks }, (_, i) => ({ id: i })),
  tasksCompleted: [],
  habitsCompleted: Array.from({ length: habits }, (_, i) => ({ id: i })),
  notesEdited: [],
  estimatedHours: 0,
} as unknown as DayData);

const months = () => [...container.querySelectorAll<HTMLButtonElement>('button')];
const month = (name: string) => months().find(b => b.getAttribute('aria-label')!.startsWith(`${name} `))!;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('YearStrip', () => {
  const onFocusMonth = vi.fn();
  const onSelectDay = vi.fn();
  const render = (dayData = new Map<string, DayData>()) => act(() => root.render(
    <YearStrip
      year={2026}
      focusedMonth={9}
      dayData={dayData}
      todayStr="2026-10-21"
      selectedDate={new Date(2026, 9, 14)}
      onFocusMonth={onFocusMonth}
      onSelectDay={onSelectDay}
    />,
  ));

  beforeEach(() => { onFocusMonth.mockReset(); onSelectDay.mockReset(); });

  it('shows twelve months, one button each, with the focused one pressed', () => {
    render(new Map([['2026-03-02', day(2)], ['2026-03-20', day(1)]]));
    expect(months()).toHaveLength(12);
    expect(month('October').getAttribute('aria-pressed')).toBe('true');
    expect(months().filter(b => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(month('March').getAttribute('aria-label')).toBe('March 2026, 3 tasks due');
    expect(month('June').getAttribute('aria-label')).toBe('June 2026, 0 tasks due');
    expect(container.textContent).toContain('2026 at a glance');
  });

  it('shades busier days darker', () => {
    render(new Map([['2026-03-02', day(1)], ['2026-03-03', day(4, 4)]]));
    const shade = (date: string) => (container.querySelector(`[data-date="${date}"] span`) as HTMLElement | null)?.style.opacity;
    expect(shade('2026-03-01')).toBeUndefined();
    expect(Number(shade('2026-03-02'))).toBeLessThan(Number(shade('2026-03-03')));
  });

  it('focuses a month on click, or picks the day that was clicked', () => {
    render();
    act(() => month('March').click());
    expect(onFocusMonth).toHaveBeenCalledWith(2);
    expect(onSelectDay).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLElement>('[data-date="2026-06-15"]')!.click());
    expect(onSelectDay).toHaveBeenCalledTimes(1);
    expect(onSelectDay.mock.calls[0][0].toDateString()).toBe('Mon Jun 15 2026');
    expect(onFocusMonth).toHaveBeenCalledTimes(1);
  });

  it('outlines today and the picked day', () => {
    render();
    const outline = (date: string) => (container.querySelector(`[data-date="${date}"]`) as HTMLElement).style.outline;
    expect(outline('2026-10-21')).toContain('var(--tm-accent)');
    expect(outline('2026-10-14')).toContain('var(--tm-text-primary)');
    expect(outline('2026-10-15')).toBe('');
  });
});
