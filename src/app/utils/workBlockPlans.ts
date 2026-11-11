import { createWorkBlock, deleteWorkBlock, describeError } from '@/app/lib/backend-api';
import { notifyWorkBlocksChanged } from '@/app/hooks/useWorkBlocksVersion';
import type { Task } from '@/app/types/task';
import type { WorkBlock, WorkBlockCreate } from '@/app/types/workBlock';
import { hhmm } from './slotLabels';

/** A time picked to work on a task: a suggested row, a split piece, or a time tapped on the strip. */
export interface PlanPick {
  date: string;
  start: number;
  end: number;
}

export const pickKey = (p: PlanPick) => `${p.date}|${p.start}|${p.end}`;

export const samePick = (a: PlanPick, b: PlanPick) => a.date === b.date && a.start === b.start && a.end === b.end;

/** Adds the picks not picked yet, or removes them all when every one already is. */
export function togglePicks(picks: PlanPick[], toggled: PlanPick[]): PlanPick[] {
  const all = toggled.every(t => picks.some(p => samePick(p, t)));
  return all
    ? picks.filter(p => !toggled.some(t => samePick(p, t)))
    : [...picks, ...toggled.filter(t => !picks.some(p => samePick(p, t)))];
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The POST /create-work-block body for `pick`, for a task or a habit. */
export function workBlockBody(target: { taskId: number } | { habitId: number }, pick: PlanPick): WorkBlockCreate {
  const times = { date: pick.date, start_time: hhmm(pick.start), end_time: hhmm(pick.end), time_zone: browserZone() };
  return 'taskId' in target ? { task_id: target.taskId, ...times } : { habit_id: target.habitId, ...times };
}

/** The task (and linked tasks) saved, but some of their picked times didn't make it onto the calendar. */
export class WorkBlocksSaveError extends Error {
  constructor(readonly task: Task, readonly failed: number, readonly reason: string) {
    super(`${failed} planned time${failed === 1 ? '' : 's'} weren't saved: ${reason}`);
    this.name = 'WorkBlocksSaveError';
  }
}

/** One block to make, and the task it's for. */
export interface PlanRequest {
  taskId: number;
  pick: PlanPick;
}

/**
 * Makes each block and removes each block id in `remove`, carrying on past
 * failures. Returns the creates that failed (in order) and the ids that
 * couldn't be removed, with the first reason. Tells the views to reload.
 */
export async function savePlans(create: PlanRequest[], remove: number[] = []): Promise<{
  created: WorkBlock[];
  failed: PlanRequest[];
  failedRemoves: number[];
  reason: string | null;
}> {
  const created: WorkBlock[] = [];
  const failed: PlanRequest[] = [];
  const failedRemoves: number[] = [];
  let reason: string | null = null;
  for (const req of create) {
    try {
      created.push(await createWorkBlock(workBlockBody({ taskId: req.taskId }, req.pick)));
    } catch (err) {
      console.error('Saving a work block failed:', err);
      failed.push(req);
      reason ??= describeError(err, 'Something went wrong. Please try again.');
    }
  }
  for (const id of remove) {
    try {
      await deleteWorkBlock(id);
    } catch (err) {
      console.error('Removing a work block failed:', err);
      failedRemoves.push(id);
      reason ??= describeError(err, 'Something went wrong. Please try again.');
    }
  }
  if (create.length || remove.length) notifyWorkBlocksChanged();
  return { created, failed, failedRemoves, reason };
}
