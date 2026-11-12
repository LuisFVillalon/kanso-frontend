'use client';

import React, { useId, useMemo, useState } from 'react';
import { ChartScatter, ChevronRight, Hourglass, ListChecks, Minus, Sparkles, Tag, Tags, TrendingDown, TrendingUp } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { MOOD_METRICS, type MoodMetric, type ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  activityQuestion,
  CARD_FINDINGS,
  CLEAR_GAP,
  describePattern,
  findingSupport,
  METRIC_NAME,
  patternFindings,
  patternNumbers,
  patternsRest,
  patternSupport,
  periodPatterns,
  PLAIN_GAP,
  SEPARATE_DAY_KINDS,
  stepAdverb,
  SURE_SIDE,
  tagsCardGroups,
  tagsQuestion,
  thinReason,
  waitsOnCheckIns,
  type PatternFinding,
  type PatternRow,
  type PatternsAnalysis,
} from '@/app/utils/patterns';
import { CHANCE_LEVEL, FEELING_NAME, FEELINGS, feelingWord, formatAverage, TAG_MIN_SIDE, type Feeling } from '@/app/utils/tagFeelings';
import { MetricButton } from './ReportParts';
import { AnswerBubble, AnswerIcon, DayStrip, PatternLine } from './ReportPatternParts';

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
  { value: 'tag', label: 'Your tags', icon: <Tag className="w-3.5 h-3.5" aria-hidden="true" /> },
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
  /** The finding whose days show under its sentence; one at a time. */
  open: string | null;
  /** Every finding listed, not just the first CARD_FINDINGS. */
  more: boolean;
}

/** The Tags & moments card on one finding, its days shown and its list opened far enough to hold it. */
const tagsPickFor = (rows: PatternRow[], { row, feeling }: PatternFinding): TagsPick => {
  const source = row.source as TagSource;
  const index = tagsCardGroups(rows, source, feeling).found.indexOf(row);
  return { source, feeling, open: row.key, more: index >= CARD_FINDINGS };
};

