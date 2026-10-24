'use client';

import React, { useMemo, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
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
  tagsByDay,
  timelineFeeling,
  type Feeling,
} from '@/app/utils/tagFeelings';
import { MetricButton } from './ReportActivityChart';
import { EASIER_COLOR, FEELING_COLOR, HARDER_COLOR, TagBarsChart, tagColor, TagTimelineChart } from './ReportTagFeelingsChart';

const Swatch: React.FC<{ style: React.CSSProperties; label: React.ReactNode }> = ({ style, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-3 h-2.5 shrink-0 rounded-sm" style={style} aria-hidden="true" />
    {label}
  </span>
);

const HATCH_SWATCH: React.CSSProperties = {
  background: 'repeating-linear-gradient(45deg, var(--tm-pencil) 0 2px, var(--tm-surface) 2px 4px)',
  border: '1px solid var(--tm-pencil)',
};

const Notice: React.FC<{ children: React.ReactNode; action?: { label: string; onClick: () => void } }> = ({ children, action }) => (
  <div className="rounded-lg p-3 flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface-raised">
    <p className="text-xs sm:text-sm text-text-secondary flex-1 min-w-48">{children}</p>
    {action && (
      <button type="button" onClick={action.onClick} className="btn btn-secondary py-1 px-3 text-xs">
        {action.label}
      </button>
    )}
  </div>
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
}

/**
 * "Your task & note tags": mood, energy and stress on days with each of your own
 * tags — a day you finished a task or edited a note carrying it — against
 * your usual, as grouped bars. Tapping a tag opens its days as a timeline
 * of one feeling. A week is drawn hatched with a note that it's too short.
 */
const ReportTagFeelings: React.FC<ReportTagFeelingsProps> = ({ activity, byDay, period, scopeLabel, restDays, widen }) => {
  const startStr = toLocalDateStr(period.start);
  const endStr = toLocalDateStr(period.end);
  const restKey = restDays.join(',');
  const analysis = useMemo(() => {
    const { byDay: tagDays, tags } = tagsByDay(activity, period.start, period.end);
    return analyseTagFeelings(tagDayRows(byDay, tagDays, period.start, period.end, restDays), tags, `${startStr}|${endStr}`);
    // `period` and `restDays` are rebuilt every render; their days identify them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, byDay, startStr, endStr, restKey]);
  const [picked, setPicked] = useState<{ key: string; feeling: Feeling | null } | null>(null);

  const week = period.kind === 'week';
  const shown = analysis.tags.slice(0, MAX_CHART_TAGS);
  const selected = picked ? shown.find(t => t.tag.key === picked.key) ?? null : null;
  const feeling = selected ? picked!.feeling ?? timelineFeeling(selected) : 'mood';
  const summary = week ? '' : summarizeTagFeelings(analysis, scopeLabel);
  const logged = analysis.days.length;

  const select = (key: string) => setPicked(p => (p?.key === key ? null : { key, feeling: null }));

  return (
    <CardShell icon={<Tag className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Your task & note tags">
      <p className="-mt-2 text-xs text-text-muted">How you felt on days you worked on each tag</p>
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
      ) : (
        <>
          <div>
            <p className="text-sm font-semibold text-text-primary">Mood, energy and stress on days with each tag</p>
            <p className="text-xs text-text-muted">Average on your tag days, with your usual marked across each bar</p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {FEELINGS.map(f => <Swatch key={f} style={{ backgroundColor: FEELING_COLOR[f] }} label={FEELING_NAME[f]} />)}
            <Swatch style={{ height: 2, backgroundColor: 'var(--tm-text-primary)' }} label="Your usual" />
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
              <b style={{ color: EASIER_COLOR }}>▲</b>
              <b style={{ color: HARDER_COLOR }}>▼</b>
              Clear difference (blue easier on you, brick harder)
            </span>
            <Swatch style={HATCH_SWATCH} label={`Under ${TAG_MIN_SIDE} days: too few to tell`} />
          </div>

          <TagBarsChart tags={shown} hatched={week} selected={selected?.tag.key ?? null} onSelect={select} />

          <p className="text-sm text-text-primary leading-relaxed">
            Each bar is how you felt on average on days with that tag; the line across it is your usual. An arrow means the gap is too big to be chance.
            {summary && ` ${summary}`} Tap a tag to see its days over time.
          </p>

          {selected && (
            <div className="rounded-lg p-3 flex flex-col gap-2 border border-border-subtle">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-text-primary flex-1 min-w-48">
                  Your {FEELING_NAME[feeling].toLowerCase()}, day by day, with {selected.tag.name} days highlighted
                </p>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Feeling to show">
                  {FEELINGS.map(f => (
                    <MetricButton key={f} active={feeling === f} onClick={() => setPicked({ key: selected.tag.key, feeling: f })}>{FEELING_NAME[f]}</MetricButton>
                  ))}
                </div>
                <button type="button" onClick={() => setPicked(null)} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-raised" aria-label="Close the timeline">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
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
          )}

          <p className="text-[11px] text-text-muted mt-auto">
            {logged} daily {logged === 1 ? 'check-in' : 'check-ins'} {scopeLabel}. A tag’s day is one where you finished a task or edited a note with that tag.
            “Your usual” is your average on days without it, work days matched with work days and days off with days off.
            {analysis.tags.length > shown.length && ` Showing the ${MAX_CHART_TAGS} tags on the most days.`} Shows what went together, not what caused it.
          </p>
        </>
      )}
    </CardShell>
  );
};

export default ReportTagFeelings;
