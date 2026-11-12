'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import {
  checkHabitTime, habitGaps, habitReason, habitStarts,
  type HabitClash, type HabitTime, type SlotState,
} from '@/app/utils/slotSuggest';
import { clock, hhmm, lengthText, timeRange } from '@/app/utils/slotLabels';

/** A habit in the review: its length and the time it opens with (null when nothing fits). */
export interface ReviewRow {
  id: number;
  title: string;
  len: number;
  start: number | null;
  /** Ticked to plan it today; move mode ignores it. */
  on: boolean;
}

/** A row as it's planned or moved: its picked time and whether that differs from the one it opened with. */
export interface ReviewedTime {
  id: number;
  title: string;
  start: number;
  end: number;
  changed: boolean;
}

interface HabitPlanReviewProps {
  /** "plan" books the ticked habits; "move" moves planned ones. */
  mode: 'plan' | 'move';
  rows: ReviewRow[];
  /** The planner state, without the reviewed habits' own blocks today. */
  state: SlotState;
  /** The other habits' times today, outside the review: they stay where they are. */
  fixed: HabitTime[];
  /** The habit whose time field gets focus; the first one otherwise. */
  focusId: number | null;
  /** Below `sm`: a bottom sheet over the brief instead of a panel inside the card. */
  phone: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (rows: ReviewedTime[]) => void;
}

const clashText = (clash: HabitClash, title: string): string => {
  switch (clash.kind) {
    case 'past': return "That's already past.";
    case 'midnight': return `${title} would run past midnight.`;
    case 'habit': return `Overlaps ${clash.title} (${timeRange(clash.start, clash.end)}).`;
    default: return `Clashes with ${clash.title} (${timeRange(clash.start, clash.end)}).`;
  }
};

