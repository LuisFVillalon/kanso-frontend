'use client';

import React, { useMemo, useState } from 'react';
import { Check, Clock } from 'lucide-react';
import {
  dayBest, dayList, nudge, relength, slotReason,
  type Edge, type FreeDay, type PlanRange, type Slot, type SlotState,
} from '@/app/utils/slotSuggest';
import { clock, dayInSentence, dayLong, dayName, lengthText, shortLength, timeRange } from '@/app/utils/slotLabels';
import { pickKey, samePick, togglePicks, type PlanPick } from '@/app/utils/workBlockPlans';
import DayStrip, { type DayPick } from './DayStrip';

interface SlotRowProps {
  on: boolean;
  onClick: () => void;
  day: React.ReactNode;
  time: React.ReactNode;
  pill?: string;
  reason?: string;
  icon?: React.ReactNode;
  /** Lets a long time (a split plan's pieces) wrap instead of running past the row. */
  wrapTime?: boolean;
}

/** One suggested time as a toggle row: a check, the day and time, an optional pill, and why it's offered. */
export const SlotRow: React.FC<SlotRowProps> = ({ on, onClick, day, time, pill, reason, icon, wrapTime }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    data-slot-row
    className="w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--tm-accent-subtle)]"
    style={{
      borderColor: on ? 'var(--tm-accent)' : 'var(--tm-border)',
      backgroundColor: on ? 'var(--tm-accent-subtle)' : 'var(--tm-surface)',
    }}
  >
    <span
      aria-hidden
      className="w-4 h-4 flex-shrink-0 rounded-full border flex items-center justify-center"
      style={{ borderColor: on ? 'var(--tm-accent)' : 'var(--tm-border-strong)', backgroundColor: on ? 'var(--tm-accent)' : 'transparent' }}
    >
      {on && <Check className="w-3 h-3" style={{ color: 'var(--tm-accent-text)' }} />}
    </span>
    <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="inline-flex items-center gap-1 font-semibold text-text-primary whitespace-nowrap">{icon}{day}</span>
      <span className={`text-text-primary ${wrapTime ? 'min-w-0' : 'whitespace-nowrap'}`}>{time}</span>
      {pill && (
        <span
          className="rounded-full px-1.5 text-[10.5px] font-bold"
          style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
        >
          {pill}
        </span>
      )}
      {reason && <span className="basis-full sm:basis-auto text-xs text-text-muted">{reason}</span>}
    </span>
  </button>
);

/** The block lengths the tune bar offers, in minutes; the task's own length joins them when it's none of these. */
const LENGTHS = [30, 60, 90, 120];
/** How far Earlier/Later move a picked time. */
const NUDGE_MINUTES = 30;

/** "Library shift ends at 5:00 PM", "it's already past then": why a picked time can't move further. */
function edgeWords(e: Edge, side: 'earlier' | 'later'): string {
  const at = clock(e.at);
  switch (e.kind) {
    case 'event':
    case 'habit':
      return `${e.title} ${side === 'earlier' ? 'ends' : 'starts'} at ${at}`;
    case 'now': return "it's already past then";
    case 'due': return `it's due at ${at}`;
    case 'workStart': return `your work day starts at ${at}`;
    case 'workEnd': return `your work day ends at ${at}`;
    case 'block': return `another planned time ${side === 'earlier' ? 'ends' : 'starts'} at ${at}`;
    default: return 'that time is held for a habit or a task due sooner';
  }
}

interface TuneBarProps {
  pick: PlanPick;
  /** The task's own length. */
  taskLen: number;
  label: string;
  state: SlotState;
  days: FreeDay[];
  range: PlanRange;
  /** The form's other picks, which the time keeps off. */
  others: PlanPick[];
  onChange: (next: PlanPick) => void;
}

