'use client';

import React from 'react';
import { CalendarClock, ChartColumn, Clock, Hourglass, Tag, Trophy } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import { useEventReport } from '@/app/hooks/useEventReport';
import type { EventReport } from '@/app/types/event';
import { describePeriod, periodLength, type ReportPeriod } from '@/app/utils/calendarReport';
import { parseLocalDate } from '@/app/utils/dateUtils';
import { eventBuckets, type EventBucket } from '@/app/utils/eventReport';
import { formatEventMinutes } from '@/app/utils/eventOccurrences';
import { eventColor } from '@/app/utils/events';
import { LegendDot } from './ReportActivityChart';

const EVENT_COLOR = 'var(--tm-accent)';
const FREE_COLOR = 'color-mix(in srgb, var(--tm-success) 55%, var(--tm-surface))';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The free time in words, so its unit is never in doubt: "Free time left in
 * your work hours: 48h 40m, 70% of your work hours".
 */
export const freeTimeSentence = (report: Pick<EventReport, 'free_minutes' | 'free_pct' | 'window_minutes'>): string =>
  report.window_minutes > 0
    ? `Free time left in your work hours: ${formatEventMinutes(report.free_minutes)}, ${Math.round(report.free_pct ?? 0)}% of your work hours`
    : 'No work hours in this period: every day in it is a rest day';

interface TileProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  color: string;
}

// Unlike the Productivity tiles, these keep their detail on a phone: the
// free-time tile's detail says what its number means.
const Tile: React.FC<TileProps> = ({ icon, title, value, detail, color }) => (
  <div
    className="p-2 sm:p-3 rounded-lg border border-border-subtle flex flex-col gap-1 min-w-0"
    style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, var(--tm-surface))` }}
  >
    <span className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm font-semibold whitespace-nowrap overflow-hidden" style={{ color }}>
      {icon}
      {title}
    </span>
    <span className="text-lg sm:text-2xl font-bold leading-none text-text-primary whitespace-nowrap">{value}</span>
    <span className="text-[11px] sm:text-xs text-text-secondary">{detail}</span>
  </div>
);

const iconClass = 'w-3.5 h-3.5 sm:w-4 sm:h-4';

const dayLabel = (dateStr: string) =>
  parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const EventTiles: React.FC<{ report: EventReport; period: ReportPeriod }> = ({ report, period }) => {
  const perDay = report.total_minutes / periodLength(period);
  const busiest = report.busiest_day;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <Tile
        icon={<CalendarClock className={iconClass} />}
        title="Events"
        value={String(report.event_count)}
        detail={report.archived_count > 0 ? `${report.archived_count} of them archived` : 'None archived'}
        color="var(--tm-accent)"
      />
      <Tile
        icon={<Hourglass className={iconClass} />}
        title="Time in events"
        value={formatEventMinutes(report.total_minutes)}
        detail={`${formatEventMinutes(perDay)} a day on average`}
        color="var(--tm-warning)"
      />
      <Tile
        icon={<Trophy className={iconClass} />}
        title="Busiest day"
        value={busiest ? dayLabel(busiest.date) : '—'}
        detail={busiest ? `${formatEventMinutes(busiest.minutes)} in ${plural(busiest.count, 'event')}` : 'No event time'}
        color="var(--tm-accent-2)"
      />
      <Tile
        icon={<Clock className={iconClass} />}
        title="Free in work hours"
        value={report.window_minutes > 0 ? formatEventMinutes(report.free_minutes) : '—'}
        detail={report.window_minutes > 0
          ? `${Math.round(report.free_pct ?? 0)}% of your work hours left after events`
          : 'Only rest days in this period'}
        color="var(--tm-success)"
      />
    </div>
  );
};

const TagBars: React.FC<{ report: EventReport }> = ({ report }) => {
  const rows = report.by_tag.filter(r => r.minutes > 0 || r.count > 0);
  if (rows.length === 0) return <p className="text-xs sm:text-sm text-text-muted italic py-2">No events in this period.</p>;
  const max = Math.max(...rows.map(r => r.minutes), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map(r => {
        const color = eventColor(r.tag ? [r.tag] : []);
        const name = r.tag?.name ?? 'No tag';
        return (
          <li key={r.tag?.id ?? 'none'} className="flex items-center gap-2" title={`${name}: ${formatEventMinutes(r.minutes)} in ${plural(r.count, 'event')}`}>
            <span className="flex items-center gap-1.5 w-24 sm:w-36 flex-shrink-0 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs sm:text-sm text-text-secondary truncate">{name}</span>
            </span>
            <span className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }} aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${Math.max((r.minutes / max) * 100, r.minutes > 0 ? 4 : 0)}%`, backgroundColor: color }} />
            </span>
            <span className="text-xs sm:text-sm text-text-primary whitespace-nowrap text-right w-24 sm:w-28">
              <span className="font-semibold">{formatEventMinutes(r.minutes)}</span>
              <span className="text-text-muted"> · {r.count}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};

