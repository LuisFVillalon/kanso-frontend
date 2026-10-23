'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { ENERGY_LABELS, MOOD_LABELS, STRESS_LABELS, WORKLOAD_LABELS, moodLabel, type MoodCheckin } from '@/app/types/mood';
import type { ReportBucket, ReportPeriod } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { monthMood, periodRollingAverage, seriesValue, YEAR_FADE_DAYS, type MonthMood, type MoodSeries } from '@/app/utils/moodReport';
import { LegendDot } from './ReportActivityChart';

const SERIES: { series: MoodSeries; label: string; names: readonly string[] }[] = [
  { series: 'mood', label: 'Mood', names: MOOD_LABELS },
  { series: 'energy', label: 'Energy', names: ENERGY_LABELS },
  { series: 'stress', label: 'Stress', names: STRESS_LABELS },
];

const LINE_COLOR = 'var(--tm-text-secondary)';

const seriesColor = (series: MoodSeries, value: number) =>
  series === 'mood' ? moodColor(Math.round(value)) : series === 'energy' ? 'var(--tm-accent)' : 'var(--tm-accent-2)';

/** Each row's line: the mood line stays neutral under its coloured dots; energy and stress take their own colour. */
const lineColor = (series: MoodSeries) => (series === 'mood' ? LINE_COLOR : seriesColor(series, 3));

// Vertical positions as a percentage of a row's height: 5 at the top,
// 1 near the bottom, and (on the mood row) days without a check-in on an
// axis below that.
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

const LegendHollow: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-dashed" style={{ borderColor: moodColor(4) }} />
    {label}
  </span>
);

const LegendFaded: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2.5 h-2.5 rounded-full opacity-35" style={{ backgroundColor: moodColor(4) }} />
    {label}
  </span>
);

const shortDate = (dateStr: string) => parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

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
  /** Weekly check-ins whose week overlaps the period, drawn as dashed spans on the mood row. */
  weeks: MoodCheckin[];
  /** Monthly check-ins by "YYYY-MM", drawn as ◇ on the year's mood row. */
  months: Map<string, MoodCheckin>;
  /** A day was clicked: edit its check-in, or log one for it. */
  onDay: (dateStr: string, checkin: MoodCheckin | null) => void;
  /** A weekly check-in's span was clicked: edit it. */
  onWeek: (week: MoodCheckin) => void;
  /** A month of the year was clicked: open that month's report. */
  onMonth: (monthStart: string) => void;
  /** A monthly check-in's ◇ was clicked: edit it. */
  onMonthCheckin: (month: MoodCheckin) => void;
}

interface Row {
  series: MoodSeries;
  label: string;
  names: readonly string[];
  /** One value per bucket: a day's value, or a month's average on the year. */
  values: (number | null)[];
  /** The line drawn through the row: the 7-day trend on a month, the values otherwise. */
  line: (number | null)[];
  /** Year only: each month's average, spread and day count. */
  months: MonthMood[];
}

/**
 * "Mood over time": mood, energy and stress as three short charts stacked
 * on one shared time axis, each with its own words on its 1–5 scale. For a
 * week or month, one dot per daily check-in (a month adds each row's 7-day
 * trend) and, on the mood row, hollow dots for days without one and each
 * weekly check-in as a dashed span across its week; for a year, each
 * month's average with its interquartile range, faded under
 * `YEAR_FADE_DAYS` days, and a ◇ on the mood row for the monthly check-in.
 * Energy and stress are optional in the check-in, so a day without them is
 * a gap in their rows, never a zero. Hovering, focusing or tapping a column
 * lights that day (or month) up in all three rows and lists its values;
 * clicking it — or tapping it again on a touch screen — edits the day or
 * opens the month. Dots and labels are HTML positioned over stretched SVG
 * lines, so nothing distorts at narrow widths.
 */