/** Under a picked row: move it 30 minutes earlier or later inside its free time, or change its length there. */
const TuneBar: React.FC<TuneBarProps> = ({ pick, taskLen, label, state, days, range, others, onChange }) => {
  const earlier = nudge(state, days, pick, -NUDGE_MINUTES, range, others);
  const later = nudge(state, days, pick, NUDGE_MINUTES, range, others);
  const len = pick.end - pick.start;
  const lengths = [...new Set([...LENGTHS, taskLen, len])].sort((a, b) => a - b);
  const early = earlier && 'blocked' in earlier ? edgeWords(earlier.blocked, 'earlier') : null;
  const late = later && 'blocked' in later ? edgeWords(later.blocked, 'later') : null;
  const why = early && early === late
    ? [`Can't go earlier or later: ${early}.`]
    : [early && `Can't go earlier: ${early}.`, late && `Can't go later: ${late}.`].filter(Boolean);
  const seg = 'px-2.5 py-1 font-semibold transition-colors';
  const move = (r: typeof earlier) => { if (r && 'pick' in r) onChange(r.pick); };
  const canMove = (r: typeof earlier) => !!r && 'pick' in r;

  return (
    <div className="mt-1.5 sm:ml-[26px] text-[12.5px]" data-tune-bar>
      <div role="group" aria-label={`Adjust ${label}`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex rounded-lg border border-border overflow-hidden" style={{ backgroundColor: 'var(--tm-surface)' }}>
          {([['‹ Earlier', '30 minutes earlier', earlier], ['Later ›', '30 minutes later', later]] as const).map(([text, aria, r], i) => (
            <button
              key={aria}
              type="button"
              aria-label={aria}
              aria-disabled={!canMove(r)}
              onClick={() => move(r)}
              className={`${seg} ${i ? 'border-l border-border' : ''} ${canMove(r) ? 'text-accent hover:bg-[var(--tm-accent-subtle)]' : 'text-text-muted cursor-not-allowed opacity-60'}`}
            >
              {text}
            </button>
          ))}
        </span>
        <span role="group" aria-label="Length" className="inline-flex flex-wrap rounded-lg border border-border overflow-hidden" style={{ backgroundColor: 'var(--tm-surface)' }}>
          {lengths.map((l, i) => {
            const next = relength(days, pick, l, others);
            const on = l === len;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                disabled={!on && !next}
                title={!on && !next ? `No free ${lengthText(l)} here` : undefined}
                aria-label={lengthText(l)}
                onClick={() => { if (!on && next) onChange(next); }}
                className={`${seg} ${i ? 'border-l border-border' : ''} disabled:cursor-not-allowed disabled:opacity-45`}
                style={on
                  ? { backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }
                  : { color: next ? 'var(--tm-text-secondary)' : 'var(--tm-text-muted)' }}
              >
                {shortLength(l)}
              </button>
            );
          })}
        </span>
      </div>
      {why.length > 0 && <p className="mt-1 text-xs text-text-muted">{why.join(' ')}</p>}
    </div>
  );
};

/** Where a picked time came from, once Earlier/Later or a length moved it. */
interface Moved {
  from: PlanPick;
  to: PlanPick;
}

const without = <T,>(rec: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));

interface SlotChooserProps {
  state: SlotState;
  /** The free days the suggestions came from (`suggest(...).days`). */
  days: FreeDay[];
  range: PlanRange;
  len: number;
  today: string;
  /** "Best": the suggested times. When empty, `empty` shows instead of the strip and rows. */
  best: Slot[];
  /** Labels the first "Best" row "Soonest". */
  soonest?: boolean;
  picks: PlanPick[];
  onPicksChange: (picks: PlanPick[]) => void;
  /** Picks the parent shows itself (a split plan, after work hours), so they aren't listed as "your pick". */
  shownElsewhere?: PlanPick[];
  /** Rows shown first in the group, such as the edit form's kept blocks. */
  before?: React.ReactNode;
  /** What shows when nothing fits. */
  empty?: React.ReactNode;
  /** The heading the rows' group is named by. */
  labelledBy?: string;
  /** Extra classes on the day strip's scroller. */
  stripClassName?: string;
}

/**
 * The suggested times with a "Which day" strip over them: "Best" shows the
 * suggestions, a day shows up to 3 spread-out times on it. Every picked row
 * gets Earlier/Later and length controls; a moved row keeps its place and
 * says where it came from. Picks no longer on screen stay as "your pick" rows.
 */