// A month has up to 6 weeks and a year 12 months; every column gets a label.
const ColumnChart: React.FC<{
  buckets: EventBucket[];
  valueOf: (b: EventBucket) => number;
  format: (v: number) => string;
  describe: (b: EventBucket) => string;
  summary: string;
}> = ({ buckets, valueOf, format, describe, summary }) => {
  const max = Math.max(...buckets.map(valueOf), 0);
  if (max === 0) return <p className="text-xs sm:text-sm text-text-muted italic py-2">No events in this period.</p>;
  return (
    <div role="img" aria-label={summary} className="flex-1 flex flex-col">
      <div className="flex-1 flex items-end gap-1 sm:gap-1.5 border-b min-h-[8rem] sm:min-h-[10rem]" style={{ borderColor: 'var(--tm-border)' }} aria-hidden="true">
        {buckets.map(b => {
          const v = valueOf(b);
          return (
            <div key={b.key} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-0.5" title={describe(b)}>
              {v > 0 && <span className="text-[9px] sm:text-[10px] font-semibold text-text-secondary whitespace-nowrap">{format(v)}</span>}
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${(v / max) * 80}%`, minHeight: v > 0 ? 3 : 0, backgroundColor: EVENT_COLOR, opacity: b.isCurrent ? 1 : 0.8 }}
              />
            </div>
          );
        })}
      </div>
      <BucketLabels buckets={buckets} />
    </div>
  );
};

const BucketLabels: React.FC<{ buckets: EventBucket[] }> = ({ buckets }) => (
  <div className="flex gap-1 sm:gap-1.5 pt-1" aria-hidden="true">
    {buckets.map(b => (
      <span
        key={b.key}
        className={`flex-1 min-w-0 text-center text-[9px] sm:text-[11px] leading-none truncate ${b.isCurrent ? 'font-bold' : ''}`}
        style={{ color: b.isCurrent ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}
      >
        {b.label}
      </span>
    ))}
  </div>
);

/**
 * Each column is a day's (week's, month's) work hours, split into the part
 * events took and the free time left; a column of only rest days reads "rest".
 */
const FreeTimeChart: React.FC<{ buckets: EventBucket[]; report: EventReport }> = ({ buckets, report }) => {
  const max = Math.max(...buckets.map(b => b.windowMinutes), 0);
  return (
    <div className="flex-1 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <LegendDot color={EVENT_COLOR} label="Events in work hours" />
        <LegendDot color={FREE_COLOR} label="Free" />
      </div>
      {max === 0 ? (
        <p className="text-xs sm:text-sm text-text-muted italic py-2">No work hours in this period.</p>
      ) : (
        <div role="img" aria-label={`Work hours per column, split into time in events and free time. ${freeTimeSentence(report)}.`} className="flex flex-col">
          <div className="flex items-end gap-1 sm:gap-1.5 border-b h-32 sm:h-40" style={{ borderColor: 'var(--tm-border)' }} aria-hidden="true">
            {buckets.map(b => (
              <div
                key={b.key}
                className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-0.5"
                title={b.windowMinutes > 0
                  ? `${b.longLabel}: ${formatEventMinutes(b.freeMinutes)} free of ${formatEventMinutes(b.windowMinutes)} work hours; events took ${formatEventMinutes(b.eventWindowMinutes)}`
                  : `${b.longLabel}: rest`}
              >
                {b.windowMinutes > 0 ? (
                  <>
                    <span className="text-[9px] sm:text-[10px] font-semibold text-text-secondary whitespace-nowrap">{formatEventMinutes(b.freeMinutes)}</span>
                    <div className="w-full rounded-t-sm overflow-hidden flex flex-col" style={{ height: `${(b.windowMinutes / max) * 80}%` }}>
                      <div style={{ flexGrow: b.eventWindowMinutes, backgroundColor: EVENT_COLOR }} />
                      <div style={{ flexGrow: b.freeMinutes, backgroundColor: FREE_COLOR }} />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] sm:text-[10px] text-text-muted">rest</span>
                    <div className="w-full h-[3px] rounded-t-sm" style={{ backgroundColor: 'var(--tm-border)' }} />
                  </>
                )}
              </div>
            ))}
          </div>
          <BucketLabels buckets={buckets} />
        </div>
      )}
      <p className="text-xs text-text-secondary">
        <span className="font-semibold text-text-primary">{freeTimeSentence(report)}.</span>
        {report.window_minutes > 0 && (
          <>
            {' '}That&apos;s the time left in your daily work windows after events, out of {formatEventMinutes(report.window_minutes)} of work hours.
            Rest days have no work hours.
          </>
        )}
      </p>
    </div>
  );
};

/** "this week", "last month", or "in October 2026". */
const relativeName = (period: ReportPeriod) => {
  const name = describePeriod(period);
  return /^(this|last) /.test(name) ? name : `in ${name}`;
};

const EventsSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 sm:gap-4" aria-hidden="true">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-20 sm:h-24 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
      ))}
    </div>
    <div className="h-64 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
  </div>
);

/**
 * Reports → Events: how many events the period held and how long they took,
 * the busiest day, the time in events by tag and per day (week, month), and
 * the free time left in the work hours after events. Past archived events
 * count, as they did happen; upcoming archived ones don't.
 */
const ReportEventsSection: React.FC<{ period: ReportPeriod }> = ({ period }) => {
  const { report, loading, error, retry } = useEventReport(period);

  if (error) {
    return (
      <div className="card-glass p-4 flex flex-wrap items-center gap-3" role="alert">
        <p className="text-sm text-text-primary flex-1 min-w-0">{error}</p>
        <button type="button" onClick={retry} className="btn btn-secondary py-1.5 px-3">Try again</button>
      </div>
    );
  }
  if (loading || !report) {
    return (
      <>
        <span className="sr-only" role="status">Loading events…</span>
        <EventsSkeleton />
      </>
    );
  }
  if (report.event_count === 0) {
    return (
      <div className="card-glass p-8 flex flex-col items-center text-center gap-2">
        <CalendarClock className="w-8 h-8 text-text-muted" aria-hidden="true" />
        <h3 className="text-base font-semibold text-text-primary">No events {relativeName(period)}</h3>
        <p className="text-sm text-text-muted max-w-sm">
          Events you add on the week calendar show up here: their time by tag and by day, and the free time left in your work hours.
        </p>
        <p className="text-xs text-text-secondary">{freeTimeSentence(report)}.</p>
      </div>
    );
  }

  const buckets = eventBuckets(report, period);
  const byWeekOrMonth = period.kind !== 'week';
  const unit = period.kind === 'year' ? 'month' : 'week';
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <EventTiles report={report} period={period} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <CardShell icon={<Tag className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Time in events by tag">
          <TagBars report={report} />
          <p className="text-[11px] text-text-muted mt-auto">An event with several tags counts in full under each.</p>
        </CardShell>
        <CardShell
          icon={<ChartColumn className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />}
          header={byWeekOrMonth ? `Events per ${unit}` : 'Event time by day'}
        >
          <ColumnChart
            buckets={buckets}
            valueOf={b => (byWeekOrMonth ? b.count : b.minutes)}
            format={v => (byWeekOrMonth ? String(v) : formatEventMinutes(v))}
            describe={b => `${b.longLabel}: ${plural(b.count, 'event')}, ${formatEventMinutes(b.minutes)}`}
            summary={byWeekOrMonth ? `Number of events per ${unit}` : 'Time in events per day'}
          />
        </CardShell>
        <CardShell icon={<Clock className="w-4 h-4" style={{ color: 'var(--tm-success)' }} />} header="Events vs free time">
          <FreeTimeChart buckets={buckets} report={report} />
        </CardShell>
      </div>

      <div className="sr-only">
        <table>
          <caption>Events per {period.kind === 'week' ? 'day' : unit}</caption>
          <thead>
            <tr>
              <th scope="col">{period.kind === 'week' ? 'Day' : period.kind === 'month' ? 'Week' : 'Month'}</th>
              <th scope="col">Events</th>
              <th scope="col">Time in events</th>
              <th scope="col">Free in work hours</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => (
              <tr key={b.key}>
                <th scope="row">{b.longLabel}</th>
                <td>{b.count}</td>
                <td>{formatEventMinutes(b.minutes)}</td>
                <td>{b.windowMinutes > 0 ? `${formatEventMinutes(b.freeMinutes)} of ${formatEventMinutes(b.windowMinutes)}` : 'Rest'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportEventsSection;
