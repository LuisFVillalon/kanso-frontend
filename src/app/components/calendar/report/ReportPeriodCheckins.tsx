'use client';

import React from 'react';
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
  /** Edit a weekly or monthly check-in, or log the period's week (`existing` null). */
  onOpen: (kind: 'week' | 'month', start: string, existing: MoodCheckin | null) => void;
}

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{children}</p>
);

/**
 * The Check-ins card's list of weekly check-ins (mood, workload, highlight)
 * — or, in the Year view, "Months in a word" from the monthly check-ins.
 * Each opens to edit. Hidden while there are none and that check-in is off.
 */
const ReportPeriodCheckins: React.FC<Props> = ({ period, weeks, months, settings, onOpen }) => {
  if (period.kind === 'year') {
    const year = String(period.start.getFullYear());
    const inYear = [...months.values()]
      .filter(m => m.period_start.startsWith(`${year}-`))
      .sort((a, b) => a.period_start.localeCompare(b.period_start));
    if (inYear.length === 0 && !settings.monthly) return null;
    return (
      <div className="flex flex-col gap-2">
        <Heading>Months in a word</Heading>
        {inYear.length === 0 ? (
          <p className="text-xs text-text-muted italic">No monthly check-ins in {year} yet — they’re asked on the last day of each month.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {inYear.map(m => {
              const monthName = parseLocalDate(m.period_start).toLocaleDateString('en-US', { month: 'long' });
              return (
                <button
                  key={m.period_start}
                  type="button"
                  onClick={() => onOpen('month', m.period_start, m)}
                  className="rounded-lg px-2 py-1.5 text-left min-w-0 hover:ring-1 hover:ring-border focus-visible:outline-2 focus-visible:outline-accent"
                  style={{ backgroundColor: `color-mix(in srgb, ${moodColor(m.mood)} 12%, var(--tm-surface))` }}
                  aria-label={`${monthName}: ${moodLabel(m.mood)}${m.word ? `, “${m.word}”` : ''}. Edit`}
                  title={`${monthName} · ${moodLabel(m.mood)}${m.word ? ` · “${m.word}”` : ''}`}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">{monthName.slice(0, 3)}</span>
                  <span className="block text-xs font-semibold text-text-primary truncate">
                    {m.word ? `“${m.word}”` : moodLabel(m.mood)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (weeks.length === 0 && !settings.weekly) return null;
  const todayStr = toLocalDateStr(new Date());
  const weekStart = toLocalDateStr(period.start);
  const isCurrentWeek = period.kind === 'week' && isSamePeriod(period, periodContaining('week', new Date()));
  return (
    <div className="flex flex-col gap-2">
      <Heading>Weekly check-ins</Heading>
      {weeks.length === 0 ? (
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
          {weeks.map(w => {
            const label = `Week of ${parseLocalDate(w.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            const details = [w.workload != null ? `${WORKLOAD_LABELS[w.workload]} workload` : null, w.highlight ? `“${w.highlight}”` : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={w.period_start}>
                <button
                  type="button"
                  onClick={() => onOpen('week', w.period_start, w)}
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
