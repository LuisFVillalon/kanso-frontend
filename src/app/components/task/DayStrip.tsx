'use client';

import React, { useRef } from 'react';
import type { DayChoice, PlanRange } from '@/app/utils/slotSuggest';
import { clock, dayChip, dayLong, lengthText, shortLength } from '@/app/utils/slotLabels';

/** The strip's selection: the best times overall, or one day ("YYYY-MM-DD"). */
export type DayPick = 'best' | string;

interface DayStripProps {
  /** Each day from today to the deadline, from `dayList`. */
  days: DayChoice[];
  /** How many times "Best" offers. */
  bestCount: number;
  selected: DayPick;
  onSelect: (pick: DayPick) => void;
  today: string;
  due: PlanRange;
  /** The task's length, for "no free 1 hr". */
  len: number;
  /** Extra classes on the scroller, such as a bleed to the panel's edge on a phone. */
  className?: string;
}

/** "Friday, Nov 13: 3 hr free", "Saturday, Nov 14: rest day", "…: no free 1 hr", with ", due 10:00 AM" on the due day. */
function chipLabel(d: DayChoice, today: string, due: PlanRange, len: number): string {
  const name = `${d.date === today ? 'Today, ' : ''}${dayLong(d.date)}`;
  const what = d.off ? 'rest day' : d.fits ? `${lengthText(d.free)} free` : `no free ${lengthText(len)}`;
  const dueAt = d.due ? (due.due.min >= 24 * 60 ? ', due' : `, due ${clock(due.due.min)}`) : '';
  return `${name}: ${what}${dueAt}`;
}

/**
 * "Which day": a "Best" chip, then one chip per day up to the deadline with
 * its free time, as a radio group. A day the task doesn't fit is disabled and
 * skipped by the arrow keys; the due day has a "Due" flag, and a rule after
 * the last chip marks the deadline.
 */
const DayStrip: React.FC<DayStripProps> = ({ days, bestCount, selected, onSelect, today, due, len, className = '' }) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const options: { pick: DayPick; enabled: boolean }[] = [
    { pick: 'best', enabled: true },
    ...days.map(d => ({ pick: d.date, enabled: d.fits })),
  ];
  const current = Math.max(0, options.findIndex(o => o.pick === selected));

  const go = (i: number) => {
    onSelect(options[i].pick);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const enabled = options.flatMap((o, i) => (o.enabled ? [i] : []));
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled.find(i => i > current) ?? enabled[0];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = [...enabled].reverse().find(i => i < current) ?? enabled[enabled.length - 1];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    go(next);
  };

  const endLabel = due.hasDue && due.until === due.due.date ? 'due' : `${days.length} days`;

  return (
    <div className={`overflow-x-auto scrollbar-none ${className}`} data-day-strip>
      <div role="radiogroup" aria-label="Which day" onKeyDown={onKeyDown} className="flex items-stretch gap-1.5 w-max pt-2 pb-1 pr-1">
        {options.map((o, i) => {
          const on = i === current;
          const d = i === 0 ? null : days[i - 1];
          const top = d ? dayChip(d.date, today) : 'Best';
          const bottom = d ? (d.off ? 'Off' : shortLength(d.free)) : `${bestCount} ${bestCount === 1 ? 'time' : 'times'}`;
          const style: React.CSSProperties = on
            ? { backgroundColor: 'var(--tm-accent)', borderColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }
            : o.enabled
              ? { backgroundColor: 'var(--tm-surface)', borderColor: 'var(--tm-border)' }
              : { backgroundColor: 'transparent', borderColor: 'var(--tm-border)', borderStyle: 'dashed' };
          return (
            <button
              key={o.pick}
              ref={el => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d ? chipLabel(d, today, due, len) : `Best times: ${bottom}`}
              disabled={!o.enabled}
              tabIndex={on ? 0 : -1}
              onClick={() => go(i)}
              data-day-chip={o.pick}
              className="relative flex-shrink-0 min-w-[58px] rounded-[10px] border px-2 py-1 text-center transition-colors enabled:hover:border-[var(--tm-accent)] disabled:cursor-not-allowed"
              style={style}
            >
              <span className={`block text-[12.5px] font-semibold leading-tight whitespace-nowrap ${on ? '' : o.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
                {top}
              </span>
              <span
                className="block text-[11px] leading-tight whitespace-nowrap"
                style={{ color: on ? 'var(--tm-accent-text)' : d && o.enabled ? 'var(--tm-success-text)' : 'var(--tm-text-muted)' }}
              >
                {bottom}
              </span>
              {d?.due && (
                <span
                  aria-hidden
                  className="absolute -top-2 -right-1.5 rounded-full px-1 text-[9.5px] font-bold leading-[14px]"
                  style={{ backgroundColor: 'var(--tm-due)', color: '#fff' }}
                >
                  Due
                </span>
              )}
            </button>
          );
        })}
        <span aria-hidden className="flex-shrink-0 flex items-center gap-1 pl-0.5">
          <span className="w-0.5 self-stretch rounded-full" style={{ backgroundColor: 'var(--tm-due)' }} />
          <span className="text-[10.5px] font-semibold whitespace-nowrap" style={{ color: 'var(--tm-due-text)' }}>{endLabel}</span>
        </span>
      </div>
    </div>
  );
};

export default DayStrip;
