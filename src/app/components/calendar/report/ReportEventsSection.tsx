'use client';

import React, { useMemo, useState } from 'react';
import { ChartColumn, ListChecks, Repeat, Target, Trophy } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import type { CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import type { ReportBucket, ReportPeriod } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import { addsHours, formatEventMinutes } from '@/app/utils/eventOccurrences';
import { bucketInWindow, bucketTotal, buildEventTimeSeries, type EventTimeSeries } from '@/app/utils/eventTime';
import { rowHasTags, type ReportTag, type TagRow } from '@/app/utils/tagReport';
import { EmptyLine, plural, ProgressRow, TagFilterLabel } from './ReportParts';
import ReportEventsChart, { IN_COLOR, useEventSelection, useNowMinute } from './ReportEventsChart';

const fmt = formatEventMinutes;
const OUT_COLOR = 'color-mix(in srgb, var(--tm-week-note) 45%, transparent)';

/** Rows the Top events card shows before "Show all". */
export const TOP_EVENTS = 8;
/** All-day and 24h+ titles named in the footer before "and n more". */
const NOT_COUNTED_SHOWN = 4;

// ── Work hours ──────────────────────────────────────────────────────────────

const WorkHoursCard: React.FC<{ series: EventTimeSeries; current: boolean }> = ({ series, current }) => {
  let window = 0;
  let inWindow = 0;
  let total = 0;
  let freeAhead = 0;
  for (const b of series.buckets.values()) {
    window += b.windowMinutes;
    inWindow += bucketInWindow(b);
    total += bucketTotal(b);
    freeAhead += Math.max(b.upcomingWindowMinutes - b.inWindow.upcoming, 0);
  }
  const outside = Math.max(total - inWindow, 0);
  const free = Math.max(window - inWindow, 0);
  return (
    <CardShell icon={<Target className="w-4 h-4" style={{ color: 'var(--tm-success)' }} />} header="Work hours">
      {window === 0 ? (
        <EmptyLine>No work hours in this period</EmptyLine>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <ProgressRow label="Booked by events" detail={`${fmt(inWindow)} of ${fmt(window)}`} share={inWindow / window} color={IN_COLOR} />
            <ProgressRow label="Free for focus" detail={`${fmt(free)} · ${Math.round((free / window) * 100)}%`} share={free / window} color="var(--tm-success)" />
            <ProgressRow label="Outside work hours" detail={fmt(outside)} share={total > 0 ? outside / total : 0} color={OUT_COLOR} />
          </div>
          {current && (
            <p className="text-[11px] text-text-muted mt-auto">{fmt(freeAhead)} of work hours still free from now</p>
          )}
        </>
      )}
    </CardShell>
  );
};

// ── Busiest days ────────────────────────────────────────────────────────────

const BUSIEST_DAYS = 3;

/** The period's top days by time in events, scheduled ones included; a year still ranks single days. */
const BusiestEventDays: React.FC<{ byDay: EventTimeSeries }> = ({ byDay }) => {
  const today = toLocalDateStr(new Date());
  const days = [...byDay.buckets.values()]
    .filter(b => bucketTotal(b) > 0)
    .sort((a, b) => bucketTotal(b) - bucketTotal(a) || a.key.localeCompare(b.key))
    .slice(0, BUSIEST_DAYS);
  if (days.length === 0) return <EmptyLine>No event time in this period.</EmptyLine>;
  return (
    <ol className="flex flex-col gap-2">
      {days.map((d, i) => {
        const total = bucketTotal(d);
        const hours = d.windowMinutes > 0 ? `${Math.round((bucketInWindow(d) / d.windowMinutes) * 100)}% of work hours` : 'rest day';
        return (
          <li key={d.key} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={i === 0 ? { backgroundColor: IN_COLOR, color: 'var(--tm-surface)' } : { backgroundColor: 'var(--tm-surface)', color: 'var(--tm-text-secondary)' }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex flex-col">
              <span className="text-sm font-semibold text-text-primary">
                {parseLocalDate(d.key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {d.key > today && <span className="ml-1.5 text-xs font-normal italic text-text-muted">scheduled</span>}
              </span>
              <span className="text-xs text-text-secondary truncate">{fmt(total)} · {plural(d.eventCount, 'event')} · {hours}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

// ── Top events by time ──────────────────────────────────────────────────────

export interface EventSeriesRow {
  key: string;
  title: string;
  tags: ReportTag[];
  repeating: boolean;
  google: boolean;
  /** Each occurrence's own length clipped to the period, added up, in minutes. */
  total: number;
  count: number;
}

/**
 * The series an occurrence belongs to: a kanso event by its id; a repeating
 * Google event by title and tags, since each instance carries its own id; a
 * one-off on its own.
 */
const seriesKey = (o: EventOccurrence) =>
  o.source === 'google' && o.repeating
    ? `g:${o.title}|${o.tags.map(t => t.id).sort((a, b) => a - b).join(',')}`
    : `e:${o.event_id}`;

export interface TopEventsData {
  /** Busy timed events under 24 hours, most time first. */
  rows: EventSeriesRow[];
  /** All-day and 24h+ events in the period: on the calendar but adding no hours. */
  notCounted: EventSeriesRow[];
}

/** The period's events grouped into series, each with its own full time (overlaps aren't split here). */
export const collectTopEvents = (activity: CalendarActivity, start: Date, end: Date): TopEventsData => {
  const rangeStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const rangeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  const timed = new Map<string, EventSeriesRow>();
  const other = new Map<string, EventSeriesRow>();
  for (const o of activity.events ?? []) {
    if (o.busy === false) continue;
    const s = Math.max(new Date(o.starts_at).getTime(), rangeStart);
    const e = Math.min(new Date(o.ends_at).getTime(), rangeEnd);
    const counts = addsHours(o);
    // An all-day event ends at a midnight, so one ending on the range's first one is outside it.
    if (e <= s) continue;
    const map = counts ? timed : other;
    const key = seriesKey(o);
    let row = map.get(key);
    if (!row) {
      row = {
        key, title: o.title, tags: o.tags,
        repeating: o.source === 'google' ? !!o.repeating : (o.repeat_days?.length ?? 0) > 0,
        google: o.source === 'google',
        total: 0, count: 0,
      };
      map.set(key, row);
    }
    if (counts) row.total += (e - s) / 60000;
    row.count++;
  }
  const rows = [...timed.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  return { rows, notCounted: [...other.values()] };
};

const swatchOf = (tags: ReportTag[]) => tags[0]?.color || 'var(--tm-border-strong)';

const GoogleBadge: React.FC = () => (
  <span
    className="text-[10px] font-bold leading-none px-1 py-0.5 rounded-[4px] text-text-muted flex-shrink-0"
    style={{ border: '1px solid var(--tm-border-strong)' }}
    title="From Google Calendar"
  >
    <span aria-hidden="true">G</span>
    <span className="sr-only">From Google Calendar</span>
  </span>
);

const TopEventRow: React.FC<{ row: EventSeriesRow; largest: number }> = ({ row, largest }) => (
  <li className="flex items-center gap-2">
    <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: swatchOf(row.tags) }} aria-hidden="true" />
    <span className="flex items-center gap-1 min-w-0 w-28 sm:w-48 flex-shrink-0">
      <span className="text-xs sm:text-sm text-text-primary truncate" title={row.title}>{row.title}</span>
      {row.repeating && (
        <span className="flex-shrink-0 text-text-muted" title="Repeats">
          <Repeat className="w-3 h-3" aria-hidden="true" />
          <span className="sr-only">Repeats</span>
        </span>
      )}
      {row.google && <GoogleBadge />}
    </span>
    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }} aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${Math.max((row.total / largest) * 100, 6)}%`, backgroundColor: swatchOf(row.tags) }} />
    </div>
    <span className="text-xs sm:text-sm whitespace-nowrap text-right">
      <span className="font-semibold text-text-primary">{fmt(row.total)}</span>
      <span className="text-text-muted">
        {` · ${row.count}×`}
        <span className="hidden sm:inline">{` · ${fmt(row.total / row.count)} each`}</span>
      </span>
    </span>
  </li>
);

const TopEvents: React.FC<{ data: TopEventsData; tag: TagRow | null; periodKey: string }> = ({ data, tag, periodKey }) => {
  // "Show all" only holds for the period it was pressed in.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === periodKey;
  const rows = tag ? data.rows.filter(r => rowHasTags(tag, r.tags)) : data.rows;
  const notCounted = [...new Set((tag ? data.notCounted.filter(r => rowHasTags(tag, r.tags)) : data.notCounted).map(r => r.title))];
  if (rows.length === 0 && notCounted.length === 0) return <EmptyLine>No events in this period.</EmptyLine>;
  const shown = expanded ? rows : rows.slice(0, TOP_EVENTS);
  const named = notCounted.slice(0, NOT_COUNTED_SHOWN).join(', ');
  const more = notCounted.length - NOT_COUNTED_SHOWN;
  return (
    <>
      {rows.length === 0 ? (
        <EmptyLine>No event time in this period.</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(row => <TopEventRow key={row.key} row={row} largest={rows[0].total} />)}
        </ul>
      )}
      {rows.length > TOP_EVENTS && (
        <button
          type="button"
          onClick={() => setExpandedFor(expanded ? null : periodKey)}
          className="self-start text-xs font-semibold text-accent hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      {notCounted.length > 0 && (
        <p className="text-[11px] text-text-muted">
          Not counted in hours: {named}{more > 0 ? ` and ${more} more` : ''} (all-day or 24h+).
        </p>
      )}
    </>
  );
};

// ── The view ────────────────────────────────────────────────────────────────

interface EventsReportProps {
  period: ReportPeriod;
  buckets: ReportBucket[];
  activity: CalendarActivity;
  workDays: WorkDaySettings;
  /** Whether the period holds today, for the time still free from now. */
  current: boolean;
  byUnit: string;
}

/**
 * The Productivity › Events view, built like Tasks: time in events by day
 * (by month for a year) with a tag picker, the period's work hours and
 * busiest days beside it, and the events that took the most time below. A
 * tag picked in the chart narrows the list to it.
 */
const EventsReport: React.FC<EventsReportProps> = ({ period, buckets, activity, workDays, current, byUnit }) => {
  const selection = useEventSelection(period, activity, workDays);
  const { selected, series } = selection;
  const isYear = period.kind === 'year';
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;
  const nowMinute = useNowMinute();
  // A year's chart is by month, but its busiest days are still single days.
  const yearByDay = useMemo(
    () => (isYear ? buildEventTimeSeries(activity, period.start, period.end, workDays, false, new Date(nowMinute * 60000)) : null),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isYear, activity, periodKey, workDays, nowMinute],
  );
  const byDay = yearByDay ?? series;
  const top = useMemo(
    () => collectTopEvents(activity, period.start, period.end),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, periodKey],
  );
  const occurrences = top.rows.reduce((sum, r) => sum + r.count, 0) + top.notCounted.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      <div className="lg:col-span-2">
        <CardShell icon={<ChartColumn className="w-4 h-4" style={{ color: IN_COLOR }} />} header={`Time in events ${byUnit}`}>
          <ReportEventsChart period={period} buckets={buckets} selection={selection} />
        </CardShell>
      </div>
      <div className="flex flex-col gap-3 sm:gap-4">
        <WorkHoursCard series={series} current={current} />
        <CardShell icon={<Trophy className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />} header="Busiest days">
          <BusiestEventDays byDay={byDay} />
        </CardShell>
      </div>
      <div className="lg:col-span-3">
        <CardShell
          icon={<ListChecks className="w-4 h-4" style={{ color: IN_COLOR }} />}
          header="Top events by time"
          headerAction={selected ? <TagFilterLabel tag={selected} /> : occurrences > 0 && <span className="text-xs text-text-muted">{plural(occurrences, 'event')}</span>}
        >
          <TopEvents data={top} tag={selected} periodKey={periodKey} />
        </CardShell>
      </div>
    </div>
  );
};

export default EventsReport;
