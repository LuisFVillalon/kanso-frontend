'use client';

import React from 'react';

// The one chart primitive that was a genuine byte-for-byte duplicate between
// StatsCard's HoursLineChart and the calendar's WeekTrendLineChart (same W/H/
// padding constants, same point/tick/path math, same SVG structure) — factored
// out here. The donut and bar charts in components/stats/charts.tsx and
// components/calendar/DayCharts.tsx were evaluated for the same treatment and
// deliberately kept separate: they differ in real, non-cosmetic ways (count
// vs. hours as the plotted value, legend-inclusion, label-column width,
// zero-filtering), not just styling, so forcing them into one component would
// trade a real behavior difference for a cosmetic dedup.

export interface TrendPoint {
  date: Date;
  hours: number;
  isToday: boolean;
}

interface TrendLineChartProps {
  days: TrendPoint[]; // seven entries, Monday through Sunday
  /** SVG element classes — callers size/center it differently (dashboard card vs. full day-detail view). */
  svgClassName?: string;
  /** When set, adds role="img" + this as the aria-label. Omit for callers that don't want it announced. */
  ariaLabel?: string;
}

const fmtHours = (hours: number): string => (Number.isInteger(hours) ? `${hours}` : hours.toFixed(1));

// Y-axis steps in hours. One label per hour crowded the axis on busy weeks
// (0h-13h), so the axis uses the smallest step that keeps it to at most four
// intervals (five labels), with the top rounded up to a whole step.
const Y_STEPS = [0.5, 1, 2, 3, 4, 6, 12, 24];
const MAX_Y_INTERVALS = 4;

/** Evenly spaced y-axis tick values from 0 up to a clean top at or above `maxHours`. */
export const niceHourTicks = (maxHours: number): number[] => {
  const max = Math.max(maxHours, 0.5);
  // Half-hour steps only for sub-hour ranges; 0-2h reads best as 0/1/2.
  const candidates = max <= 1 ? Y_STEPS : Y_STEPS.filter(s => s >= 1);
  const step =
    candidates.find(s => Math.ceil(max / s) <= MAX_Y_INTERVALS) ?? 24 * Math.ceil(max / (24 * MAX_Y_INTERVALS));
  const intervals = Math.ceil(max / step);
  return Array.from({ length: intervals + 1 }, (_, i) => i * step);
};

/**
 * Just the SVG line/area chart — callers own their own header text and empty
 * "no data" copy (both already varied between the two original call sites),
 * this only renders the plot itself, or the shared empty-state placeholder
 * when every day has zero hours.
 */
export const TrendLineChart: React.FC<TrendLineChartProps> = ({ days, svgClassName = 'w-full h-auto', ariaLabel }) => {
  const totalHours = days.reduce((sum, d) => sum + d.hours, 0);

  if (totalHours <= 0) {
    return (
      <div className="flex items-center justify-center text-center" style={{ minHeight: '5rem' }}>
        <p className="text-xs sm:text-sm text-text-muted italic">No estimated hours this week</p>
      </div>
    );
  }

  const W = 300;
  const H = 130;
  const padL = 26;
  const padR = 10;
  const padT = 16;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxHours = Math.max(...days.map(d => d.hours), 1);
  const tickValues = niceHourTicks(maxHours);
  const axisMax = tickValues[tickValues.length - 1];
  const stepX = days.length > 1 ? plotW / (days.length - 1) : 0;

  const points = days.map((d, i) => ({
    ...d,
    x: padL + stepX * i,
    y: padT + plotH - (d.hours / axisMax) * plotH,
  }));

  const yTicks = tickValues.map(value => ({ value, y: padT + plotH - (value / axisMax) * plotH }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={svgClassName}
      {...(ariaLabel ? { role: 'img' as const, 'aria-label': ariaLabel } : {})}
    >
      {yTicks.map((t, i) => (
        <line
          key={`grid-${i}`}
          x1={padL}
          y1={t.y}
          x2={W - padR}
          y2={t.y}
          stroke="var(--tm-border)"
          strokeWidth={1}
          opacity={t.value === 0 ? 1 : 0.35}
        />
      ))}
      {yTicks.map((t, i) => (
        <text key={`ylabel-${i}`} x={0} y={t.y + 3} fontSize={9} fill="var(--tm-text-muted)">
          {fmtHours(t.value)}h
        </text>
      ))}
      <path d={areaPath} fill="var(--tm-accent)" fillOpacity={0.1} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--tm-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.isToday ? 4 : 2.75}
          fill={p.isToday ? 'var(--tm-accent)' : 'var(--tm-surface)'}
          stroke="var(--tm-accent)"
          strokeWidth={2}
        >
          <title>{`${p.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmtHours(p.hours)}h`}</title>
        </circle>
      ))}
      {points.map((p, i) => (
        <text
          key={`label-${i}`}
          x={p.x}
          y={H - 4}
          fontSize={10}
          textAnchor="middle"
          fontWeight={p.isToday ? 700 : 400}
          fill={p.isToday ? 'var(--tm-accent)' : 'var(--tm-text-muted)'}
        >
          {p.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
        </text>
      ))}
    </svg>
  );
};
