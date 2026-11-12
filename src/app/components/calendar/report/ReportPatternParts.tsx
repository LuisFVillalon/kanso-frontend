'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { Hourglass, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { rowHas, patternNumbers, type AnswerKind, type PatternDay, type PatternRow } from '@/app/utils/patterns';
import { FEELING_WORDS, hash, type Feeling } from '@/app/utils/tagFeelings';
import { useMeasuredWidth, useShortWindow } from './useChartSize';

/** Series colors as on Mood › Over time: mood in ink, energy accent, stress accent-2. */
export const FEELING_COLOR: Record<Feeling, string> = {
  mood: 'var(--tm-text-secondary)',
  energy: 'var(--tm-accent)',
  stress: 'var(--tm-accent-2)',
};

/** Each answer's colour, from the mood palette: "lower" is the Low mood's amber, never a warning red. */
export const ANSWER_COLOR: Record<AnswerKind, string> = {
  higher: 'var(--tm-mood-4)',
  lower: 'var(--tm-mood-2)',
  same: 'var(--tm-mood-3)',
  wait: 'var(--tm-text-muted)',
};

const ANSWER_ICON: Record<AnswerKind, typeof TrendingUp> = { higher: TrendingUp, lower: TrendingDown, same: Minus, wait: Hourglass };

/** A rising, falling or flat line, or an hourglass: which way a feeling went, never whether that's good. */
export const AnswerIcon: React.FC<{ kind: AnswerKind; className?: string }> = ({ kind, className }) => {
  const Icon = ANSWER_ICON[kind];
  return <Icon className={className} style={{ color: ANSWER_COLOR[kind] }} aria-hidden="true" />;
};

/** The icon in a soft round of its own colour, beside a big answer. */
export const AnswerBubble: React.FC<{ kind: AnswerKind; className?: string; iconClassName?: string }> = ({ kind, className = 'w-10 h-10 sm:w-11 sm:h-11', iconClassName = 'w-5 h-5 sm:w-6 sm:h-6' }) => (
  <span className={`${className} shrink-0 rounded-full grid place-items-center`} style={{ backgroundColor: `color-mix(in srgb, ${ANSWER_COLOR[kind]} 15%, transparent)` }}>
    <AnswerIcon kind={kind} className={iconClassName} />
  </span>
);

/** A feeling's line and dot colour: mood in ink, energy and stress in their Over time colours. */
export const lineColor = (f: Feeling) => (f === 'mood' ? 'var(--tm-text-primary)' : FEELING_COLOR[f]);

const unit = (s: string) => (hash(s) % 1000) / 1000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const capitalize = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/**
 * One row and feeling as a line: each day a faint dot on its side, the
 * other days' usual at one end and the row's days' average at the other,
 * over the feeling's own words (Rough…Great, Drained…Charged, Calm…Maxed).
 * "About the same" draws the real averages in a muted line, so the picture
 * shows the gap without calling it a finding; "can't tell yet" is a dashed,
 * level line with an hourglass.
 */
export const PatternLine: React.FC<{ row: PatternRow; feeling: Feeling; days: PatternDay[] }> = ({ row, feeling, days }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const short = useShortWindow();
  const c = row.feel[feeling];
  const kind = row.answer[feeling].kind;
  const narrow = width < 480;
  const height = short ? 112 : narrow ? 128 : 138;
  const padL = narrow ? 50 : 62;
  const top = 10;
  const bottom = height - 34;
  const x0 = padL + (width - padL) * 0.2;
  const x1 = padL + (width - padL) * 0.8;
  const yOf = (v: number) => top + ((5 - v) / 4) * (bottom - top);
  const words = FEELING_WORDS[feeling];
  const wait = kind === 'wait' || c.avg == null || c.other == null;
  const color = kind === 'same' ? 'var(--tm-text-muted)' : lineColor(feeling);
  const label = wait ? 'No line yet: not enough to compare' : patternNumbers(row, feeling);
  const room = Math.max(12, Math.floor(((x1 - x0) * 0.95) / 6.4));

  const dots = (side: PatternDay[], x: number, tag: string) =>
    side.flatMap(d => {
      const v = d[feeling];
      if (v == null) return [];
      const cx = x + (unit(d.day + tag) - 0.5) * (narrow ? 34 : 46);
      const cy = yOf(v) + (unit(`${d.day}y`) - 0.5) * 8;
      return [<circle key={d.day} cx={cx} cy={cy} r={3.2} fill={feeling === 'mood' ? moodColor(v) : FEELING_COLOR[feeling]} fillOpacity={0.4} />];
    });
  const end = (x: number, text: string, n: number) => (
    <g>
      <text x={x} y={height - 18} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--tm-text-secondary)">{clip(capitalize(text), room)}</text>
      <text x={x} y={height - 5} textAnchor="middle" fontSize={10.5} fill="var(--tm-text-muted)">{n} {n === 1 ? 'day' : 'days'}</text>
    </g>
  );

  return (
    <div className="rounded-lg bg-surface-raised px-2.5 pt-2 pb-1.5">
      <div ref={ref}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img" aria-label={label}>
          {[1, 2, 3, 4, 5].map(v => (
            <g key={v}>
              <line x1={padL} x2={width - 4} y1={yOf(v)} y2={yOf(v)} stroke="var(--tm-rule)" strokeDasharray="2 4" />
              {((!narrow && !short) || v === 1 || v === 5) && (
                <text x={padL - 8} y={yOf(v) + 4} textAnchor="end" fontSize={10.5} fill="var(--tm-text-muted)">{words[v - 1]}</text>
              )}
            </g>
          ))}
          {wait ? (
            <>
              <line x1={x0} x2={x1} y1={yOf(3)} y2={yOf(3)} stroke="var(--tm-text-muted)" strokeWidth={2.6} strokeDasharray="6 8" strokeLinecap="round" />
              <g transform={`translate(${(x0 + x1) / 2 - 14} ${yOf(3) - 14})`} style={{ color: ANSWER_COLOR.wait }}>
                <rect width={28} height={28} rx={14} fill="var(--tm-surface-raised)" />
                <Hourglass x={6} y={6} width={16} height={16} strokeWidth={1.8} aria-hidden="true" />
              </g>
            </>
          ) : (
            <>
              {dots(days.filter(d => !rowHas(row, d)), x0, 'a')}
              {dots(days.filter(d => rowHas(row, d)), x1, 'b')}
              <line x1={x0} y1={yOf(c.other!)} x2={x1} y2={yOf(c.avg!)} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
              <circle cx={x0} cy={yOf(c.other!)} r={5.5} fill="var(--tm-surface)" stroke={color} strokeWidth={2.4} />
              <circle cx={x1} cy={yOf(c.avg!)} r={5.5} fill="var(--tm-surface)" stroke={color} strokeWidth={2.4} />
            </>
          )}
          {end(x0, row.off, c.nOtherAll)}
          {end(x1, row.on, c.nAll)}
        </svg>
      </div>
    </div>
  );
};