const SlotChooser: React.FC<SlotChooserProps> = ({
  state, days, range, len, today, best, soonest = true, picks, onPicksChange,
  shownElsewhere = [], before, empty, labelledBy, stripClassName,
}) => {
  const [day, setDay] = useState<DayPick>('best');
  const [moved, setMoved] = useState<Record<string, Moved>>({});
  const [announce, setAnnounce] = useState('');

  const choices = useMemo(() => dayList(state, days, len, range), [state, days, len, range]);
  // A day that no longer fits (other picks took its time) falls back to Best.
  const view = day !== 'best' && choices.some(c => c.date === day && c.fits) ? day : 'best';
  const shown = useMemo(() => (view === 'best' ? best : dayBest(days, view, len)), [view, best, days, len]);

  const picked = (p: PlanPick) => picks.some(x => samePick(x, p));
  // Moves whose time is still picked, by the key of the time they came from.
  const live = Object.entries(moved).filter(([, m]) => picked(m.to));
  const movedFrom = (p: PlanPick) => live.find(([, m]) => samePick(m.to, p));

  // Each row on screen and the pick it shows, if any.
  const shownKeys = new Set(shown.map(pickKey));
  const rows = shown.flatMap(s => {
    const own = moved[pickKey(s)];
    if (own && picked(own.to)) return [{ key: pickKey(s), slot: s, pick: own.to as PlanPick | null, from: own.from }];
    const m = movedFrom(s);
    if (m && shownKeys.has(m[0])) return []; // Its pick shows on the row it was moved from.
    return [{ key: m?.[0] ?? pickKey(s), slot: s, pick: picked(s) ? (s as PlanPick) : null, from: m?.[1].from }];
  });
  const onScreen = [...rows.flatMap(r => (r.pick ? [r.pick] : [])), ...shownElsewhere];
  const custom = picks.filter(p => !onScreen.some(x => samePick(x, p)));

  const select = (d: DayPick) => {
    setDay(d);
    setAnnounce(d === 'best' ? 'Showing the best times' : `Showing ${dayLong(d)}`);
  };

  const unpick = (p: PlanPick) => {
    onPicksChange(picks.filter(x => !samePick(x, p)));
    const m = movedFrom(p);
    if (m) setMoved(prev => without(prev, m[0]));
  };

  const replace = (cur: PlanPick, next: PlanPick) => {
    onPicksChange(picks.map(x => (samePick(x, cur) ? next : x)));
    const m = movedFrom(cur);
    const from = m ? m[1].from : cur;
    const key = m ? m[0] : pickKey(cur);
    setMoved(prev => (samePick(from, next) ? without(prev, key) : { ...prev, [key]: { from, to: next } }));
    setAnnounce(`Moved to ${timeRange(next.start, next.end)}`);
  };

  const reasonFor = (p: PlanPick, from: PlanPick | undefined, fallback: string) => {
    if (!from) return fallback;
    const l = p.end - p.start;
    return `moved from ${clock(from.start)}${l !== from.end - from.start ? `, ${lengthText(l)}` : ''}`;
  };

  const tune = (p: PlanPick) => (
    <TuneBar
      pick={p}
      taskLen={len}
      label={`${dayName(p.date, today)} ${timeRange(p.start, p.end)}`}
      state={state}
      days={days}
      range={range}
      others={picks.filter(x => !samePick(x, p))}
      onChange={next => replace(p, next)}
    />
  );

  const fewer = view !== 'best' && shown.length < 3;
  const dueThatDay = range.hasDue && view === range.due.date && range.due.min < 24 * 60;

  return (
    <>
      {best.length > 0 && (
        <DayStrip
          days={choices}
          bestCount={best.length}
          selected={view}
          onSelect={select}
          today={today}
          due={range}
          len={len}
          className={stripClassName}
        />
      )}
      <div className="flex flex-col gap-1.5" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Suggested times'}>
        {before}
        {best.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label={view === 'best' ? 'Suggested times' : `Times ${dayInSentence(view, today)}`}>
            {rows.map(({ key, slot, pick, from }, i) => {
              const p = pick ?? slot;
              return (
                <li key={key}>
                  <SlotRow
                    on={!!pick}
                    onClick={() => (pick ? unpick(pick) : onPicksChange(togglePicks(picks, [slot])))}
                    day={dayName(p.date, today)}
                    time={timeRange(p.start, p.end)}
                    pill={view === 'best' && soonest && i === 0 ? 'Soonest' : undefined}
                    reason={reasonFor(p, from, slotReason(slot, state, range.hasDue ? range.due : null, clock))}
                  />
                  {pick && tune(pick)}
                </li>
              );
            })}
          </ul>
        ) : empty}
        {best.length > 0 && fewer && (
          <p className="text-xs text-text-muted">
            That&apos;s all the free time {dayInSentence(view, today)}
            {dueThatDay ? ` before it's due at ${clock(range.due.min)}` : ''}.
          </p>
        )}
        {custom.map(p => {
          const m = movedFrom(p);
          return (
            <div key={`custom-${m?.[0] ?? pickKey(p)}`}>
              <SlotRow
                on
                onClick={() => unpick(p)}
                icon={<Clock className="w-3.5 h-3.5" aria-hidden />}
                day={dayName(p.date, today)}
                time={timeRange(p.start, p.end)}
                reason={reasonFor(p, m?.[1].from, 'your pick')}
              />
              {tune(p)}
            </div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </>
  );
};

export default SlotChooser;
