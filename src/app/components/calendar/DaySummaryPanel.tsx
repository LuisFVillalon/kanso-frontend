'use client';

import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { Habit } from '@/app/types/habit';
import DaySummary from './DaySummary';
import DayHeading from './DayHeading';

interface DaySummaryPanelProps {
  date: Date | null;
  data: DayData | undefined;
  totalHabits: number;
  allHabits: Habit[];
  /** Shows the day's check-in, with a chip to log or edit it. */
  showMood?: boolean;
}

// Right-hand pane of the month carousel — mirrors DayDetailModal's content
// inline instead of as an overlay, so picking a day in the carousel doesn't
// cover the calendar it was picked from.
const DaySummaryPanel: React.FC<DaySummaryPanelProps> = ({ date, data, totalHabits, allHabits, showMood = false }) => (
  <div className="card h-full p-4 sm:p-5 flex flex-col overflow-y-auto scrollbar-custom">
    {date ? (
      <>
        <div className="mb-4">
          <DayHeading date={date} />
        </div>
        <DaySummary date={date} data={data} totalHabits={totalHabits} allHabits={allHabits} showMood={showMood} />
      </>
    ) : (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
        <CalendarDays className="w-8 h-8 text-text-muted" />
        <p className="text-sm text-text-muted">Select a day on the calendar to see its summary</p>
      </div>
    )}
  </div>
);

export default DaySummaryPanel;
