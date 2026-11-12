'use client';

import React, { useMemo } from 'react';
import type { PreviousActivity } from '@/app/hooks/usePreviousActivity';
import type { CalendarActivity } from '@/app/types/activity';
import { formatPeriodLabel, periodLength, type ReportPeriod, type ReportPeriodKind } from '@/app/utils/calendarReport';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import {
  buildPace, formatPace, isTimeMetric, ordinal, paceDelta, PACE_METRICS, type Pace, type PaceMetric,
} from '@/app/utils/pace';
import { axisTicks } from './activityAxis';
import { useNowMinute } from './ReportEventsChart';
import { useMeasuredWidth } from './useChartSize';

const METRIC_NAME: Record<PaceMetric, string> = {
  done: 'Done', tasks: 'Tasks', habits: 'Habits', notes: 'Note time', events: 'Events',
};
const METRIC_COLOR: Record<PaceMetric, string> = {
  done: 'var(--tm-text-primary)',
  tasks: 'var(--tm-accent)',
  habits: 'var(--tm-success)',
  notes: 'var(--tm-accent-2)',
  events: 'var(--tm-week-note)',
};
/** What the verdict calls a metric's amount: "12 done", "2h in notes". */
const METRIC_UNIT: Record<PaceMetric, string> = {
  done: 'done', tasks: 'tasks', habits: 'check-ins', notes: 'in notes', events: 'in events',
};
/** Green going up: #0B8A63 in the light theme, #45CFA3 in the dark one. */
const UP_COLOR = 'var(--tm-week-completed)';
const LINE_COLOR = 'var(--tm-accent)';
const LAST_COLOR = 'var(--tm-text-muted)';

/** Under this width the card lays out as on a phone. */
const COMPACT_WIDTH = 480;

// A month has up to 31 points; labelling every one crowds a phone screen, so
// only the 1st and every 5th day get a label.
const showLabel = (kind: ReportPeriodKind, index: number) =>
  kind !== 'month' || index === 0 || (index + 1) % 5 === 0;

/** The x axis label of each point: weekday letters, days of the month, month initials. */
const unitLabel = (period: ReportPeriod, index: number): string => {
  const { start, kind } = period;
  if (kind === 'year') return new Date(start.getFullYear(), index, 1).toLocaleDateString('en-US', { month: 'narrow' });
  if (kind === 'week') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index).toLocaleDateString('en-US', { weekday: 'narrow' });
  return String(index + 1);
};

