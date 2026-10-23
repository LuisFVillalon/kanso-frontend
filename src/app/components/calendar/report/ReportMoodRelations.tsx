'use client';

import React, { useMemo, useState } from 'react';
import { ChartScatter, ChevronRight, Tags } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  analyseCorrelation,
  CORRELATION_LABELS,
  dailyActivity,
  describeCorrelation,
  EARLY_SIGN_DAYS,
  MAX_P,
  MIN_RHO,
  MOOD_METRICS,
  moodActivityPoints,
  STRONG_MIN_DAYS,
  type CorrelationLevel,
  type MoodMetric,
  type ReportPeriod,
} from '@/app/utils/calendarReport';
import { moodByTag, PATTERN_MIN_DAYS, TAG_MIN_DAYS } from '@/app/utils/moodReport';
import ReportMoodRelationChart, { dayItems, METRIC_INFO, type RelationView } from './ReportMoodRelationChart';
import { MetricButton } from './ReportActivityChart';

const METER_BARS: Record<CorrelationLevel, number> = {
  insufficient: 0, flat: 0, none: 0, early: 1, slight: 1, moderate: 2, strong: 3,
};

/** Three rising bars, lit by how strong the link is. The level's text label carries the meaning. */
const StrengthMeter: React.FC<{ level: CorrelationLevel }> = ({ level }) => (
  <span className="inline-flex items-end gap-0.5 shrink-0" aria-hidden="true">
    {[6, 9, 12].map((h, i) => (
      <span
        key={h}
        className="w-1 rounded-sm"
        style={{ height: h, backgroundColor: i < METER_BARS[level] ? 'var(--tm-accent)' : 'var(--tm-border)' }}
      />
    ))}
  </span>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-surface text-text-secondary">
    {children}
  </span>
);

