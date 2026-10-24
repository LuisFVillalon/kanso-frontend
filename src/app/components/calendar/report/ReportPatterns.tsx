'use client';

import React, { useMemo, useState } from 'react';
import { ChartScatter, ChevronRight, ListChecks, Sparkles, Tag, Tags } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { dailyActivity, MOOD_METRICS, type MoodMetric, type ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  activityQuestion,
  analysePatterns,
  CLEAR_GAP,
  describePattern,
  METRIC_NAME,
  patternDays,
  patternFindings,
  patternNumbers,
  patternsRest,
  patternSupport,
  PLAIN_GAP,
  SURE_SIDE,
  tagsQuestion,
  type PatternFinding,
  type PatternsAnalysis,
} from '@/app/utils/patterns';
import { CHANCE_LEVEL, FEELING_NAME, FEELINGS, MAX_CHART_TAGS, MIN_GAP, TAG_MIN_SIDE, tagDayRows, tagsByDay, type Feeling } from '@/app/utils/tagFeelings';
import { MetricButton } from './ReportActivityChart';
import { AnswerBubble, AnswerIcon, Dumbbell, lineColor, PatternLine } from './ReportPatternParts';

/** The heading over Mood › Patterns, saying what the page is for. */
export const PATTERNS_HEADING = 'What tends to go with your mood, energy and stress';

export const PatternsHeading: React.FC<{ note?: string }> = ({ note }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
    <h3 className="font-display text-lg sm:text-xl font-medium text-text-primary">{PATTERNS_HEADING}</h3>
    {note && <span className="text-xs sm:text-sm text-text-muted">{note}</span>}
  </div>
);

type TagSource = 'tag' | 'moment';

const SOURCES: { value: TagSource; label: string; icon: React.ReactNode }[] = [
  { value: 'tag', label: 'Your task & note tags', icon: <Tag className="w-3.5 h-3.5" aria-hidden="true" /> },
  { value: 'moment', label: 'Moments', icon: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> },
];

/** Findings in the summary; the rest are a tap away in the cards. */
const MAX_SUMMARY = 3;

interface ActivityPick {
  metric: MoodMetric;
  feeling: Feeling;
}

interface TagsPick {
  source: TagSource;
  feeling: Feeling;
  /** The row whose numbers show under the list. */
  row: string | null;
}

/** Where the page opens: each card on its clearest finding, and on a phone the card holding the clearest of all. */
const opening = (findings: PatternFinding[]) => {
  const act = findings.find(x => x.row.source === 'activity');
  const tag = findings.find(x => x.row.source !== 'activity');
  return {
    activity: { metric: act?.row.metric ?? 'tasks', feeling: act?.feeling ?? 'mood' } as ActivityPick,
    tags: { source: (tag?.row.source ?? 'tag') as TagSource, feeling: tag?.feeling ?? 'mood', row: tag?.row.key ?? null } as TagsPick,
    panel: findings[0] && findings[0].row.source !== 'activity' ? 'tags' as const : 'activity' as const,
  };
};

const FeelingSwitch: React.FC<{ value: Feeling; onChange: (f: Feeling) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Feeling to show">
    {FEELINGS.map(f => <MetricButton key={f} active={value === f} onClick={() => onChange(f)}>{FEELING_NAME[f]}</MetricButton>)}
  </div>
);

interface ReportPatternsProps {
  activity: CalendarActivity;
  byDay: Map<string, MoodCheckin>;
  /** A month or year: a week is too short for patterns. */
  period: ReportPeriod;
  /** How the copy names the period: "this month", "in 2025". */
  scopeLabel: string;
  /** The profile's rest days, compared apart from work days. */
  restDays: number[];
  /** A month's way to its year, offered when nothing stood out. */
  widen?: { label: string; onClick: () => void };
}

/**
 * Mood › Patterns for a month or year: what tends to go with your mood,
 * energy and stress. "What stood out" on top says it in plain sentences;
 * below it "Mood & your activity" asks how you felt on days you did more
 * (tasks, note time, habits) and "Tags & moments" on days with each of your
 * tags or moments, each for any feeling. Every answer comes from one rule
 * (utils/patterns.ts), so the summary and the cards always agree, and the
 * page opens on the clearest finding with its feeling picked. Below the lg
 * breakpoint the two cards take turns behind an Activity / Tags & moments
 * switch. Nothing here says what causes what, or that higher or lower is
 * good or bad.
 */
