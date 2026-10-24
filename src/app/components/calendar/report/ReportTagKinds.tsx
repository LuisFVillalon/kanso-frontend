'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  analyseTagKinds,
  defaultKindTag,
  describeKind,
  describeKindFeeling,
  FEELING_NAME,
  FEELINGS,
  feelingWord,
  KIND_NAME,
  kindSides,
  kindTags,
  MAX_CHART_TAGS,
  TAG_MIN_SIDE,
  type ActivityKind,
  type Feeling,
  type FeelingComparison,
  type FeelingTag,
  type KindComparison,
  type KindCounts,
  type TagDay,
} from '@/app/utils/tagFeelings';
import { EASIER_COLOR, FEELING_COLOR, HARDER_COLOR } from './ReportTagFeelingsChart';
import { Footnote, hatchFill, HATCH_SWATCH, Notice, Swatch } from './ReportTagParts';

const CHIP_UP: Record<Feeling, string> = { mood: 'Better mood', energy: 'More energy', stress: 'More stressed' };
const CHIP_DOWN: Record<Feeling, string> = { mood: 'Lower mood', energy: 'Less energy', stress: 'Calmer' };

/** Where a 1–5 value ends across a bar's track. */
const at = (v: number) => Math.max(3, ((v - 1) / 4) * 100);

/** The verdict on one feeling, as a chip: "▲ Better mood", "About the same", "Too few days". */
const VerdictChip: React.FC<{ f: Feeling; c: FeelingComparison }> = ({ f, c }) => {
  if (c.verdict === 'clear') {
    const color = c.good ? EASIER_COLOR : HARDER_COLOR;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-px rounded-full text-[11px] font-semibold border whitespace-nowrap"
        style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${color} 10%, var(--tm-surface))` }}
      >
        <b aria-hidden="true">{c.gap! > 0 ? '▲' : '▼'}</b>
        {c.gap! > 0 ? CHIP_UP[f] : CHIP_DOWN[f]}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2 py-px rounded-full text-[11px] border border-border whitespace-nowrap text-text-muted ${c.verdict === 'thin' ? 'border-dashed' : ''}`}>
      {c.verdict === 'thin' ? 'Too few days' : 'About the same'}
    </span>
  );
};

