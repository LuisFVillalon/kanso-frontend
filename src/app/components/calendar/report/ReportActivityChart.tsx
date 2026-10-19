'use client';

import React, { useState } from 'react';
import type { ReportBucket, ReportPeriodKind } from '@/app/utils/calendarReport';
import { formatDurationShort } from '@/app/utils/dateUtils';

type Metric = 'completions' | 'notes';

const TASK_COLOR = 'var(--tm-accent)';
const HABIT_COLOR = 'var(--tm-success)';
const NOTE_COLOR = 'var(--tm-accent-2)';

interface ReportActivityChartProps {
  buckets: ReportBucket[];
  kind: ReportPeriodKind;
}

// A month has up to 31 bars; labelling every one crowds a phone screen, so
// only the 1st and every 5th day get a label.
const showLabel = (kind: ReportPeriodKind, index: number) =>
  kind !== 'month' || index === 0 || (index + 1) % 5 === 0;

const MetricButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
    }`}
  >
    {children}
  </button>
);

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
    {label}
  </span>
);

const describeBucket = (b: ReportBucket): string =>
  `${b.longLabel}: ${b.tasksCompleted} ${b.tasksCompleted === 1 ? 'task' : 'tasks'}, ` +
  `${b.habitsCompleted} habit ${b.habitsCompleted === 1 ? 'check-in' : 'check-ins'}, ` +
  `${b.noteSeconds > 0 ? formatDurationShort(b.noteSeconds) : 'no time'} in notes`;

/**
 * Bar chart of a report period — per day for a week or month, per month for
 * a year. "Completions" stacks completed tasks under habit check-ins;
 * "Note time" plots time spent in notes. Bars are plain flex boxes rather
 * than SVG so the axis labels never stretch at narrow widths.
 */
const ReportActivityChart: React.FC<ReportActivityChartProps> = ({ buckets, kind }) => {
  const [metric, setMetric] = useState<Metric>('completions');

  const valueOf = (b: ReportBucket) => (metric === 'completions' ? b.tasksCompleted + b.habitsCompleted : b.noteSeconds);
  const max = Math.max(...buckets.map(valueOf), 0);
  const unit = kind === 'year' ? 'month' : 'day';
  const summary = metric === 'completions'
    ? `Tasks completed and habit check-ins per ${unit}`
    : `Time spent in notes per ${unit}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Chart metric">
          <MetricButton active={metric === 'completions'} onClick={() => setMetric('completions')}>Completions</MetricButton>
          <MetricButton active={metric === 'notes'} onClick={() => setMetric('notes')}>Note time</MetricButton>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {metric === 'completions' ? (
            <>
              <LegendDot color={TASK_COLOR} label="Tasks" />
              <LegendDot color={HABIT_COLOR} label="Habits" />
            </>
          ) : (
            <LegendDot color={NOTE_COLOR} label="Notes" />
          )}
        </div>
      </div>

      {max === 0 ? (
        <div className="flex items-center justify-center text-center rounded-lg" style={{ minHeight: '9rem', backgroundColor: 'var(--tm-surface-raised)' }}>
          <p className="text-xs sm:text-sm text-text-muted italic">
            {metric === 'completions' ? 'No tasks or habits completed in this period' : 'No time in notes in this period'}
          </p>
        </div>
      ) : (
        <div role="img" aria-label={summary}>
          <div className="flex items-end h-36 gap-[2px] sm:gap-1 border-b" style={{ borderColor: 'var(--tm-border)' }} aria-hidden="true">
            {buckets.map(b => {
              const total = valueOf(b);
              const pct = (total / max) * 100;
              return (
                <div
                  key={b.key}
                  className="flex-1 min-w-0 h-full flex flex-col justify-end rounded-t-sm"
                  style={{ backgroundColor: b.isCurrent ? 'var(--tm-accent-subtle)' : undefined }}
                  title={describeBucket(b)}
                >
                  {metric === 'completions' ? (
                    <div className="flex flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${pct}%`, transition: 'height var(--tm-dur-slow) var(--tm-ease)' }}>
                      <div style={{ flexGrow: b.habitsCompleted, backgroundColor: HABIT_COLOR }} />
                      <div style={{ flexGrow: b.tasksCompleted, backgroundColor: TASK_COLOR }} />
                    </div>
                  ) : (
                    <div className="rounded-t-sm" style={{ height: `${pct}%`, backgroundColor: NOTE_COLOR, transition: 'height var(--tm-dur-slow) var(--tm-ease)' }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[2px] sm:gap-1 pt-1" aria-hidden="true">
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className={`flex-1 min-w-0 text-center text-[10px] sm:text-xs leading-none ${b.isCurrent ? 'font-bold' : ''}`}
                style={{ color: b.isCurrent ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}
              >
                {showLabel(kind, i) ? b.label : ''}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            Peak: {metric === 'completions' ? `${max} completed` : formatDurationShort(max)} in one {unit}
          </p>
        </div>
      )}

      {/* sr-only on the table itself doesn't shrink it — tables size to their content. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{kind === 'year' ? 'Month' : 'Day'}</th>
              <th scope="col">Tasks completed</th>
              <th scope="col">Habit check-ins</th>
              <th scope="col">Time in notes</th>
            </tr>
          </thead>
          <tbody>
            {buckets.filter(b => !b.isFuture).map(b => (
              <tr key={b.key}>
                <th scope="row">{b.longLabel}</th>
                <td>{b.tasksCompleted}</td>
                <td>{b.habitsCompleted}</td>
                <td>{b.noteSeconds > 0 ? formatDurationShort(b.noteSeconds) : '0m'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportActivityChart;