const parseTime = (value: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * "Plan today's habits": every open habit with its time, which can be typed
 * or stepped to the previous or next free time from now to midnight. A time
 * that clashes says with what and offers the nearest free one; unticking a
 * habit leaves it out for today. Nothing is booked until "Plan N habits".
 * In move mode the rows are planned habits and "Save times" moves them.
 */
const HabitPlanReview: React.FC<HabitPlanReviewProps> = ({ mode, rows: initial, state: S, fixed, focusId, phone, busy, onCancel, onSubmit }) => {
  const [rows, setRows] = useState(initial);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const move = mode === 'move';

  useFocusTrap(sheetRef);
  useEffect(() => {
    const fields = [...(rootRef.current?.querySelectorAll<HTMLInputElement>('input[type="time"]:not(:disabled)') ?? [])];
    (fields.find(f => f.dataset.habit === String(focusId)) ?? fields[0])?.focus();
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (id: number, patch: Partial<ReviewRow>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const isOn = (r: ReviewRow) => move || r.on;
  const othersFor = (r: ReviewRow): HabitTime[] => [
    ...fixed,
    ...rows.filter(o => o.id !== r.id && isOn(o) && o.start != null).map(o => ({ id: o.id, title: o.title, start: o.start!, end: o.start! + o.len })),
  ];

  const view = rows.map(r => {
    const others = othersFor(r);
    const starts = habitStarts(habitGaps(S, r.id, others), r.len);
    const check = r.start == null ? null : checkHabitTime(S, others, r.id, r.start, r.len);
    const bad = isOn(r) && (r.start == null || (check != null && !check.ok));
    return { r, others, starts, check, bad };
  });
  const ticked = view.filter(v => isOn(v.r));
  const badCount = ticked.filter(v => v.bad).length;
  const n = ticked.length;
  const blocked = busy || badCount > 0 || n === 0;
  const original = new Map(initial.map(r => [r.id, r.start]));

  const submit = () => {
    if (blocked) return;
    onSubmit(ticked.map(({ r }) => ({ id: r.id, title: r.title, start: r.start!, end: r.start! + r.len, changed: original.get(r.id) !== r.start })));
  };

  const label = move
    ? n === 1 && ticked[0].r.start != null ? `Move to ${clock(ticked[0].r.start)}` : 'Save times'
    : n ? `Plan ${n} habit${n === 1 ? '' : 's'}` : 'Nothing to plan';

  const panel = (
    <div ref={rootRef} className={phone ? '' : 'rounded-md p-3'} style={phone ? undefined : { backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}>
      <div className="mb-1.5">
        <h3 id={headingId} className="text-[13px] font-semibold text-text-primary">{move ? 'Move planned habits' : 'Plan today’s habits'}</h3>
        <p className="text-[11px] text-text-muted">
          {move ? 'Change any time, then save. Nothing moves until you do.' : 'Change any time, then plan. Nothing is booked until you do.'}
        </p>
      </div>
      <ul>
        {view.map(({ r, others, starts, check }) => {
          const on = isOn(r);
          const prev = r.start == null ? undefined : starts.filter(t => t < r.start!).pop();
          const next = r.start == null ? starts[0] : starts.find(t => t > r.start!);
          const name = (
            <span className="min-w-0">
              <span className={`block truncate text-xs font-medium ${on ? 'text-text-primary' : 'text-text-muted line-through'}`}>{r.title}</span>
              <span className="block text-[10px] text-text-muted">{lengthText(r.len)}</span>
            </span>
          );
          let message: React.ReactNode;
          if (!on) {
            message = <span className="text-text-muted">{starts.length ? 'Not today' : 'No free time left today'}</span>;
          } else if (r.start == null || (check && !check.ok)) {
            const fix = check && !check.ok ? check.fix : starts[0] ?? null;
            message = (
              <span role="alert" style={{ color: 'var(--tm-warning)' }}>
                {check && !check.ok ? clashText(check.clash, r.title) : 'Pick a time.'}
                {fix != null && (
                  <button type="button" onClick={() => update(r.id, { start: fix })} className="ml-1 font-semibold text-accent hover:underline">
                    Use {clock(fix)}
                  </button>
                )}
              </span>
            );
          } else {
            const why = habitReason(S, others, r.id, r.start, r.start + r.len, clock);
            message = (
              <span style={{ color: 'var(--tm-success-text)' }}>
                {timeRange(r.start, r.start + r.len)}{why && ` · ${why}`}
              </span>
            );
          }
          const stepper = 'w-7 h-7 flex-shrink-0 inline-flex items-center justify-center rounded-md border text-accent disabled:text-text-muted disabled:opacity-50 disabled:cursor-not-allowed';
          return (
            <li key={r.id} data-review-row={r.id} className="py-2 border-b last:border-b-0" style={{ borderColor: 'var(--tm-border-subtle)' }}>
              <div className="flex items-center gap-2">
                {move ? (
                  <span className="min-w-0 flex-1">{name}</span>
                ) : (
                  <label className="min-w-0 flex-1 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.on}
                      disabled={!r.on && r.start == null && starts.length === 0}
                      onChange={e => update(r.id, { on: e.target.checked, ...(e.target.checked && r.start == null ? { start: starts[0] ?? null } : {}) })}
                      className="flex-shrink-0"
                      style={{ accentColor: 'var(--tm-accent)' }}
                      aria-label={`Plan ${r.title} today`}
                    />
                    {name}
                  </label>
                )}
                <span className="flex flex-shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className={stepper}
                    style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface-raised)' }}
                    disabled={!on || prev === undefined}
                    onClick={() => prev !== undefined && update(r.id, { start: prev })}
                    aria-label={prev === undefined ? 'No earlier free time' : `Earlier free time: ${clock(prev)}`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
                  </button>
                  <input
                    type="time"
                    step={900}
                    data-habit={r.id}
                    value={r.start == null ? '' : hhmm(r.start)}
                    disabled={!on}
                    onChange={e => update(r.id, { start: parseTime(e.target.value) })}
                    aria-label={`${r.title} start time`}
                    aria-invalid={on && (r.start == null || (check != null && !check.ok))}
                    className="w-[112px] rounded-md px-1.5 py-1 text-xs text-text-primary disabled:opacity-60"
                    style={{
                      backgroundColor: 'var(--tm-surface-raised)',
                      border: `1px solid ${on && (r.start == null || (check && !check.ok)) ? 'var(--tm-warning)' : 'var(--tm-border)'}`,
                    }}
                  />
                  <button
                    type="button"
                    className={stepper}
                    style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface-raised)' }}
                    disabled={!on || next === undefined}
                    onClick={() => next !== undefined && update(r.id, { start: next })}
                    aria-label={next === undefined ? 'No later free time' : `Later free time: ${clock(next)}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </span>
              </div>
              <p className={`mt-1 text-[11px] break-words ${move ? '' : 'pl-5'}`}>{message}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          aria-disabled={blocked || undefined}
          className={`btn btn-primary text-xs px-3 py-1.5 gap-1 ${blocked ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          {label}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost text-xs px-2 py-1.5">Cancel</button>
        {badCount > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--tm-warning)' }}>
            {badCount === 1 ? 'Fix the time above first.' : `Fix ${badCount} times above first.`}
          </span>
        )}
      </div>
    </div>
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      onCancel();
    }
  };

  if (!phone) {
    return <section aria-labelledby={headingId} data-habit-review onKeyDown={onKeyDown}>{panel}</section>;
  }
  // On the body: the brief's card has a backdrop filter, which would pin a fixed sheet to the card.
  return createPortal(
    <div className="fixed inset-0 z-50" data-habit-review onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in" style={{ backgroundColor: 'var(--tm-scrim)' }} onClick={() => !busy && onCancel()} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl px-4 pt-2 pb-4 bg-surface-raised"
        style={{ boxShadow: 'var(--tm-shadow-lg)' }}
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full" style={{ backgroundColor: 'var(--tm-border-strong)' }} aria-hidden />
        {panel}
      </div>
    </div>,
    document.body,
  );
};

export default HabitPlanReview;
