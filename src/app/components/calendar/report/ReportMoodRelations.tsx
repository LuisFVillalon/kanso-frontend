'use client';

import React, { useMemo, useState } from 'react';
import { ChartScatter, ChevronRight, Tags } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
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
  MOOD_METRICS,
  moodActivityPoints,
  STRONG_MIN_DAYS,
  type CorrelationLevel,
  type MoodMetric,
  type ReportPeriod,
} from '@/app/utils/calendarReport';
import { moodByTag, PATTERN_MIN_DAYS, TAG_MIN_DAYS } from '@/app/utils/moodReport';
import { moodLabel } from '@/app/types/mood';
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

/** How far from "your usual" a bar reaches its end: a mood point and a half. */
const TAG_DELTA_SPAN = 1.5;

/** "+0.7", "−0.4" (a real minus) or "±0.0". */
const signedDelta = (d: number) => `${d >= 0.05 ? '+' : d <= -0.05 ? '−' : '±'}${Math.abs(d).toFixed(1)}`;

/** A mood average as shown: to one decimal. */
const toTenth = (n: number) => Math.round(n * 10) / 10;

/** The row in plain words, for hover, the tap caption and screen readers. */
export const describeTagMood = (tag: string, days: number, tagAverage: number, usualAverage: number) => {
  const average = toTenth(tagAverage);
  const usual = toTenth(usualAverage);
  const d = average - usual;
  const cmp = Math.abs(d) < 0.05 ? 'the same as' : `${Math.abs(d).toFixed(1)} ${d > 0 ? 'higher' : 'lower'} than`;
  return `On the ${days} ${days === 1 ? 'day' : 'days'} you tagged “${tag}”, your mood averaged ${average.toFixed(1)} (${moodLabel(Math.round(average))}) — ${cmp} your usual ${usual.toFixed(1)}.`;
};

/**
 * "Tags & mood", as days with each tag compared with your usual: a bar from
 * a labeled center (your average mood over the period) toward lower or
 * higher mood, the tag's own mood as a face, and the signed difference.
 */
