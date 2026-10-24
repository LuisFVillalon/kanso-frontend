'use client';

import React from 'react';
import { SquareCheck, FileText } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { TermPeriod } from '@/app/types/calendar';
import { termColor } from '@/app/lib/termPeriods';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { formatEventTime, occurrenceKey } from '@/app/utils/eventOccurrences';
import { eventColor } from '@/app/utils/events';
import type { EventOccurrence } from '@/app/types/event';

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
  /** The term this day falls in, marked by a band along the cell's foot. */
  term?: TermPeriod;
}

const fmtHours = (hours: number): string => (Number.isInteger(hours) ? `${hours}` : hours.toFixed(1));

// Titled event bars shown before the rest fold into "+N".
const MAX_EVENT_BARS = 2;

const eventTitle = (o: EventOccurrence) =>
  `${o.title} · ${formatEventTime(o)}${o.archived ? ' · archived' : o.past ? ' · past' : ''}`;

/**
 * One event as a bar in its tag's color, with its title from sm up; a phone
 * shows only a thin colored bar. Past events are faded, archived ones are
 * hatched and struck through.
 */
const EventBar: React.FC<{ occurrence: EventOccurrence }> = ({ occurrence: o }) => {
  const color = eventColor(o.tags);
  return (
    <span
      data-event-bar
      title={eventTitle(o)}
      className="block h-1 sm:h-auto rounded-sm sm:rounded-[3px] sm:px-1 sm:py-px text-[0px] sm:text-[9px] font-semibold leading-tight truncate text-text-primary"
      style={{
        borderLeft: `2px solid ${color}`,
        background: o.archived
          ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 22%, var(--tm-surface)) 0 3px, var(--tm-surface) 3px 6px)`
          : `color-mix(in srgb, ${color} ${o.past ? 14 : 24}%, var(--tm-surface))`,
        opacity: o.past && !o.archived ? 0.7 : 1,
        textDecoration: o.archived ? 'line-through' : undefined,
      }}
    >
      {o.title}
    </span>
  );
};

// A single day cell in a month grid — day number plus compact indicators for
// habits completed (colored dots, tag color), events (tag-colored bars),
// tasks due + estimated hours, and notes edited, with a band along the foot
// on days inside a term.
// Deliberately terse; the day panel beside the calendar
// page's month (or the dashboard tile's DayDetailModal) carries the full text.
const DayCell: React.FC<DayCellProps> = ({ date, data, isToday, onSelect, hue, holidayName, isSelected, tabIndex, term }) => {
  const habitDots = data?.habitsCompleted ?? [];
  const taskCount = data?.tasksDue.length ?? 0;
  const hours = data?.estimatedHours ?? 0;
  const noteCount = data?.notesEdited.length ?? 0;
  const events = data?.events ?? [];
  const hasContent = habitDots.length > 0 || taskCount > 0 || noteCount > 0 || events.length > 0;
  const visibleEvents = events.slice(0, MAX_EVENT_BARS);
  const overflowEvents = events.length - visibleEvents.length;
  const eventsLabel = events.length > 0 ? ` — ${events.length} event${events.length === 1 ? '' : 's'}` : '';

  const visibleDots = habitDots.slice(0, 4);
  const overflowDots = habitDots.length - visibleDots.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      data-date={toLocalDateStr(date)}
      aria-pressed={isSelected}
      tabIndex={tabIndex}
      title={[holidayName ?? date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), term?.title].filter(Boolean).join(' · ')}
      aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${holidayName ? ` — ${holidayName}` : ''}${term ? ` — ${term.title}` : ''}${eventsLabel}${hasContent ? ' — has activity' : ''}`}
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

      {term && (
        <span
          aria-hidden
          data-term-band
          className="absolute left-1 right-1 bottom-0.5 h-[3px] rounded-full"
          style={{ backgroundColor: termColor(term), opacity: term.archived ? 0.55 : 0.75 }}
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

      {events.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1 min-w-0" aria-hidden>
          {visibleEvents.map(o => <EventBar key={occurrenceKey(o)} occurrence={o} />)}
          {overflowEvents > 0 && (
            <span className="text-[8px] sm:text-[9px] font-semibold leading-none text-text-muted">+{overflowEvents}</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-1 pb-0.5 flex items-center justify-between gap-1 flex-wrap">
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
