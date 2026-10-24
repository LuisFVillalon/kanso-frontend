'use client';

import React from 'react';
import { Cloud, CloudSun, Hourglass, Sun } from 'lucide-react';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import { MOOD_LABELS } from '@/app/types/mood';
import type { AnswerKind, SplitSides } from '@/app/utils/calendarReport';
import { useMeasuredWidth } from './ReportMoodRelationChart';

/** Each answer's colour, from the mood palette: "lower" is the Low mood's amber, never a warning red. */
export const ANSWER_COLOR: Record<AnswerKind, string> = {
  higher: 'var(--tm-mood-4)',
  lower: 'var(--tm-mood-2)',
  same: 'var(--tm-mood-3)',
  wait: 'var(--tm-text-muted)',
};

const ANSWER_ICON: Record<AnswerKind, typeof Sun> = { higher: Sun, lower: Cloud, same: CloudSun, wait: Hourglass };

/** Sun, cloud, sun behind a cloud or an hourglass: which way mood went, never whether that's good. */
export const AnswerIcon: React.FC<{ kind: AnswerKind; className?: string }> = ({ kind, className }) => {
  const Icon = ANSWER_ICON[kind];
  return <Icon className={className} style={{ color: ANSWER_COLOR[kind] }} aria-hidden="true" />;
};

// MoodFace's mouth per mood as end y, control y and end x, so a face can sit between two moods.
const MOUTH: Record<number, [number, number, number]> = {
  1: [16.6, 12.6, 8],
  2: [16, 14.2, 8.4],
  3: [15.3, 15.3, 8.5],
  4: [14.2, 18, 8],
  5: [13.4, 19.6, 7.6],
};

/** A mood average's colour, blended between the two nearest moods. */
export const blendedMoodColor = (average: number): string => {
  const m = Math.max(1, Math.min(5, average));
  const lo = Math.floor(m);
  const f = m - lo;
  return f < 0.01 ? moodColor(lo) : `color-mix(in oklab, ${moodColor(Math.min(5, lo + 1))} ${Math.round(f * 100)}%, ${moodColor(lo)})`;
};

/** A mood average in words, to the nearest half: "Okay", "Low–Okay". */
export const moodWords = (average: number): string => {
  const h = Math.round(average * 2) / 2;
  return Number.isInteger(h) ? MOOD_LABELS[h - 1] : `${MOOD_LABELS[Math.floor(h) - 1]}–${MOOD_LABELS[Math.ceil(h) - 1]}`;
};

/** MoodFace's paths for any average from 1 to 5, the mouth between the two nearest moods. */
const BlendedFacePaths: React.FC<{ average: number }> = ({ average }) => {
  const m = Math.max(1, Math.min(5, average));
  const lo = Math.floor(m);
  const hi = Math.min(5, lo + 1);
  const f = m - lo;
  const [ey, cy, ex] = MOUTH[lo].map((v, i) => v + (MOUTH[hi][i] - v) * f);
  const open = m >= 4.6;
  return (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity={0.14} />
      <circle cx="9" cy="9.6" r="0.6" fill="currentColor" />
      <circle cx="15" cy="9.6" r="0.6" fill="currentColor" />
      <path
        d={`M${ex.toFixed(2)} ${ey.toFixed(2)} Q12 ${cy.toFixed(2)} ${(24 - ex).toFixed(2)} ${ey.toFixed(2)}${open ? ' Z' : ''}`}
        {...(open ? { fill: 'currentColor', fillOpacity: 0.9 } : {})}
      />
    </>
  );
};

const FACE = 36;

