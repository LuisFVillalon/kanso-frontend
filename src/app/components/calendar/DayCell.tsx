'use client';

import React from 'react';
import { SquareCheck, FileText } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import { toLocalDateStr } from '@/app/utils/dateUtils';

interface DayCellProps {
  date: Date;
  data: DayData | undefined;
  isToday: boolean;
  onSelect: (date: Date) => void;
  /** Month accent hue — used for the holiday dot. */
  hue: string;
  holidayName?: string;
  /** The picked day, shown in the day panel beside the grid. Undefined where the grid has no picked day. */
  isSelected?: boolean;
  /** Roving tab stop: 0 for the grid's one focusable day, -1 for the rest. */
  tabIndex?: number;
}

const fmtHours = (hours: number): string => (Number.isInteger(hours) ? `${hours}` : hours.toFixed(1));

// A single day cell in a month grid — day number plus compact indicators for
// habits completed (colored dots, tag color), tasks due + estimated hours,
// and notes edited. Deliberately terse; the day panel beside the calendar
// page's month (or the dashboard tile's DayDetailModal) carries the full text.
const DayCell: React.FC<DayCellProps> = ({ date, data, isToday, onSelect, hue, holidayName, isSelected, tabIndex }) => {
  const habitDots = data?.habitsCompleted ?? [];
  const taskCount = data?.tasksDue.length ?? 0;
  const hours = data?.estimatedHours ?? 0;
  const noteCount = data?.notesEdited.length ?? 0;
  const hasContent = habitDots.length > 0 || taskCount > 0 || noteCount > 0;

  const visibleDots = habitDots.slice(0, 4);
  const overflowDots = habitDots.length - visibleDots.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      data-date={toLocalDateStr(date)}
      aria-pressed={isSelected}
      tabIndex={tabIndex}
      title={holidayName ?? date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
      aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${holidayName ? ` — ${holidayName}` : ''}${hasContent ? ' — has activity' : ''}`}
      className="relative flex flex-col text-left rounded-md p-1 sm:p-1.5 transition-transform duration-150 ease-in-out hover:z-10 hover:-translate-y-px"
      style={{
        minHeight: 60,
        backgroundColor: isSelected ? 'var(--tm-accent-subtle)' : 'var(--tm-surface)',
        border: `1px solid ${isSelected ? 'var(--tm-accent)' : 'var(--tm-border-subtle)'}`,
        boxShadow: isToday || isSelected ? '0 0 0 1.5px var(--tm-accent)' : 'none',
      }}
    >
      <span
        className="text-[10px] sm:text-[11px] font-semibold leading-none"
        style={{ color: isToday || isSelected ? 'var(--tm-accent)' : 'var(--tm-text-secondary)' }}
      >
        {date.getDate()}
      </span>

      {holidayName && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{ top: 5, right: 5, width: 5, height: 5, backgroundColor: hue }}
        />
      )}

      {habitDots.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5 mt-1">
          {visibleDots.map((h, i) => (
            <span
              key={`${h.id}-${i}`}
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: h.tags[0]?.color ?? 'var(--tm-accent)' }}
              title={h.title}
            />
          ))}
          {overflowDots > 0 && (
            <span className="text-[8px] leading-none text-text-muted">+{overflowDots}</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-1 flex items-center justify-between gap-1 flex-wrap">
        {taskCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-semibold text-text-muted leading-none">
            <SquareCheck className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            {taskCount}
          </span>
        )}
        {hours > 0 && (
          <span className="text-[8px] sm:text-[9px] font-semibold leading-none" style={{ color: 'var(--tm-accent)' }}>
            {fmtHours(hours)}h
          </span>
        )}
        {noteCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-semibold text-text-muted leading-none">
            <FileText className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            {noteCount}
          </span>
        )}
      </div>
    </button>
  );
};

export default DayCell;
