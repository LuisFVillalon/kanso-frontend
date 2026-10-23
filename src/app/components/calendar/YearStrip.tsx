'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import { MONTH_NAMES } from '@/app/lib/monthPersonality';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { monthCells } from '@/app/utils/monthGrid';

interface YearStripProps {
  year: number;
  /** The month shown in full below the strip (0-11). */
  focusedMonth: number;
  dayData: Map<string, DayData>;
  todayStr: string;
  selectedDate: Date | null;
  onFocusMonth: (month: number) => void;
  onSelectDay: (date: Date) => void;
}

// Shade steps for 0 (nothing) to 4 (busiest). A day's activity is its habits
// completed, tasks due and notes edited, so past and future days both read.
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1];
const activityLevel = (d: DayData | undefined): number => {
  if (!d) return 0;
  const n = d.habitsCompleted.length + d.tasksDue.length + d.notesEdited.length;
  return n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 7 ? 3 : 4;
};

const Square: React.FC<{ level: number; outline?: string; dateStr?: string }> = ({ level, outline, dateStr }) => (
  <span
    data-date={dateStr}
    className="relative block aspect-square rounded-[2px] overflow-hidden"
    style={{
      backgroundColor: 'var(--tm-border-subtle)',
      outline: outline ? `1.5px solid ${outline}` : undefined,
    }}
  >
    {level > 0 && (
      <span className="absolute inset-0" style={{ backgroundColor: 'var(--tm-accent)', opacity: LEVEL_OPACITY[level] }} />
    )}
  </span>
);

// The year at a glance above the focused month: twelve mini months shaded by
// activity. Clicking a month focuses it; clicking one of its days also picks
// that day. Each month is a single button (its days are pointer targets
// only), so the strip adds 12 tab stops, not 365 — the focused month's grid
// carries day-by-day keyboard movement.
const YearStrip: React.FC<YearStripProps> = ({ year, focusedMonth, dayData, todayStr, selectedDate, onFocusMonth, onSelectDay }) => {
  const selectedStr = selectedDate ? toLocalDateStr(selectedDate) : null;
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, month) => {
      const cells = monthCells(year, month);
      const tasks = cells.reduce((sum, d) => sum + (d ? dayData.get(toLocalDateStr(d))?.tasksDue.length ?? 0 : 0), 0);
      return { month, cells, tasks };
    }),
    [year, dayData],
  );

  // On narrow screens the strip scrolls sideways; keep the focused month in view.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const focused = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (focused) el.scrollLeft = focused.offsetLeft - el.offsetLeft - (el.clientWidth - focused.clientWidth) / 2;
  }, [year, focusedMonth]);

  const handleClick = (month: number) => (e: React.MouseEvent) => {
    const dateStr = (e.target as HTMLElement).closest('[data-date]')?.getAttribute('data-date');
    if (dateStr) onSelectDay(parseLocalDate(dateStr));
    else onFocusMonth(month);
  };

  return (
    <section className="card p-3 sm:p-4 mb-4" aria-label={`${year} at a glance`}>
      <div className="flex items-center gap-3 mb-2.5 flex-wrap">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{year} at a glance</h3>
        <span className="flex items-center gap-1 text-[10px] text-text-muted" aria-hidden>
          Less
          {LEVEL_OPACITY.map((_, level) => (
            <span key={level} className="w-2.5"><Square level={level} /></span>
          ))}
          More
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-custom lg:grid lg:grid-cols-12 lg:overflow-visible lg:pb-0"
      >
        {months.map(({ month, cells, tasks }) => {
          const focused = month === focusedMonth;
          const isCurrentMonth = cells.some(d => d && toLocalDateStr(d) === todayStr);
          return (
            <button
              key={month}
              type="button"
              onClick={handleClick(month)}
              aria-pressed={focused}
              aria-label={`${MONTH_NAMES[month]} ${year}, ${tasks} ${tasks === 1 ? 'task' : 'tasks'} due`}
              className="flex-[0_0_5.75rem] lg:flex-auto min-w-0 snap-center flex flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors"
              style={{
                backgroundColor: focused ? 'var(--tm-surface-raised)' : 'var(--tm-surface)',
                border: `1px solid ${focused ? 'var(--tm-accent)' : 'var(--tm-border)'}`,
                boxShadow: focused ? '0 0 0 1px var(--tm-accent)' : 'none',
              }}
            >
              <span className="flex items-center justify-between gap-1 px-0.5 leading-none">
                <span className="text-[11px] font-bold" style={{ color: isCurrentMonth ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}>
                  {MONTH_NAMES[month].slice(0, 3)}
                </span>
                <span className="text-[10px] text-text-muted tabular-nums">{tasks}</span>
              </span>
              <span className="grid grid-cols-7 gap-[2px]">
                {cells.map((date, i) => {
                  if (!date) return <span key={i} />;
                  const dateStr = toLocalDateStr(date);
                  const outline = dateStr === selectedStr ? 'var(--tm-text-primary)' : dateStr === todayStr ? 'var(--tm-accent)' : undefined;
                  return <Square key={dateStr} dateStr={dateStr} level={activityLevel(dayData.get(dateStr))} outline={outline} />;
                })}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default YearStrip;