/** One bar of a pair: the days you did it are always the solid, darker one; stripes mean too few days to tell. */
const PairBar: React.FC<{ f: Feeling; value: number | null; did: boolean; thin: boolean }> = ({ f, value, did, thin }) => (
  <span className="flex items-center gap-1.5 h-3">
    <span className="relative flex-1 h-2.5 rounded-sm bg-surface-raised">
      {value != null && (
        <span
          data-side={did ? 'did' : 'didnt'}
          data-thin={thin || undefined}
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ width: `${at(value)}%`, background: thin ? hatchFill(FEELING_COLOR[f]) : FEELING_COLOR[f], opacity: did ? 1 : thin ? 0.45 : 0.35 }}
        />
      )}
    </span>
    <span className={`w-14 shrink-0 text-[11px] leading-3 ${did ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
      {value != null && !thin ? feelingWord(f, value) : ''}
    </span>
  </span>
);

/** A kind's bars: per feeling, the days you did it on top and the days you didn't below, on the same 1–5 scale. */
const KindPairs: React.FC<{ o: KindComparison; tagName: string }> = ({ o, tagName }) => (
  <div className="flex flex-col gap-1.5 pt-1">
    {FEELINGS.map(f => {
      const c = o.feel![f];
      const thin = c.verdict === 'thin';
      return (
        <div key={f} data-feeling={f} title={describeKindFeeling(o, f, tagName)}>
          <span className="sr-only">{describeKindFeeling(o, f, tagName)}</span>
          <div className="flex items-center justify-between gap-2 mb-1" aria-hidden="true">
            <span className="text-xs font-medium text-text-secondary">{FEELING_NAME[f]}</span>
            <VerdictChip f={f} c={c} />
          </div>
          <div className="flex flex-col gap-0.5" aria-hidden="true">
            <PairBar f={f} value={c.avg} did thin={thin} />
            <PairBar f={f} value={c.other ?? c.rawOther} did={false} thin={thin} />
          </div>
        </div>
      );
    })}
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 [&>span]:text-[11px]">
      <Swatch style={{ backgroundColor: 'var(--tm-text-secondary)' }} label="Top, solid: days you did it" />
      <Swatch style={{ backgroundColor: 'var(--tm-text-secondary)', opacity: 0.35 }} label="Bottom, faded: days you didn’t" />
      <Swatch style={HATCH_SWATCH} label={`Striped: under ${TAG_MIN_SIDE} days on a side, too few to tell`} />
    </div>
  </div>
);

interface ReportTagKindsProps {
  /** The period's check-in days, oldest first. */
  days: TagDay[];
  counts: { byDay: Map<string, Map<string, KindCounts>>; tags: Map<string, FeelingTag> };
  period: ReportPeriod;
  scopeLabel: string;
  widen?: { label: string; onClick: () => void };
  wide: boolean;
}

/**
 * Graph 2, "By kind of activity": pick one of your tags, then a line per
 * kind of activity (tasks, notes, habits, events) says what went with doing
 * more of it — "Doing more COMM 103 tasks is linked to more stress" — only
 * when the difference is clear, else "No clear difference". Tapping a line
 * opens its bars: the days you did it against the days you didn't, in the
 * check-in's words.
 */
const ReportTagKinds: React.FC<ReportTagKindsProps> = ({ days, counts, period, scopeLabel, widen, wide }) => {
  const seedKey = `${toLocalDateStr(period.start)}|${toLocalDateStr(period.end)}`;
  const tags = useMemo(() => kindTags(days, counts.byDay, counts.tags).slice(0, MAX_CHART_TAGS), [days, counts]);
  const { fallback, found } = useMemo(() => {
    const found = new Map<string, KindComparison[]>();
    const fallback = defaultKindTag(tags, key => {
      const rows = analyseTagKinds(days, counts.byDay, key, seedKey);
      found.set(key, rows);
      return rows;
    });
    return { fallback, found };
  }, [tags, days, counts, seedKey]);
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<ActivityKind | null>(null);

  const week = period.kind === 'week';
  const tagKey = tags.some(t => t.tag.key === picked) ? picked! : fallback;
  const tag = tags.find(t => t.tag.key === tagKey)?.tag ?? null;
  const rows = useMemo(
    () => (tagKey ? found.get(tagKey) ?? analyseTagKinds(days, counts.byDay, tagKey, seedKey) : []),
    [tagKey, found, days, counts, seedKey],
  );

  return (
    <>
      {week && (
        <Notice action={widen}>
          A week is too short to tell anything from chance. Comparisons need {TAG_MIN_SIDE} days on each side.
        </Notice>
      )}
      {!tag ? (
        <p className="text-xs sm:text-sm text-text-muted italic py-2">
          Tag your tasks, notes, habits and events and, once a tag is on {TAG_MIN_SIDE} days with a check-in, this shows how you felt on days with more of each.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 [@media(max-height:760px)]:gap-1" role="group" aria-label="Tag to break down">
            {tags.map(t => (
              <button
                key={t.tag.key}
                type="button"
                aria-pressed={t.tag.key === tag.key}
                onClick={() => {
                  setPicked(t.tag.key);
                  setOpen(null);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 [@media(max-height:760px)]:py-0 rounded-full border text-xs ${
                  t.tag.key === tag.key ? 'border-accent bg-accent-subtle font-semibold text-text-primary' : 'border-border text-text-secondary hover:bg-surface-raised'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.tag.color || 'var(--tm-pencil)' }} aria-hidden="true" />
                {t.tag.name}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-text-muted">
            <b style={{ color: EASIER_COLOR }}>Blue</b> is easier on you, <b style={{ color: HARDER_COLOR }}>brick</b> harder. Tap a line to see its bars.
          </p>

          <ul className="flex flex-col gap-1 [@media(max-height:760px)]:gap-0">
            {rows.map(o => {
              const line = describeKind(o, tag.name, scopeLabel);
              const isOpen = open === o.kind && !o.none;
              const [did, didnt] = o.none ? ['', ''] : kindSides(o, null);
              return (
                <li key={o.kind} data-kind={o.kind} className={`rounded-lg ${isOpen ? 'bg-surface-raised' : ''}`}>
                  <button
                    type="button"
                    disabled={o.none}
                    aria-expanded={o.none ? undefined : isOpen}
                    onClick={() => setOpen(isOpen ? null : o.kind)}
                    className="w-full text-left rounded-lg px-2 py-1.5 [@media(max-height:760px)]:py-1 enabled:hover:bg-surface-raised disabled:cursor-default"
                  >
                    <span className="flex items-baseline gap-2">
                      <b className="w-12 shrink-0 text-xs font-semibold text-text-secondary">{KIND_NAME[o.kind]}</b>
                      <span data-tone={line.tone} className={`flex-1 text-sm leading-snug ${line.tone === 'clear' ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>
                        {line.tone === 'clear' ? (
                          <>
                            {line.lead}{' '}
                            {line.effects.map((e, i) => (
                              <React.Fragment key={e.feeling}>
                                {i > 0 && (i === line.effects.length - 1 ? ' and ' : ', ')}
                                <b style={{ color: e.good ? EASIER_COLOR : HARDER_COLOR }}>{e.words}</b>
                              </React.Fragment>
                            ))}
                          </>
                        ) : line.text}
                      </span>
                      {!o.none && <ChevronDown className={`w-3.5 h-3.5 shrink-0 self-center text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
                    </span>
                    {!o.none && (
                      <span className="block pl-14 text-[11px] text-text-muted">
                        {did}: <b className="text-text-secondary">{o.moreDays}</b> · {didnt}: <b className="text-text-secondary">{o.lessDays}</b>
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-2 pb-2">
                      <KindPairs o={o} tagName={tag.name} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <Footnote wide={wide}>
            Each line compares the days you did that kind of {tag.name} activity with the days you didn’t: tasks you finished, notes you edited,
            habits you checked off and events on your calendar, each carrying {tag.name}. “Usually Good” means your check-ins on those days were
            Good on average (mood Rough to Great, energy Drained to Charged, stress Calm to Maxed). Only days with a check-in count; work days are
            compared with work days and days off with days off, and each side needs at least {TAG_MIN_SIDE} days. Shows what went together, not what
            caused it.
          </Footnote>
        </>
      )}
    </>
  );
};

export default ReportTagKinds;
