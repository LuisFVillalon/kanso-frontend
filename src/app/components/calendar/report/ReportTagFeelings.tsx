'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  analyseTagFeelings,
  describeTagFeeling,
  FEELING_NAME,
  FEELINGS,
  hasClearDifference,
  MAX_CHART_TAGS,
  summarizeTagFeelings,
  TAG_MIN_SIDE,
  tagDayRows,
  tagKindCounts,
  tagsByDay,
  timelineFeeling,
  type Feeling,
  type TagFeelings,
} from '@/app/utils/tagFeelings';
import { MetricButton } from './ReportActivityChart';
import { EASIER_COLOR, FEELING_COLOR, HARDER_COLOR, TagBarsChart, tagColor, TagTimelineChart } from './ReportTagFeelingsChart';
import { Footnote, hatchFill, HATCH_SWATCH, Notice, Swatch } from './ReportTagParts';
import ReportTagKinds from './ReportTagKinds';

const allThin = (t: TagFeelings) => FEELINGS.every(f => t.feel[f].verdict === 'thin');

/** Where a 1–5 value sits across a bar's track. */
const at = (v: number) => ((v - 1) / 4) * 100;

/**
 * A narrow card's take on the grouped bars: a row per tag, three thin bars
 * (mood, energy, stress) from 1 to 5, a tick at your usual and ▶◀ at a clear
 * difference. Tapping a row opens its days.
 */
