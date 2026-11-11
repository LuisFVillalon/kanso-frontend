'use client';

import React from 'react';
import type { EventOccurrence } from '@/app/types/event';
import type { WorkBlock } from '@/app/types/workBlock';
import { eventColor } from '@/app/utils/events';
import { occurrenceSpanOn, takesTime } from '@/app/utils/eventOccurrences';
import { rawGaps, subtract, SLOT_STEP, type FreeDay, type PlanRange, type Slot, type SlotState, type Span } from '@/app/utils/slotSuggest';
import { blockSpan } from '@/app/hooks/useSlotPlanner';
import { clock, dayShort, timeRange } from '@/app/utils/slotLabels';
import { parseLocalDate } from '@/app/utils/dateUtils';
import { samePick, type PlanPick } from '@/app/utils/workBlockPlans';

/** Free time on the strip: a soft green. */
const FREE_BG = 'color-mix(in srgb, var(--tm-success) 22%, var(--tm-surface))';
/** Time held for habits and tasks due sooner: hatched. */
const HELD_BG = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--tm-text-muted) 22%, transparent) 0 3px, transparent 3px 7px)';
const PLAN_TINT = 'color-mix(in srgb, var(--tm-accent) 30%, var(--tm-surface))';

interface FreeTimeStripProps {
  state: SlotState;
  /** Free days after the holds, from today to the end of the range. */
  days: FreeDay[];
  range: PlanRange;
  /** The block length to place. */
  len: number;
  /** The suggested rows, numbered 1–3 on the strip. */
  slots: Slot[];
  picks: PlanPick[];
  events: EventOccurrence[];
  workBlocks: WorkBlock[];
  today: string;
  /** A suggestion or a free time was tapped: add a block there. */
  onPlace: (pick: PlanPick) => void;
}

/**
 * Each work day up to the deadline as one bar from the window's start to its
 * end: events in their tag colors, kept blocks, time held for habits and tasks
 * due sooner (hatched), free time (green), the numbered suggestions and a due
 * line. Tapping a number places the block there; tapping free time places it
 * at that time, on the 15-minute grid and inside that free gap. The rows above
 * list the same suggestions for screen readers.
 */
