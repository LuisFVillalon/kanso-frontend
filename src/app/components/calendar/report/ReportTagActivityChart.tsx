'use client';

import React, { useMemo, useState } from 'react';
import type { CalendarActivity } from '@/app/types/activity';
import type { ReportBucket, ReportPeriod } from '@/app/utils/calendarReport';
import { formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';
import { buildTagSeries, UNTAGGED_KEY, type TagItemKind, type TagRow } from '@/app/utils/tagReport';
import { axisTicks } from './ReportActivityChart';
import { rowColor } from './ReportTagBreakdown';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const trim = (n: number) => Math.round(n * 10) / 10;

interface KindCopy {
  /** The y axis's title. */
  axis: string;
  empty: string;
  /** "Each bar is …" — what a bar adds up. */
  bar: (unit: string) => string;
  /** How an item with several tags counts. */
  split: string;
  amount: (value: number) => string;
}

const COPY: Record<TagItemKind, KindCopy> = {
  task: {
    axis: 'Tasks completed',
    empty: 'No tasks completed in this period',
    bar: unit => `Each bar is the tasks you checked off that ${unit}, colored by their tags. Only tasks count here; habits and notes have their own tabs.`,
    split: 'A task with several tags is split evenly between them, as in the Time tab.',
    amount: v => plural(trim(v), 'task'),
  },
  note: {
    axis: 'Time in notes',
    empty: 'No time in notes in this period',
    bar: unit => `Each bar is the time you spent editing notes that ${unit}, colored by the notes’ tags.`,
    split: 'A note with several tags has its time split evenly between them, as in the Time tab.',
    amount: v => (v > 0 ? formatDurationShort(v) : '0m'),
  },
  habit: {
    axis: 'Habit check-ins',
    empty: 'No habit check-ins in this period',
    bar: unit => `Each bar is your habit check-ins that ${unit}, colored by the habits’ tags.`,
    split: 'A habit with several tags has each check-in split evenly between them, as in the Time tab.',
    amount: v => plural(trim(v), 'check-in'),
  },
};

// A month has up to 31 bars; labelling every one crowds a phone screen, so
// only the 1st and every 5th day get a label.
const showLabel = (kind: ReportPeriod['kind'], index: number) =>
  kind !== 'month' || index === 0 || (index + 1) % 5 === 0;

const formatTick = (value: number, itemKind: TagItemKind) => {
  if (itemKind !== 'note' || value === 0) return String(value);
  return value < 3600 ? `${value / 60}m` : `${Math.round((value / 3600) * 10) / 10}h`;
};

interface ReportTagActivityChartProps {
  period: ReportPeriod;
  buckets: ReportBucket[];
  activity: CalendarActivity;
  itemKind: TagItemKind;
}

/**
 * The Tasks, Notes and Habits tabs' chart: that one kind per day (per month
 * for a year) — tasks completed, time in notes or habit check-ins — with
 * each bar split by the items' tags in their own colors and Untagged in
 * grey. Tapping a tag in the legend highlights its part of every bar.
 */
const ReportTagActivityChart: React.FC<ReportTagActivityChartProps> = ({ period, buckets, activity, itemKind }) => {
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;
  const series = useMemo(
    () => buildTagSeries(activity, period.start, period.end, itemKind, period.kind === 'year'),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, periodKey, itemKind],
  );
  const [picked, setPicked] = useState<{ periodKey: string; key: string } | null>(null);
  const selected = picked?.periodKey === periodKey ? series.rows.find(r => r.key === picked.key) ?? null : null;

  const copy = COPY[itemKind];
  const unit = period.kind === 'year' ? 'month' : 'day';
  const totalOf = (b: ReportBucket) => [...(series.byBucket.get(b.key)?.values() ?? [])].reduce((sum, v) => sum + v, 0);
  const valueIn = (b: ReportBucket, row: TagRow) => series.byBucket.get(b.key)?.get(row.key) ?? 0;
  const rowTotal = (row: TagRow) => buckets.reduce((sum, b) => sum + valueIn(b, row), 0);
  const max = Math.max(...buckets.map(totalOf), 0);
  const grand = buckets.reduce((sum, b) => sum + totalOf(b), 0);
  const ticks = axisTicks(max, itemKind === 'note' ? 'notes' : 'completions');
  const scaleTop = ticks[ticks.length - 1];
  const summary = `${copy.axis} per ${unit}, by tag`;

  const describeBucket = (b: ReportBucket) => {
    const parts = series.rows.filter(r => valueIn(b, r) > 0).map(r => `${r.name} ${copy.amount(valueIn(b, r))}`);
    return `${b.longLabel}: ${copy.amount(totalOf(b))}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  };

  if (max === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center rounded-lg" style={{ minHeight: '9rem', backgroundColor: 'var(--tm-surface-raised)' }}>
        <p className="text-xs sm:text-sm text-text-muted italic">{copy.empty}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags">
        {series.rows.map(row => {
          const isSelected = selected?.key === row.key;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => setPicked(p => (p?.periodKey === periodKey && p.key === row.key ? null : { periodKey, key: row.key }))}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs transition-colors ${
                isSelected ? 'border-border-strong bg-surface-raised text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              style={{ opacity: selected && !isSelected ? 0.55 : 1 }}
            >
              <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: rowColor(row) }} aria-hidden="true" />
              <span className={row.key === UNTAGGED_KEY ? 'italic' : ''}>{row.name}</span>
              <span className="font-semibold text-text-primary">{copy.amount(rowTotal(row))}</span>
            </button>
          );
        })}
      </div>

      <div role="img" aria-label={summary} className="flex-1 flex flex-col">
        <p className="m-0 mb-1 text-[10px] sm:text-[11px] text-text-muted" aria-hidden="true">{copy.axis}</p>
        <div className="flex-1 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(6rem,1fr)_auto_auto] sm:grid-rows-[minmax(9rem,1fr)_auto_auto] gap-x-1.5">
          <div className="relative w-7 sm:w-8" aria-hidden="true">
            {ticks.map(t => (
              <span
                key={t}
                className="absolute right-0 text-[10px] sm:text-[11px] leading-none text-text-muted tabular-nums whitespace-nowrap"
                style={{ bottom: `${(t / scaleTop) * 100}%`, transform: 'translateY(50%)' }}
              >
                {formatTick(t, itemKind)}
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
              <div
                key={b.key}
                className="relative flex-1 min-w-0 h-full flex flex-col justify-end rounded-t-sm"
                title={describeBucket(b)}
              >
                {/* The largest tag sits at the bottom of every bar. */}
                <div
                  className="flex flex-col-reverse overflow-hidden rounded-t-sm"
                  style={{ height: `${(totalOf(b) / scaleTop) * 100}%`, transition: 'height var(--tm-dur-slow) var(--tm-ease)' }}
                >
                  {series.rows.map(row => {
                    const value = valueIn(b, row);
                    if (value <= 0) return null;
                    return (
                      <div
                        key={row.key}
                        data-tag={row.key}
                        style={{
                          flexGrow: value,
                          backgroundColor: rowColor(row),
                          opacity: selected && selected.key !== row.key ? 0.2 : 1,
                          transition: 'opacity var(--tm-dur-fast) var(--tm-ease)',
                        }}
                      />
                    );
                  })}
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
          <p className="col-start-2 m-0 pt-1 text-center text-[10px] sm:text-[11px] text-text-muted" aria-hidden="true">
            {period.kind === 'year' ? 'Month' : 'Day'}
          </p>
        </div>
      </div>

      {selected && (
        <p className="m-0 text-xs sm:text-sm text-text-primary" aria-live="polite">
          <span className="font-semibold">{selected.name}</span>: {copy.amount(rowTotal(selected))}
          {grand > 0 && ` · ${Math.round((rowTotal(selected) / grand) * 100)}% of the total`}
        </p>
      )}
      <p className="m-0 text-[11px] sm:text-xs text-text-muted">
        {copy.bar(unit)} Tap a tag to highlight it. {copy.split}
      </p>

      {/* sr-only on the table itself doesn't shrink it — tables size to their content. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{period.kind === 'year' ? 'Month' : 'Day'}</th>
              {series.rows.map(row => <th key={row.key} scope="col">{row.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {buckets.filter(b => !b.isFuture).map(b => (
              <tr key={b.key}>
                <th scope="row">{b.longLabel}</th>
                {series.rows.map(row => <td key={row.key}>{copy.amount(valueIn(b, row))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportTagActivityChart;