const ReportPatterns: React.FC<ReportPatternsProps> = ({ activity, byDay, period, scopeLabel, restDays, widen }) => {
  const startStr = toLocalDateStr(period.start);
  const endStr = toLocalDateStr(period.end);
  const restKey = restDays.join(',');
  const analysis = useMemo(() => {
    const { byDay: tagDays, tags } = tagsByDay(activity, period.start, period.end);
    const rows = tagDayRows(byDay, tagDays, period.start, period.end, restDays);
    return analysePatterns(patternDays(rows, byDay, dailyActivity(activity, period.start, period.end)), tags, `${startStr}|${endStr}`);
    // `period` and `restDays` are rebuilt every render; their days identify them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, byDay, startStr, endStr, restKey]);
  const findings = useMemo(() => patternFindings(analysis.rows), [analysis]);

  const [start] = useState(() => opening(findings));
  const [act, setAct] = useState<ActivityPick>(start.activity);
  const [tags, setTags] = useState<TagsPick>(start.tags);
  const [panel, setPanel] = useState<'activity' | 'tags'>(start.panel);

  const open = ({ row, feeling }: PatternFinding) => {
    if (row.source === 'activity') {
      setAct({ metric: row.metric!, feeling });
      setPanel('activity');
    } else {
      setTags({ source: row.source, feeling, row: row.key });
      setPanel('tags');
    }
  };

  const panelSwitch = (
    <div className="lg:hidden flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Pattern to show">
      <MetricButton active={panel === 'activity'} onClick={() => setPanel('activity')}>Activity</MetricButton>
      <MetricButton active={panel === 'tags'} onClick={() => setPanel('tags')}><span className="whitespace-nowrap">Tags &amp; moments</span></MetricButton>
    </div>
  );

  const logged = analysis.days.length;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PatternsHeading note={`${logged} ${logged === 1 ? 'day' : 'days'} with a check-in ${scopeLabel}`} />
      <Summary analysis={analysis} findings={findings} scopeLabel={scopeLabel} onOpen={open} widen={widen} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className={`min-w-0 ${panel === 'tags' ? 'max-lg:hidden' : ''}`}>
          <ActivityCard analysis={analysis} pick={act} onPick={setAct} headerAction={panelSwitch} />
        </div>
        <div className={`min-w-0 ${panel === 'activity' ? 'max-lg:hidden' : ''}`}>
          <TagsCard analysis={analysis} pick={tags} onPick={setTags} headerAction={panelSwitch} />
        </div>
      </div>
    </div>
  );
};

/** "What stood out": the clearest findings as sentences you can tap, then everything else in a line or two. */
const Summary: React.FC<{
  analysis: PatternsAnalysis;
  findings: PatternFinding[];
  scopeLabel: string;
  onOpen: (finding: PatternFinding) => void;
  widen?: { label: string; onClick: () => void };
}> = ({ analysis, findings, scopeLabel, onOpen, widen }) => {
  const shown = findings.slice(0, MAX_SUMMARY);
  const more = findings.length - shown.length;
  return (
    <CardShell icon={<ListChecks className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="What stood out">
      {shown.length > 0 && (
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-3">
          {shown.map(finding => (
            <li key={`${finding.row.key}|${finding.feeling}`}>
              <button
                type="button"
                onClick={() => onOpen(finding)}
                className="w-full h-full flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 md:mx-0 text-left hover:bg-surface-raised"
              >
                <AnswerIcon kind={finding.row.answer[finding.feeling].kind} className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary">{describePattern(finding.row, finding.feeling)}</span>
                  <span className="block text-xs text-text-muted [@media(max-height:760px)]:hidden">{patternSupport(finding.row, finding.feeling)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex-1 min-w-48 text-sm text-text-secondary leading-relaxed">
          {more > 0 && `${more} more in the cards below. `}
          {patternsRest(analysis, scopeLabel).join(' ')}
        </p>
        {widen && findings.length === 0 && (
          <button type="button" onClick={widen.onClick} className="btn btn-secondary py-1 px-3 text-xs">
            {widen.label}
          </button>
        )}
      </div>
    </CardShell>
  );
};

/** "Mood & your activity": how you felt on days you did more of one activity, for one feeling, with a tile per activity. */
const ActivityCard: React.FC<{
  analysis: PatternsAnalysis;
  pick: ActivityPick;
  onPick: (pick: ActivityPick) => void;
  headerAction: React.ReactNode;
}> = ({ analysis, pick, onPick, headerAction }) => {
  const rows = analysis.rows.filter(r => r.source === 'activity');
  const row = rows.find(r => r.metric === pick.metric)!;
  const f = pick.feeling;
  const answer = row.answer[f];
  return (
    <CardShell icon={<ChartScatter className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Mood & your activity" headerAction={headerAction}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Compare with">
          {MOOD_METRICS.map(m => <MetricButton key={m} active={pick.metric === m} onClick={() => onPick({ ...pick, metric: m })}>{METRIC_NAME[m]}</MetricButton>)}
        </div>
        <div className="ml-auto"><FeelingSwitch value={f} onChange={feeling => onPick({ ...pick, feeling })} /></div>
      </div>

      <div className="flex flex-col gap-2 [@media(max-height:760px)]:gap-1">
        <h4 className="text-base sm:text-lg font-bold leading-snug text-text-primary">{activityQuestion(pick.metric, f)}</h4>
        <p className="flex items-center gap-3">
          <AnswerBubble kind={answer.kind} />
          <span className="font-display font-medium text-xl sm:text-2xl leading-tight text-text-primary">{describePattern(row, f)}</span>
        </p>
        <p className="text-sm text-text-secondary">{patternSupport(row, f)}</p>
      </div>

      <PatternLine row={row} feeling={f} days={analysis.days} />

      <details className="group/how text-xs text-text-secondary">
        <summary className="inline-flex items-center gap-1 text-[13px] font-medium text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/how:rotate-90" aria-hidden="true" />
          How this is worked out
        </summary>
        <div className="mt-2 pl-4 flex flex-col gap-1 leading-relaxed">
          <p>
            {patternNumbers(row, f)} Each day with a daily check-in counts once. Days are split at the middle of how much you did into busier
            and quieter days — for a tag or moment, days with it and days without — and work days are compared with work days, days off with days off.
          </p>
          <p>
            Each side needs {TAG_MIN_SIDE} days before anything is said. A gap under half a step on the 1–5 scale, or one that shuffling the same
            days often gives too (a {Math.round(CHANCE_LEVEL * 100)}% bar shared across everything this page compares), reads “about the same”.
            Otherwise, with under {SURE_SIDE} days on a side it’s only “maybe”; after that a gap under {PLAIN_GAP} is “a little”, one of{' '}
            {CLEAR_GAP} or more “clearly”. The same rule answers every card on this page.
          </p>
          <p className="text-[11px] text-text-muted">Shows what tends to go together — not what causes what. A busy week, sleep or the season can drive both.</p>
        </div>
      </details>

      <div className="hidden sm:grid grid-cols-3 gap-2 [@media(max-height:760px)]:hidden">
        {rows.map(r => {
          const a = r.answer[f];
          const active = r.metric === pick.metric;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onPick({ ...pick, metric: r.metric! })}
              aria-pressed={active}
              className={`text-left rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 border transition-colors ${
                active ? 'border-transparent bg-accent-subtle' : 'border-border-subtle hover:bg-surface-raised'
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{r.name}</span>
              <span className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold text-text-primary">
                <AnswerIcon kind={a.kind} className="w-4 h-4 shrink-0" />
                {a.short}
              </span>
            </button>
          );
        })}
      </div>
    </CardShell>
  );
};

/** "Tags & moments": how you felt on days with each of your tags, or each moment, for one feeling. */
const TagsCard: React.FC<{
  analysis: PatternsAnalysis;
  pick: TagsPick;
  onPick: (pick: TagsPick) => void;
  headerAction: React.ReactNode;
}> = ({ analysis, pick, onPick, headerAction }) => {
  const f = pick.feeling;
  const all = analysis.rows.filter(r => r.source === pick.source);
  const rows = all.slice(0, MAX_CHART_TAGS);
  const selected = rows.find(r => r.key === pick.row) ?? null;
  const tag = pick.source === 'tag';
  return (
    <CardShell icon={<Tags className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header={<span className="whitespace-nowrap">Tags &amp; moments</span>} headerAction={headerAction}>
      <div className="flex p-0.5 rounded-lg bg-surface border border-border" role="tablist" aria-label="Tags or moments to show">
        {SOURCES.map(s => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={pick.source === s.value}
            onClick={() => onPick({ ...pick, source: s.value, row: null })}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              pick.source === s.value ? 'bg-accent-subtle text-accent shadow-sm font-semibold' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 min-w-48 text-base sm:text-lg font-bold leading-snug text-text-primary">{tagsQuestion(pick.source, f)}</h4>
        <FeelingSwitch value={f} onChange={feeling => onPick({ ...pick, feeling })} />
      </div>

      {rows.length === 0 ? (
        <p className="text-xs sm:text-sm text-text-muted italic py-2">
          {tag
            ? `Tag your tasks and notes and, once a tag is on ${TAG_MIN_SIDE} days with a check-in, this shows how you felt on those days.`
            : `Pick moments when you check in and, once one is on ${TAG_MIN_SIDE} days, this shows how you felt on those days.`}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted [@media(max-height:760px)]:hidden" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><span className="w-[1.5px] h-3 bg-text-primary" />other days</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColor(f) }} />days with it</span>
            <span>· tap a row for the numbers</span>
          </div>
          <ul className="flex flex-col">
            {rows.map(r => {
              const a = r.answer[f];
              const on = selected === r;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => onPick({ ...pick, row: on ? null : r.key })}
                    aria-pressed={on}
                    aria-label={`${r.name}, ${r.days} ${r.days === 1 ? 'day' : 'days'}: ${a.short}`}
                    className={`w-full grid grid-cols-[minmax(4rem,2fr)_auto_minmax(2.5rem,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-xs sm:text-sm ${
                      on ? 'bg-accent-subtle' : 'hover:bg-surface-raised'
                    } ${a.kind === 'wait' ? 'opacity-70' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {r.source === 'tag' && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color || 'var(--tm-pencil)' }} />}
                      <span className="truncate font-medium text-text-primary">{r.name}</span>
                    </span>
                    <span className="w-12 text-right text-[11px] text-text-muted">{r.days} {r.days === 1 ? 'day' : 'days'}</span>
                    <Dumbbell row={r} feeling={f} />
                    <span className="w-[6.5rem] sm:w-[8.5rem] flex items-center gap-1 font-semibold text-text-primary whitespace-nowrap">
                      <AnswerIcon kind={a.kind} className="w-4 h-4 shrink-0" />
                      {a.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="rounded-lg p-2.5 bg-surface-raised text-xs sm:text-[13px] text-text-secondary leading-relaxed" aria-live="polite">
            {selected ? (
              <>
                <b className="text-text-primary">{selected.answer[f].kind === 'wait' ? `Can’t tell yet for ${selected.name}` : describePattern(selected, f)}.</b>{' '}
                {patternSupport(selected, f)}. {patternNumbers(selected, f)}
              </>
            ) : tag ? (
              `A tag counts on days you finished a task or edited a note with it. Each side needs ${TAG_MIN_SIDE} days before anything is said, and a gap under ${MIN_GAP} never counts.`
            ) : (
              `Moments are what you pick when you check in. Each side needs ${TAG_MIN_SIDE} days before anything is said, and a gap under ${MIN_GAP} never counts.`
            )}
          </p>
          <p className="mt-auto text-[11px] text-text-muted">
            {all.length > rows.length && `Showing the ${MAX_CHART_TAGS} on the most days. `}Shows what went together, not what caused it.
          </p>
        </>
      )}
    </CardShell>
  );
};

export default ReportPatterns;
