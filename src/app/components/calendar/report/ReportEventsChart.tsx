'use client';

import React, { useMemo, useState } from 'react';
import type { CalendarActivity } from '@/app/types/activity';
import type { ReportBucket, ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import { formatEventMinutes } from '@/app/utils/eventOccurrences';
import {
  bucketInWindow, bucketTotal, buildEventTimeSeries, type EventTimeBucket, type EventTimeSeries, type EventTimeTag,
} from '@/app/utils/eventTime';
import { UNTAGGED_KEY, type TagRow } from '@/app/utils/tagReport';
import { axisTicks } from './activityAxis';
import { rowColor } from './ReportTagBreakdown';

/** The Events stat tile's color, so the chart matches the tile. */
export const IN_COLOR = 'var(--tm-week-note)';
/**
 * Free work hours: a pale tint of the Work hours card's "Free for focus"
 * green, edged with a dashed line so it never reads as a tag's solid color.
 */
export const FREE_COLOR = 'color-mix(in srgb, var(--tm-success) 30%, var(--tm-surface))';
const FREE_EDGE = 'color-mix(in srgb, var(--tm-success) 75%, transparent)';
const freeStyle: React.CSSProperties = { backgroundColor: FREE_COLOR, outline: `1px dashed ${FREE_EDGE}`, outlineOffset: -1 };
/** How much a tag that isn't picked fades, as on the Tasks, Notes and Habits charts. */
const DIMMED = 0.2;

/** Upcoming time: stripes of the part's own color. */
const hatch = (color: string) =>
  `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 70%, transparent) 0 3px, color-mix(in srgb, ${color} 38%, transparent) 3px 6px)`;

const fillOf = (color: string, upcoming: boolean): React.CSSProperties =>
  upcoming ? { backgroundImage: hatch(color) } : { backgroundColor: color };

/** "30m" under an hour, "1.5h" from there, so a label fits the narrow axis. */
const formatTick = (minutes: number) => {
  if (minutes === 0) return '0';
  return minutes < 60 ? `${minutes}m` : `${Math.round((minutes / 60) * 10) / 10}h`;
};

const duration = (minutes: number) => formatEventMinutes(minutes);

// A month has up to 31 bars; labelling every one crowds a phone screen, so
// only the 1st and every 5th day get a label.
const showLabel = (kind: ReportPeriod['kind'], index: number) =>
  kind !== 'month' || index === 0 || (index + 1) % 5 === 0;

/** "Wed", "Wed 11" or "Apr": how the peak line names a bucket. */
const shortName = (kind: ReportPeriod['kind'], b: ReportBucket) => {
  const [y, m, d = 1] = b.dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (kind === 'year') return date.toLocaleDateString('en-US', { month: 'short' });
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  return kind === 'week' ? weekday : `${weekday} ${d}`;
};

const LegendDot: React.FC<{ swatch: React.CSSProperties; label: string; dimmed?: boolean }> = ({ swatch, label, dimmed }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary" style={{ opacity: dimmed ? 0.55 : 1 }}>
    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={swatch} />
    {label}
  </span>
);

interface Part {
  key: string;
  minutes: number;
  style: React.CSSProperties;
  dimmed: boolean;
}

const EMPTY_TAG: EventTimeTag = { past: 0, upcoming: 0, inWindow: 0 };

/** A minute-stable "now", so a series stays memoized between renders. */
export const useNowMinute = (): number => Math.floor(Date.now() / 60000);

const periodKeyOf = (period: ReportPeriod) => `${period.kind}:${toLocalDateStr(period.start)}`;

/** The period's time in events, per day or (with `byMonth`) per month. */
export const useEventTimeSeries = (
  period: ReportPeriod,
  activity: CalendarActivity,
  workDays: WorkDaySettings,
  byMonth: boolean,
): EventTimeSeries => {
  const periodKey = periodKeyOf(period);
  const nowMinute = useNowMinute();
  return useMemo(
    () => buildEventTimeSeries(activity, period.start, period.end, workDays, byMonth, new Date(nowMinute * 60000)),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, periodKey, workDays, byMonth, nowMinute],
  );
};

export interface EventSelection {
  /** Per day, or per month for a year. */
  series: EventTimeSeries;
  /** The picked tag. A pick only holds for the period it was made in. */
  selected: TagRow | null;
  /** Picks a tag row by key, or all events with null. */
  pick: (key: string | null) => void;
}

/** The Events chart's data and picked tag, for a view whose other cards follow the tag too. */
export const useEventSelection = (period: ReportPeriod, activity: CalendarActivity, workDays: WorkDaySettings): EventSelection => {
  const periodKey = periodKeyOf(period);
  const series = useEventTimeSeries(period, activity, workDays, period.kind === 'year');
  const [picked, setPicked] = useState<{ periodKey: string; key: string } | null>(null);
  const selected = picked?.periodKey === periodKey ? series.rows.find(r => r.key === picked.key) ?? null : null;
  const pick = (key: string | null) => setPicked(key ? { periodKey, key } : null);
  return { series, selected, pick };
};