const ReportMoodChart: React.FC<ReportMoodChartProps> = ({ period, buckets, byDay, weeks, months: monthCheckins, onDay, onWeek, onMonth, onMonthCheckin }) => {
  const [active, setActive] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const pointerType = useRef<string | null>(null);
  const previewed = useRef<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const isYear = period.kind === 'year';
  const n = buckets.length;

  // A column chosen by touch stays lit until the next tap lands outside the chart.
  useEffect(() => {
    if (!touched) return;
    const dismiss = (e: PointerEvent) => {
      if (!chartRef.current?.contains(e.target as Node)) {
        setActive(null);
        setTouched(false);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [touched]);

  const rows: Row[] = SERIES.map(({ series, label, names }) => {
    const months = isYear ? buckets.map(b => monthMood(byDay, b.key, series)) : [];
    const values = isYear ? months.map(m => m.average) : buckets.map(b => seriesValue(byDay.get(b.key), series));
    const line = period.kind === 'month' ? periodRollingAverage(period, byDay, series) : values;
    return { series, label, names, values, line, months };
  });

  const weekSpans = !isYear
    ? weeks.flatMap(week => {
        const lastDay = parseLocalDate(week.period_start);
        lastDay.setDate(lastDay.getDate() + 6);
        const last = toLocalDateStr(lastDay);
        const from = buckets.findIndex(b => b.key >= week.period_start);
        const to = buckets.findLastIndex(b => b.key <= last);
        return from >= 0 && to >= from ? [{ week, from, to }] : [];
      })
    : [];
  const hasFaded = isYear && rows.some(r => r.months.some(m => m.n > 0 && m.n < YEAR_FADE_DAYS));

  const dotSize = period.kind === 'week' ? 'w-3 h-3' : isYear ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const hollowSize = period.kind === 'week' ? 'w-2.5 h-2.5' : 'w-2 h-2';

  const monthlyText = (checkin: MoodCheckin | undefined) =>
    checkin ? `Monthly check-in: ${moodLabel(checkin.mood)}${checkin.word ? ` · “${checkin.word}”` : ''}` : '';

  /** A column's accessible name: the day's values, or the month's typical ones, and what clicking does. */
  const columnLabel = (b: ReportBucket, i: number): string => {
    if (isYear) {
      const monthName = b.longLabel.split(' ')[0];
      const typical = rows
        .filter(r => r.months[i].average != null)
        .map((r, k) => {
          const m = r.months[i];
          return `${k === 0 ? 'typical' : 'Typical'} ${r.label.toLowerCase()} ${m.average!.toFixed(1)} across ${days(m.n)}.`;
        });
      const monthly = monthlyText(monthCheckins.get(b.key));
      return `${monthName}: ${typical.length ? typical.join(' ') : 'no mood recorded.'}${monthly ? ` ${monthly}.` : ''} Open ${monthName}`;
    }
    const checkin = byDay.get(b.key);
    if (!checkin) return `${b.longLabel}: no check-in. Log it`;
    const parts = rows.flatMap(r => {
      const v = r.values[i];
      return v != null ? [`${r.label} ${r.names[v - 1]}`] : [];
    });
    if (checkin.tags.length) parts.push(checkin.tags.join(', '));
    if (checkin.note) parts.push(`“${checkin.note}”`);
    return `${b.longLabel}: ${parts.join(' · ')}. Edit`;
  };

  const handleColumnClick = (b: ReportBucket, i: number) => {
    // On a touch screen the first tap shows the column's values; the second acts on it.
    if (pointerType.current === 'touch' && !(touched && previewed.current === i)) {
      previewed.current = i;
      setActive(i);
      setTouched(true);
      return;
    }
    if (isYear) onMonth(b.dateStr);
    else onDay(b.key, byDay.get(b.key) ?? null);
  };

  const tooltip = active != null && buckets[active] ? (() => {
    const b = buckets[active];
    const lines: { label: string; text: string; color: string | null; few?: string }[] = rows.map(r => {
      const v = r.values[active];
      if (isYear) {
        const m = r.months[active];
        return {
          label: r.label,
          text: m.average != null ? `${r.names[Math.round(m.average) - 1]} ${m.average.toFixed(1)}` : 'Not recorded',
          color: m.average != null ? seriesColor(r.series, m.average) : null,
          few: m.n > 0 && m.n < YEAR_FADE_DAYS ? `only ${days(m.n)}` : undefined,
        };
      }
      return { label: r.label, text: v != null ? r.names[v - 1] : 'Not recorded', color: v != null ? seriesColor(r.series, v) : null };
    });
    const checkin = isYear ? undefined : byDay.get(b.key);
    const monthly = isYear ? monthlyText(monthCheckins.get(b.key)) : '';
    const logged = isYear ? rows[0].months[active].n : 0;
    const action = isYear ? `Open ${b.longLabel.split(' ')[0]}` : checkin ? 'Edit' : 'Log it';
    const x = xOf(active, n);
    return (
      <div
        className="absolute top-1 z-30 pointer-events-none min-w-[9rem] max-w-[13rem] rounded-lg border border-border bg-surface-raised shadow-md px-2.5 py-2 text-xs"
        style={x < 50 ? { left: `calc(${((active + 1) / n) * 100}% + 4px)` } : { right: `calc(${100 - (active / n) * 100}% + 4px)` }}
        aria-hidden="true"
      >
        <p className="font-semibold text-text-primary">{b.longLabel}</p>
        {isYear && logged > 0 && (
          <p className="text-[10px] text-text-muted">{days(logged)} logged</p>
        )}
        <div className="mb-1" />
        {isYear || checkin ? (
          <ul className="flex flex-col gap-0.5">
            {lines.map(l => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${l.color ? '' : 'border border-dashed'}`}
                  style={l.color ? { backgroundColor: l.color } : { borderColor: 'var(--tm-text-muted)' }}
                />
                <span className="text-text-muted">{l.label}</span>
                <span className={`ml-auto pl-2 whitespace-nowrap ${l.color ? 'text-text-primary font-medium' : 'text-text-muted italic'}`}>{l.text}</span>
                {l.few && <span className="whitespace-nowrap text-[10px] text-text-muted">· {l.few}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-muted">No check-in</p>
        )}
        {monthly && <p className="mt-1 text-text-secondary">{monthly}</p>}
        <p className="mt-1 text-[10px] text-text-muted">{touched ? `Tap again: ${action.toLowerCase()}` : `Click: ${action.toLowerCase()}`}</p>
      </div>
    );
  })() : null;

  const rowPlot = (row: Row) => {
    const isMood = row.series === 'mood';
    const hasValues = row.values.some(v => v != null);
    const lower = row.label.toLowerCase();
    return (
      <div className="relative h-20 sm:h-24" aria-hidden="true">
        {[1, 3, 5].map(v => (
          <div
            key={v}
            className={`absolute left-0 right-0 border-t ${v === 3 ? '' : 'border-dashed'}`}
            style={{ top: `${yOf(v)}%`, borderColor: 'var(--tm-border)' }}
          />
        ))}

        {isYear && row.months.map((m, i) =>
          m.q1 != null && m.q3 != null && m.average != null ? (
            <div
              key={`band-${buckets[i].key}`}
              className="absolute flex justify-center"
              style={{
                left: `${(i / n) * 100}%`,
                width: `${100 / n}%`,
                top: `${yOf(m.q3)}%`,
                height: `max(4px, ${yOf(m.q1) - yOf(m.q3)}%)`,
                opacity: m.n < YEAR_FADE_DAYS ? 0.35 : 1,
              }}
            >
              <div
                className="h-full w-[56%] max-w-[14px] rounded-full"
                style={{ backgroundColor: `color-mix(in srgb, ${seriesColor(row.series, m.average)} 18%, transparent)` }}
              />
            </div>
          ) : null,
        )}

        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d={linePath(row.line)}
            fill="none"
            stroke={lineColor(row.series)}
            strokeWidth={period.kind === 'week' ? 1.25 : 2}
            strokeOpacity={period.kind === 'week' ? 0.5 : 0.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {buckets.map((b, i) => {
          if (b.isFuture) return null;
          const v = row.values[i];
          const lit = active === i;
          const style = { left: `${xOf(i, n)}%` };
          if (v == null) {
            // Only the mood row marks a day without a check-in; elsewhere a missing value is just a gap.
            if (!isMood || isYear || byDay.has(b.key)) return null;
            return (
              <span key={b.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ ...style, top: `${AXIS_Y}%` }} data-gap-day={b.key}>
                <MoodDot size={hollowSize} color={null} lit={lit} />
              </span>
            );
          }
          const faded = isYear && row.months[i].n < YEAR_FADE_DAYS;
          return (
            <span
              key={b.key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ ...style, top: `${yOf(v)}%`, opacity: faded ? 0.35 : 1 }}
              data-series={row.series}
              data-day={b.key}
            >
              <MoodDot size={dotSize} color={seriesColor(row.series, v)} lit={lit} />
            </span>
          );
        })}

        {!hasValues && (
          <p className="absolute inset-x-0 top-1/3 text-center text-[11px] sm:text-xs text-text-muted italic px-2">
            {isMood ? 'No daily check-ins in this period' : `No ${lower} recorded — it’s optional in the check-in`}
          </p>
        )}
      </div>
    );
  };

  const scaleLabels = (row: Row) => (
    <div className="relative h-20 sm:h-24" aria-hidden="true">
      {[1, 3, 5].map(v => (
        <span
          key={v}
          className="absolute left-0 right-0 -translate-y-1/2 flex items-center gap-1 text-[10px] sm:text-[11px] text-text-muted leading-none"
          style={{ top: `${yOf(v)}%` }}
        >
          {row.series === 'mood' && (
            <span className="w-3 h-3 shrink-0" style={{ color: moodColor(v) }}>
              <MoodFace mood={v} filled className="w-full h-full" />
            </span>
          )}
          <span className="truncate">{row.names[v - 1]}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-secondary">
          Mood, energy and stress from your daily check-ins, one line each.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <LegendDot color={moodColor(4)} label="Mood" />
          <LegendDot color="var(--tm-accent)" label="Energy" />
          <LegendDot color="var(--tm-accent-2)" label="Stress" />
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          {isYear ? (
            <>
              <LegendLine label="How the month felt" />
              {hasFaded && <LegendFaded label={`Fewer than ${YEAR_FADE_DAYS} days`} />}
              {monthCheckins.size > 0 && <LegendDiamond label="Monthly check-in (click to edit)" />}
            </>
          ) : (
            <>
              <LegendHollow label="No check-in yet" />
              {period.kind === 'month' && <LegendLine label="7-day trend" />}
              {weekSpans.length > 0 && <LegendDash label="Weekly check-in" />}
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex gap-2">
          {/* Row titles and each row's own words */}
          <div className="w-14 sm:w-16 shrink-0 flex flex-col gap-2">
            {rows.map(row => (
              <div key={row.series}>
                <p className="h-5 flex items-center gap-1 text-xs font-bold text-text-primary">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: seriesColor(row.series, 4) }} aria-hidden="true" />
                  {row.label}
                </p>
                {scaleLabels(row)}
              </div>
            ))}
          </div>

          <div
            ref={chartRef}
            className="relative isolate flex-1 min-w-0 flex flex-col gap-2"
            role="group"
            aria-label="Mood, energy and stress over time"
            onPointerLeave={e => {
              if (e.pointerType === 'mouse') setActive(null);
            }}
          >
            {buckets.map((b, i) =>
              b.isCurrent || active === i ? (
                <div
                  key={`col-${b.key}`}
                  className="absolute top-0 bottom-0 rounded-md -z-10"
                  style={{
                    left: `${(i / n) * 100}%`,
                    width: `${100 / n}%`,
                    backgroundColor: active === i ? 'color-mix(in srgb, var(--tm-accent) 14%, transparent)' : 'var(--tm-accent-subtle)',
                  }}
                  aria-hidden="true"
                  data-active-column={active === i ? b.key : undefined}
                />
              ) : null,
            )}

            {rows.map(row => (
              <div key={row.series}>
                <div className="h-5" />
                {rowPlot(row)}
              </div>
            ))}

            {/* One column per day (or month), across all three rows. */}
            {buckets.map((b, i) => {
              if (b.isFuture) return null;
              return (
                <button
                  key={`hit-${b.key}`}
                  type="button"
                  className="absolute top-0 bottom-0 z-10 rounded-md focus-visible:outline-2 focus-visible:outline-accent"
                  style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
                  aria-label={columnLabel(b, i)}
                  onPointerDown={e => {
                    pointerType.current = e.pointerType;
                  }}
                  onPointerEnter={e => {
                    if (e.pointerType === 'mouse') {
                      setActive(i);
                      setTouched(false);
                    }
                  }}
                  onFocus={() => setActive(i)}
                  onBlur={() => {
                    if (!touched) setActive(a => (a === i ? null : a));
                  }}
                  onClick={() => handleColumnClick(b, i)}
                />
              );
            })}

            {/* Weekly and monthly check-ins sit on the mood row, above the columns so they stay clickable. */}
            <div className="absolute inset-x-0 top-5 h-20 sm:h-24 pointer-events-none z-20">
              {weekSpans.map(({ week, from, to }) => {
                const label = describeWeekCheckin(week);
                return (
                  <button
                    key={`week-${week.period_start}`}
                    type="button"
                    onClick={() => onWeek(week)}
                    className="absolute h-3 -translate-y-1/2 flex items-center rounded pointer-events-auto focus-visible:outline-2 focus-visible:outline-accent"
                    style={{ left: `${((from + 0.1) / n) * 100}%`, width: `${((to - from + 0.8) / n) * 100}%`, top: `${yOf(week.mood)}%` }}
                    aria-label={`Weekly check-in. ${label}. Edit`}
                    title={`Weekly check-in\n${label}`}
                  >
                    <span className="block w-full opacity-60" style={{ borderTop: `2.5px dashed ${moodColor(week.mood)}` }} />
                  </button>
                );
              })}

              {isYear && buckets.map((b, i) => {
                const checkin = monthCheckins.get(b.key);
                if (!checkin) return null;
                const label = `${b.longLabel.split(' ')[0]} monthly check-in: ${moodLabel(checkin.mood)}${checkin.word ? ` · “${checkin.word}”` : ''}`;
                return (
                  <button
                    key={`diamond-${b.key}`}
                    type="button"
                    onClick={() => onMonthCheckin(checkin)}
                    className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded pointer-events-auto focus-visible:outline-2 focus-visible:outline-accent"
                    style={{ left: `${xOf(i, n)}%`, top: `${yOf(checkin.mood)}%` }}
                    aria-label={`${label}. Edit`}
                    title={label}
                  >
                    <span className="block w-3 h-3 rotate-45 border-[1.6px]" style={{ borderColor: moodColor(checkin.mood) }} />
                  </button>
                );
              })}
            </div>

            {tooltip}
          </div>
        </div>

        <div className="flex gap-2 pt-1" aria-hidden="true">
          <div className="w-14 sm:w-16 shrink-0" />
          <div className="flex-1 min-w-0 flex">
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className={`flex-1 min-w-0 text-center text-[10px] sm:text-xs leading-none ${b.isCurrent || active === i ? 'font-bold' : ''}`}
                style={{ color: b.isCurrent ? 'var(--tm-accent)' : active === i ? 'var(--tm-text-primary)' : 'var(--tm-text-muted)' }}
              >
                {period.kind !== 'month' || i === 0 || (i + 1) % 5 === 0 ? b.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        {isYear
          ? 'Each dot shows how a month felt overall. Point at a month to compare all three, and click it to open it.'
          : 'Each line shows how you felt day to day. Point at a day to compare all three, and click it to edit or log it. A break in energy or stress means you skipped it that day.'}
      </p>
    </div>
  );
};

const MoodDot: React.FC<{ size: string; color: string | null; lit?: boolean }> = ({ size, color, lit }) =>
  color ? (
    <span
      className={`${size} rounded-full block transition-transform ${lit ? 'scale-150' : ''}`}
      style={{ backgroundColor: color, boxShadow: '0 0 0 2px var(--tm-surface)' }}
    />
  ) : (
    <span
      className={`${size} rounded-full block border-[1.5px] border-dashed`}
      style={{ backgroundColor: 'var(--tm-surface)', borderColor: 'var(--tm-text-muted)' }}
    />
  );

export default ReportMoodChart;
