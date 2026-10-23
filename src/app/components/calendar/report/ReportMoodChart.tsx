'use client';

import React, { useState } from 'react';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { ENERGY_LABELS, MOOD_LABELS, STRESS_LABELS, WORKLOAD_LABELS, moodLabel, type MoodCheckin } from '@/app/types/mood';
import type { ReportBucket, ReportPeriod } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { monthMood, periodRollingAverage, seriesValue, type MoodSeries } from '@/app/utils/moodReport';
import { LegendDot, MetricButton } from './ReportActivityChart';

const SERIES: { series: MoodSeries; label: string; names: readonly string[] }[] = [
  { series: 'mood', label: 'Mood', names: MOOD_LABELS },
  { series: 'energy', label: 'Energy', names: ENERGY_LABELS },
  { series: 'stress', label: 'Stress', names: STRESS_LABELS },
];

const LINE_COLOR = 'var(--tm-text-secondary)';

const seriesColor = (series: MoodSeries, value: number) =>
  series === 'mood' ? moodColor(Math.round(value)) : series === 'energy' ? 'var(--tm-accent)' : 'var(--tm-accent-2)';

// Vertical positions as a percentage of the plot's height: 5 at the top,
// 1 near the bottom, and days without a check-in on an axis below that.
const yOf = (value: number) => 8 + ((5 - value) / 4) * 72;
const AXIS_Y = 93;

const xOf = (i: number, n: number) => ((i + 0.5) / n) * 100;

