'use client';

import React, { useState } from 'react';
import { CalendarClock, Check, Flame, Loader2, Repeat } from 'lucide-react';
import { createWorkBlock, deleteWorkBlock, describeError } from '@/app/lib/backend-api';
import { notifyWorkBlocksChanged } from '@/app/hooks/useWorkBlocksVersion';
import type { SlotPlanner } from '@/app/hooks/useSlotPlanner';
import { blockSpan, minutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import type { Habit } from '@/app/types/habit';
import type { WorkBlock } from '@/app/types/workBlock';
import { formatHabitGoal } from '@/app/utils/habitLabels';
import { habitsToday, type Span } from '@/app/utils/slotSuggest';
import { clock } from '@/app/utils/slotLabels';
import { workBlockBody } from '@/app/utils/workBlockPlans';
import Callout from './Callout';

interface HabitsLeftCardProps {
  habits: Habit[];
  planner: SlotPlanner | null;
  /** Logs (or un-logs) a habit for today; without it the check circle only shows. */
  onToggleHabit?: (id: number) => void;
}

/** "Read 20 pages at 11:30 AM and Spanish practice at 1:00 PM". */
const listPlans = (items: { title: string; start: number }[]) => {
  const parts = items.map(i => `${i.title} at ${clock(i.start)}`);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

/**
 * Today's habits in the Daily brief: each one done, planned (a block on the
 * calendar today) or with a suggested time (its usual time, or the first free
 * gap after now that fits once today's events and tasks due today are held),
 * and a Plan button that blocks that time. "Plan my habits" plans every one
 * left in one tap, with Undo.
 */
const HabitsLeftCard: React.FC<HabitsLeftCardProps> = ({ habits, planner, onToggleHabit }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPlanned, setJustPlanned] = useState<{ block: WorkBlock; title: string; start: number }[] | null>(null);
  const live = habits.filter(h => !h.archived_at);
  if (live.length === 0) return null;

  const today = planner?.today ?? null;
  const planned = new Map<number, WorkBlock>();
  for (const b of planner?.workBlocks ?? []) if (b.habit_id != null && b.date === today) planned.set(b.habit_id, b);
  const suggested = new Map<number, Span | null>(
    planner
      ? habitsToday({ ...planner.state, habits: planner.state.habits.filter(h => !planned.has(h.id)) }).map(x => [x.habit.id, x.slot])
      : live.map(h => {
        const t = minutesOf(h.planned_time);
        return [h.id, t === null ? null : [t, t + planMinutes(h.estimated_time)] as Span];
      }),
  );
  const open = live.filter(h => !h.logged_today && !planned.has(h.id) && suggested.get(h.id));

  const plan = async (list: Habit[]) => {
    if (!today || list.length === 0) return;
    setBusy(true);
    setError(null);
    const made: { block: WorkBlock; title: string; start: number }[] = [];
    try {
      for (const h of list) {
        const slot = suggested.get(h.id)!;
        const block = await createWorkBlock(workBlockBody({ habitId: h.id }, { date: today, start: slot[0], end: slot[1] }));
        made.push({ block, title: h.title, start: slot[0] });
      }
      if (list.length > 1) setJustPlanned(made);
    } catch (err) {
      console.error('Planning habits failed:', err);
      setError(describeError(err, "Couldn't put that on your calendar. Please try again."));
      if (made.length > 1) setJustPlanned(made);
    } finally {
      if (made.length) notifyWorkBlocksChanged();
      setBusy(false);
    }
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

  return (
    <div
      data-habits-left
      className="rounded-md p-3"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--tm-week-habit)' }}>
          <Repeat className="w-4 h-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">Habits left today</span>
        </div>
        {planner && open.length > 0 && (
          <button
            type="button"
            onClick={() => plan(open)}
            disabled={busy}
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
              <button type="button" onClick={undo} disabled={busy} className="font-semibold text-accent hover:underline">Undo</button>
              <a href="/calendar" className="font-semibold text-accent hover:underline">Change times</a>
            </span>
          </Callout>
        </div>
      )}
      {error && <div className="mb-2"><Callout tone="danger" role="alert">{error}</Callout></div>}

      <ul>
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
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--tm-week-habit) 18%, var(--tm-surface))', color: 'var(--tm-text-primary)' }}>
                  Planned {clock(blockSpan(block).start)}
                </span>
              ) : slot ? (
                <span className="flex items-center gap-1.5">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-text-secondary" style={{ border: '1px dashed var(--tm-border-strong)' }}>
                    {clock(slot[0])}
                  </span>
                  {planner && (
                    <button
                      type="button"
                      onClick={() => plan([h])}
                      disabled={busy}
                      className="text-[11px] font-semibold text-accent hover:underline"
                      aria-label={`Plan ${h.title} at ${clock(slot[0])}`}
                    >
                      Plan
                    </button>
                  )}
                </span>
              ) : (
                <span className="text-[11px] text-text-muted">No free time left</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default HabitsLeftCard;