const TagsCard: React.FC<{ byDay: Map<string, MoodCheckin>; period: ReportPeriod; average: number }> = ({ byDay, period, average }) => {
  const rows = moodByTag(byDay, period.start, period.end);
  const markerLeft = `${((average - 1) / 4) * 100}%`;
  return (
    <CardShell icon={<Tags className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />} header="Tags & mood">
      {rows.length === 0 ? (
        <p className="text-xs sm:text-sm text-text-muted italic py-2">
          Tag your check-ins and the tags you use on at least {TAG_MIN_DAYS} days show up here with your average mood on those days.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map(row => (
              <li key={row.tag} className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-text-secondary truncate w-24 shrink-0" title={row.tag}>{row.tag}</span>
                <span className="flex-1 h-2 rounded-full relative bg-surface-raised" aria-hidden="true">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(((row.average - 1) / 4) * 100, 4)}%`, backgroundColor: moodColor(Math.round(row.average)) }}
                  />
                  <span className="absolute -top-1 w-px h-4 bg-pencil" style={{ left: markerLeft }} />
                </span>
                <span className="text-xs font-semibold text-text-primary w-8 text-right">
                  <span className="sr-only">average mood </span>{row.average.toFixed(1)}
                </span>
                <span className="text-[11px] text-text-muted w-12 text-right whitespace-nowrap">
                  {row.days} {row.days === 1 ? 'day' : 'days'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-muted mt-auto">
            Average mood on days with each tag; the line marks your overall {average.toFixed(1)}. Tags on fewer than {TAG_MIN_DAYS} days are hidden.
          </p>
        </>
      )}
    </CardShell>
  );
};

interface ReportMoodRelationsProps {
  /** The report's calendar activity. */
  activity: CalendarActivity;
  byDay: Map<string, MoodCheckin>;
  /** A month or year: a week is too short for patterns. */
  period: ReportPeriod;
  /** How the statement names the period: "this month", "in 2025". */
  scopeLabel: string;
  /** Average mood over the period. */
  average: number;
  /** A year's "Day by day" view groups days into weeks. */
  byWeek: boolean;
}

/**
 * "Mood & your activity" — how mood moved with tasks, note time and habits
 * on days with a check-in, as a chart, a plain-language statement capped by
 * sample size, and a mini card per metric — beside "Tags & mood". Nothing
 * here says what causes what.
 */
const ReportMoodRelations: React.FC<ReportMoodRelationsProps> = ({ activity, byDay, period, scopeLabel, average, byWeek }) => {
  const [metric, setMetric] = useState<MoodMetric>('tasks');
  const [view, setView] = useState<RelationView>('scatter');

  const startStr = toLocalDateStr(period.start);
  const endStr = toLocalDateStr(period.end);
  // `period` is rebuilt every render; its days identify it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => dailyActivity(activity, period.start, period.end), [activity, startStr, endStr]);
  const results = useMemo(
    () => Object.fromEntries(MOOD_METRICS.map(m => [m, analyseCorrelation(moodActivityPoints(byDay, days, period.start, period.end, m))])) as Record<MoodMetric, ReturnType<typeof analyseCorrelation>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDay, days, startStr, endStr],
  );

  const result = results[metric];
  const points = moodActivityPoints(byDay, days, period.start, period.end, metric);
  const items = view === 'days' ? dayItems(byDay, days, period.start, period.end, metric, byWeek) : [];
  const info = METRIC_INFO[metric];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      <div className="lg:col-span-2 min-w-0">
        <CardShell icon={<ChartScatter className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Mood & your activity">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Compare mood with">
              {MOOD_METRICS.map(m => (
                <MetricButton key={m} active={metric === m} onClick={() => setMetric(m)}>{METRIC_INFO[m].button}</MetricButton>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Chart type">
              <MetricButton active={view === 'scatter'} onClick={() => setView('scatter')}>Scatter</MetricButton>
              <MetricButton active={view === 'days'} onClick={() => setView('days')}>Day by day</MetricButton>
            </div>
          </div>

          <ReportMoodRelationChart metric={metric} view={view} points={points} items={items} byWeek={byWeek} />

          <div className="rounded-lg p-3 flex flex-col gap-2 bg-surface-raised">
            <div className="flex flex-wrap items-center gap-2">
              <StrengthMeter level={result.level} />
              <span className="text-sm font-semibold text-text-primary">{CORRELATION_LABELS[result.level]}</span>
              <Chip>{result.n} {result.n === 1 ? 'day' : 'days'} with a check-in</Chip>
              {result.level === 'insufficient' && (
                <span
                  className="flex-1 min-w-24 h-1.5 rounded-full overflow-hidden bg-surface"
                  role="progressbar"
                  aria-label="Days with a check-in so far"
                  aria-valuemin={0}
                  aria-valuemax={PATTERN_MIN_DAYS}
                  aria-valuenow={result.n}
                >
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(result.n / PATTERN_MIN_DAYS) * 100}%` }} />
                </span>
              )}
            </div>
            <p className="text-sm text-text-primary leading-relaxed">{describeCorrelation(metric, result, scopeLabel)}</p>
            <p className="text-[11px] text-text-muted">
              Shows what tends to move together — not what causes what. A busy week, sleep or the season can drive both.
            </p>
            <details className="group text-xs text-text-secondary">
              <summary className="inline-flex items-center gap-1 font-medium text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
                How this is worked out
              </summary>
              <div className="mt-2 pl-4 flex flex-col gap-1 leading-relaxed">
                <p>
                  Each day with a daily check-in is one data point: its mood (1–5) and that day’s {info.label.toLowerCase()}.
                  Days without a check-in are left out. Both are ranked, and the ranks are compared to see how often they rise
                  and fall together (Spearman’s rank correlation{result.rho != null ? `, ρ = ${result.rho.toFixed(2)}` : ''}).
                </p>
                <p>
                  Under {PATTERN_MIN_DAYS} days nothing is said. Weak or likely-chance results (ρ under {MIN_RHO}, or more than a
                  1-in-{Math.round(1 / MAX_P)} chance of turning up in random data) read as “no clear link”, as do results where
                  days with more {info.label.toLowerCase()} didn’t actually average a different mood in that direction. Otherwise under 0.3 is
                  “slight”, under 0.5 “moderate” and above that “strong” — but under {EARLY_SIGN_DAYS} days anything is only an
                  “early sign”, and under {STRONG_MIN_DAYS} days nothing is called “strong”.
                </p>
              </div>
            </details>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MOOD_METRICS.map(m => {
              const r = results[m];
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={active}
                  className={`text-left rounded-lg px-3 py-2 border transition-colors ${
                    active ? 'border-transparent bg-accent-subtle' : 'border-border-subtle hover:bg-surface-raised'
                  }`}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{METRIC_INFO[m].label}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-text-primary">
                    <StrengthMeter level={r.level} />
                    {CORRELATION_LABELS[r.level]}
                    {r.rho != null && METER_BARS[r.level] > 0 && (
                      <span className="text-xs font-normal text-text-muted">{r.rho > 0 ? '↑ together' : '↓ opposite'}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </CardShell>
      </div>
      <TagsCard byDay={byDay} period={period} average={average} />
    </div>
  );
};

export default ReportMoodRelations;
