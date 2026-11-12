'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CalendarClock, Check, ChevronDown, Flame, Loader2, Repeat } from 'lucide-react';
import { createWorkBlock, deleteWorkBlock, describeError, updateWorkBlock } from '@/app/lib/backend-api';
import { notifyWorkBlocksChanged } from '@/app/hooks/useWorkBlocksVersion';
import type { SlotPlanner } from '@/app/hooks/useSlotPlanner';
import { blockSpan, isAllDayHabit, minutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import type { Habit } from '@/app/types/habit';
import type { WorkBlock } from '@/app/types/workBlock';
import { formatHabitGoal } from '@/app/utils/habitLabels';
import {
  checkHabitTime, habitGaps, habitStarts, habitsToday, withHeld, type HabitTime, type SlotState, type Span,
} from '@/app/utils/slotSuggest';
import { clock, hhmm } from '@/app/utils/slotLabels';
import { workBlockBody } from '@/app/utils/workBlockPlans';
import Callout from './Callout';
import HabitPlanReview, { type ReviewedTime, type ReviewRow } from './HabitPlanReview';

interface HabitsLeftCardProps {
  habits: Habit[];
  planner: SlotPlanner | null;
  /** Logs (or un-logs) a habit for today; without it the check circle only shows. */
  onToggleHabit?: (id: number) => void;
}

/** Tailwind's `sm` breakpoint: below it the review opens as a bottom sheet. */
const PHONE_QUERY = '(max-width: 639px)';
const subscribePhone = (onChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhoneNow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

/** A plan made from the card: the block, and the habit's title and start for the Planned note. */
interface MadePlan {
  block: WorkBlock;
  title: string;
  start: number;
}

/** The open review: plan the open habits, or move planned ones; and the control to focus again when it closes. */
interface OpenReview {
  mode: 'plan' | 'move';
  /** Move mode: the habits whose blocks it moves. */
  ids: number[];
  focusId: number | null;
  /** Find a time: this habit opens ticked at the first free time. */
  findId: number | null;
  opener: string;
}

/** "Read 20 pages and Spanish practice". */
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** "Read 20 pages at 11:30 AM and Spanish practice at 1:00 PM". */
const listPlans = (items: { title: string; start: number }[]) => {
  const parts = items.map(i => `${i.title} at ${clock(i.start)}`);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

/**
 * Today's habits in the Daily brief: each one done, planned (a block on the
 * calendar today) or with a suggested time (its usual time while that is
 * still free; the free time nearest its usual time once that is taken or has
 * passed; or, with no usual time, the first free gap after now that fits once
 * today's events and tasks due today are held), and a Plan button that
 * blocks that time in one tap. "Plan my habits" (or a tap on a time) opens a
 * review where each time can be changed before anything is booked; a habit
 * with no free time left in the work day gets "Find a time" from now to
 * midnight; a planned habit's pill moves it. The times shown don't re-pack
 * while the card is open. A habit with no time goal is all-day: it's listed
 * with "All day" and never planned.
 */
const HabitsLeftCard: React.FC<HabitsLeftCardProps> = ({ habits, planner, onToggleHabit }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPlanned, setJustPlanned] = useState<MadePlan[] | null>(null);
  const [review, setReview] = useState<OpenReview | null>(null);
  const [said, setSaid] = useState('');
  const [refocus, setRefocus] = useState<{ key: string } | null>(null);
  // The times last shown, so they stay put while the card is open.
  const [shown, setShown] = useState<{ key: string; times: Map<number, Span> }>({ key: '', times: new Map() });
  const cardRef = useRef<HTMLDivElement>(null);
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);

  useEffect(() => {
    if (!refocus || !cardRef.current) return;
    const el = cardRef.current.querySelector<HTMLElement>(`[data-focus-key="${refocus.key}"]`)
      ?? cardRef.current.querySelector<HTMLElement>('[data-focus-key="undo"]')
      ?? cardRef.current;
    el.focus();
  }, [refocus]);

  const live = habits.filter(h => !h.archived_at);
  if (live.length === 0) return null;

  const today = planner?.today ?? null;
  const planned = new Map<number, WorkBlock>();
  for (const b of planner?.workBlocks ?? []) if (b.habit_id != null && b.date === today) planned.set(b.habit_id, b);
  const byId = new Map(live.map(h => [h.id, h]));
  const titleOf = (id: number) => byId.get(id)?.title ?? '';
  const plannedTimes = (skip: (id: number) => boolean = () => false): HabitTime[] =>
    [...planned].filter(([id]) => !skip(id)).map(([id, b]) => ({ id, title: titleOf(id), start: blockSpan(b).start, end: blockSpan(b).end }));

  // The times shown stay put while the card is open: a habit keeps the time it
  // showed while that's still free, and only the rest get fresh suggestions.
  let suggested: Map<number, Span | null>;
  if (planner) {
    const S = planner.state;
    const openInputs = S.habits.filter(h => !h.done && !h.allDay && !planned.has(h.id));
    const kept: HabitTime[] = [];
    for (const h of openInputs) {
      const prev = shown.times.get(h.id);
      if (prev && prev[1] - prev[0] === h.len && checkHabitTime(S, kept, h.id, prev[0], h.len).ok) {
        kept.push({ id: h.id, title: h.title, start: prev[0], end: prev[1] });
      }
    }
    const keptIds = new Set(kept.map(k => k.id));
    const fresh = habitsToday({
      ...withHeld(S, kept.map(k => ({ date: S.now.date, start: k.start, end: k.end }))),
      habits: S.habits.filter(h => !planned.has(h.id) && !keptIds.has(h.id)),
    });
    suggested = new Map<number, Span | null>([
      ...fresh.map(x => [x.habit.id, x.slot] as [number, Span | null]),
      ...kept.map(k => [k.id, [k.start, k.end]] as [number, Span]),
    ]);
    const times = new Map([...suggested].filter((e): e is [number, Span] => e[1] != null));
    const key = [...times].map(([id, [a, b]]) => `${id}:${a}-${b}`).sort().join(',');
    if (key !== shown.key) setShown({ key, times });
  } else {
    suggested = new Map<number, Span | null>(live.filter(h => !isAllDayHabit(h)).map(h => {
      const t = minutesOf(h.planned_time);
      return [h.id, t === null ? null : [t, t + planMinutes(h.estimated_time)] as Span];
    }));
  }
  const reviewable = live.filter(h => !h.logged_today && !planned.has(h.id) && !isAllDayHabit(h));
  const shownTimes = (skip: (id: number) => boolean): HabitTime[] => reviewable.flatMap(h => {
    const slot = suggested.get(h.id);
    return slot && !skip(h.id) ? [{ id: h.id, title: h.title, start: slot[0], end: slot[1] }] : [];
  });
  /** The first free time from now to midnight for a habit with no suggestion, keeping off every other habit's time. */
  const firstFree = (h: Habit): number | null => {
    if (!planner) return null;
    const others = [...plannedTimes(), ...shownTimes(id => id === h.id)];
    return habitStarts(habitGaps(planner.state, h.id, others), planMinutes(h.estimated_time))[0] ?? null;
  };
  const canReview = !!planner && reviewable.some(h => suggested.get(h.id) || firstFree(h) != null);

  const open = (r: OpenReview) => { setError(null); setReview(r); };
  const close = (key?: string) => { const k = key ?? review?.opener; setReview(null); if (k) setRefocus({ key: k }); };

  const book = async (list: { id: number; title: string; start: number; end: number }[], note: boolean) => {
    if (!today || list.length === 0) return;
    setBusy(true);
    setError(null);
    const made: MadePlan[] = [];
    try {
      for (const p of list) {
        const block = await createWorkBlock(workBlockBody({ habitId: p.id }, { date: today, start: p.start, end: p.end }));
        made.push({ block, title: p.title, start: p.start });
      }
      if (note) setJustPlanned(made);
    } catch (err) {
      console.error('Planning habits failed:', err);
      setError(describeError(err, "Couldn't put that on your calendar. Please try again."));
      if (made.length > 1 || (note && made.length)) setJustPlanned(made);
    } finally {
      if (made.length) notifyWorkBlocksChanged();
      setBusy(false);
    }
  };
  const planOne = (h: Habit) => {
    const slot = suggested.get(h.id)!;
    void book([{ id: h.id, title: h.title, start: slot[0], end: slot[1] }], false);
  };

  const undo = async () => {
    if (!justPlanned) return;
    setBusy(true);
    setError(null);
    let left = justPlanned;
    try {
      for (const p of justPlanned) {
        await deleteWorkBlock(p.block.id);
        left = left.filter(x => x !== p);
      }
      setJustPlanned(null);
    } catch (err) {
      console.error('Undoing the habit plans failed:', err);
      setError(describeError(err, "Couldn't undo that. Please try again."));
      setJustPlanned(left.length ? left : null);
    } finally {
      notifyWorkBlocksChanged();
      setBusy(false);
    }
  };

  const moveBlocks = async (list: ReviewedTime[]) => {
    if (!today) return;
    const changed = list.filter(r => r.changed);
    if (changed.length === 0) { close(); return; }
    setBusy(true);
    setError(null);
    const moved: ReviewedTime[] = [];
    try {
      for (const r of changed) {
        const block = planned.get(r.id) ?? justPlanned?.find(p => p.block.habit_id === r.id)?.block;
        if (!block) continue;
        await updateWorkBlock(block.id, { date: today, start_time: hhmm(r.start), end_time: hhmm(r.end) });
        moved.push(r);
      }
    } catch (err) {
      console.error('Moving habits failed:', err);
      setError(describeError(err, "Couldn't move that. Please try again."));
    } finally {
      if (moved.length) {
        notifyWorkBlocksChanged();
        setJustPlanned(prev => prev && prev.map(p => {
          const m = moved.find(r => r.id === p.block.habit_id);
          return m ? { ...p, start: m.start } : p;
        }));
        setSaid(`Moved ${listNames(moved.map(m => `${m.title} to ${clock(m.start)}`))}`);
      }
      setBusy(false);
      close();
    }
  };

  const submit = async (list: ReviewedTime[]) => {
    if (review?.mode === 'move') return moveBlocks(list);
    await book(list, true);
    close();
  };

  let reviewView: React.ReactNode = null;
  if (review && planner) {
    const S = planner.state;
    let rows: ReviewRow[];
    let fixed: HabitTime[];
    if (review.mode === 'plan') {
      rows = reviewable.map(h => {
        const slot = suggested.get(h.id);
        const start = slot ? slot[0] : h.id === review.findId ? firstFree(h) : null;
        return { id: h.id, title: h.title, len: planMinutes(h.estimated_time), start, on: start != null };
      });
      fixed = plannedTimes();
    } else {
      const ids = new Set(review.ids);
      rows = review.ids.flatMap(id => {
        const b = planned.get(id) ?? justPlanned?.find(p => p.block.habit_id === id)?.block;
        if (!b) return [];
        const span = blockSpan(b);
        return [{ id, title: titleOf(id) || b.title, len: span.end - span.start, start: span.start, on: true }];
      });
      fixed = [...plannedTimes(id => ids.has(id)), ...shownTimes(id => ids.has(id))];
    }
    const reviewIds = new Set(rows.map(r => r.id));
    const state: SlotState = { ...S, blocks: S.blocks.filter(b => !(b.date === S.now.date && b.habitId != null && reviewIds.has(b.habitId))) };
    reviewView = rows.length > 0 && (
      <HabitPlanReview
        key={`${review.mode}-${review.opener}`}
        mode={review.mode}
        rows={rows}
        state={state}
        fixed={fixed}
        focusId={review.focusId}
        phone={phone}
        busy={busy}
        onCancel={() => close()}
        onSubmit={list => void submit(list)}
      />
    );
  }
  const inline = !!reviewView && !phone;

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-habits-left
      className="rounded-md p-3 outline-none"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--tm-week-habit)' }}>
          <Repeat className="w-4 h-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">Habits left today</span>
        </div>
        {canReview && !review && (
          <button
            type="button"
            data-focus-key="plan-all"
            onClick={() => open({ mode: 'plan', ids: [], focusId: null, findId: null, opener: 'plan-all' })}
            disabled={busy}
            aria-haspopup="dialog"
            className="btn btn-secondary text-xs px-2 py-1 gap-1"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <CalendarClock className="w-3.5 h-3.5" aria-hidden />}
            Plan my habits
          </button>
        )}
      </div>

      {justPlanned && (
        <div className="mb-2">
          <Callout tone="info" role="status">
            Planned {listPlans(justPlanned)}. They&apos;re on your calendar.
            <span className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" data-focus-key="undo" onClick={undo} disabled={busy} className="font-semibold text-accent hover:underline">Undo</button>
              {planner && (
                <button
                  type="button"
                  data-focus-key="change-times"
                  onClick={() => open({ mode: 'move', ids: justPlanned.map(p => p.block.habit_id!).filter(id => id != null), focusId: null, findId: null, opener: 'change-times' })}
                  disabled={busy}
                  aria-haspopup="dialog"
                  className="font-semibold text-accent hover:underline"
                >
                  Change times
                </button>
              )}
            </span>
          </Callout>
        </div>
      )}
      {error && <div className="mb-2"><Callout tone="danger" role="alert">{error}</Callout></div>}
      <p className="sr-only" aria-live="polite">{said}</p>

      {reviewView}
      {!inline && <ul>
        {live.map(h => {
          const block = planned.get(h.id);
          const slot = suggested.get(h.id);
          const goal = formatHabitGoal(h.estimated_time);
          return (
            <li key={h.id} className="flex items-center gap-2 py-1 border-b last:border-b-0" style={{ borderColor: 'var(--tm-border-subtle)' }}>
              <button
                type="button"
                onClick={() => onToggleHabit?.(h.id)}
                disabled={!onToggleHabit}
                aria-pressed={h.logged_today}
                aria-label={`${h.logged_today ? 'Done' : 'Mark done'}: ${h.title}`}
                className="w-4 h-4 flex-shrink-0 rounded-full border flex items-center justify-center"
                style={{
                  borderColor: h.logged_today ? 'var(--tm-success)' : 'var(--tm-border-strong)',
                  backgroundColor: h.logged_today ? 'var(--tm-success)' : 'transparent',
                }}
              >
                {h.logged_today && <Check className="w-3 h-3 text-white" aria-hidden />}
              </button>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-xs font-medium ${h.logged_today ? 'text-text-muted line-through' : 'text-text-primary'}`}>{h.title}</span>
                <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  {goal && <span>{goal}</span>}
                  {h.current_streak > 0 && (
                    <span className="inline-flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" aria-hidden />{h.current_streak}</span>
                  )}
                </span>
              </span>
              {h.logged_today ? (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--tm-success-text)' }}>Done</span>
              ) : block ? (
                planner ? (
                  <button
                    type="button"
                    data-focus-key={`planned-${h.id}`}
                    onClick={() => open({ mode: 'move', ids: [h.id], focusId: h.id, findId: null, opener: `planned-${h.id}` })}
                    disabled={busy}
                    aria-haspopup="dialog"
                    aria-label={`Move ${h.title}, planned at ${clock(blockSpan(block).start)}`}
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--tm-week-habit) 18%, var(--tm-surface))', color: 'var(--tm-text-primary)' }}
                  >
                    Planned {clock(blockSpan(block).start)}
                    <ChevronDown className="w-3 h-3" aria-hidden />
                  </button>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--tm-week-habit) 18%, var(--tm-surface))', color: 'var(--tm-text-primary)' }}>
                    Planned {clock(blockSpan(block).start)}
                  </span>
                )
              ) : isAllDayHabit(h) ? (
                <span className="text-[11px] text-text-muted">All day</span>
              ) : slot ? (
                <span className="flex items-center gap-1.5">
                  {planner ? (
                    <button
                      type="button"
                      data-focus-key={`chip-${h.id}`}
                      onClick={() => open({ mode: 'plan', ids: [], focusId: h.id, findId: null, opener: `chip-${h.id}` })}
                      disabled={busy}
                      aria-haspopup="dialog"
                      aria-label={`Change ${h.title}'s time, now ${clock(slot[0])}`}
                      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                      style={{ border: '1px dashed var(--tm-border-strong)' }}
                    >
                      {clock(slot[0])}
                      <ChevronDown className="w-3 h-3" aria-hidden />
                    </button>
                  ) : (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-text-secondary" style={{ border: '1px dashed var(--tm-border-strong)' }}>
                      {clock(slot[0])}
                    </span>
                  )}
                  {planner && (
                    <button
                      type="button"
                      onClick={() => planOne(h)}
                      disabled={busy}
                      className="text-[11px] font-semibold text-accent hover:underline"
                      aria-label={`Plan ${h.title} at ${clock(slot[0])}`}
                    >
                      Plan
                    </button>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-muted">No free time left</span>
                  {firstFree(h) != null && (
                    <button
                      type="button"
                      data-focus-key={`find-${h.id}`}
                      onClick={() => open({ mode: 'plan', ids: [], focusId: h.id, findId: h.id, opener: `find-${h.id}` })}
                      disabled={busy}
                      aria-haspopup="dialog"
                      className="text-[11px] font-semibold text-accent hover:underline"
                    >
                      Find a time
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>}
    </div>
  );
};

export default HabitsLeftCard;