/** The sr-only table's row names: "Monday, November 9", "November 9", "November". */
const unitLongLabel = (period: ReportPeriod, index: number): string => {
  const { start, kind } = period;
  if (kind === 'year') return new Date(start.getFullYear(), index, 1).toLocaleDateString('en-US', { month: 'long' });
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
  return date.toLocaleDateString('en-US', kind === 'week' ? { weekday: 'long', month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric' });
};

/** "30m" under an hour, "2h" from there; counts from 1000 as "1k". */
const formatTick = (value: number, time: boolean) => {
  if (value === 0) return '0';
  if (!time) return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
  return value < 3600 ? `${value / 60}m` : `${Math.round((value / 3600) * 10) / 10}h`;
};

interface Names {
  /** "this week", "in Oct 12–18, 2026". */
  current: string;
  /** "last week", "the week before", "in 2025". */
  previous: string;
  /** The legend's: "This week" / "Last week", "Oct 12–18, 2026" / "The week before", "2026" / "2025". */
  currentLegend: string;
  previousLegend: string;
  /** The verdict's lead: "last week", "2025". */
  lead: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const namesOf = (pace: Pace): Names => {
  const { period, previousPeriod, finished } = pace;
  if (period.kind === 'year') {
    const year = String(period.start.getFullYear());
    const prev = String(previousPeriod.start.getFullYear());
    return {
      current: finished ? `in ${year}` : 'this year', previous: `in ${prev}`,
      currentLegend: year, previousLegend: prev, lead: prev,
    };
  }
  if (finished) {
    const label = formatPeriodLabel(period);
    const prev = `the ${period.kind} before`;
    return { current: `in ${label}`, previous: prev, currentLegend: label, previousLegend: capitalize(prev), lead: prev };
  }
  const prev = `last ${period.kind}`;
  return {
    current: `this ${period.kind}`, previous: prev,
    currentLegend: `This ${period.kind}`, previousLegend: capitalize(prev), lead: prev,
  };
};

/** ": 12 done by Wednesday, against 9 by last Wednesday". */
const verdictRest = (pace: Pace, metric: PaceMetric, names: Names, now: Date): string => {
  const { period, previousPeriod, finished, previousDate } = pace;
  const { current, previous } = pace.metrics[metric];
  const cur = `${formatPace(metric, current)} ${METRIC_UNIT[metric]}`;
  const prev = formatPace(metric, previous);
  if (finished) {
    const prevName = period.kind === 'year' ? names.previous : `in ${formatPeriodLabel(previousPeriod)}`;
    return `: ${cur} ${names.current}, against ${prev} ${prevName}`;
  }
  if (period.kind === 'week') {
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    return `: ${cur} by ${weekday}, against ${prev} by last ${weekday}`;
  }
  if (period.kind === 'month') {
    return `: ${cur} by the ${ordinal(now.getDate())}, against ${prev} by the ${ordinal(previousDate.getDate())}`;
  }
  return `: ${cur} by this point, against ${prev} by this time in ${previousPeriod.start.getFullYear()}`;
};

const Delta: React.FC<{ metric: PaceMetric; current: number; previous: number }> = ({ metric, current, previous }) => {
  const { direction, amount } = paceDelta(metric, current, previous);
  if (direction === 'equal') return <span className="ml-1 text-[11px] font-bold text-text-muted">=</span>;
  const up = direction === 'up';
  return (
    <span className="ml-1 text-[11px] font-bold" style={{ color: up ? UP_COLOR : 'var(--tm-accent-2)' }}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? ' up ' : ' down '}</span>
      {formatPace(metric, amount)}
    </span>
  );
};

interface ChartProps {
  pace: Pace;
  metric: PaceMetric;
  compare: boolean;
  width: number;
  compact: boolean;
  label: string;
}

/** Running totals: this period's solid line up to today over last period's dashed one. Drawn 1:1 at the card's width. */
const PaceChart: React.FC<ChartProps> = ({ pace, metric, compare, width, compact, label }) => {
  const { period, finished } = pace;
  const series = pace.metrics[metric];
  const cur = series.currentPoints;
  const prev = compare ? series.previousPoints : [];
  // A month's points run to the longer of the two months.
  const n = Math.max(period.kind === 'year' ? 12 : periodLength(period), prev.length, 1);
  const todayIndex = finished ? null : cur.length - 1;

  const H = compact ? 150 : 168;
  const padL = compact ? 30 : 34;
  const padR = compact ? 8 : 12;
  const padT = 8;
  const padB = 18;
  const time = isTimeMetric(metric);
  const max = Math.max(...cur, ...prev, 0);
  const ticks = axisTicks(max, time ? 'notes' : 'completions');
  const top = ticks[ticks.length - 1];
  const xs = (i: number) => padL + (n === 1 ? 0 : i / (n - 1)) * (width - padL - padR);
  const ys = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const path = (points: number[]) => points.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join('');
  const fontSize = compact ? 10 : 11;

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label} className="block" data-testid="pace-chart">
      {ticks.map(t => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={ys(t)} y2={ys(t)} stroke="var(--tm-border)" strokeDasharray="3 3" strokeWidth={1} />
          <text x={padL - 6} y={ys(t) + 3.5} textAnchor="end" fontSize={fontSize} fill="var(--tm-text-muted)" className="tabular-nums">
            {formatTick(t, time)}
          </text>
        </g>
      ))}
      {prev.length > 0 && (
        <path d={path(prev)} fill="none" stroke={LAST_COLOR} strokeWidth={2} strokeDasharray="5 4" opacity={0.8} data-testid="pace-last" />
      )}
      {cur.length > 0 && (
        <>
          <path d={`${path(cur)}L${xs(cur.length - 1).toFixed(1)},${ys(0).toFixed(1)}L${xs(0).toFixed(1)},${ys(0).toFixed(1)}Z`} fill="color-mix(in srgb, var(--tm-accent) 14%, transparent)" />
          <path d={path(cur)} fill="none" stroke={LINE_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" data-testid="pace-current" />
        </>
      )}
      {todayIndex !== null && todayIndex >= 0 && (
        <g data-testid="pace-today">
          <line x1={xs(todayIndex)} x2={xs(todayIndex)} y1={padT} y2={ys(0)} stroke={LINE_COLOR} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
          {compare && (
            <circle cx={xs(todayIndex)} cy={ys(series.previous)} r={3.5} fill="var(--tm-surface)" stroke={LAST_COLOR} strokeWidth={2} data-testid="pace-last-dot" />
          )}
          <circle cx={xs(todayIndex)} cy={ys(series.current)} r={4.5} fill={LINE_COLOR} stroke="var(--tm-surface)" strokeWidth={2} />
        </g>
      )}
      {Array.from({ length: n }, (_, i) => {
        if (!showLabel(period.kind, i)) return null;
        const today = i === todayIndex;
        return (
          <text
            key={i}
            x={xs(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize={fontSize}
            fill={today ? LINE_COLOR : 'var(--tm-text-muted)'}
            fontWeight={today ? 700 : 400}
          >
            {unitLabel(period, i)}
          </text>
        );
      })}
    </svg>
  );
};

const Legend: React.FC<{ names: Names; compare: boolean }> = ({ names, compare }) => (
  <span className="ml-auto flex items-center gap-3">
    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap">
      <span className="rounded-full" style={{ width: 14, height: 2.5, backgroundColor: LINE_COLOR }} aria-hidden="true" />
      {names.currentLegend}
    </span>
    {compare && (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap">
        <span style={{ width: 14, height: 0, borderTop: `2px dashed ${LAST_COLOR}` }} aria-hidden="true" />
        {names.previousLegend}
      </span>
    )}
  </span>
);

const EmptyBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex-1 flex items-center justify-center text-center rounded-lg p-3" style={{ minHeight: '9rem', backgroundColor: 'var(--tm-surface-raised)' }}>
    <p className="text-xs sm:text-sm text-text-muted italic">{children}</p>
  </div>
);

interface ReportPaceProps {
  period: ReportPeriod;
  activity: CalendarActivity;
  previous: PreviousActivity;
  /** The user's work days and hours, which events' time is split by. */
  workDays: WorkDaySettings;
  /** The picked chip; kept by the report, so it holds when the period changes. */
  metric: PaceMetric;
  onMetric: (metric: PaceMetric) => void;
}

/**
 * The Overview's Pace card body: this period's running totals against the
 * period before, at the same point. Chips give each metric's value and its
 * difference from last period, and pick the line drawn.
 */
const ReportPace: React.FC<ReportPaceProps> = ({ period, activity, previous, workDays, metric, onMetric }) => {
  const nowMinute = useNowMinute();
  const now = new Date(nowMinute * 60000);
  const [chartRef, width] = useMeasuredWidth<HTMLDivElement>();
  const compact = width < COMPACT_WIDTH;
  const periodKey = `${period.kind}:${period.start.getTime()}`;
  const pace = useMemo(
    () => buildPace(activity, previous.activity, period, workDays, new Date(nowMinute * 60000)),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, previous.activity, periodKey, workDays, nowMinute],
  );
  const names = namesOf(pace);
  const ready = !!previous.activity;
  const compare = ready && pace.hasPrevious;
  const series = pace.metrics[metric];
  const lastName = period.kind === 'year' ? String(pace.previousPeriod.start.getFullYear()) : names.previous;

  const footer = previous.error
    ? `Couldn’t load ${lastName}.`
    : previous.loading
      ? `Loading ${lastName}…`
      : compare
        ? `${period.kind === 'year' ? lastName : capitalize(names.previous)} ended at ${formatPace(metric, series.previousTotal)}. ${pace.finished
          ? `Compared over the whole ${period.kind}.`
          : `Compared at the same point in the ${period.kind}; events count only up to now.`}`
        : pace.finished ? null : `Comparisons start next ${period.kind}. Events count only up to now.`;
  const footerLine = footer && <p className="hidden sm:block m-0 text-[11px] text-text-muted">{footer}</p>;

  if (!pace.hasCurrent && (!ready || !pace.hasPrevious)) {
    const yet = pace.finished ? '' : ' yet';
    return (
      <div ref={chartRef} className="flex-1 flex flex-col gap-1.5 min-w-0">
        <EmptyBox>
          {ready
            ? `Nothing done${yet} ${names.current} or ${names.previous}.`
            : `Nothing done${yet} ${names.current}.`}
          {' '}Tasks, habits, notes and events will show up here as you go.
        </EmptyBox>
        {!ready && footerLine}
      </div>
    );
  }

  const value = `${formatPace(metric, series.current)} ${METRIC_UNIT[metric]}`;
  let verdict: React.ReactNode;
  if (compare) {
    const { direction } = paceDelta(metric, series.current, series.previous);
    const word = direction === 'equal' ? 'Level with' : direction === 'up' ? 'Ahead of' : 'Behind';
    verdict = <><b className="font-bold text-text-primary">{word} {names.lead}</b>{verdictRest(pace, metric, names, now)}</>;
  } else if (ready) {
    verdict = <><b className="font-bold text-text-primary">{value}</b> {names.current} · nothing {names.previous} to compare with yet</>;
  } else {
    verdict = <><b className="font-bold text-text-primary">{value}</b> {names.current}</>;
  }

  const chartLabel = `${METRIC_NAME[metric]}: running total ${names.current}${compare ? ` against ${names.previous}` : ''}`;
  const rows = period.kind === 'year' ? series.currentPoints.length : series.currentRunning.length;
  const prevAt = (i: number): number => {
    if (period.kind !== 'year') return series.previousRunning[Math.min(i, series.previousRunning.length - 1)] ?? 0;
    // The current month runs to today, so it compares with last year's same point.
    return !pace.finished && i === rows - 1 ? series.previous : series.previousPoints[i] ?? 0;
  };
  const curAt = (i: number): number => (period.kind === 'year' ? series.currentPoints[i] : series.currentRunning[i]);

  return (
    <div ref={chartRef} className="flex-1 flex flex-col gap-3 min-w-0">
      <div role="group" aria-label="Compare" className="flex gap-1.5 flex-nowrap overflow-x-auto scrollbar-none sm:flex-wrap sm:overflow-visible">
        {PACE_METRICS.map(m => {
          const s = pace.metrics[m];
          const on = m === metric;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => onMetric(m)}
              className={`relative flex-shrink-0 inline-flex flex-col items-start gap-px rounded-[10px] border px-2 py-1 sm:px-2.5 sm:py-1.5 text-left transition-colors ${
                on ? 'border-border-strong bg-surface-raised shadow-sm' : 'border-border hover:border-border-strong'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted whitespace-nowrap">
                <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: METRIC_COLOR[m] }} aria-hidden="true" />
                {METRIC_NAME[m]}
              </span>
              <span className="text-[13px] sm:text-[15px] font-bold text-text-primary whitespace-nowrap">
                {formatPace(m, s.current)}
                {compare && <Delta metric={m} current={s.current} previous={s.previous} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="m-0 text-[12.5px] sm:text-sm text-text-secondary" data-testid="pace-verdict">{verdict}</p>
        <Legend names={names} compare={compare} />
      </div>

      <div className="flex-1 flex items-end min-w-0">
        <PaceChart pace={pace} metric={metric} compare={compare} width={width} compact={compact} label={chartLabel} />
      </div>

      {footerLine}

      {/* sr-only on the table itself doesn't shrink it — tables size to their content. */}
      <div className="sr-only">
        <table>
          <caption>{chartLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{period.kind === 'year' ? 'Month' : 'Day'}</th>
              <th scope="col">{names.currentLegend}</th>
              {compare && <th scope="col">{names.previousLegend}</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <th scope="row">{unitLongLabel(period, i)}</th>
                <td>{formatPace(metric, curAt(i))}</td>
                {compare && <td>{formatPace(metric, prevAt(i))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportPace;