/** Where the page opens: each card on its clearest finding, and on a phone the card holding the clearest of all. */
const opening = (rows: PatternRow[], findings: PatternFinding[]) => {
  const act = findings.find(x => x.row.source === 'activity');
  const tag = findings.find(x => x.row.source !== 'activity');
  return {
    activity: { metric: act?.row.metric ?? 'tasks', feeling: act?.feeling ?? 'mood' } as ActivityPick,
    tags: tag ? tagsPickFor(rows, tag) : { source: 'tag', feeling: 'mood', open: null, more: false } as TagsPick,
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
 * (tasks, note time, habits, time in events) and "Tags & moments" says, in
 * plain sentences with their numbers, which of your tags (from tasks, notes,
 * habits and events) or moments went with a difference, each for any
 * feeling. Every answer comes from one rule
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
  const analysis = useMemo(
    () => periodPatterns(activity, byDay, period.start, period.end, restDays),
    // `period` and `restDays` are rebuilt every render; their days identify them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, byDay, startStr, endStr, restKey],
  );
  const findings = useMemo(() => patternFindings(analysis.rows), [analysis]);

  const [start] = useState(() => opening(analysis.rows, findings));
  const [act, setAct] = useState<ActivityPick>(start.activity);
  const [tags, setTags] = useState<TagsPick>(start.tags);
  const [panel, setPanel] = useState<'activity' | 'tags'>(start.panel);

  const open = ({ row, feeling }: PatternFinding) => {
    if (row.source === 'activity') {
      setAct({ metric: row.metric!, feeling });
      setPanel('activity');
    } else {
      setTags(tagsPickFor(analysis.rows, { row, feeling }));
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
          <TagsCard analysis={analysis} period={period} scopeLabel={scopeLabel} pick={tags} onPick={setTags} headerAction={panelSwitch} />
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

/** "Mood & your activity": how you felt on days you did more of one activity, for one feeling. */
const ActivityCard: React.FC<{
  analysis: PatternsAnalysis;
  pick: ActivityPick;
  onPick: (pick: ActivityPick) => void;
  headerAction: React.ReactNode;
}> = ({ analysis, pick, onPick, headerAction }) => {
  const row = analysis.rows.find(r => r.source === 'activity' && r.metric === pick.metric)!;
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
            and quieter days — for a tag or moment, days with it and days without — and {SEPARATE_DAY_KINDS}.
          </p>
          {pick.metric === 'events' && (
            <p>
              Time in events counts each minute once even when events overlap. All-day events and ones 24 hours or longer add no time, and
              Google events you declined or marked “Show as free” add none, as in Reports › Events.
            </p>
          )}
          <p>
            Each side needs {TAG_MIN_SIDE} days before anything is said. A gap under half a step on the 1–5 scale, or one that shuffling the same
            days often gives too (a {Math.round(CHANCE_LEVEL * 100)}% bar shared across everything this page compares), reads “about the same”.
            Otherwise, with under {SURE_SIDE} days on a side it’s only “maybe”; after that a gap under {PLAIN_GAP} is “a little”, one of{' '}
            {CLEAR_GAP} or more “clearly”. The same rule answers every card on this page.
          </p>
          <p className="text-[11px] text-text-muted">Shows what tends to go together — not what causes what. A busy week, sleep or the season can drive both.</p>
        </div>
      </details>
    </CardShell>
  );
};

/** "Tags & moments": which of your tags or moments went with a difference in one feeling, in plain sentences with their numbers. */
const TagsCard: React.FC<{
  analysis: PatternsAnalysis;
  period: ReportPeriod;
  scopeLabel: string;
  pick: TagsPick;
  onPick: (pick: TagsPick) => void;
  headerAction: React.ReactNode;
}> = ({ analysis, period, scopeLabel, pick, onPick, headerAction }) => {
  const headingId = useId();
  const f = pick.feeling;
  const tag = pick.source === 'tag';
  const any = analysis.rows.some(r => r.source === pick.source);
  const { found, same, thin } = tagsCardGroups(analysis.rows, pick.source, f);
  const shown = pick.more ? found : found.slice(0, CARD_FINDINGS);
  const hidden = found.length - shown.length;
  const checkIns = analysis.days.length;
  const ongoing = toLocalDateStr(period.end) >= toLocalDateStr(new Date());
  const box = (text: string) => <p className="rounded-lg p-2.5 bg-surface-raised text-xs sm:text-[13px] text-text-secondary leading-relaxed">{text}</p>;

  return (
    <CardShell icon={<Tags className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header={<span className="whitespace-nowrap">Tags &amp; moments</span>} headerAction={headerAction}>
      <div className="flex p-0.5 rounded-lg bg-surface border border-border" role="tablist" aria-label="Tags or moments to show">
        {SOURCES.map(s => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={pick.source === s.value}
            onClick={() => onPick({ source: s.value, feeling: f, open: null, more: false })}
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
        <h4 className="flex-1 min-w-48 text-base sm:text-lg font-bold leading-snug text-text-primary">{tagsQuestion(f, scopeLabel)}</h4>
        <FeelingSwitch value={f} onChange={feeling => onPick({ ...pick, feeling, open: null, more: false })} />
      </div>

      {!any ? (
        box(tag
          ? `Tag your tasks, notes, habits and events and, once a tag is on ${TAG_MIN_SIDE} days with a check-in, this shows how you felt on those days.`
          : `Pick moments when you check in and, once one is on ${TAG_MIN_SIDE} days, this shows how you felt on those days.`)
      ) : (
        <>
          {waitsOnCheckIns(analysis) ? (
            box(`Only ${checkIns} ${checkIns === 1 ? 'check-in' : 'check-ins'} ${scopeLabel}${ongoing ? ' so far' : ''}. Each comparison needs ${TAG_MIN_SIDE} days with it and ${TAG_MIN_SIDE} without, so check back in a few days.`)
          ) : found.length === 0 ? (
            box(`Nothing went with a clear difference in your ${f} ${scopeLabel}.`)
          ) : (
            <div className="flex flex-col gap-2">
              <h5 id={headingId} className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Went with a difference</h5>
              <ul className="flex flex-col gap-3" aria-labelledby={headingId}>
                {shown.map(r => (
                  <Finding
                    key={r.key}
                    row={r}
                    feeling={f}
                    analysis={analysis}
                    period={period}
                    open={pick.open === r.key}
                    onToggle={() => onPick({ ...pick, open: pick.open === r.key ? null : r.key })}
                  />
                ))}
              </ul>
              {hidden > 0 && (
                <button type="button" onClick={() => onPick({ ...pick, more: true })} className="self-start text-[13px] font-medium text-accent hover:underline">
                  Show {hidden} more
                </button>
              )}
            </div>
          )}

          {same.length > 0 && (
            <p className="flex items-start gap-2 text-xs sm:text-[13px] text-text-secondary leading-relaxed">
              <Minus className="w-4 h-4 shrink-0 mt-px" style={{ color: 'var(--tm-mood-3)' }} aria-hidden="true" />
              <span><span className="font-semibold text-text-primary">About the same as usual:</span> {same.map(r => `${r.name} (${r.days})`).join(', ')}</span>
            </p>
          )}

          {thin.length > 0 && (
            <details className="group/thin text-xs sm:text-[13px] text-text-secondary">
              <summary className="flex items-start gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden leading-relaxed">
                <Hourglass className="w-4 h-4 shrink-0 mt-px" style={{ color: 'var(--tm-text-muted)' }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-semibold text-text-primary">Not enough days yet:</span> {thin.map(r => r.name).join(', ')}
                </span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent transition-transform group-open/thin:rotate-90" aria-hidden="true" />
              </summary>
              <ul className="mt-1.5 pl-6 flex flex-col gap-1">
                {thin.map(r => (
                  <li key={r.key}><span className="font-medium text-text-primary">{r.name}</span> · {thinReason(r, f, analysis.days)}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <p className="mt-auto text-[11px] text-text-muted leading-relaxed">
        {tag
          ? 'A tag counts on days you finished a task, wrote in a note, checked off a habit or had an event with it.'
          : 'Moments are what you pick when you check in.'}{' '}
        These went together. That doesn’t mean one caused the other: a busy week or a bad night’s sleep can drive both.
      </p>
    </CardShell>
  );
};

/** One finding as a sentence: "On Work days your energy was clearly lower: 2.0 Low vs 3.9 Good on other days.", with its days a tap away. */
const Finding: React.FC<{
  row: PatternRow;
  feeling: Feeling;
  analysis: PatternsAnalysis;
  period: ReportPeriod;
  open: boolean;
  onToggle: () => void;
}> = ({ row, feeling: f, analysis, period, open, onToggle }) => {
  const c = row.feel[f];
  const a = row.answer[f];
  const color = c.good ? 'var(--tm-mood-4)' : 'var(--tm-mood-2)';
  const Icon = a.kind === 'higher' ? TrendingUp : TrendingDown;
  const value = (x: number) => (
    <><b className="font-semibold text-text-primary">{formatAverage(x)}</b> <span className="text-xs text-text-muted">{feelingWord(f, x)}</span></>
  );
  return (
    <li className="flex items-start gap-2.5">
      <span className="w-[30px] h-[30px] shrink-0 rounded-full grid place-items-center" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
        <Icon className="w-4 h-4" style={{ color }} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <p className="text-sm sm:text-[15px] leading-snug text-text-secondary">
          {row.source === 'tag'
            ? <>On <b className="font-semibold text-text-primary">{row.name}</b> days</>
            : <>On days you picked <b className="font-semibold text-text-primary">“{row.name}”</b></>}
          {' '}your {f} was {stepAdverb(a.step!)}<b className="font-semibold text-text-primary">{a.kind}</b>: {value(c.avg!)} vs {value(c.other!)} on other days.
        </p>
        <p className="text-xs text-text-muted">
          {findingSupport(row, f)} ·{' '}
          <button type="button" onClick={onToggle} aria-expanded={open} className="font-medium text-accent hover:underline">
            {open ? 'Hide days' : 'See the days'}
          </button>
        </p>
        {open && <DayStrip row={row} feeling={f} days={analysis.days} period={period} />}
      </div>
    </li>
  );
};

export default ReportPatterns;
