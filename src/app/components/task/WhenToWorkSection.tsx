'use client';

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MoonStar, Split } from 'lucide-react';
import { AppShellContext } from '@/app/context/AppShellContext';
import type { WorkBlock } from '@/app/types/workBlock';
import type { SlotPlanner } from '@/app/hooks/useSlotPlanner';
import { blockSpan, minutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import { toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';
import {
  afterWorkHours, freeMinutesOn, planRange, splitFill, suggest, type PlanRange,
} from '@/app/utils/slotSuggest';
import { clock, dayName, dayShort, lengthText, timeRange } from '@/app/utils/slotLabels';
import { samePick, togglePicks, type PlanPick } from '@/app/utils/workBlockPlans';
import Callout from './Callout';
import SlotChooser, { SlotRow } from './SlotChooser';

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
 * per day, keeping off the due day while other days have room. A "Which day"
 * strip over them swaps in up to 3 times on any one day before the deadline.
 * Picking rows (any number) adds a block to the calendar for each when the
 * task saves, and a picked row can move 30 minutes earlier or later or change
 * its length inside its free time. When nothing fits it offers to split the
 * time or go past work hours.
 */
const WhenToWorkSection: React.FC<WhenToWorkSectionProps> = ({
  planner, dueDate, dueTime, estimatedHours, picks, onPicksChange, kept = [], removedKept, onToggleKept, error,
}) => {
  const shell = useContext(AppShellContext);
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
  const keptSpans = kept.map(b => ({ b, span: blockSpan(b) }));

  return (
    <div data-when-to-work>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-1">
        <span id="when-to-work-label" className="block text-sm font-medium text-text-secondary">
          When to work on it <span className="font-normal text-text-muted">(optional)</span>
        </span>
        {dueToday && (
          <span className="text-xs text-text-muted whitespace-nowrap ml-auto">Due today · {lengthText(freeMinutesOn(days, today))} free left</span>
        )}
      </div>

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

      <SlotChooser
        // A new due date or length starts over on Best, as the picks are cleared.
        key={inputs.key}
        state={state}
        days={days}
        range={range}
        len={len}
        today={today}
        best={slots}
        picks={picks}
        onPicksChange={onPicksChange}
        shownElsewhere={[...(split ?? []), ...(after ? [after] : [])]}
        labelledBy="when-to-work-label"
        stripClassName="-mx-6 px-6 sm:mx-0 sm:px-0 mb-1"
        before={keptSpans.map(({ b, span }) => (
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
        empty={(
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
                    wrapTime
                    time={split.map((p, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && ' + '}
                        <span className="whitespace-nowrap">{dayShort(p.date, today)} {timeRange(p.start, p.end)}</span>
                      </React.Fragment>
                    ))}
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
      />

      {error && <div className="mt-2">{error}</div>}
    </div>
  );
};

export default WhenToWorkSection;
