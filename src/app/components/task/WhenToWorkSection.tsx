'use client';

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, MoonStar, Split } from 'lucide-react';
import { AppShellContext } from '@/app/context/AppShellContext';
import type { WorkBlock } from '@/app/types/workBlock';
import type { SlotPlanner } from '@/app/hooks/useSlotPlanner';
import { blockSpan, minutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import { toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';
import {
  afterWorkHours, freeMinutesOn, planRange, slotReason, splitFill, suggest,
  type PlanRange, type Slot, type SlotState,
} from '@/app/utils/slotSuggest';
import { clock, dayName, dayShort, lengthText, timeRange } from '@/app/utils/slotLabels';
import { pickKey, samePick, togglePicks, type PlanPick } from '@/app/utils/workBlockPlans';
import Callout from './Callout';
import FreeTimeStrip from './FreeTimeStrip';

/** Waits for `value` to settle for `ms` before passing it on, so typing a date doesn't recompute every keystroke. */
function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

const dateStr = (v: string | Date | null | undefined) => (v instanceof Date ? toLocalDateStr(v) : v || null);
const timeStr = (v: string | Date | null | undefined) => (v instanceof Date ? toLocalTimeStr(v) : v || null);

/** "Thu · 10:00 AM", "Thu" with no time, or "the next 7 days" without a due date. */
export function dueText(range: PlanRange, today: string): string {
  if (!range.hasDue) return 'the next 7 days';
  const day = dayShort(range.due.date, today);
  return range.due.min >= 24 * 60 ? day : `${day} · ${clock(range.due.min)}`;
}

/** The suggestion inputs for a task, from its form fields. Null when it can't have any (past due). */
export function usePlanInputs(planner: SlotPlanner | null, dueDate: string | Date | null | undefined, dueTime: string | Date | null | undefined, hours: number | null | undefined) {
  const settled = useSettled(`${dateStr(dueDate) ?? ''}|${timeStr(dueTime) ?? ''}|${hours ?? ''}`);
  return useMemo(() => {
    if (!planner) return null;
    const [d, t, h] = settled.split('|');
    const range = planRange(planner.state.now, d || null, minutesOf(t));
    if (!range) return null;
    return { range, len: planMinutes(h === '' ? null : Number(h)), key: settled };
  }, [planner, settled]);
}

interface SlotRowsProps {
  slots: Slot[];
  picks: PlanPick[];
  onToggle: (slot: Slot) => void;
  state: SlotState;
  range: PlanRange;
  today: string;
  /** Labels the first row "Soonest". */
  soonest?: boolean;
}

/** The suggested times as toggle rows: day, time, a "Soonest" pill on the first, and why it's offered. */
export const SlotRows: React.FC<SlotRowsProps> = ({ slots, picks, onToggle, state, range, today, soonest = true }) => (
  <ul className="flex flex-col gap-1.5" aria-label="Suggested times">
    {slots.map((s, i) => {
      const on = picks.some(p => samePick(p, s));
      const reason = slotReason(s, state, range.hasDue ? range.due : null, clock);
      return (
        <li key={pickKey(s)}>
          <SlotRow
            on={on}
            onClick={() => onToggle(s)}
            day={dayName(s.date, today)}
            time={timeRange(s.start, s.end)}
            pill={soonest && i === 0 ? 'Soonest' : undefined}
            reason={reason}
          />
        </li>
      );
    })}
  </ul>
);

interface SlotRowProps {
  on: boolean;
  onClick: () => void;
  day: React.ReactNode;
  time: string;
  pill?: string;
  reason?: string;
  icon?: React.ReactNode;
}

const SlotRow: React.FC<SlotRowProps> = ({ on, onClick, day, time, pill, reason, icon }) => (
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
      <span className="text-text-primary whitespace-nowrap">{time}</span>
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

interface WhenToWorkSectionProps {
  planner: SlotPlanner | null;
  dueDate: string | Date | null | undefined;
  dueTime: string | Date | null | undefined;
  /** "How long?", in hours; 30 minutes when skipped. */
  estimatedHours: number | null | undefined;
  picks: PlanPick[];
  onPicksChange: (picks: PlanPick[]) => void;
  /** Editing: the task's kept blocks from now on, shown picked; unpicking one marks it for removal. */
  kept?: WorkBlock[];
  removedKept?: Set<number>;
  onToggleKept?: (id: number) => void;
  /** Why saving the picked times failed, with what to do. */
  error?: React.ReactNode;
}

/**
 * "When to work on it": up to 3 free times before the task is due, after
 * events, today's habits and the tasks due sooner, ranked soonest first, one
 * per day, keeping off the due day while other days have room. Picking rows
 * (any number) adds a block to the calendar for each when the task saves;
 * "Other time…" opens the free-time strip to place one anywhere free. When
 * nothing fits it offers to split the time or go past work hours.
 */
const WhenToWorkSection: React.FC<WhenToWorkSectionProps> = ({
  planner, dueDate, dueTime, estimatedHours, picks, onPicksChange, kept = [], removedKept, onToggleKept, error,
}) => {
  const shell = useContext(AppShellContext);
  const [stripOpen, setStripOpen] = useState(false);
  const inputs = usePlanInputs(planner, dueDate, dueTime, estimatedHours);

  // The rows change with the due date and length, and so do the times picked from them.
  const inputKey = inputs?.key;
  const lastKey = useRef(inputKey);
  useEffect(() => {
    if (inputKey === lastKey.current) return;
    const had = lastKey.current !== undefined;
    lastKey.current = inputKey;
    if (had && picks.length) onPicksChange([]);
  }, [inputKey, picks.length, onPicksChange]);

  const result = useMemo(() => {
    if (!planner || !inputs) return null;
    const { slots, days } = suggest(planner.state, inputs.len, inputs.range);
    const split = slots.length ? null : splitFill(days, inputs.len);
    const after = slots.length ? null : afterWorkHours(planner.state, inputs.len, inputs.range);
    return { slots, days, split, after };
  }, [planner, inputs]);

  if (!planner || !inputs || !result) return null;
  const { state, today } = planner;
  const { range, len } = inputs;
  const { slots, days, split, after } = result;
  const dueToday = range.hasDue && range.due.date === today;
  const toggle = (p: PlanPick | PlanPick[]) => onPicksChange(togglePicks(picks, Array.isArray(p) ? p : [p]));
  // Picks that aren't one of the rows: placed on the strip, split pieces, after work hours.
  const listed = [...slots, ...(split ?? []), ...(after ? [after] : [])];
  const custom = picks.filter(p => !listed.some(s => samePick(s, p)));
  const keptSpans = kept.map(b => ({ b, span: blockSpan(b) }));

  return (
    <div data-when-to-work>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span id="when-to-work-label" className="block text-sm font-medium text-text-secondary">
          When to work on it <span className="font-normal text-text-muted">(optional)</span>
        </span>
        <span className="flex items-baseline gap-3 text-xs">
          {dueToday && (
            <span className="text-text-muted whitespace-nowrap">Due today · {lengthText(freeMinutesOn(days, today))} free left</span>
          )}
          <button
            type="button"
            onClick={() => setStripOpen(o => !o)}
            aria-expanded={stripOpen}
            className="font-semibold text-accent hover:underline whitespace-nowrap"
          >
            Other time…
          </button>
        </span>
      </div>
      <p className="text-xs text-text-muted mb-2">
        Free time before it&apos;s due, after your events, today&apos;s habits and tasks due sooner. Pick one or more; each adds a block to your calendar.
      </p>

      {!planner.workHoursSet && (
        <div className="mb-2">
          <Callout tone="info">
            You haven&apos;t set your work day, so these use 8 AM – 10 PM, Monday to Friday.{' '}
            {shell && (
              <button type="button" onClick={() => shell.openSettings('workday')} className="font-semibold text-accent hover:underline">
                Set work hours
              </button>
            )}
          </Callout>
        </div>
      )}

      <div className="flex flex-col gap-1.5" role="group" aria-labelledby="when-to-work-label">
        {keptSpans.map(({ b, span }) => (
          <SlotRow
            key={`kept-${b.id}`}
            on={!removedKept?.has(b.id)}
            onClick={() => onToggleKept?.(b.id)}
            day={dayName(b.date, today)}
            time={timeRange(span.start, span.end)}
            pill="Planned"
            reason={removedKept?.has(b.id) ? 'removed when you save' : 'on your calendar'}
          />
        ))}

        {slots.length > 0 && (
          <SlotRows slots={slots} picks={picks} onToggle={toggle} state={state} range={range} today={today} />
        )}

        {slots.length === 0 && (
          <Callout tone="warning">
            <span>No free {lengthText(len)} before {dueText(range, today)}.</span>
            {(split || after) && (
              <div className="mt-2 flex flex-col gap-1.5">
                {split && (
                  <SlotRow
                    on={split.every(p => picks.some(x => samePick(x, p)))}
                    onClick={() => toggle(split)}
                    icon={<Split className="w-3.5 h-3.5" aria-hidden />}
                    day="Split it"
                    time={split.map(p => `${dayShort(p.date, today)} ${timeRange(p.start, p.end)}`).join(' + ')}
                    reason={`${split.length} blocks`}
                  />
                )}
                {after && (
                  <SlotRow
                    on={picks.some(x => samePick(x, after))}
                    onClick={() => toggle(after)}
                    icon={<MoonStar className="w-3.5 h-3.5" aria-hidden />}
                    day="After work hours"
                    time={`${dayShort(after.date, today)} ${timeRange(after.start, after.end)}`}
                  />
                )}
              </div>
            )}
          </Callout>
        )}

        {custom.map(p => (
          <SlotRow
            key={`custom-${pickKey(p)}`}
            on
            onClick={() => toggle(p)}
            icon={<Clock className="w-3.5 h-3.5" aria-hidden />}
            day={dayName(p.date, today)}
            time={timeRange(p.start, p.end)}
            reason="your pick"
          />
        ))}
      </div>

      {stripOpen && (
        <div className="mt-3 rounded-lg border border-border p-3" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
          <FreeTimeStrip
            state={state}
            days={days}
            range={range}
            len={len}
            slots={slots}
            picks={picks}
            events={planner.events}
            workBlocks={planner.workBlocks}
            today={today}
            onPlace={p => { if (!picks.some(x => samePick(x, p))) onPicksChange([...picks, p]); }}
          />
        </div>
      )}

      {error && <div className="mt-2">{error}</div>}
    </div>
  );
};

export default WhenToWorkSection;
