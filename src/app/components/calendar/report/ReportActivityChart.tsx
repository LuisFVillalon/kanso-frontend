'use client';

import React, { useState } from 'react';
import type { ReportBucket, ReportPeriodKind } from '@/app/utils/calendarReport';
import { formatDurationShort } from '@/app/utils/dateUtils';

export type ActivityMetric = 'completions' | 'notes';

const TASK_COLOR = 'var(--tm-accent)';
const HABIT_COLOR = 'var(--tm-success)';
const NOTE_COLOR = 'var(--tm-accent-2)';

interface ReportActivityChartProps {
  buckets: ReportBucket[];
  kind: ReportPeriodKind;
  /** Shows only this metric, without the Completions / Note time switch. */
  metric?: ActivityMetric;
}

// A month has up to 31 bars; labelling every one crowds a phone screen, so
// only the 1st and every 5th day get a label.
const showLabel = (kind: ReportPeriodKind, index: number) =>
  kind !== 'month' || index === 0 || (index + 1) % 5 === 0;

export const MetricButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
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

export const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
    {label}
  </span>
);

// Steps the y axis can count in: whole numbers of things done, or round
// stretches of time (in seconds) for note time.
const COUNT_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 180, 300, 600, 1200].map(m => m * 60);
const MAX_GRIDLINES = 4;

/** The y axis ticks from 0 up to a round number at or above `max`, at most MAX_GRIDLINES above 0. */
export const axisTicks = (max: number, metric: ActivityMetric): number[] => {
  const steps = metric === 'completions' ? COUNT_STEPS : TIME_STEPS;
  const step = steps.find(st => Math.ceil(max / st) <= MAX_GRIDLINES) ?? Math.ceil(max / MAX_GRIDLINES);
  const top = Math.max(Math.ceil(max / step), 1);
  return Array.from({ length: top + 1 }, (_, i) => i * step);
};

/** "30m" under an hour, "1.5h" from there, so a label fits the narrow axis. */
const formatTick = (value: number, metric: ActivityMetric) => {
  if (metric === 'completions' || value === 0) return String(value);
  return value < 3600 ? `${value / 60}m` : `${Math.round((value / 3600) * 10) / 10}h`;
};

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
const ReportActivityChart: React.FC<ReportActivityChartProps> = ({ buckets, kind, metric: fixedMetric }) => {
  const [chosenMetric, setMetric] = useState<ActivityMetric>('completions');
  const metric = fixedMetric ?? chosenMetric;

  const valueOf = (b: ReportBucket) => (metric === 'completions' ? b.tasksCompleted + b.habitsCompleted : b.noteSeconds);
  const max = Math.max(...buckets.map(valueOf), 0);
  const ticks = axisTicks(max, metric);
  const scaleTop = ticks[ticks.length - 1];
  const unit = kind === 'year' ? 'month' : 'day';
  const summary = metric === 'completions'
    ? `Tasks completed and habit check-ins per ${unit}`
    : `Time spent in notes per ${unit}`;

  return (
    <div className="flex-1 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!fixedMetric && (
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Chart metric">
            <MetricButton active={metric === 'completions'} onClick={() => setMetric('completions')}>Completions</MetricButton>
            <MetricButton active={metric === 'notes'} onClick={() => setMetric('notes')}>Note time</MetricButton>
          </div>
        )}
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
        <div className="flex-1 flex items-center justify-center text-center rounded-lg" style={{ minHeight: '9rem', backgroundColor: 'var(--tm-surface-raised)' }}>
          <p className="text-xs sm:text-sm text-text-muted italic">
            {metric === 'completions' ? 'No tasks or habits completed in this period' : 'No time in notes in this period'}
          </p>
        </div>
      ) : (
        <div role="img" aria-label={summary} className="flex-1 flex flex-col">
          <p className="m-0 mb-1 text-[10px] sm:text-[11px] text-text-muted" aria-hidden="true">
            {metric === 'completions' ? 'Tasks & habits done' : 'Time in notes'}
          </p>
          {/* The bars' row grows to fill the card when a taller card sits beside it. */}
          <div className="flex-1 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(6rem,1fr)_auto] sm:grid-rows-[minmax(9rem,1fr)_auto] gap-x-1.5">
            <div className="relative w-7 sm:w-8" aria-hidden="true">
              {ticks.map(t => (
                <span
                  key={t}
                  className="absolute right-0 text-[10px] sm:text-[11px] leading-none text-text-muted tabular-nums whitespace-nowrap"
                  style={{ bottom: `${(t / scaleTop) * 100}%`, transform: 'translateY(50%)' }}
                >
                  {formatTick(t, metric)}
                </span>
              ))}
            </div>
            <div className="relative flex items-end gap-[2px] sm:gap-1 border-b" style={{ borderColor: 'var(--tm-border)' }} aria-hidden="true">
              {ticks.slice(1).map(t => (
                <span
                  key={t}
                  className="absolute inset-x-0 border-t border-dashed pointer-events-none"
                  style={{ bottom: `${(t / scaleTop) * 100}%`, borderColor: 'var(--tm-border-subtle)' }}
                />
              ))}
              {buckets.map(b => {
                const total = valueOf(b);
                const pct = (total / scaleTop) * 100;
                return (
                  <div
                    key={b.key}
                    className="relative flex-1 min-w-0 h-full flex flex-col justify-end rounded-t-sm"
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
            <div className="col-start-2 flex gap-[2px] sm:gap-1 pt-1" aria-hidden="true">
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
          </div>
          {/* Hidden on a phone to keep the report tabs on one screen. */}
          <p className="hidden sm:block mt-1.5 text-[11px] text-text-muted">
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
