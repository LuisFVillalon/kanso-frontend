'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import MonthCalendar from './MonthCalendar';

interface MonthCarouselProps {
  year: number;
  month: number; // 0-11
  /** Steps to another month; the year changes when stepping past December or January. */
  onChangeMonth: (year: number, month: number) => void;
  dayData: Map<string, DayData>;
  todayStr: string;
  onSelectDay: (date: Date) => void;
}

const ARROW_CLASS =
  'p-1.5 rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none flex-shrink-0';

// Single-month carousel — arrows step the displayed month back and forth,
// crossing into the previous or next year at the ends (December -> January
// of the next year and back).
const MonthCarousel: React.FC<MonthCarouselProps> = ({ year, month, onChangeMonth, dayData, todayStr, onSelectDay }) => {
  const step = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    onChangeMonth(next.getFullYear(), next.getMonth());
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous month"
        className={ARROW_CLASS}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        <MonthCalendar
          year={year}
          month={month}
          dayData={dayData}
          todayStr={todayStr}
          onSelectDay={onSelectDay}
        />
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next month"
        className={ARROW_CLASS}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

export default MonthCarousel;