interface ReportEventsChartProps {
  period: ReportPeriod;
  buckets: ReportBucket[];
  selection: EventSelection;
  /** Buttons that share the row with the legend. */
  tabs?: React.ReactNode;
}

/**
 * The Events view's chart: time in events per day (per month for a year),
 * each bar split by the events' tags in their own colors as on the Tasks,
 * Notes and Habits charts, with the work hours left free on top; time
 * still to come is hatched. Picking a tag fades the others.
 */
const ReportEventsChart: React.FC<ReportEventsChartProps> = ({ period, buckets, selection, tabs }) => {
  const { series: { rows, buckets: byKey }, selected, pick } = selection;

  const unit = period.kind === 'year' ? 'month' : 'day';
  const dataOf = (b: ReportBucket): EventTimeBucket | undefined => byKey.get(b.key);
  const totalOf = (b: ReportBucket) => { const d = dataOf(b); return d ? bucketTotal(d) : 0; };
  const inWindowOf = (b: ReportBucket) => { const d = dataOf(b); return d ? bucketInWindow(d) : 0; };
  const windowOf = (b: ReportBucket) => dataOf(b)?.windowMinutes ?? 0;
  /** The work hours no event books; none on a rest day. */
  const freeOf = (b: ReportBucket) => Math.max(windowOf(b) - inWindowOf(b), 0);
  const tagOf = (b: ReportBucket, row: TagRow) => dataOf(b)?.byTag.get(row.key) ?? EMPTY_TAG;
  const tagMinutes = (b: ReportBucket, row: TagRow) => { const t = tagOf(b, row); return t.past + t.upcoming; };
  const upcomingOf = (b: ReportBucket) => { const d = dataOf(b); return d ? d.inWindow.upcoming + d.outside.upcoming : 0; };

  const max = Math.max(...buckets.map(totalOf), 0);
  const scaleMax = Math.max(...buckets.map(b => totalOf(b) + freeOf(b)), 0);
  const ticks = axisTicks(scaleMax * 60, 'notes').map(t => t / 60);
  const scaleTop = ticks[ticks.length - 1];
  const grand = buckets.reduce((s, b) => s + totalOf(b), 0);
  const freeTotal = buckets.reduce((s, b) => s + freeOf(b), 0);
  const isDimmed = (key: string) => selected !== null && selected.key !== key;

  /** Bottom up: each tag, largest first, its past time then its scheduled time; then the free work hours. */
  const partsOf = (b: ReportBucket): Part[] => {
    const parts: Part[] = rows.flatMap(row => {
      const tag = tagOf(b, row);
      const color = rowColor(row);
      return [
        { key: `${row.key}:past`, minutes: tag.past, style: fillOf(color, false), dimmed: isDimmed(row.key) },
        { key: `${row.key}:upcoming`, minutes: tag.upcoming, style: fillOf(color, true), dimmed: isDimmed(row.key) },
      ];
    });
    parts.push({ key: 'free', minutes: freeOf(b), style: freeStyle, dimmed: selected !== null });
    return parts;
  };

  const describeBucket = (b: ReportBucket) => {
    const tags = rows.filter(r => tagMinutes(b, r) > 0).map(r => `${r.name} ${duration(tagMinutes(b, r))}`);
    const window = windowOf(b);
    const free = window > 0 ? `Free ${duration(freeOf(b))} of ${duration(window)} work hours` : 'rest day';
    return `${b.longLabel}: ${duration(totalOf(b))} in events${tags.length ? ` (${tags.join(', ')})` : ''} · ${free}`;
  };

  // The bucket whose work hours are most booked, counting time still to come.
  const booked = buckets
    .filter(b => windowOf(b) > 0)
    .reduce<ReportBucket | null>((best, b) => (best && inWindowOf(best) / windowOf(best) >= inWindowOf(b) / windowOf(b) ? best : b), null);
  const peak = booked
    ? `Most booked: ${shortName(period.kind, booked)}, ${duration(inWindowOf(booked))} of ${duration(windowOf(booked))} work hours (${Math.round((inWindowOf(booked) / windowOf(booked)) * 100)}%)`
    : `Peak: ${duration(max)} in one ${unit}`;

  const tagTotal = (row: TagRow) => buckets.reduce((s, b) => s + tagMinutes(b, row), 0);
  const tagInWindow = (row: TagRow) => buckets.reduce((s, b) => s + tagOf(b, row).inWindow, 0);
  const summary = `Time in events per ${unit} by tag, with the work hours left free${selected ? `, with ${selected.name} picked out` : ''}`;
  const withScheduled = (minutes: number, upcoming: number) =>
    `${duration(minutes)}${upcoming > 0 ? ` (${duration(upcoming)} scheduled)` : ''}`;

  // The tag chips below are the tags' key, as on the Tasks, Notes and Habits charts.
  const legend = max > 0 && freeTotal > 0 && <LegendDot swatch={freeStyle} label="Free" dimmed={selected !== null} />;

  const chip = (key: string | null, label: React.ReactNode, color: string, isSelected: boolean) => (
    <button
      key={key ?? 'all'}
      type="button"
      onClick={() => pick(key)}
      aria-pressed={isSelected}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap transition-colors ${
        isSelected ? 'border-border-strong bg-surface-raised text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabs}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">{legend}</div>
      </div>

      {max === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center rounded-lg" style={{ minHeight: '9rem', backgroundColor: 'var(--tm-surface-raised)' }}>
          <p className="text-xs sm:text-sm text-text-muted italic">No time in events in this period</p>
        </div>
      ) : (
        <>
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Show a tag">
            {chip(null, 'All events', IN_COLOR, !selected)}
            {rows.map(row => chip(
              row.key,
              <span className={row.key === UNTAGGED_KEY ? 'italic' : ''}>{row.name}</span>,
              rowColor(row),
              selected?.key === row.key,
            ))}
          </div>

          <div role="img" aria-label={summary} className="flex-1 flex flex-col">
            <p className="m-0 mb-1 text-[10px] sm:text-[11px] text-text-muted" aria-hidden="true">Time in events</p>
            <div className="flex-1 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(6rem,1fr)_auto] sm:grid-rows-[minmax(9rem,1fr)_auto] gap-x-1.5">
              <div className="relative w-7 sm:w-8" aria-hidden="true">
                {ticks.map(t => (
                  <span
                    key={t}
                    className="absolute right-0 text-[10px] sm:text-[11px] leading-none text-text-muted tabular-nums whitespace-nowrap"
                    style={{ bottom: `${(t / scaleTop) * 100}%`, transform: 'translateY(50%)' }}
                  >
                    {formatTick(t)}
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
                {buckets.map(b => (
                  // Today is marked by its label alone: a tinted column would read as a tag's bar.
                  <div key={b.key} className="relative flex-1 min-w-0 h-full flex flex-col justify-end" title={describeBucket(b)}>
                    <div
                      className="relative flex flex-col-reverse overflow-hidden rounded-t-sm"
                      style={{ height: `${((totalOf(b) + freeOf(b)) / scaleTop) * 100}%`, transition: 'height var(--tm-dur-slow) var(--tm-ease)' }}
                    >
                      {partsOf(b).filter(p => p.minutes > 0).map(p => (
                        <div
                          key={p.key}
                          data-part={p.key}
                          style={{
                            flexGrow: p.minutes,
                            ...p.style,
                            opacity: p.dimmed ? DIMMED : 1,
                            transition: 'opacity var(--tm-dur-fast) var(--tm-ease)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-start-2 flex gap-[2px] sm:gap-1 pt-1" aria-hidden="true">
                {buckets.map((b, i) => (
                  <span
                    key={b.key}
                    className={`flex-1 min-w-0 text-center text-[10px] sm:text-xs leading-none ${b.isCurrent ? 'font-bold' : ''}`}
                    style={{ color: b.isCurrent ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}
                  >
                    {showLabel(period.kind, i) ? b.label : ''}
                  </span>
                ))}
              </div>
            </div>
            {/* Hidden on a phone to keep the report tabs on one screen. */}
            <p className="hidden sm:block mt-1.5 text-[11px] text-text-muted">{peak}</p>
          </div>

          {selected && (
            <p className="m-0 text-xs sm:text-sm text-text-primary" aria-live="polite">
              <span className="font-semibold">{selected.name}</span>: {duration(tagTotal(selected))}
              {grand > 0 && ` · ${Math.round((tagTotal(selected) / grand) * 100)}% of event time`}
              {` · ${duration(tagInWindow(selected))} in work hours`}
            </p>
          )}
        </>
      )}

      {/* sr-only on the table itself doesn't shrink it — tables size to their content. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{period.kind === 'year' ? 'Month' : 'Day'}</th>
              <th scope="col">Time in events</th>
              {rows.map(row => <th key={row.key} scope="col">{row.name}</th>)}
              <th scope="col">Free</th>
              <th scope="col">Work hours</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              return (
                <tr key={b.key}>
                  <th scope="row">{b.longLabel}</th>
                  <td>{withScheduled(totalOf(b), upcomingOf(b))}</td>
                  {rows.map(row => <td key={row.key}>{withScheduled(tagMinutes(b, row), tagOf(b, row).upcoming)}</td>)}
                  <td>{windowOf(b) > 0 ? duration(freeOf(b)) : '—'}</td>
                  <td>{windowOf(b) > 0 ? duration(windowOf(b)) : 'Rest day'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportEventsChart;
