'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Sun } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { TermPeriod } from '@/app/types/calendar';
import { formatTermRange, termColor, termOnDay, termsInRange } from '@/app/lib/termPeriods';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { gridKeyTarget, monthCells } from '@/app/utils/monthGrid';
import {
  MONTH_NAMES,
  MONTHS,
  MONTH_SHAPES,
  type MonthShape,
  monthCardBg,
  monthBandBg,
  monthShapeColor,
  monthNameColor,
  daylightRailPct,
  formatDaylight,
  formatHeroDate,
  getHolidays,
} from '@/app/lib/monthPersonality';
import DayCell from './DayCell';

interface MonthCalendarProps {
  year: number;
  month: number; // 0-11
  dayData: Map<string, DayData>;
  todayStr: string;
  onSelectDay: (date: Date) => void;
  /** The picked day, highlighted in the grid. Omit where the grid has no picked day. */
  selectedDate?: Date | null;
  /**
   * Turns on keyboard movement: arrows, Home/End and PageUp/PageDown pick
   * the day they land on, which may be in another month — the parent pages
   * there, and focus follows once that day is rendered.
   */
  onNavigate?: (date: Date) => void;
  /** Term periods to mark across their days (the current term and archived ones). */
  terms?: TermPeriod[];
}

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const NO_TERMS: TermPeriod[] = [];

const shapeStyle = (s: MonthShape, color: string, animate: boolean): React.CSSProperties => ({
  position: 'absolute',
  left: s.l,
  top: s.t,
  width: s.w,
  height: s.h,
  borderRadius: s.r,
  ...(s.ring
    ? { border: `2px solid ${color}`, backgroundColor: 'transparent' }
    : { backgroundColor: color }),
  animation: animate
    ? `${s.anim} ${s.dur}s ${s.anim === 'tm-spin' ? 'linear' : 'ease-in-out'} ${s.delay ?? 0}s infinite`
    : undefined,
});