const TagsCard: React.FC<{ byDay: Map<string, MoodCheckin>; period: ReportPeriod; average: number; logged: number; scopeLabel: string; headerAction: React.ReactNode }> = ({
  byDay, period, average, logged, scopeLabel, headerAction,
}) => {
  const rows = moodByTag(byDay, period.start, period.end);
  const usual = toTenth(average);
  const [openTag, setOpenTag] = useState<string | null>(null);
  return (
    <CardShell icon={<Tags className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />} header="Tags & mood" headerAction={headerAction}>
      {rows.length === 0 ? (
        <p className="text-xs sm:text-sm text-text-muted italic py-2">
          Tag your check-ins and the tags you use on at least {TAG_MIN_DAYS} days show up here, compared with your usual mood.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 text-[11px] text-text-muted" aria-hidden="true">
            <span className="text-right">◀ lower mood</span>
            <span className="px-2 py-0.5 rounded-full bg-surface-raised font-semibold text-text-primary whitespace-nowrap">
              your usual {usual.toFixed(1)} · {moodLabel(Math.round(usual))}
            </span>
            <span>higher mood ▶</span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {rows.map(row => {
              const tagAverage = toTenth(row.average);
              const d = tagAverage - usual;
              const half = Math.min(Math.abs(d) / TAG_DELTA_SPAN, 1) * 50;
              const mood = Math.round(tagAverage);
              const sentence = describeTagMood(row.tag, row.days, row.average, average);
              const open = openTag === row.tag;
              return (
                <li key={row.tag}>
                  <button
                    type="button"
                    onClick={() => setOpenTag(t => (t === row.tag ? null : row.tag))}
                    aria-expanded={open}
                    title={sentence}
                    className="w-full flex items-center gap-2 text-left rounded-md px-1 py-0.5 hover:bg-surface-raised"
                  >
                    <span className="sr-only">{sentence}</span>
                    <span className="w-24 shrink-0 min-w-0" aria-hidden="true">
                      <span className="block text-xs sm:text-sm text-text-primary truncate">{row.tag}</span>
                      <span className="block text-[11px] text-text-muted">{row.days} {row.days === 1 ? 'day' : 'days'}</span>
                    </span>
                    <span className="flex-1 h-4 relative" aria-hidden="true">
                      <span className="absolute inset-x-0 top-[7px] h-0.5 rounded-full bg-surface-raised" />
                      <span
                        className="absolute top-[3px] h-2.5 rounded-sm"
                        style={{ left: `${d >= 0 ? 50 : 50 - half}%`, width: `${Math.max(half, 1.5)}%`, backgroundColor: moodColor(mood) }}
                      />
                      <span className="absolute left-1/2 -ml-px -top-0.5 -bottom-0.5 w-0.5 rounded-sm bg-text-primary opacity-55" />
                    </span>
                    <span className="w-16 shrink-0 inline-flex items-center justify-end gap-1 text-xs font-semibold text-text-primary whitespace-nowrap" aria-hidden="true">
                      <span className="w-4 h-4 shrink-0" style={{ color: moodColor(mood) }}>
                        <MoodFace mood={mood} filled className="w-full h-full" />
                      </span>
                      {signedDelta(d)}
                    </span>
                  </button>
                  {open && <p className="mt-1 text-[11px] text-text-secondary leading-relaxed" aria-hidden="true">{sentence}</p>}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-text-muted mt-auto">
            Your usual is your typical mood across all {logged} {logged === 1 ? 'check-in' : 'check-ins'} {scopeLabel}. Each bar is how days with that tag compared. Tags on fewer than {TAG_MIN_DAYS} days are hidden.
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
  /** Daily check-ins behind that average. */
  logged: number;
  /** A year's "Day by day" view groups days into weeks. */
  byWeek: boolean;
}

/**
 * "Mood & your activity" — how mood moved with tasks, note time and habits
 * on days with a check-in, as a chart, a plain-language statement capped by
 * sample size, and a mini card per metric — beside "Tags & mood". Below the
 * lg breakpoint the two cards take turns behind an Activity / Tags switch,
 * and the mini cards are left out on phones, so Patterns fits one screen.
 * Nothing here says what causes what.
 */
const ReportMoodRelations: React.FC<ReportMoodRelationsProps> = ({ activity, byDay, period, scopeLabel, average, logged, byWeek }) => {
  const [metric, setMetric] = useState<MoodMetric>('tasks');
  const [view, setView] = useState<RelationView>('scatter');
  const [panel, setPanel] = useState<'activity' | 'tags'>('activity');

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
  const panelSwitch = (
    <div className="lg:hidden flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Pattern to show">
      <MetricButton active={panel === 'activity'} onClick={() => setPanel('activity')}>Activity</MetricButton>
      <MetricButton active={panel === 'tags'} onClick={() => setPanel('tags')}>Tags</MetricButton>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      <div className={`lg:col-span-2 min-w-0 ${panel === 'tags' ? 'max-lg:hidden' : ''}`}>
        <CardShell icon={<ChartScatter className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Mood & your activity" headerAction={panelSwitch}>
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
                  Days without a check-in are left out. Your days are put in order twice — from lowest to highest mood, and from
                  least to most {info.label.toLowerCase()} — and the two orders are compared: the more they match, the stronger the link.
                </p>
                <p>
                  Under {PATTERN_MIN_DAYS} days nothing is said. If the orders barely match, or the match could easily be luck
                  (more than a 1-in-{Math.round(1 / MAX_P)} chance), it reads “no clear link” — as it does when days with more{' '}
                  {info.label.toLowerCase()} didn’t really have a different mood in that direction. Otherwise a loose match is “slight”, a
                  closer one “moderate” and a close one “strong” — but under {EARLY_SIGN_DAYS} days anything is only an
                  “early sign”, and under {STRONG_MIN_DAYS} days nothing is called “strong”.
                </p>
              </div>
            </details>
          </div>

          <div className="hidden sm:grid grid-cols-3 gap-2">
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
      <div className={`min-w-0 ${panel === 'activity' ? 'max-lg:hidden' : ''}`}>
        <TagsCard byDay={byDay} period={period} average={average} logged={logged} scopeLabel={scopeLabel} headerAction={panelSwitch} />
      </div>
    </div>
  );
};

export default ReportMoodRelations;
