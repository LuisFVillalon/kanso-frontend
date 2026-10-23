'use client';

import React, { useState } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useCalendarViewMode } from '@/app/hooks/useCalendarViewMode';
import { useDailyMood } from '@/app/hooks/useDailyMood';
import { useWeekCalendarHeight } from '@/app/hooks/useWeekCalendarHeight';
import { useYearCalendarData } from '@/app/hooks/useYearCalendarData';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import PageSpinner from '@/app/components/common/PageSpinner';
import MonthCarousel from './MonthCarousel';
import DaySummaryPanel from './DaySummaryPanel';
import WeekView from './WeekView';
import YearStrip from './YearStrip';

// The Month view: the year at a glance on top, the focused month below it and
// the picked day's summary beside it. The browsed year and month aren't
// persisted: the page always reopens on today.
const CalendarView: React.FC = () => {
  const today = new Date();
  const [year, setYear] = useState(() => today.getFullYear());
  const [month, setMonth] = useState(() => today.getMonth());
  const { dayData, habits, loading, yearLoading } = useYearCalendarData(year);
  const showMood = useDailyMood() === true;
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date());
  const [viewMode, setViewMode] = useCalendarViewMode();
  const weekHeight = useWeekCalendarHeight();

  const todayStr = toLocalDateStr(today);
  const atToday = year === today.getFullYear() && month === today.getMonth();

  // The panel only ever shows a day from the month on screen, so paging away
  // drops the picked day rather than leaving the panel on another month.
  const showMonth = (nextYear: number, nextMonth: number) => {
    setYear(nextYear);
    setMonth(nextMonth);
    setSelectedDate(d => (d && (d.getFullYear() !== nextYear || d.getMonth() !== nextMonth) ? null : d));
  };
  const pickDay = (date: Date) => {
    showMonth(date.getFullYear(), date.getMonth());
    setSelectedDate(date);
  };
  const goToToday = () => pickDay(today);

  if (loading) return <PageSpinner />;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl sm:text-3xl text-text-primary">Calendar</h1>
        {viewMode !== 'week' && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => showMonth(year - 1, month)} className="btn btn-ghost p-2" aria-label="Previous year" title="Previous year">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="min-w-[3.5rem] text-center text-base sm:text-lg text-text-primary tabular-nums" aria-live="polite">
              {year}
            </h2>
            <button type="button" onClick={() => showMonth(year + 1, month)} className="btn btn-ghost p-2" aria-label="Next year" title="Next year">
              <ChevronRight className="w-4 h-4" />
            </button>
            {!atToday && (
              <button type="button" onClick={goToToday} className="btn btn-secondary px-3 py-1.5 text-sm ml-1">
                Today
              </button>
            )}
            {yearLoading && <Loader2 className="w-4 h-4 ml-1 animate-spin text-text-muted" aria-label={`Loading ${year} habits`} />}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 p-1 rounded-lg bg-surface border border-border">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            aria-pressed={viewMode === 'week'}
            title="Week view"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'week'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            <span className="hidden sm:inline">Week</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            aria-pressed={viewMode === 'month'}
            title="Month view"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'month'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span className="hidden sm:inline">Month</span>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-6 sm:pb-10">
        {viewMode === 'week' ? (
          <WeekView {...weekHeight} />
        ) : (
          <>
            <YearStrip
              year={year}
              focusedMonth={month}
              dayData={dayData}
              todayStr={todayStr}
              selectedDate={selectedDate}
              onFocusMonth={m => showMonth(year, m)}
              onSelectDay={pickDay}
            />
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              <div className="lg:flex-1 lg:min-w-0">
                <MonthCarousel
                  year={year}
                  month={month}
                  onChangeMonth={showMonth}
                  dayData={dayData}
                  todayStr={todayStr}
                  onSelectDay={pickDay}
                  selectedDate={selectedDate}
                  onNavigate={pickDay}
                />
              </div>
              <div className="lg:flex-1 lg:min-w-0">
                <DaySummaryPanel
                  date={selectedDate}
                  data={selectedDate ? dayData.get(toLocalDateStr(selectedDate)) : undefined}
                  totalHabits={habits.length}
                  allHabits={habits}
                  dayData={dayData}
                  showMood={showMood}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CalendarView;
