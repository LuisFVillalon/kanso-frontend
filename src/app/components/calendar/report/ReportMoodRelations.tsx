'use client';

import React, { useMemo, useState } from 'react';
import { ChartScatter, ChevronRight } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  analyseCorrelation,
  dailyActivity,
  describeAnswer,
  describeCorrelation,
  EARLY_SIGN_DAYS,
  MAX_P,
  MOOD_METRICS,
  MOOD_QUESTIONS,
  moodActivityPoints,
  splitSides,
  STRONG_MIN_DAYS,
  type CorrelationResult,
  type MoodAnswer,
  type MoodMetric,
  type MoodPoint,
  type ReportPeriod,
} from '@/app/utils/calendarReport';
import { PATTERN_MIN_DAYS } from '@/app/utils/moodReport';
import ReportMoodRelationChart, { dayItems, METRIC_INFO, type RelationView } from './ReportMoodRelationChart';
import { MetricButton } from './ReportActivityChart';
import { ANSWER_COLOR, AnswerIcon, MoodLine, MoodLinePlaceholder } from './ReportMoodAnswer';

interface ReportMoodRelationsProps {
  /** The report's calendar activity. */
  activity: CalendarActivity;
  byDay: Map<string, MoodCheckin>;
  /** A month or year: a week is too short for patterns. */
  period: ReportPeriod;
  /** How the statement names the period: "this month", "in 2025". */
  scopeLabel: string;
  /** A year's "Day by day" view groups days into weeks. */
  byWeek: boolean;
  /** The card beside it, given the Activity / Tags switch for its header. */
  renderTags: (headerAction: React.ReactNode) => React.ReactNode;
}

interface MetricAnalysis {
  points: MoodPoint[];
  result: CorrelationResult;
  answer: MoodAnswer;
}

/**
 * "Mood & your activity" — how mood moved with tasks, note time and habits
 * on days with a check-in, as a question and its answer: a neutral icon (sun,
 * cloud, sun behind a cloud, hourglass), one sentence worded by how sure it
 * is, one short line, and a line from lighter to busier days. The chart, the
 * full statement and how it's worked out wait behind "See details", and a
 * tile per metric gives the same answer for each activity — beside the Tags
 * & moments card. Below the lg breakpoint the two cards take turns behind an Activity /
 * Tags switch, and the tiles are left out on phones and short windows, so
 * Patterns fits one screen.
 * Nothing here says what causes what, or that a higher or lower mood is good
 * or bad.
 */
