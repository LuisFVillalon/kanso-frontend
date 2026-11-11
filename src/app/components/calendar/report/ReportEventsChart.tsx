'use client';

import React, { useMemo, useState } from 'react';
import type { CalendarActivity } from '@/app/types/activity';
import type { ReportBucket, ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import { formatEventMinutes } from '@/app/utils/eventOccurrences';
import {
  bucketInWindow, bucketTotal, buildEventTimeSeries, type EventTimeBucket, type EventTimeTag,
} from '@/app/utils/eventTime';
import { UNTAGGED_KEY, type TagRow } from '@/app/utils/tagReport';
import { axisTicks } from './activityAxis';
import { rowColor } from './ReportTagBreakdown';

/** The Events stat tile's color, so the tab matches the tile. */
const IN_COLOR = 'var(--tm-week-note)';
const OUT_COLOR = 'color-mix(in srgb, var(--tm-week-note) 45%, transparent)';
const REST_COLOR = 'color-mix(in srgb, var(--tm-text-muted) 38%, transparent)';

/** A tag's color here: Untagged's usual grey is too close to "Other events", so it takes a lighter one. */
const spotColor = (row: TagRow) => (row.key === UNTAGGED_KEY ? 'var(--tm-text-secondary)' : rowColor(row));

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

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
    {label}
  </span>
);

const OutlineKey: React.FC = () => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ border: '1px dashed var(--tm-border-strong)' }} />
    Work hours
  </span>
);

interface Part {
  key: string;
  minutes: number;
  color: string;
  upcoming: boolean;
}

const EMPTY_TAG: EventTimeTag = { past: 0, upcoming: 0, inWindow: 0 };

interface ReportEventsChartProps {
  period: ReportPeriod;
  buckets: ReportBucket[];
  activity: CalendarActivity;
  workDays: WorkDaySettings;
  /** The tab buttons, which share the row with this tab's legend. */
  tabs: React.ReactNode;
  now?: Date;
}

/**
 * The Activity card's Events tab: time in events per day (per month for a
 * year). Each workday's work hours are a dashed outline the day's events
 * fill, with time outside them lighter on top; time still to come is
 * hatched. Picking a tag recolors the bars by it, keeping the outline.
 */