const FreeTimeStrip: React.FC<FreeTimeStripProps> = ({
  state, days, range, len, slots, picks, events, workBlocks, today, onPlace,
}) => {
  const workDays = days.filter(d => state.windowOn(d.date));
  if (workDays.length === 0) {
    return <p className="text-xs text-text-muted">No work days before it&apos;s due.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5" data-free-time-strip>
      {workDays.map(day => {
        const win = state.windowOn(day.date)!;
        const [from, to] = win;
        const pct = (m: number) => `${((Math.min(Math.max(m, from), to) - from) / (to - from)) * 100}%`;
        const width = (s: number, e: number) => `${((Math.min(e, to) - Math.max(s, from)) / (to - from)) * 100}%`;
        const before = rawGaps(state, day.date);
        const held: Span[] = day.gaps.reduce((spans, gap) => subtract(spans, gap), before);
        const dayEvents = events.flatMap(o => {
          const span = occurrenceSpanOn(o, day.date);
          return span && takesTime(o) && span.end > from && span.start < to ? [{ o, span }] : [];
        });
        const blocks = workBlocks.filter(b => b.date === day.date).map(b => ({ b, span: blockSpan(b) }));
        const isDueDay = range.hasDue && day.date === range.due.date && range.due.min < to;

        const placeIn = (gap: Span, at: number) => {
          const snapped = Math.round(at / SLOT_STEP) * SLOT_STEP;
          const end = Math.min(gap[1], Math.max(gap[0], snapped) + len);
          const start = Math.max(gap[0], end - len);
          onPlace({ date: day.date, start, end });
        };

        return (
          <div key={day.date} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
            <span className="text-[11px] font-semibold text-text-secondary truncate">
              {day.date === today ? 'Today' : parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <div
              className="relative h-7 rounded-md overflow-hidden border border-border-subtle"
              style={{ backgroundColor: 'var(--tm-surface)' }}
            >
              {held.map(([s, e]) => (
                <span key={`h${s}`} aria-hidden className="absolute inset-y-0" style={{ left: pct(s), width: width(s, e), background: HELD_BG }} />
              ))}
              {day.gaps.map(gap => (
                <button
                  key={`f${gap[0]}`}
                  type="button"
                  onClick={e => {
                    const box = e.currentTarget.getBoundingClientRect();
                    const ratio = box.width > 0 ? (e.clientX - box.left) / box.width : 0;
                    placeIn(gap, gap[0] + ratio * (gap[1] - gap[0]));
                  }}
                  className="absolute inset-y-0 hover:brightness-95 focus-visible:z-10"
                  style={{ left: pct(gap[0]), width: width(gap[0], gap[1]), backgroundColor: FREE_BG }}
                  aria-label={`Free ${dayShort(day.date, today)} ${timeRange(gap[0], gap[1])}: plan it from ${clock(gap[0])}`}
                  title={`Free ${timeRange(gap[0], gap[1])}`}
                />
              ))}
              {dayEvents.map(({ o, span }) => {
                const color = eventColor(o.tags);
                return (
                  <span
                    key={`e${o.event_id}-${o.occurrence_date}`}
                    aria-hidden
                    className="absolute inset-y-0.5 rounded-sm"
                    title={`${o.title}, ${timeRange(span.start, span.end)}`}
                    style={{
                      left: pct(span.start), width: width(span.start, span.end),
                      backgroundColor: `color-mix(in srgb, ${color} 35%, var(--tm-surface))`,
                      borderLeft: `2px solid ${color}`,
                    }}
                  />
                );
              })}
              {blocks.map(({ b, span }) => (
                <span
                  key={`b${b.id}`}
                  aria-hidden
                  className="absolute inset-y-0.5 rounded-sm"
                  title={`Work on ${b.title}, ${timeRange(span.start, span.end)}`}
                  style={{ left: pct(span.start), width: width(span.start, span.end), backgroundColor: PLAN_TINT }}
                />
              ))}
              {picks.filter(p => p.date === day.date).map(p => (
                <span
                  key={`p${p.start}`}
                  aria-hidden
                  data-strip-pick
                  className="absolute inset-y-0.5 rounded-sm pointer-events-none"
                  style={{ left: pct(p.start), width: width(p.start, p.end), backgroundColor: 'var(--tm-accent)', opacity: 0.8 }}
                />
              ))}
              {slots.map((s, i) => s.date === day.date && (
                <button
                  key={`s${i}`}
                  type="button"
                  onClick={() => onPlace({ date: s.date, start: s.start, end: s.end })}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shadow-sm z-10"
                  style={{
                    left: `calc(${pct(s.start)} + 10px)`,
                    backgroundColor: picks.some(p => samePick(p, s)) ? 'var(--tm-accent)' : 'var(--tm-surface)',
                    color: picks.some(p => samePick(p, s)) ? 'var(--tm-accent-text)' : 'var(--tm-accent)',
                    border: '1.5px solid var(--tm-accent)',
                  }}
                  aria-label={`Suggestion ${i + 1}: ${dayShort(s.date, today)} ${timeRange(s.start, s.end)}`}
                >
                  {i + 1}
                </button>
              ))}
              {isDueDay && (
                <span
                  aria-hidden
                  data-strip-due
                  className="absolute inset-y-0 w-0.5 z-10"
                  style={{ left: pct(range.due.min), backgroundColor: 'var(--tm-due, var(--tm-danger))' }}
                  title={`Due ${clock(range.due.min)}`}
                />
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted pl-[3.75rem]">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FREE_BG }} />Free</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: HELD_BG }} />Held for habits and tasks due sooner</span>
        <span>Tap a number or any free time.</span>
      </div>
    </div>
  );
};

export default FreeTimeStrip;