const ReportMoodRelations: React.FC<ReportMoodRelationsProps> = ({ activity, byDay, period, scopeLabel, byWeek, renderTags }) => {
  const [metric, setMetric] = useState<MoodMetric>('tasks');
  const [view, setView] = useState<RelationView>('scatter');
  const [panel, setPanel] = useState<'activity' | 'tags'>('activity');

  const startStr = toLocalDateStr(period.start);
  const endStr = toLocalDateStr(period.end);
  // `period` is rebuilt every render; its days identify it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => dailyActivity(activity, period.start, period.end), [activity, startStr, endStr]);
  const analyses = useMemo(
    () => Object.fromEntries(MOOD_METRICS.map(m => {
      const points = moodActivityPoints(byDay, days, period.start, period.end, m);
      const result = analyseCorrelation(points);
      return [m, { points, result, answer: describeAnswer(m, result, points.map(p => p.mood)) }];
    })) as Record<MoodMetric, MetricAnalysis>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDay, days, startStr, endStr],
  );

  const { points, result, answer } = analyses[metric];
  const sides = splitSides(metric, result, points.map(p => p.value));
  const items = view === 'days' ? dayItems(byDay, days, period.start, period.end, metric, byWeek) : [];
  const info = METRIC_INFO[metric];
  const panelSwitch = (
    <div className="lg:hidden flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Pattern to show">
      <MetricButton active={panel === 'activity'} onClick={() => setPanel('activity')}>Activity</MetricButton>
      <MetricButton active={panel === 'tags'} onClick={() => setPanel('tags')}><span className="whitespace-nowrap">Tags &amp; moments</span></MetricButton>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      <div className={`lg:col-span-2 min-w-0 ${panel === 'tags' ? 'max-lg:hidden' : ''}`}>
        <CardShell icon={<ChartScatter className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Mood & your activity" headerAction={panelSwitch}>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border self-start" role="group" aria-label="Compare mood with">
            {MOOD_METRICS.map(m => (
              <MetricButton key={m} active={metric === m} onClick={() => setMetric(m)}>{METRIC_INFO[m].button}</MetricButton>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-base sm:text-lg font-bold leading-snug text-text-primary">{MOOD_QUESTIONS[metric]}</h3>
            <p className="flex items-center gap-3">
              <span
                className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full grid place-items-center"
                style={{ backgroundColor: `color-mix(in srgb, ${ANSWER_COLOR[answer.kind]} 15%, transparent)` }}
              >
                <AnswerIcon kind={answer.kind} className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <span className="font-display font-medium text-[22px] sm:text-[28px] leading-tight text-text-primary">{answer.sentence}</span>
            </p>
            <p className="text-sm text-text-secondary">{answer.support}</p>
            {result.level === 'insufficient' && (
              <span
                className="block max-w-72 h-1.5 rounded-full overflow-hidden bg-surface-raised"
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

          {answer.kind === 'wait' ? (
            <MoodLinePlaceholder />
          ) : sides && result.lowAverage != null && result.highAverage != null && (
            <MoodLine kind={answer.kind} sides={sides} lowAverage={result.lowAverage} highAverage={result.highAverage} />
          )}

          <details className="group/details text-xs text-text-secondary">
            <summary className="inline-flex items-center gap-1 text-[13px] font-medium text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/details:rotate-90" aria-hidden="true" />
              See details
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <div className="self-end flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Chart type">
                <MetricButton active={view === 'scatter'} onClick={() => setView('scatter')}>Scatter</MetricButton>
                <MetricButton active={view === 'days'} onClick={() => setView('days')}>Day by day</MetricButton>
              </div>
              <ReportMoodRelationChart metric={metric} view={view} points={points} items={items} byWeek={byWeek} />
              <p className="text-sm text-text-primary leading-relaxed">{describeCorrelation(metric, result, scopeLabel)}</p>
              <p className="text-[11px] text-text-muted">
                Shows what tends to move together — not what causes what. A busy week, sleep or the season can drive both.
              </p>
              <details className="group/how">
                <summary className="inline-flex items-center gap-1 font-medium text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/how:rotate-90" aria-hidden="true" />
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
                    (more than a 1-in-{Math.round(1 / MAX_P)} chance), it reads “about the same” — as it does when days with more{' '}
                    {info.label.toLowerCase()} didn’t really have a different mood in that direction. Otherwise a loose match is “a little”
                    higher or lower, a closer one plainly “higher” or “lower” and a close one “clearly” — but under {EARLY_SIGN_DAYS} days
                    anything is only “maybe”, and under {STRONG_MIN_DAYS} days nothing is called “clearly”.
                  </p>
                </div>
              </details>
            </div>
          </details>

          <div className="hidden sm:grid grid-cols-3 gap-2 [@media(max-height:760px)]:hidden">
            {MOOD_METRICS.map(m => {
              const a = analyses[m].answer;
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={active}
                  className={`text-left rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 border transition-colors ${
                    active ? 'border-transparent bg-accent-subtle' : 'border-border-subtle hover:bg-surface-raised'
                  }`}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{METRIC_INFO[m].button}</span>
                  <span className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold text-text-primary">
                    <AnswerIcon kind={a.kind} className="w-4 h-4 shrink-0" />
                    {a.short}
                  </span>
                </button>
              );
            })}
          </div>
        </CardShell>
      </div>
      <div className={`min-w-0 ${panel === 'activity' ? 'max-lg:hidden' : ''}`}>
        {renderTags(panelSwitch)}
      </div>
    </div>
  );
};

export default ReportMoodRelations;