/** A check-in value's colour on the mood palette; stress is turned over so Calm stays blue like a Great mood. */
export const levelColor = (f: Feeling, v: number) => `var(--tm-mood-${f === 'stress' ? 6 - v : v})`;

const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

interface StripDay {
  day: string;
  date: Date;
  value: number | null;
  /** Has a daily check-in, maybe without this feeling. */
  checked: boolean;
  /** On the row's "with it" side. */
  has: boolean;
  future: boolean;
}

/**
 * The period's days for one row and feeling: each check-in day in the
 * feeling's colour, days with the tag or moment bright and marked, other
 * days faded, days without a check-in outlined and days still to come
 * dotted. A month is one strip; a year a week-by-week grid, Monday first,
 * scrolled to its latest weeks when it's wider than the card.
 */
export const DayStrip: React.FC<{ row: PatternRow; feeling: Feeling; days: PatternDay[]; period: ReportPeriod; now?: Date }> = ({
  row, feeling, days, period, now = new Date(),
}) => {
  const byDay = new Map(days.map(d => [d.day, d]));
  const today = toLocalDateStr(now);
  const cells: StripDay[] = [];
  for (let d = period.start; d <= period.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const day = toLocalDateStr(d);
    const p = byDay.get(day);
    cells.push({ day, date: d, value: p?.[feeling] ?? null, checked: !!p, has: !!p && rowHas(row, p), future: day > today });
  }
  const year = period.kind === 'year';
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  const words = FEELING_WORDS[feeling];
  const title = (c: StripDay) =>
    `${dayLabel(c.date)}: ${c.future ? 'still to come' : !c.checked ? 'no check-in' : `${c.value == null ? `no ${feeling} logged` : words[c.value - 1]}${c.has ? ` · ${row.name}` : ''}`}`;
  const cellStyle = (c: StripDay): React.CSSProperties =>
    c.value != null
      ? {
        backgroundColor: levelColor(feeling, c.value),
        opacity: c.has ? 1 : 0.2,
        ...(year && c.has ? { outline: '1.5px solid var(--tm-text-primary)', outlineOffset: '0.5px', opacity: 1 } : {}),
      }
      : { border: `1px ${c.future ? 'dotted' : 'dashed'} var(--tm-border)` };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-raised p-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-muted" aria-hidden="true">
        {words.map((w, i) => (
          <span key={w} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: levelColor(feeling, i + 1) }} />{w}
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] opacity-20" style={{ backgroundColor: levelColor(feeling, 3) }} />day without it</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] border border-dashed border-border" />no check-in</span>
      </div>
      <div ref={scroller} role="img" aria-label={patternNumbers(row, feeling)} className={year ? 'overflow-x-auto pb-0.5' : ''}>
        {year ? (
          <div className="grid grid-flow-col grid-rows-7 auto-cols-[10px] gap-[2px] w-max p-[2px]" data-strip="year">
            {/* Monday-first rows: pad the first week up to the year's first day. */}
            {Array.from({ length: (period.start.getDay() + 6) % 7 }, (_, i) => <span key={`pad${i}`} />)}
            {cells.map(c => <span key={c.day} title={title(c)} className="block w-[10px] h-[10px] rounded-[2px]" style={cellStyle(c)} />)}
          </div>
        ) : (
          <div className="flex gap-[2px] pb-1.5" data-strip="month">
            {cells.map(c => (
              <span key={c.day} title={title(c)} className="relative flex-1 min-w-0 h-[14px] rounded-[3px]" style={cellStyle(c)}>
                {c.has && <span className="absolute left-1/2 -bottom-[5px] -ml-[2px] w-1 h-0.5 bg-text-primary" />}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
