'use client';

import React, { useMemo, useState } from 'react';
import { createWorkBlock, describeError, updateWorkBlock } from '@/app/lib/backend-api';
import { notifyWorkBlocksChanged } from '@/app/hooks/useWorkBlocksVersion';
import { blockSpan, dueMinutesOf, type SlotPlanner } from '@/app/hooks/useSlotPlanner';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import {
  blockConflicts, habitConflicts, keepConflict, loadKeptConflicts, type BlockConflict, type HabitConflict,
} from '@/app/utils/planConflicts';
import { freeTime, planRange, resuggest, type SlotState } from '@/app/utils/slotSuggest';
import { clock, dayName, dayShort, hhmm, lengthText, timeRange } from '@/app/utils/slotLabels';
import { workBlockBody, type PlanPick } from '@/app/utils/workBlockPlans';
import Callout from './Callout';
import FreeTimeStrip from './FreeTimeStrip';

interface PlanConflictCalloutsProps {
  planner: SlotPlanner | null;
  tasks: Task[];
  habits: Habit[];
}

/**
 * In the Daily brief: one warning per plan a busy event now covers. A task's
 * kept block offers the nearest free time (Move), the free-time strip (Other
 * times) or Keep it; a habit whose usual time is taken today offers today's
 * first free time (a block for today only, its usual time unchanged) or Skip.
 * Nothing moves without a tap.
 */
const PlanConflictCallouts: React.FC<PlanConflictCalloutsProps> = ({ planner, tasks, habits }) => {
  const [kept, setKept] = useState<Set<string>>(loadKeptConflicts);
  const [stripFor, setStripFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conflicts = useMemo((): (BlockConflict | HabitConflict)[] => {
    if (!planner) return [];
    return [
      ...blockConflicts(planner.state, planner.workBlocks, planner.events, tasks),
      ...habitConflicts(planner.state, habits, planner.events, planner.workBlocks),
    ].filter(c => !kept.has(c.key));
  }, [planner, tasks, habits, kept]);

  if (!planner || conflicts.length === 0) return null;
  const { today } = planner;

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await run();
      notifyWorkBlocksChanged();
      setStripFor(null);
    } catch (err) {
      console.error('Changing the plan failed:', err);
      setError(describeError(err, "Couldn't change the plan. Please try again."));
    } finally {
      setBusy(null);
    }
  };
  const keep = (key: string) => setKept(keepConflict(key));
  const moveBlock = (c: BlockConflict, p: PlanPick) =>
    act(c.key, () => updateWorkBlock(c.block.id, { date: p.date, start_time: hhmm(p.start), end_time: hhmm(p.end) }));

  return (
    <div className="space-y-2" data-plan-conflicts>
      {conflicts.map(c => {
        if (c.kind === 'habit') {
          const s = c.suggestion;
          return (
            <Callout key={c.key} tone="warning">
              <b>{c.event.title}</b> takes {clock(c.usual)} today, your usual time for <b>{c.habit.title}</b>.
              {s ? <> Today only: <b>{timeRange(s.start, s.end)}</b>?</> : ' Nothing else is free today.'}
              <span className="mt-1.5 flex flex-wrap gap-2">
                {s && (
                  <button
                    type="button"
                    disabled={busy === c.key}
                    onClick={() => act(c.key, () => createWorkBlock(workBlockBody({ habitId: c.habit.id }, { date: today, start: s.start, end: s.end })))}
                    className="btn btn-primary text-xs px-2 py-1"
                  >
                    Do it at {clock(s.start)}
                  </button>
                )}
                <button type="button" onClick={() => keep(c.key)} className="btn btn-ghost text-xs px-2 py-1">Skip</button>
              </span>
            </Callout>
          );
        }
        const span = blockSpan(c.block);
        const s = c.suggestion;
        return (
          <Callout key={c.key} tone="warning">
            <b>{c.event.title}</b> now covers part of your plan for <b>{c.block.title}</b> ({dayName(c.block.date, today)}, {timeRange(span.start, span.end)}).
            {s
              ? <> Nearest free {lengthText(span.end - span.start)}: <b>{dayName(s.date, today)}, {timeRange(s.start, s.end)}</b>.</>
              : ' Nothing else is free before it’s due.'}
            <span className="mt-1.5 flex flex-wrap gap-2">
              {s && (
                <button type="button" disabled={busy === c.key} onClick={() => moveBlock(c, s)} className="btn btn-primary text-xs px-2 py-1">
                  Move to {dayShort(s.date, today)} {clock(s.start)}
                </button>
              )}
              <button
                type="button"
                aria-expanded={stripFor === c.key}
                onClick={() => setStripFor(stripFor === c.key ? null : c.key)}
                className="btn btn-secondary text-xs px-2 py-1"
              >
                Other times
              </button>
              <button type="button" onClick={() => keep(c.key)} className="btn btn-ghost text-xs px-2 py-1">Keep it</button>
            </span>
            {stripFor === c.key && (
              <div className="mt-2">
                <ConflictStrip planner={planner} conflict={c} tasks={tasks} onPlace={p => moveBlock(c, p)} />
              </div>
            )}
          </Callout>
        );
      })}
      {error && <Callout tone="danger" role="alert">{error}</Callout>}
    </div>
  );
};

/** The free-time strip for moving one block: its nearest free times numbered, any free time tappable. */
const ConflictStrip: React.FC<{ planner: SlotPlanner; conflict: BlockConflict; tasks: Task[]; onPlace: (p: PlanPick) => void }> = ({
  planner, conflict, tasks, onPlace,
}) => {
  const task = tasks.find(t => t.id === conflict.block.task_id);
  const range = planRange(planner.state.now, task?.due_date ? toLocalDateStr(task.due_date) : null, task ? dueMinutesOf(task) : null);
  if (!range) return null;
  const span = blockSpan(conflict.block);
  const state: SlotState = {
    ...planner.state,
    blocks: planner.state.blocks.filter(b => !(b.taskId === conflict.block.task_id && b.date === conflict.block.date && b.start === span.start)),
  };
  const len = span.end - span.start;
  return (
    <FreeTimeStrip
      state={state}
      days={freeTime(state, range.until, range.due)}
      range={range}
      len={len}
      slots={resuggest(state, len, range, { date: conflict.block.date, start: span.start })}
      picks={[]}
      events={planner.events}
      workBlocks={planner.workBlocks.filter(b => b.id !== conflict.block.id)}
      today={planner.today}
      onPlace={onPlace}
    />
  );
};

export default PlanConflictCallouts;