const ReportEventsChart: React.FC<ReportEventsChartProps> = ({ period, buckets, activity, workDays, tabs, now: nowProp }) => {
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;
  // A minute-stable "now" keeps the series memoized between renders.
  const nowMinute = Math.floor((nowProp ?? new Date()).getTime() / 60000);
  const { rows, buckets: byKey } = useMemo(
    () => buildEventTimeSeries(activity, period.start, period.end, workDays, period.kind === 'year', new Date(nowMinute * 60000)),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, periodKey, workDays, nowMinute],
  );
  // A pick only holds for the period it was made in.
  const [picked, setPicked] = useState<{ periodKey: string; key: string } | null>(null);
  const selected: TagRow | null = picked?.periodKey === periodKey ? rows.find(r => r.key === picked.key) ?? null : null;

  const unit = period.kind === 'year' ? 'month' : 'day';
  const dataOf = (b: ReportBucket): EventTimeBucket | undefined => byKey.get(b.key);
  const totalOf = (b: ReportBucket) => { const d = dataOf(b); return d ? bucketTotal(d) : 0; };
  const inWindowOf = (b: ReportBucket) => { const d = dataOf(b); return d ? bucketInWindow(d) : 0; };
  const windowOf = (b: ReportBucket) => dataOf(b)?.windowMinutes ?? 0;
  const tagOf = (b: ReportBucket, row: TagRow) => dataOf(b)?.byTag.get(row.key) ?? EMPTY_TAG;
  const upcomingOf = (b: ReportBucket) => { const d = dataOf(b); return d ? d.inWindow.upcoming + d.outside.upcoming : 0; };

  const max = Math.max(...buckets.map(totalOf), 0);
  const scaleMax = Math.max(max, ...buckets.map(windowOf));
  const ticks = axisTicks(scaleMax * 60, 'events').map(t => t / 60);
  const scaleTop = ticks[ticks.length - 1];
  const grand = buckets.reduce((s, b) => s + totalOf(b), 0);

  const partsOf = (b: ReportBucket): Part[] => {
    const d = dataOf(b);
    if (!d) return [];
    if (!selected) {
      return [
        { key: 'in-past', minutes: d.inWindow.past, color: IN_COLOR, upcoming: false },
        { key: 'in-upcoming', minutes: d.inWindow.upcoming, color: IN_COLOR, upcoming: true },
        { key: 'out-past', minutes: d.outside.past, color: OUT_COLOR, upcoming: false },
        { key: 'out-upcoming', minutes: d.outside.upcoming, color: OUT_COLOR, upcoming: true },
      ];
    }
    const tag = tagOf(b, selected);
    const color = spotColor(selected);
    return [
      { key: 'tag-past', minutes: tag.past, color, upcoming: false },
      { key: 'tag-upcoming', minutes: tag.upcoming, color, upcoming: true },
      { key: 'rest-past', minutes: Math.max(d.inWindow.past + d.outside.past - tag.past, 0), color: REST_COLOR, upcoming: false },
      { key: 'rest-upcoming', minutes: Math.max(d.inWindow.upcoming + d.outside.upcoming - tag.upcoming, 0), color: REST_COLOR, upcoming: true },
    ];
  };

  const describeBucket = (b: ReportBucket) => {
    const window = windowOf(b);
    const hours = window > 0 ? `${duration(inWindowOf(b))} of ${duration(window)} work hours` : 'rest day';
    return `${b.longLabel}: ${duration(totalOf(b))} in events · ${hours}`;
  };

  // The bucket whose work hours are most booked, counting time still to come.
  const booked = buckets
    .filter(b => windowOf(b) > 0)
    .reduce<ReportBucket | null>((best, b) => (best && inWindowOf(best) / windowOf(best) >= inWindowOf(b) / windowOf(b) ? best : b), null);
  const peak = booked
    ? `Most booked: ${shortName(period.kind, booked)}, ${duration(inWindowOf(booked))} of ${duration(windowOf(booked))} work hours (${Math.round((inWindowOf(booked) / windowOf(booked)) * 100)}%)`
    : `Peak: ${duration(max)} in one ${unit}`;

  const tagTotal = (row: TagRow) => buckets.reduce((s, b) => { const t = tagOf(b, row); return s + t.past + t.upcoming; }, 0);
  const tagInWindow = (row: TagRow) => buckets.reduce((s, b) => s + tagOf(b, row).inWindow, 0);
  const summary = `Time in events per ${unit}, against your work hours${selected ? `, with ${selected.name} picked out` : ''}`;
  const withScheduled = (minutes: number, upcoming: number) =>
    `${duration(minutes)}${upcoming > 0 ? ` (${duration(upcoming)} scheduled)` : ''}`;

  const legend = selected ? (
    <>
      <LegendDot color={spotColor(selected)} label={selected.name} />
      <LegendDot color={REST_COLOR} label="Other events" />
      <OutlineKey />
    </>
  ) : (
    <>
      <LegendDot color={IN_COLOR} label="In work hours" />
      <LegendDot color={OUT_COLOR} label="Outside" />
      <OutlineKey />
    </>
  );

  const chip = (key: string | null, label: React.ReactNode, color: string, isSelected: boolean) => (
    <button
      key={key ?? 'all'}
      type="button"
      onClick={() => setPicked(key ? { periodKey, key } : null)}
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
              spotColor(row),
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
                {buckets.map(b => {
                  const window = windowOf(b);
                  return (
                    // Today is marked by its label alone: a tinted column would clash with the outline.
                    <div key={b.key} className="relative flex-1 min-w-0 h-full flex flex-col justify-end" title={describeBucket(b)}>
                      {window > 0 && (
                        <div
                          data-testid="work-hours"
                          className="absolute bottom-0 inset-x-0 rounded-t-sm"
                          style={{
                            height: `${(window / scaleTop) * 100}%`,
                            border: '1px dashed var(--tm-border-strong)',
                            borderBottom: 'none',
                            backgroundColor: 'color-mix(in srgb, var(--tm-text-muted) 7%, transparent)',
                          }}
                        />
                      )}
                      <div
                        className="relative flex flex-col-reverse overflow-hidden rounded-t-sm"
                        style={{ height: `${(totalOf(b) / scaleTop) * 100}%`, transition: 'height var(--tm-dur-slow) var(--tm-ease)' }}
                      >
                        {partsOf(b).filter(p => p.minutes > 0).map(p => (
                          <div key={p.key} data-part={p.key} style={{ flexGrow: p.minutes, ...fillOf(p.color, p.upcoming) }} />
                        ))}
                      </div>
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
              <th scope="col">In work hours</th>
              <th scope="col">Work hours</th>
              {selected && <th scope="col">{selected.name}</th>}
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const d = dataOf(b);
              const tag = selected ? tagOf(b, selected) : null;
              return (
                <tr key={b.key}>
                  <th scope="row">{b.longLabel}</th>
                  <td>{withScheduled(totalOf(b), upcomingOf(b))}</td>
                  <td>{withScheduled(inWindowOf(b), d?.inWindow.upcoming ?? 0)}</td>
                  <td>{windowOf(b) > 0 ? duration(windowOf(b)) : 'Rest day'}</td>
                  {tag && <td>{withScheduled(tag.past + tag.upcoming, tag.upcoming)}</td>}
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
