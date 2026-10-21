'use client';

import React from 'react';
import { CalendarDays, PartyPopper } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { Habit } from '@/app/types/habit';
import { getHolidays } from '@/app/lib/monthPersonality';
import DaySummary from './DaySummary';
import DayMoodChip from './DayMoodChip';

interface DaySummaryPanelProps {
  date: Date | null;
  data: DayData | undefined;
  totalHabits: number;
  allHabits: Habit[];
  dayData: Map<string, DayData>;
  /** 'widget' = compact dashboard-card layout; 'page' = full /calendar page layout. */
  variant?: 'page' | 'widget';
  /** Shows the day's mood chip, to log or edit its check-in. */
  showMood?: boolean;
}

// Right-hand pane of the month carousel — mirrors DayDetailModal's content
// inline instead of as an overlay, so picking a day in the carousel doesn't
// cover the calendar it was picked from.
const DaySummaryPanel: React.FC<DaySummaryPanelProps> = ({ date, data, totalHabits, allHabits, dayData, variant = 'page', showMood = false }) => {
  const holidayName = date ? getHolidays(date.getFullYear())[date.getMonth()]?.[date.getDate()] : undefined;

  return (
    <div className="card h-full p-4 sm:p-5 flex flex-col overflow-y-auto scrollbar-custom">
      {date ? (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <h2 className="text-base sm:text-lg text-text-primary">
              {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            {holidayName && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
              >
                <PartyPopper className="w-3.5 h-3.5" />
                {holidayName}
              </span>
            )}
            {showMood && <DayMoodChip date={date} data={data} totalHabits={totalHabits} />}
          </div>
          <DaySummary date={date} data={data} totalHabits={totalHabits} allHabits={allHabits} dayData={dayData} variant={variant} />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
          <CalendarDays className="w-8 h-8 text-text-muted" />
          <p className="text-sm text-text-muted">Select a day on the calendar to see its summary</p>
        </div>
      )}
    </div>
  );
};

export default DaySummaryPanel;