const MonthCalendar: React.FC<MonthCalendarProps> = ({
  year,
  month,
  dayData,
  todayStr,
  onSelectDay,
  selectedDate,
  onNavigate,
  terms = NO_TERMS,
}) => {
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth();

  const cells = useMemo(() => monthCells(year, month), [year, month]);

  const selectedStr = selectedDate ? toLocalDateStr(selectedDate) : null;
  // One tab stop per grid: the picked day, else today, else the 1st.
  const tabStopStr = useMemo(() => {
    const inMonth = (s: string | null) => s !== null && cells.some(d => d && toLocalDateStr(d) === s);
    if (inMonth(selectedStr)) return selectedStr;
    if (inMonth(todayStr)) return todayStr;
    return toLocalDateStr(new Date(year, month, 1));
  }, [cells, selectedStr, todayStr, year, month]);

  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  });

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onNavigate) return;
    const from = (e.target as HTMLElement).closest('[data-date]')?.getAttribute('data-date');
    const next = from ? gridKeyTarget(parseLocalDate(from), e.key) : null;
    if (!next) return;
    e.preventDefault();
    pendingFocus.current = toLocalDateStr(next);
    onNavigate(next);
  };

  // The terms that touch this month, named above the grid.
  const monthTerms = useMemo(
    () => termsInRange(terms, toLocalDateStr(new Date(year, month, 1)), toLocalDateStr(new Date(year, month + 1, 0))),
    [terms, year, month],
  );

  const monthHolidays = useMemo(() => getHolidays(year)[month] ?? {}, [year, month]);

  const heroSummary = useMemo(() => {
    if (!isCurrent) return null;
    let tasks = 0;
    let hours = 0;
    let habits = 0;
    for (const date of cells) {
      if (!date) continue;
      const d = dayData.get(toLocalDateStr(date));
      if (!d) continue;
      tasks += d.tasksDue.length;
      hours += d.estimatedHours;
      habits += d.habitsCompleted.length;
    }
    return { tasks, hours, habits };
  }, [isCurrent, cells, dayData]);
  const showToday = isCurrent && !!heroSummary;
  const showSummaryRow = showToday || monthTerms.length > 0;

  const { hue, icon: Icon, daylightHours } = MONTHS[month];
  const shapes = MONTH_SHAPES[month];
  const cardBg = monthCardBg(hue, isCurrent);
  const bandBg = monthBandBg(hue, isCurrent);
  const shapeColor = monthShapeColor(hue, isCurrent);
  const nameColor = monthNameColor(hue);
  const railPct = daylightRailPct(daylightHours);

  return (
    <article
      className="card relative overflow-hidden"
      style={{
        backgroundColor: cardBg,
        boxShadow: isCurrent ? '0 0 0 1.5px var(--tm-accent)' : 'none',
      }}
    >
      <div className="relative overflow-hidden" style={{ height: 34, backgroundColor: bandBg }}>
        {shapes.map((s, i) => (
          <span key={i} className="tm-shape" style={shapeStyle(s, shapeColor, isCurrent)} />
        ))}
        <span
          className="absolute left-0 bottom-0 w-full"
          style={{ height: 3, backgroundColor: 'var(--tm-border-subtle)' }}
        />
        <span
          className="absolute left-0 bottom-0"
          style={{ height: 3, width: `${railPct}%`, backgroundColor: hue }}
        />
      </div>

      <Icon
        aria-hidden
        strokeWidth={1.5}
        size={112}
        color={hue}
        className="tm-watermark pointer-events-none select-none absolute -right-3.5 -bottom-4 opacity-[0.09]"
        style={{ animation: isCurrent ? 'tm-breathe 9s ease-in-out infinite' : undefined }}
      />

      <div className="relative z-10 pt-2.5 px-3 pb-3">
        <header className="flex items-center gap-2 mb-2 px-0.5" style={{ minHeight: 27 }}>
          <h3
            className="font-bold"
            style={{ color: nameColor, fontSize: isCurrent ? 22 : 14, lineHeight: 1.2, letterSpacing: '-0.242px' }}
          >
            {MONTH_NAMES[month]}
          </h3>
          <span
            className="ml-auto flex items-center gap-1 text-[10px]"
            style={{ color: 'var(--tm-text-secondary)', letterSpacing: '0.12px' }}
            title="Average daily daylight"
            aria-label={`Average daily daylight: ${formatDaylight(daylightHours)}`}
          >
            <Sun size={10} strokeWidth={3} aria-hidden />            
            <span>Average Daily Daylight:</span>
            <span className="font-medium">{formatDaylight(daylightHours)}</span>
          </span>
        </header>

        <div
          className="flex items-center gap-2 flex-wrap mx-0.5 mb-2.5 pb-2.5"
          style={{
            minHeight: 26,
            borderBottom: showSummaryRow ? '1px solid var(--tm-border-subtle)' : '1px solid transparent',
            visibility: showSummaryRow ? 'visible' : 'hidden',
          }}
        >
          {showToday && (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium leading-none"
              style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
            >
              Today · {formatHeroDate(todayStr)}
            </span>
          )}
          {monthTerms.map(term => (
            <span
              key={`${term.title}-${term.start_date}-${term.archived}`}
              data-term={term.title}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none"
              style={{ border: '1px solid var(--tm-border)', color: 'var(--tm-text-secondary)' }}
            >
              <span aria-hidden className="w-3 h-[3px] rounded-full" style={{ backgroundColor: termColor(term) }} />
              {term.title}
              <span className="text-text-muted">
                · {formatTermRange(term)}{term.archived ? ' · archived' : ''}
              </span>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_HEADERS.map((day) => (
            <div
              key={day}
              className="py-0.5 text-center text-[9px] font-semibold text-text-muted"
            >
              {day}
            </div>
          ))}
        </div>

        <div
          ref={gridRef}
          role="group"
          aria-label={`${MONTH_NAMES[month]} ${year}`}
          onKeyDown={handleGridKeyDown}
          className="grid grid-cols-7 gap-0.5"
        >
          {cells.map((date, i) => {
            if (!date) {
              return <div key={`blank-${i}`} style={{ minHeight: 60 }} />;
            }

            const dateStr = toLocalDateStr(date);

            return (
              <DayCell
                key={dateStr}
                date={date}
                data={dayData.get(dateStr)}
                isToday={dateStr === todayStr}
                onSelect={onSelectDay}
                hue={hue}
                holidayName={monthHolidays[date.getDate()]}
                term={termOnDay(monthTerms, dateStr)}
                isSelected={selectedDate === undefined ? undefined : dateStr === selectedStr}
                tabIndex={onNavigate ? (dateStr === tabStopStr ? 0 : -1) : undefined}
              />
            );
          })}
        </div>
      </div>
    </article>
  );
};

export default MonthCalendar;