const TagList: React.FC<{ tags: TagFeelings[]; hatched: boolean; onSelect: (key: string) => void }> = ({ tags, hatched, onSelect }) => (
  <ul className="flex flex-col gap-0.5">
    {tags.map(t => {
      const n = t.feel.mood.nAvg;
      const label = `${t.tag.name}, ${n} ${n === 1 ? 'day' : 'days'}: show its days over time`;
      return (
        <li key={t.tag.key}>
          <button
            type="button"
            onClick={() => onSelect(t.tag.key)}
            aria-label={label}
            title={FEELINGS.map(f => describeTagFeeling(t.tag.name, f, t.feel[f])).join('\n')}
            className={`w-full grid grid-cols-[128px_minmax(0,1fr)] gap-2 items-center rounded-md px-1.5 py-1 [@media(max-height:760px)]:py-0.5 text-left hover:bg-surface-raised ${!hatched && allThin(t) ? 'opacity-60' : ''}`}
          >
            <span className="flex items-center gap-1.5 min-w-0 text-xs" aria-hidden="true">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tagColor(t) }} />
              <span className="truncate font-medium text-text-primary">{t.tag.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-text-muted">{n} {n === 1 ? 'day' : 'days'}</span>
            </span>
            <span className="flex flex-col gap-0.5 pr-3.5" aria-hidden="true">
              {FEELINGS.map(f => {
                const c = t.feel[f];
                if (c.avg == null) return <span key={f} className="h-[7px]" />;
                const thin = hatched || c.verdict === 'thin';
                const clear = !hatched && c.verdict === 'clear';
                return (
                  <span key={f} data-feeling={f} className="relative h-[7px] rounded-sm bg-surface-raised">
                    <span
                      data-thin={thin || undefined}
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{ width: `${Math.max(3, at(c.avg))}%`, background: thin ? hatchFill(FEELING_COLOR[f]) : FEELING_COLOR[f] }}
                    />
                    {c.other != null && <span className="absolute -inset-y-0.5 w-0.5 -ml-px rounded-sm bg-text-primary" style={{ left: `${at(c.other)}%` }} />}
                    {clear && (
                      <span className="absolute -top-[5px] text-[9px] leading-none" style={{ left: `calc(${at(Math.max(c.avg, c.other ?? c.avg))}% + 4px)`, color: c.good ? EASIER_COLOR : HARDER_COLOR }}>
                        {c.gap! > 0 ? '▶' : '◀'}
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);

interface ReportTagFeelingsProps {
  activity: CalendarActivity;
  byDay: Map<string, MoodCheckin>;
  period: ReportPeriod;
  /** How the copy names the period: "this month", "in 2025". */
  scopeLabel: string;
  /** The profile's rest days (0 = Sunday … 6 = Saturday); Saturday and Sunday are always days off. */
  restDays: number[];
  /** A week's way to its month, or a month's to its year, when the period is too short to tell. */
  widen?: { label: string; onClick: () => void };
  /** A full-width card: grouped bars and the footnote open; otherwise a row per tag and the footnote folded. */
  wide: boolean;
}

export type TagFeelingsView = 'tags' | 'kinds';

/**
 * "Your task & note tags", the Tags card's own-tags side: mood, energy and
 * stress on days with each of your own tags — a day you finished a task or
 * edited a note carrying it — against your usual. "By tag" draws them per
 * tag; tapping one swaps in its days as a timeline of one feeling. "By kind
 * of activity" picks a tag and says, for its tasks, notes, habits and events
 * apart, what went with doing more of each. A week is hatched with a note
 * that it's too short.
 */
const ReportTagFeelings: React.FC<ReportTagFeelingsProps> = ({ activity, byDay, period, scopeLabel, restDays, widen, wide }) => {
  const startStr = toLocalDateStr(period.start);
  const endStr = toLocalDateStr(period.end);
  const restKey = restDays.join(',');
  const { analysis, counts } = useMemo(() => {
    const { byDay: tagDays, tags } = tagsByDay(activity, period.start, period.end);
    return {
      analysis: analyseTagFeelings(tagDayRows(byDay, tagDays, period.start, period.end, restDays), tags, `${startStr}|${endStr}`),
      counts: tagKindCounts(activity, period.start, period.end),
    };
    // `period` and `restDays` are rebuilt every render; their days identify them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, byDay, startStr, endStr, restKey]);
  const [view, setView] = useState<TagFeelingsView>('tags');
  const [picked, setPicked] = useState<{ key: string; feeling: Feeling | null } | null>(null);

  const week = period.kind === 'week';
  const shown = analysis.tags.slice(0, MAX_CHART_TAGS);
  const selected = picked ? shown.find(t => t.tag.key === picked.key) ?? null : null;
  const feeling = selected ? picked!.feeling ?? timelineFeeling(selected) : 'mood';
  const summary = week ? '' : summarizeTagFeelings(analysis, scopeLabel);
  const logged = analysis.days.length;

  const select = (key: string) => setPicked(p => (p?.key === key ? null : { key, feeling: null }));

  const viewSwitch = (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border self-start" role="group" aria-label="Break your tags down">
      <MetricButton active={view === 'tags'} onClick={() => setView('tags')}>By tag</MetricButton>
      <MetricButton active={view === 'kinds'} onClick={() => setView('kinds')}>By kind of activity</MetricButton>
    </div>
  );

  if (view === 'kinds') {
    return (
      <>
        {viewSwitch}
        <ReportTagKinds days={analysis.days} counts={counts} period={period} scopeLabel={scopeLabel} widen={widen} wide={wide} />
      </>
    );
  }

  return (
    <>
      {viewSwitch}
      {week ? (
        <Notice action={widen}>
          A week is too short to tell anything from chance, so every bar is hatched. Comparisons need {TAG_MIN_SIDE} days with a tag and {TAG_MIN_SIDE} without.
        </Notice>
      ) : period.kind === 'month' && shown.length > 0 && !hasClearDifference(analysis) ? (
        <Notice action={widen}>
          Nothing clear {scopeLabel}: one month of check-ins is rarely enough to tell a difference from chance.
        </Notice>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-xs sm:text-sm text-text-muted italic py-2">
          Tag your tasks and notes and, once a tag is on {TAG_MIN_SIDE} days with a check-in, this shows how you felt on those days.
        </p>
      ) : selected ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPicked(null)} className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline">
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              All tags
            </button>
            <div className="ml-auto flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Feeling to show">
              {FEELINGS.map(f => (
                <MetricButton key={f} active={feeling === f} onClick={() => setPicked({ key: selected.tag.key, feeling: f })}>{FEELING_NAME[f]}</MetricButton>
              ))}
            </div>
          </div>
          <p className="text-sm font-semibold text-text-primary">
            Your {FEELING_NAME[feeling].toLowerCase()}, day by day, with {selected.tag.name} days highlighted
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            <Swatch style={{ backgroundColor: tagColor(selected), opacity: 0.5 }} label={`Days with ${selected.tag.name}`} />
            <Swatch style={{ width: 9, height: 9, borderRadius: 9, border: '1.2px solid var(--tm-pencil)', backgroundColor: 'var(--tm-surface)' }} label="Other days" />
            <Swatch style={{ height: 0, borderTop: `2px dashed ${tagColor(selected)}` }} label={`Average on ${selected.tag.name} days${selected.feel[feeling].n ? ' compared' : ''}`} />
            {selected.feel[feeling].other != null && <Swatch style={{ height: 0, borderTop: '2px dotted var(--tm-text-primary)' }} label="Your usual" />}
          </div>
          <TagTimelineChart days={analysis.days} tag={selected} feeling={feeling} kind={period.kind} periodStart={period.start} periodEnd={period.end} />
          <p className="text-sm text-text-primary leading-relaxed">
            Colored columns are days with {selected.tag.name};{' '}
            {selected.feel[feeling].other != null ? 'the two dashed lines compare their average with your usual.' : 'the dashed line is their average.'}{' '}
            {describeTagFeeling(selected.tag.name, feeling, selected.feel[feeling])}
          </p>
        </div>
      ) : (
        <>
          {wide && (
            <div className="[@media(max-height:760px)]:hidden">
              <p className="text-sm font-semibold text-text-primary">Mood, energy and stress on days with each tag</p>
              <p className="text-xs text-text-muted">Average on your tag days, with your usual marked across each bar</p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {FEELINGS.map(f => <Swatch key={f} style={{ backgroundColor: FEELING_COLOR[f] }} label={FEELING_NAME[f]} />)}
            <Swatch style={wide ? { height: 2, backgroundColor: 'var(--tm-text-primary)' } : { width: 2, height: 12, backgroundColor: 'var(--tm-text-primary)' }} label="Your usual" />
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
              <b style={{ color: EASIER_COLOR }}>{wide ? '▲' : '▶'}</b>
              <b style={{ color: HARDER_COLOR }}>{wide ? '▼' : '◀'}</b>
              {wide ? 'Clear difference (blue easier on you, brick harder)' : 'Clear difference'}
            </span>
            <Swatch style={HATCH_SWATCH} label={wide ? `Striped: under ${TAG_MIN_SIDE} days, too few to tell` : 'Striped: too few days to tell'} />
          </div>

          {wide ? <TagBarsChart tags={shown} hatched={week} selected={null} onSelect={select} /> : <TagList tags={shown} hatched={week} onSelect={select} />}

          <p className={`${wide ? 'text-sm' : 'text-[13px]'} text-text-primary leading-relaxed`}>
            {wide && 'Each bar is how you felt on average on days with that tag; the line across it is your usual. An arrow means the gap is too big to be chance. '}
            {summary && `${summary} `}Tap a tag to see its days over time.
          </p>
        </>
      )}

      {shown.length > 0 && (
        <Footnote wide={wide}>
          {!wide && 'Each bar is how you felt on average on days with that tag, from 1 (low) to 5 (high); the tick is your usual, and an arrow means the gap is too big to be chance. Blue is easier on you, brick harder. '}
          {logged} daily {logged === 1 ? 'check-in' : 'check-ins'} {scopeLabel}. A tag’s day is one where you finished a task or edited a note with that tag.
          “Your usual” is your average on days without it, work days matched with work days and days off with days off.
          {analysis.tags.length > shown.length && ` Showing the ${MAX_CHART_TAGS} tags on the most days.`} Shows what went together, not what caused it.
        </Footnote>
      )}
    </>
  );
};

export default ReportTagFeelings;