/** An SVG path through the points, broken at the gaps. */
const linePath = (values: (number | null)[]): string => {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${xOf(i, values.length).toFixed(2)} ${yOf(v).toFixed(2)} `;
    pen = true;
  });
  return d;
};

const LegendLine: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-4 h-0.5 rounded" style={{ backgroundColor: LINE_COLOR }} />
    {label}
  </span>
);

const LegendDiamond: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2 h-2 rotate-45 border-[1.6px]" style={{ borderColor: moodColor(4) }} />
    {label}
  </span>
);

const LegendDash: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-4 border-t-2 border-dashed" style={{ borderColor: moodColor(4) }} />
    {label}
  </span>
);

const shortDate = (dateStr: string) => parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** A weekly check-in in words: "Week of Oct 12: Good · About right workload · “…”". */
export const describeWeekCheckin = (week: MoodCheckin): string => {
  const parts = [moodLabel(week.mood)];
  if (week.workload != null) parts.push(`${WORKLOAD_LABELS[week.workload]} workload`);
  if (week.highlight) parts.push(`“${week.highlight}”`);
  return `Week of ${shortDate(week.period_start)}: ${parts.join(' · ')}`;
};

interface ReportMoodChartProps {
  period: ReportPeriod;
  /** The activity report's buckets — days for a week or month, months for a year. */
  buckets: ReportBucket[];
  byDay: Map<string, MoodCheckin>;
  /** Weekly check-ins whose week overlaps the period, drawn as dashed spans on the mood series. */
  weeks: MoodCheckin[];
  /** Monthly check-ins by "YYYY-MM", drawn as ◇ on the year's mood series. */
  months: Map<string, MoodCheckin>;
  /** A day's dot was clicked: edit its check-in, or log one for it. */
  onDay: (dateStr: string, checkin: MoodCheckin | null) => void;
  /** A weekly check-in's span was clicked: edit it. */
  onWeek: (week: MoodCheckin) => void;
  /** A month of the year was clicked: open that month's report. */
  onMonth: (monthStart: string) => void;
  /** A monthly check-in's ◇ was clicked: edit it. */
  onMonthCheckin: (month: MoodCheckin) => void;
}

/**
 * "Mood over time": for a week or month, one dot per daily check-in coloured
 * by its value, with hollow dots on the axis for days without one (a month
 * adds a 7-day rolling average) and each weekly check-in as a dashed span
 * across its week; for a year, each month's average with its interquartile
 * range and a ◇ for the monthly check-in, which opens it to edit. Mood,
 * energy and stress share the 1–5 scale. Dots and labels are HTML
 * positioned over a stretched SVG of lines, so nothing distorts at narrow
 * widths.
 */
const ReportMoodChart: React.FC<ReportMoodChartProps> = ({ period, buckets, byDay, weeks, months: monthCheckins, onDay, onWeek, onMonth, onMonthCheckin }) => {
  const [series, setSeries] = useState<MoodSeries>('mood');
  const { label: seriesLabel, names } = SERIES.find(s => s.series === series)!;
  const isYear = period.kind === 'year';
  const n = buckets.length;

  const months = isYear ? buckets.map(b => monthMood(byDay, b.key, series)) : [];
  const values = isYear ? months.map(m => m.average) : buckets.map(b => seriesValue(byDay.get(b.key), series));
  const line = isYear
    ? values
    : period.kind === 'month'
      ? periodRollingAverage(period, byDay, series)
      : values;
  const hasValues = values.some(v => v != null);
  const lowerName = seriesLabel.toLowerCase();
  const isMood = series === 'mood';
  const weekSpans = !isYear && isMood
    ? weeks.flatMap(week => {
        const lastDay = parseLocalDate(week.period_start);
        lastDay.setDate(lastDay.getDate() + 6);
        const last = toLocalDateStr(lastDay);
        const from = buckets.findIndex(b => b.key >= week.period_start);
        const to = buckets.findLastIndex(b => b.key <= last);
        return from >= 0 && to >= from ? [{ week, from, to }] : [];
      })
    : [];

  const dotSize = period.kind === 'week' ? 'w-3.5 h-3.5' : isYear ? 'w-3 h-3' : 'w-2 h-2 sm:w-2.5 sm:h-2.5';
  const hollowSize = period.kind === 'week' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  const dayLabel = (b: ReportBucket, checkin: MoodCheckin | undefined, value: number | null): string => {
    if (!checkin || value == null) return `${b.longLabel}: no check-in. Log it`;
    const parts = [`${seriesLabel} ${names[value - 1]}`];
    if (series !== 'mood') parts.push(`mood ${MOOD_LABELS[checkin.mood - 1]}`);
    if (checkin.tags.length) parts.push(checkin.tags.join(', '));
    if (checkin.note) parts.push(`“${checkin.note}”`);
    return `${b.longLabel}: ${parts.join(' · ')}. Edit`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Chart series">
          {SERIES.map(s => (
            <MetricButton key={s.series} active={series === s.series} onClick={() => setSeries(s.series)}>{s.label}</MetricButton>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {isYear ? (
            <>
              <LegendLine label="Monthly average" />
              {isMood && monthCheckins.size > 0 && <LegendDiamond label="Monthly check-in" />}
            </>
          ) : (
            <>
              <LegendDot color={seriesColor(series, 4)} label="Daily check-in" />
              {period.kind === 'month' && <LegendLine label="7-day average" />}
              {isMood && weeks.length > 0 && <LegendDash label="Weekly check-in" />}
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex gap-2">
          {/* Scale labels */}
          <div className="relative w-14 sm:w-16 shrink-0 h-36 sm:h-48" aria-hidden="true">
            {names.map((name, i) => (
              <span
                key={name}
                className="absolute left-0 right-0 -translate-y-1/2 flex items-center gap-1.5 text-[10px] sm:text-[11px] text-text-muted leading-none"
                style={{ top: `${yOf(i + 1)}%` }}
              >
                {series === 'mood' ? (
                  <span className="w-3.5 h-3.5 shrink-0" style={{ color: moodColor(i + 1) }}>
                    <MoodFace mood={i + 1} filled className="w-full h-full" />
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--tm-border)' }} />
                )}
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>

          <div className="relative flex-1 min-w-0 h-36 sm:h-48" role="group" aria-label={`${seriesLabel} over time`}>
            {buckets.map((b, i) =>
              b.isCurrent ? (
                <div
                  key={`now-${b.key}`}
                  className="absolute top-0 bottom-0 rounded-md"
                  style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%`, backgroundColor: 'var(--tm-accent-subtle)' }}
                  aria-hidden="true"
                />
              ) : null,
            )}
            {[1, 2, 3, 4, 5].map(v => (
              <div
                key={v}
                className={`absolute left-0 right-0 border-t ${v === 3 ? '' : 'border-dashed'}`}
                style={{ top: `${yOf(v)}%`, borderColor: 'var(--tm-border)' }}
                aria-hidden="true"
              />
            ))}

            {isYear && months.map((m, i) =>
              m.q1 != null && m.q3 != null && m.average != null ? (
                <div
                  key={`band-${buckets[i].key}`}
                  className="absolute flex justify-center"
                  style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%`, top: `${yOf(m.q3)}%`, height: `max(4px, ${yOf(m.q1) - yOf(m.q3)}%)` }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full w-[56%] max-w-[18px] rounded-full"
                    style={{ backgroundColor: `color-mix(in srgb, ${seriesColor(series, m.average)} 18%, transparent)` }}
                  />
                </div>
              ) : null,
            )}

            <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path
                d={linePath(line)}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth={period.kind === 'week' ? 1.25 : 2}
                strokeOpacity={period.kind === 'week' ? 0.45 : 0.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {weekSpans.map(({ week, from, to }) => {
              const label = describeWeekCheckin(week);
              return (
                <button
                  key={`week-${week.period_start}`}
                  type="button"
                  onClick={() => onWeek(week)}
                  className="absolute h-3 -translate-y-1/2 flex items-center rounded focus-visible:outline-2 focus-visible:outline-accent"
                  style={{ left: `${((from + 0.1) / n) * 100}%`, width: `${((to - from + 0.8) / n) * 100}%`, top: `${yOf(week.mood)}%` }}
                  aria-label={`Weekly check-in. ${label}. Edit`}
                  title={`Weekly check-in\n${label}`}
                >
                  <span className="block w-full opacity-60" style={{ borderTop: `2.5px dashed ${moodColor(week.mood)}` }} />
                </button>
              );
            })}

            {buckets.map((b, i) => {
              if (b.isFuture) return null;
              const left = `${(i / n) * 100}%`;
              const width = `${100 / n}%`;
              const buttonClass = 'absolute h-6 -translate-y-1/2 flex items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-accent';

              if (isYear) {
                const m = months[i];
                const monthName = b.longLabel.split(' ')[0];
                const checkin = isMood ? monthCheckins.get(b.key) : undefined;
                const monthly = checkin ? `Monthly check-in: ${moodLabel(checkin.mood)}${checkin.word ? ` · “${checkin.word}”` : ''}` : '';
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onMonth(b.dateStr)}
                    className={buttonClass}
                    style={{ left, width, top: `${m.average != null ? yOf(m.average) : AXIS_Y}%` }}
                    aria-label={`${m.average != null
                      ? `${monthName}: average ${lowerName} ${m.average.toFixed(1)} across ${m.n} ${m.n === 1 ? 'day' : 'days'}.`
                      : `${monthName}: no ${lowerName} recorded.`}${monthly ? ` ${monthly}.` : ''} Open ${monthName}`}
                    title={`${m.average != null && m.q1 != null && m.q3 != null
                      ? `${b.longLabel}\nAverage ${m.average.toFixed(1)} across ${m.n} ${m.n === 1 ? 'day' : 'days'}\nMiddle half of days: ${m.q1.toFixed(1)}–${m.q3.toFixed(1)}`
                      : `${b.longLabel}: no ${lowerName} recorded`}${monthly ? `\n${monthly}` : ''}`}
                  >
                    <MoodDot size={m.average != null ? dotSize : hollowSize} color={m.average != null ? seriesColor(series, m.average) : null} />
                  </button>
                );
              }

              const checkin = byDay.get(b.key);
              const value = values[i];
              // A check-in without this series (energy and stress are optional) has no dot to draw.
              if (checkin && value == null) return null;
              const label = dayLabel(b, checkin, value);
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => onDay(b.key, checkin ?? null)}
                  className={buttonClass}
                  style={{ left, width, top: `${value != null ? yOf(value) : AXIS_Y}%` }}
                  aria-label={label}
                  title={label}
                >
                  <MoodDot size={value != null ? dotSize : hollowSize} color={value != null ? seriesColor(series, value) : null} />
                </button>
              );
            })}

            {isYear && isMood && buckets.map((b, i) => {
              const checkin = monthCheckins.get(b.key);
              if (!checkin) return null;
              const label = `${b.longLabel.split(' ')[0]} monthly check-in: ${moodLabel(checkin.mood)}${checkin.word ? ` · “${checkin.word}”` : ''}`;
              // After the month dots, so the ◇ stays clickable where it sits on its month's dot.
              return (
                <button
                  key={`diamond-${b.key}`}
                  type="button"
                  onClick={() => onMonthCheckin(checkin)}
                  className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-accent"
                  style={{ left: `${xOf(i, n)}%`, top: `${yOf(checkin.mood)}%` }}
                  aria-label={`${label}. Edit`}
                  title={label}
                >
                  <span className="block w-3 h-3 rotate-45 border-[1.6px]" style={{ borderColor: moodColor(checkin.mood) }} />
                </button>
              );
            })}

            {!hasValues && (
              <p className="absolute inset-x-0 top-1/3 text-center text-xs sm:text-sm text-text-muted italic px-2">
                {series === 'mood' ? 'No check-ins in this period' : `No ${lowerName} recorded in this period — it’s optional in the check-in`}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1" aria-hidden="true">
          <div className="w-14 sm:w-16 shrink-0" />
          <div className="flex-1 min-w-0 flex">
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className={`flex-1 min-w-0 text-center text-[10px] sm:text-xs leading-none ${b.isCurrent ? 'font-bold' : ''}`}
                style={{ color: b.isCurrent ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}
              >
                {period.kind !== 'month' || i === 0 || (i + 1) % 5 === 0 ? b.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        {isYear
          ? `Dots are each month’s average; the shaded bar covers the middle half of its days${isMood && monthCheckins.size > 0 ? '; ◇ marks the monthly check-in — click it to edit' : ''}. Click a month to open it.`
          : `Click a dot to edit that day’s check-in. Hollow dots are days without one — click to log it.${period.kind === 'month' ? ' The solid line is your 7-day average: each point averages that day and the 6 before it, shown once 3 of those days have a check-in.' : ''}${weekSpans.length > 0 ? ' Dashed lines are weekly check-ins.' : ''}`}
      </p>
    </div>
  );
};

const MoodDot: React.FC<{ size: string; color: string | null }> = ({ size, color }) =>
  color ? (
    <span className={`${size} rounded-full block`} style={{ backgroundColor: color, boxShadow: '0 0 0 2px var(--tm-surface)' }} />
  ) : (
    <span
      className={`${size} rounded-full block border-[1.5px] border-dashed`}
      style={{ backgroundColor: 'var(--tm-surface)', borderColor: 'var(--tm-text-muted)' }}
    />
  );

export default ReportMoodChart;
