// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MonthCalendar from './MonthCalendar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const cell = (date: string) => container.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
const press = (el: Element, key: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });

// Stands in for CalendarView: picking a day pages the grid to its month.
const Picker: React.FC<{ start: Date }> = ({ start }) => {
  const [picked, setPicked] = useState<Date>(start);
  return (
    <MonthCalendar
      year={picked.getFullYear()}
      month={picked.getMonth()}
      dayData={new Map()}
      todayStr="2026-10-21"
      onSelectDay={setPicked}
      selectedDate={picked}
      onNavigate={setPicked}
    />
  );
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MonthCalendar', () => {
  it('runs each week Sunday to Saturday', () => {
    act(() => root.render(<MonthCalendar year={2026} month={9} dayData={new Map()} todayStr="2026-10-21" onSelectDay={() => {}} />));
    const headers = [...container.querySelectorAll('.grid-cols-7')][0].children;
    expect([...headers].map(h => h.textContent)).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
    // 1 Oct 2026 is a Thursday: four blanks, then the 1st under Th.
    const firstRow = [...container.querySelectorAll('[role="group"] > *')].slice(0, 7);
    expect(firstRow.map(c => c.getAttribute('data-date'))).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('highlights the picked day and makes it the only tab stop', () => {
    act(() => root.render(<Picker start={new Date(2026, 9, 14)} />));
    expect(cell('2026-10-14').getAttribute('aria-pressed')).toBe('true');
    expect(cell('2026-10-21').getAttribute('aria-pressed')).toBe('false');
    const stops = [...container.querySelectorAll('button[data-date]')].filter(b => b.getAttribute('tabindex') === '0');
    expect(stops.map(b => b.getAttribute('data-date'))).toEqual(['2026-10-14']);
  });

  it('falls back to today, then the 1st, as the tab stop when the picked day is elsewhere', () => {
    const render = (month: number) => act(() => root.render(
      <MonthCalendar year={2026} month={month} dayData={new Map()} todayStr="2026-10-21" onSelectDay={() => {}} selectedDate={null} onNavigate={() => {}} />,
    ));
    render(9);
    expect(cell('2026-10-21').tabIndex).toBe(0);
    expect(cell('2026-10-01').tabIndex).toBe(-1);
    render(10);
    expect(cell('2026-11-01').tabIndex).toBe(0);
  });

  it('moves the picked day with the keyboard, and focus follows into the next month', () => {
    act(() => root.render(<Picker start={new Date(2026, 9, 21)} />));
    cell('2026-10-21').focus();

    press(cell('2026-10-21'), 'ArrowRight');
    expect(document.activeElement).toBe(cell('2026-10-22'));
    expect(cell('2026-10-22').getAttribute('aria-pressed')).toBe('true');

    press(cell('2026-10-22'), 'ArrowDown');
    press(cell('2026-10-29'), 'ArrowDown');
    expect(cell('2026-11-05').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(cell('2026-11-05'));

    press(cell('2026-11-05'), 'PageUp');
    expect(document.activeElement).toBe(cell('2026-10-05'));
  });

  it('leaves keys alone when keyboard movement is off', () => {
    const onSelectDay = vi.fn();
    act(() => root.render(<MonthCalendar year={2026} month={9} dayData={new Map()} todayStr="2026-10-21" onSelectDay={onSelectDay} />));
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => { cell('2026-10-21').dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    // The dashboard overlay has no picked day: no pressed state, no roving tab stops.
    expect(cell('2026-10-21').hasAttribute('aria-pressed')).toBe(false);
    expect(cell('2026-10-21').hasAttribute('tabindex')).toBe(false);
  });

  it("marks the term's days and names the terms touching the month", () => {
    act(() => root.render(
      <MonthCalendar
        year={2026}
        month={4}
        dayData={new Map()}
        todayStr="2026-10-21"
        onSelectDay={() => {}}
        terms={[
          { title: 'Spring 2026', start_date: '2026-01-20', end_date: '2026-05-15', archived: true },
          { title: 'Summer session', start_date: '2026-05-26', end_date: '2026-08-07', archived: false },
          { title: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-18', archived: false },
        ]}
      />,
    ));
    const band = (date: string) => cell(date).querySelector('[data-term-band]');
    expect(band('2026-05-15')).not.toBeNull();
    expect(cell('2026-05-15').getAttribute('aria-label')).toContain('Spring 2026');
    expect(band('2026-05-16')).toBeNull();
    expect(band('2026-05-26')).not.toBeNull();
    const chips = [...container.querySelectorAll('[data-term]')].map(c => c.textContent);
    expect(chips).toEqual(['Spring 2026· Jan 20 – May 15, 2026 · archived', 'Summer session· May 26 – Aug 7, 2026']);
  });
});

