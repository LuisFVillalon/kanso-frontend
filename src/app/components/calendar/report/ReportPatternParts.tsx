'use client';

import React from 'react';
import { Hourglass, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import { rowHas, patternNumbers, type AnswerKind, type PatternDay, type PatternRow } from '@/app/utils/patterns';
import { FEELING_WORDS, hash, type Feeling } from '@/app/utils/tagFeelings';
import { useMeasuredWidth, useShortWindow } from './useChartSize';
import { FEELING_COLOR } from './ReportTagFeelingsChart';

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

/** Where a 1–5 value sits across a track. */
const at = (v: number) => ((v - 1) / 4) * 100;

/** A row's small picture on 1–5: a tick at the other days' usual, a dot at the row's days, and the gap between. */
export const Dumbbell: React.FC<{ row: PatternRow; feeling: Feeling }> = ({ row, feeling }) => {
  const c = row.feel[feeling];
  const wait = row.answer[feeling].kind === 'wait';
  const color = wait ? 'var(--tm-text-muted)' : lineColor(feeling);
  return (
    <span className="relative block h-3.5" aria-hidden="true">
      <span className="absolute inset-x-0 top-[6px] h-0.5 rounded-full bg-border" />
      {c.avg != null && c.other != null && (
        <>
          <span
            className="absolute top-[6px] h-0.5"
            style={{
              left: `${Math.min(at(c.avg), at(c.other))}%`,
              width: `${Math.abs(at(c.avg) - at(c.other))}%`,
              background: wait ? `repeating-linear-gradient(90deg, ${color} 0 2px, transparent 2px 4px)` : color,
            }}
          />
          <span className="absolute top-0.5 bottom-0.5 w-[1.5px] -ml-px bg-text-primary" style={{ left: `${at(c.other)}%` }} />
          <span className="absolute top-[3px] w-2 h-2 -ml-1 rounded-full" style={{ left: `${at(c.avg)}%`, backgroundColor: color }} />
        </>
      )}
    </span>
  );
};
