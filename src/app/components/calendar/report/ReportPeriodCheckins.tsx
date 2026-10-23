'use client';

import React from 'react';
import { CalendarRange } from 'lucide-react';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { WORKLOAD_LABELS, moodLabel, type MoodCheckin, type MoodCheckinSettings } from '@/app/types/mood';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { isSamePeriod, periodContaining, type ReportPeriod } from '@/app/utils/calendarReport';

interface Props {
  period: ReportPeriod;
  /** Weekly check-ins whose week overlaps the period, oldest first. */
  weeks: MoodCheckin[];
  /** Monthly check-ins by "YYYY-MM". */
  months: Map<string, MoodCheckin>;
  settings: MoodCheckinSettings;
  /** Edit a weekly or monthly check-in, or log one for a week or month without one (`existing` null). */
  onOpen: (kind: 'week' | 'month', start: string, existing: MoodCheckin | null) => void;
}

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{children}</p>
);

/** The Mondays of the Mon–Sun weeks overlapping [start, end] that have begun by `today`. */
const weekStartsIn = (start: Date, end: Date, today: string): string[] => {
  const starts: string[] = [];
  for (let d = periodContaining('week', start).start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    const key = toLocalDateStr(d);
    if (key <= today) starts.push(key);
  }
  return starts;
};

/** The 1sts of the year's months that have begun by `today`. */
const monthStartsIn = (year: number, today: string): string[] =>
  Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, '0')}-01`).filter(start => start <= today);

const weekLabel = (start: string) =>
  `Week of ${parseLocalDate(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

/**
 * The Check-ins card's list of weekly check-ins (mood, workload, highlight)
 * — or, in the Year view, "Months in a word" from the monthly check-ins.
 * Each opens to edit. While that check-in is on, a week or month that has
 * begun without one gets a row or tile to log it; hidden while there are
 * none and that check-in is off.
 */
const ReportPeriodCheckins: React.FC<Props> = ({ period, weeks, months, settings, onOpen }) => {
  const todayStr = toLocalDateStr(new Date());

  if (period.kind === 'year') {
    const year = period.start.getFullYear();
    const prefix = `${year}-`;
    const starts = settings.monthly
      ? monthStartsIn(year, todayStr)
      : [...months.values()].filter(m => m.period_start.startsWith(prefix)).map(m => m.period_start).sort();
    if (starts.length === 0 && !settings.monthly) return null;
    return (
      <div className="flex flex-col gap-2">
        <Heading>Months in a word</Heading>
        {starts.length === 0 ? (
          <p className="text-xs text-text-muted italic">No monthly check-ins in {year} yet — they’re asked on the last day of each month.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {starts.map(start => {
              const m = months.get(start.slice(0, 7)) ?? null;
              const monthName = parseLocalDate(start).toLocaleDateString('en-US', { month: 'long' });
              const tile = 'rounded-lg px-2 py-1.5 text-left min-w-0 hover:ring-1 hover:ring-border focus-visible:outline-2 focus-visible:outline-accent';
              const abbr = <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">{monthName.slice(0, 3)}</span>;
              return m ? (
                <button
                  key={start}
                  type="button"
                  onClick={() => onOpen('month', start, m)}
                  className={tile}
                  style={{ backgroundColor: `color-mix(in srgb, ${moodColor(m.mood)} 12%, var(--tm-surface))` }}
                  aria-label={`${monthName}: ${moodLabel(m.mood)}${m.word ? `, “${m.word}”` : ''}. Edit`}
                  title={`${monthName} · ${moodLabel(m.mood)}${m.word ? ` · “${m.word}”` : ''}`}
                >
                  {abbr}
                  <span className="block text-xs font-semibold text-text-primary truncate">
                    {m.word ? `“${m.word}”` : moodLabel(m.mood)}
                  </span>
                </button>
              ) : (
                <button
                  key={start}
                  type="button"
                  onClick={() => onOpen('month', start, null)}
                  className={`${tile} border border-dashed border-border`}
                  aria-label={`${monthName}: no monthly check-in. Log it`}
                  title={`${monthName} · no monthly check-in`}
                >
                  {abbr}
                  <span className="block text-xs font-medium text-accent truncate">Log it</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (weeks.length === 0 && !settings.weekly) return null;
  const weekStart = toLocalDateStr(period.start);
  const isCurrentWeek = period.kind === 'week' && isSamePeriod(period, periodContaining('week', new Date()));
  // A month lists each of its weeks so far, logged or not; a week's own empty state offers to log it.
  const logged = new Map(weeks.map(w => [w.period_start, w]));
  const starts = settings.weekly && period.kind === 'month'
    ? [...new Set([...weekStartsIn(period.start, period.end, todayStr), ...logged.keys()])].sort()
    : [...logged.keys()];
  return (
    <div className="flex flex-col gap-2">
      <Heading>Weekly check-ins</Heading>
      {starts.length === 0 ? (
        <p className="text-xs text-text-muted italic">
          {isCurrentWeek ? 'No weekly check-in yet — it’s asked on Sunday.' : `No weekly check-in for this ${period.kind}.`}
          {period.kind === 'week' && weekStart <= todayStr && (
            <>
              {' '}
              <button type="button" onClick={() => onOpen('week', weekStart, null)} className="not-italic font-medium text-accent hover:underline">
                Log it
              </button>
            </>
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {starts.map(start => {
            const w = logged.get(start);
            const label = weekLabel(start);
            if (!w) {
              return (
                <li key={start}>
                  <button
                    type="button"
                    onClick={() => onOpen('week', start, null)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-border text-left hover:ring-1 hover:ring-border focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={`${label}: no weekly check-in. Log it`}
                  >
                    <span className="w-6 h-6 shrink-0 flex items-center justify-center text-text-muted">
                      <CalendarRange className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-text-primary">
                      {label} <span className="font-medium text-accent">· Log it</span>
                    </span>
                  </button>
                </li>
              );
            }
            const details = [w.workload != null ? `${WORKLOAD_LABELS[w.workload]} workload` : null, w.highlight ? `“${w.highlight}”` : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={start}>
                <button
                  type="button"
                  onClick={() => onOpen('week', start, w)}
                  className="w-full flex items-start gap-2 p-2 rounded-lg bg-surface-raised text-left hover:ring-1 hover:ring-border focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={`${label}: ${moodLabel(w.mood)}${details ? ` · ${details}` : ''}. Edit`}
                >
                  <span className="w-6 h-6 shrink-0" style={{ color: moodColor(w.mood) }}>
                    <MoodFace mood={w.mood} filled className="w-full h-full" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      {label} <span className="font-normal text-text-muted">· {moodLabel(w.mood)}</span>
                    </span>
                    {details && <span className="block text-xs text-text-secondary truncate" title={details}>{details}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ReportPeriodCheckins;
