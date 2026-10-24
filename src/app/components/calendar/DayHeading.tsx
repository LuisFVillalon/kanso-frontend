'use client';

import React from 'react';
import { PartyPopper } from 'lucide-react';
import { useCalendarTerms } from '@/app/hooks/useCalendarSettings';
import { useWorkDay } from '@/app/hooks/useWorkDay';
import { getHolidays } from '@/app/lib/monthPersonality';
import { termOnDay } from '@/app/lib/termPeriods';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { dayContextLine } from '@/app/utils/dayReport';

/**
 * The day report's heading, shared by DayDetailModal and DaySummaryPanel: the
 * date, a holiday chip, and a line with the work window or Rest day and the
 * term the day falls in.
 */
const DayHeading: React.FC<{ date: Date }> = ({ date }) => {
  const holidayName = getHolidays(date.getFullYear())[date.getMonth()]?.[date.getDate()];
  const workDay = useWorkDay(date);
  const term = termOnDay(useCalendarTerms(), toLocalDateStr(date))?.title ?? null;
  const context = workDay ? dayContextLine({ ...workDay, term }) : term;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
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
      </div>
      {context && <p data-day-context className="text-xs text-text-muted mt-0.5">{context}</p>}
    </div>
  );
};

export default DayHeading;
