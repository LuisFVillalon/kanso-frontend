'use client';

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useYearCalendarData, type DayData } from '@/app/hooks/useYearCalendarData';
import { useCalendarTerms } from '@/app/hooks/useCalendarSettings';
import { termColor, termOnDay } from '@/app/lib/termPeriods';
import type { TermPeriod } from '@/app/types/calendar';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { monthCells } from '@/app/utils/monthGrid';
import { eventColor } from '@/app/utils/events';
import { CardShell } from '@/app/components/stats/CardShell';
import TileTools from '@/app/components/stats/TileTools';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';
import MonthCalendar from './MonthCalendar';
import DayDetailModal from './DayDetailModal';

/** Single pulsing placeholder block, shown while month data loads. */
const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-sm ${className}`} style={{ backgroundColor: 'var(--tm-border-subtle)' }} />
);

/** Pixel-approximate skeleton of the compact month tile. */
const CurrentMonthWidgetSkeleton: React.FC = () => (
  <CardShell compact icon={<CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />} header="Month">
    <div className="flex-1 min-h-0 grid grid-cols-7 gap-0.5">
      {Array.from({ length: 42 }, (_, i) => <Bone key={i} />)}
    </div>
  </CardShell>
);

interface CompactMonthGridProps {
  cells: (Date | null)[];
  dayData: Map<string, DayData>;
  todayStr: string;
  onSelectDay: (date: Date) => void;
  terms: TermPeriod[];
}

const CompactMonthGrid: React.FC<CompactMonthGridProps> = ({ cells, dayData, todayStr, onSelectDay, terms }) => (
  <div className="grid grid-cols-7 grid-rows-6 gap-[2px] w-full h-full">
    {cells.map((date, i) => {
      if (!date) return <div key={i} />;
      const dateStr = toLocalDateStr(date);
      const isToday = dateStr === todayStr;
      const data = dayData.get(dateStr);
      const hasTasks = !!data && (data.tasksDue.length > 0 || data.tasksCompleted.length > 0);
      const hasHabits = !!data && data.habitsCompleted.length > 0;
      const events = data?.events ?? [];
      const busy = hasTasks || hasHabits || events.length > 0;
      const term = termOnDay(terms, dateStr);
      return (
        <button
          type="button"
          key={dateStr}
          onClick={() => onSelectDay(date)}
          data-date={dateStr}
          title={term?.title}
          aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${term ? ` — ${term.title}` : ''}${events.length > 0 ? ` — ${events.length} event${events.length === 1 ? '' : 's'}` : ''}`}
          className="relative rounded-[4px] flex flex-col items-center justify-center gap-[2px] min-w-0 min-h-0"
          style={{
            border: isToday ? '1px solid var(--tm-accent)' : '1px solid var(--tm-border-subtle)',
            backgroundColor: busy ? 'var(--tm-accent-subtle)' : 'var(--tm-surface)',
          }}
        >
          <span className="text-[9px] font-medium leading-none" style={{ color: isToday ? 'var(--tm-accent)' : 'var(--tm-text-secondary)' }}>
            {date.getDate()}
          </span>
          {busy && (
            <span className="flex items-center gap-[2px]">
              {hasTasks && <span className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: 'var(--tm-accent)' }} />}
              {hasHabits && <span className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: 'var(--tm-success)' }} />}
              {events.length > 0 && <span data-event-dot className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: eventColor(events[0].tags) }} />}
            </span>
          )}
          {term && (
            <span
              aria-hidden
              data-term-band
              className="absolute left-[2px] right-[2px] bottom-[1px] h-[2px] rounded-full"
              style={{ backgroundColor: termColor(term), opacity: term.archived ? 0.55 : 0.75 }}
            />
          )}
        </button>
      );
    })}
  </div>
);

interface CurrentMonthWidgetProps {
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
  /** Shows the mood chip in a picked day's details. */
  showMood?: boolean;
}

/**
 * Compact dashboard tile: a dense 6×7 day grid for the current month (task/
 * habit/event presence as dots, an event's in its tag color, today outlined) — distinct from MonthCalendar's
 * richer per-day cells, which are sized for the full page/overlay, not a
 * 168px-row tile. Days inside a term (the current Term Tracker or an
 * archived term) get a thin band along their foot. Clicking a day still
 * opens the same DayDetailModal.
 */
const CurrentMonthWidget: React.FC<CurrentMonthWidgetProps> = ({ onExpand, dragHandleProps, showMood = false }) => {
  const { dayData, habits, loading } = useYearCalendarData();
  const terms = useCalendarTerms();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const cells = monthCells(now.getFullYear(), now.getMonth());

  if (loading) return <CurrentMonthWidgetSkeleton />;

  return (
    <CardShell
      compact
      icon={<CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />}
      header={now.toLocaleDateString('en-US', { month: 'long' })}
      headerAction={<TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />}
    >
      <div className="flex-1 min-h-0 flex flex-col gap-1.5">
        <div className="grid grid-cols-7 gap-0.5 text-center flex-shrink-0">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="text-[9px] font-semibold text-text-muted leading-none">{d}</span>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <CompactMonthGrid cells={cells} dayData={dayData} todayStr={todayStr} onSelectDay={setSelectedDate} terms={terms} />
        </div>
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          data={dayData.get(toLocalDateStr(selectedDate))}
          totalHabits={habits.length}
          allHabits={habits}
          onClose={() => setSelectedDate(null)}
          showMood={showMood}
        />
      )}
    </CardShell>
  );
};

interface CurrentMonthOverlayProps {
  /** Year/month to display; defaults to today's when omitted. */
  year?: number;
  month?: number;
  /** Shows the mood chip in a picked day's details. */
  showMood?: boolean;
}

/** Full-detail body rendered inside the shared expand overlay. Year/month are controlled by the overlay header's nav buttons in CalendarAndStats. */
export const CurrentMonthOverlay: React.FC<CurrentMonthOverlayProps> = ({ year, month, showMood = false }) => {
  const { dayData, habits, loading } = useYearCalendarData();
  const terms = useCalendarTerms();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const displayYear = year ?? now.getFullYear();
  const displayMonth = month ?? now.getMonth();

  if (loading) {
    return (
      <div className="card-glass overflow-hidden">
        <Bone className="h-[34px] w-full rounded-none" />
        <div className="pt-2.5 px-3 pb-3">
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 35 }, (_, i) => <Bone key={i} className="h-[60px]" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <MonthCalendar
        year={displayYear}
        month={displayMonth}
        dayData={dayData}
        todayStr={todayStr}
        onSelectDay={setSelectedDate}
        terms={terms}
      />

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          data={dayData.get(toLocalDateStr(selectedDate))}
          totalHabits={habits.length}
          allHabits={habits}
          onClose={() => setSelectedDate(null)}
          showMood={showMood}
        />
      )}
    </div>
  );
};

export default CurrentMonthWidget;
