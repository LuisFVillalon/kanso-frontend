'use client';

import React, { useState } from 'react';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import type { MoodCheckin } from '@/app/types/mood';
import { moodLabel } from '@/app/types/mood';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { moodByTag, TAG_MIN_DAYS } from '@/app/utils/moodReport';

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
  return `On the ${days} ${days === 1 ? 'day' : 'days'} you picked “${tag}”, your mood averaged ${average.toFixed(1)} (${moodLabel(Math.round(average))}) — ${cmp} your usual ${usual.toFixed(1)}.`;
};

interface ReportCheckinTagsProps {
  byDay: Map<string, MoodCheckin>;
  period: ReportPeriod;
  /** Average mood over the period; null without a daily check-in. */
  average: number | null;
  /** Daily check-ins behind that average. */
  logged: number;
  scopeLabel: string;
}

/**
 * "Moments & mood", the Tags & moments card's check-in side: days with each moment
 * picked when checking in compared with your usual, as a bar from a labeled
 * center (your average mood over the period) toward lower or higher mood,
 * the moment's own mood as a face, and the signed difference.
 */
const ReportCheckinTags: React.FC<ReportCheckinTagsProps> = ({ byDay, period, average, logged, scopeLabel }) => {
  const rows = average == null ? [] : moodByTag(byDay, period.start, period.end);
  const usual = toTenth(average ?? 3);
  const [openTag, setOpenTag] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <p className="text-xs sm:text-sm text-text-muted italic py-2">
        Pick moments when you check in, and the ones you pick on at least {TAG_MIN_DAYS} days show up here, compared with your usual mood.
      </p>
    );
  }
  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 text-[11px] text-text-muted" aria-hidden="true">
        <span className="text-right">◀ lower mood</span>
        <span className="px-2 py-0.5 rounded-full bg-surface-raised font-semibold text-text-primary whitespace-nowrap">
          your usual {usual.toFixed(1)} · {moodLabel(Math.round(usual))}
        </span>
        <span>higher mood ▶</span>
      </div>
      <ul className="flex flex-col gap-2.5 [@media(max-height:760px)]:gap-1">
        {rows.map(row => {
          const tagAverage = toTenth(row.average);
          const d = tagAverage - usual;
          const half = Math.min(Math.abs(d) / TAG_DELTA_SPAN, 1) * 50;
          const mood = Math.round(tagAverage);
          const sentence = describeTagMood(row.tag, row.days, row.average, average!);
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
                <span className="w-24 [@media(max-height:760px)]:w-32 shrink-0 min-w-0 [@media(max-height:760px)]:flex [@media(max-height:760px)]:items-baseline [@media(max-height:760px)]:gap-1" aria-hidden="true">
                  <span className="block text-xs sm:text-sm text-text-primary truncate">{row.tag}</span>
                  <span className="block text-[11px] text-text-muted shrink-0">{row.days} {row.days === 1 ? 'day' : 'days'}</span>
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
        Your usual is your typical mood across all {logged} {logged === 1 ? 'check-in' : 'check-ins'} {scopeLabel}. Each bar is how days with that moment compared. Moments on fewer than {TAG_MIN_DAYS} days are hidden.
      </p>
    </>
  );
};

export default ReportCheckinTags;