/** The line's faint Rough→Great grid and the box around it. */
const LineFrame: React.FC<{ label: string; children: (frame: { width: number; height: number; x0: number; x1: number; yOf: (m: number) => number }) => React.ReactNode }> = ({ label, children }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const narrow = width < 480;
  const height = narrow ? 124 : 140;
  const x0 = narrow ? 64 : Math.min(140, width * 0.18);
  const top = 18;
  const bottom = height - 40;
  const yOf = (m: number) => top + ((5 - m) / 4) * (bottom - top);
  return (
    <div className="rounded-lg bg-surface-raised px-2.5 pt-2 pb-1.5">
      <div ref={ref}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img" aria-label={label}>
          {[1, 2, 3, 4, 5].map(m => (
            <line key={m} x1={34} x2={width - 4} y1={yOf(m)} y2={yOf(m)} stroke="var(--tm-rule)" strokeDasharray="2 4" />
          ))}
          <text x={0} y={yOf(5) + 4} fontSize={10} fill="var(--tm-text-muted)">Great</text>
          <text x={0} y={yOf(1) + 4} fontSize={10} fill="var(--tm-text-muted)">Rough</text>
          {children({ width, height, x0, x1: width - x0, yOf })}
        </svg>
      </div>
    </div>
  );
};

/**
 * The answer as one line: typical mood on the lighter days at one end and
 * on the busier days at the other, over a faint Rough→Great grid. Only a
 * higher or lower answer slopes, each end a face; "about the same" is flat
 * at your usual mood with a sun behind a cloud at each end, so the picture
 * never says more than the answer.
 */
export const MoodLine: React.FC<{ kind: 'higher' | 'lower' | 'same'; sides: SplitSides; lowAverage: number; highAverage: number }> = ({ kind, sides, lowAverage, highAverage }) => {
  const same = kind === 'same';
  const usual = (lowAverage * sides.lowDays + highAverage * sides.highDays) / (sides.lowDays + sides.highDays);
  const label = same
    ? `Typical mood: about the same, ${moodWords(usual)}, on days with ${sides.low} and on days with ${sides.high}`
    : `Typical mood: ${moodWords(lowAverage)} on days with ${sides.low}, ${moodWords(highAverage)} on days with ${sides.high}`;
  return (
    <LineFrame label={label}>
      {({ height, x0, x1, yOf }) => {
        const ya = yOf(same ? usual : lowAverage);
        const yb = yOf(same ? usual : highAverage);
        const end = (x: number, y: number, average: number, text: string, days: number) => (
          <g>
            <g transform={`translate(${x - FACE / 2} ${y - FACE / 2})`} style={{ color: same ? ANSWER_COLOR.same : blendedMoodColor(average) }}>
              <rect width={FACE} height={FACE} rx={FACE / 2} fill="var(--tm-surface-raised)" />
              {same ? (
                <CloudSun x={7} y={7} width={FACE - 14} height={FACE - 14} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <svg width={FACE} height={FACE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <BlendedFacePaths average={average} />
                </svg>
              )}
            </g>
            <text x={x} y={height - 20} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--tm-text-primary)">{text}</text>
            <text x={x} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--tm-text-muted)">{days} {days === 1 ? 'day' : 'days'}</text>
          </g>
        );
        return (
          <>
            <line x1={x0} y1={ya} x2={x1} y2={yb} stroke="var(--tm-text-primary)" strokeOpacity={0.85} strokeWidth={2.6} strokeLinecap="round" />
            {end(x0, ya, lowAverage, sides.low, sides.lowDays)}
            {end(x1, yb, highAverage, sides.high, sides.highDays)}
          </>
        );
      }}
    </LineFrame>
  );
};

/** In place of the line while it "can't tell yet": a dashed, level placeholder with an hourglass, no slope. */
export const MoodLinePlaceholder: React.FC = () => (
  <LineFrame label="No line yet: not enough to compare">
    {({ width, x0, x1, yOf }) => {
      const y = yOf(3);
      return (
        <>
          <line x1={x0} x2={x1} y1={y} y2={y} stroke="var(--tm-text-muted)" strokeWidth={2.6} strokeDasharray="6 8" strokeLinecap="round" />
          <g transform={`translate(${width / 2 - FACE / 2} ${y - FACE / 2})`} style={{ color: ANSWER_COLOR.wait }}>
            <rect width={FACE} height={FACE} rx={FACE / 2} fill="var(--tm-surface-raised)" />
            <Hourglass x={9} y={9} width={FACE - 18} height={FACE - 18} strokeWidth={1.8} aria-hidden="true" />
          </g>
        </>
      );
    }}
  </LineFrame>
);
