'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CalendarRange, ChartColumn, GalleryHorizontal, LayoutGrid } from 'lucide-react';
import { useAppShell } from '@/app/context/AppShellContext';
import { useCalendarViewMode } from '@/app/hooks/useCalendarViewMode';
import { useYearCalendarData } from '@/app/hooks/useYearCalendarData';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import PageSpinner from '@/app/components/common/PageSpinner';
import MonthCalendar from './MonthCalendar';
import MonthCarousel from './MonthCarousel';
import DaySummaryPanel from './DaySummaryPanel';
import DayDetailModal from './DayDetailModal';
import WeekView from './WeekView';

const CalendarView: React.FC = () => {
  const { year, dayData, habits, loading } = useYearCalendarData();
  const { profile, loaded: profileLoaded } = useAppShell().profileState;
  const showMood = profileLoaded && profile.moodCheckins.daily;
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [carouselDate, setCarouselDate] = useState<Date | null>(() => new Date());
  const [viewMode, setViewMode] = useCalendarViewMode();

  const todayStr = toLocalDateStr(new Date());

  if (loading) return <PageSpinner />;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl sm:text-3xl text-text-primary">Calendar</h1>
        {viewMode !== 'week' && <span className="text-sm text-text-muted ml-1">{year}</span>}

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
            onClick={() => setViewMode('carousel')}
            aria-pressed={viewMode === 'carousel'}
            title="Carousel view"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'carousel'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <GalleryHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Carousel</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            aria-pressed={viewMode === 'all'}
            title="All months view"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'all'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">All Months</span>
          </button>
        </div>

        <Link
          href="/reports"
          title="Reports"
          aria-label="Reports"
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 rounded-lg bg-surface border border-border text-xs sm:text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChartColumn className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">Reports</span>
        </Link>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-6 sm:pb-10">
        {viewMode === 'week' ? (
          <WeekView />
        ) : viewMode === 'carousel' ? (
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="lg:flex-1 lg:min-w-0">
              <MonthCarousel
                year={year}
                dayData={dayData}
                todayStr={todayStr}
                onSelectDay={setCarouselDate}
              />
            </div>
            <div className="lg:flex-1 lg:min-w-0">
              <DaySummaryPanel
                date={carouselDate}
                data={carouselDate ? dayData.get(toLocalDateStr(carouselDate)) : undefined}
                totalHabits={habits.length}
                allHabits={habits}
                dayData={dayData}
                showMood={showMood}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 12 }, (_, month) => (
              <MonthCalendar
                key={month}
                year={year}
                month={month}
                dayData={dayData}
                todayStr={todayStr}
                onSelectDay={setSelectedDate}
              />
            ))}
          </div>
        )}
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          data={dayData.get(toLocalDateStr(selectedDate))}
          totalHabits={habits.length}
          allHabits={habits}
          dayData={dayData}
          onClose={() => setSelectedDate(null)}
          showMood={showMood}
        />
      )}
    </div>
  );
};

export default CalendarView;
