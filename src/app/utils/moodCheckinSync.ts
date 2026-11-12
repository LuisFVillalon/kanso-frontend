/**
 * Keeps the places that show a check-in in step when one of them saves,
 * edits or undoes it: the dashboard's weekly and monthly chips, the Daily Brief's mood chip, the
 * calendar day panel, the calendar's month grid and the form a notification opens; and, when a
 * moment is renamed or deleted, every check-in row they hold. In-memory and per-tab; each place
 * still loads its own rows from the server.
 */

import type { MoodCheckin, MoodPeriodKind } from '@/app/types/mood';

/** A period's check-in as it now stands: `row` null when it was removed. */
export interface MoodCheckinChange {
  kind: MoodPeriodKind;
  start: string;
  row: MoodCheckin | null;
}

type Listener = (change: MoodCheckinChange) => void;

const listeners = new Set<Listener>();
const latest = new Map<string, MoodCheckin | null>();

export function announceMoodCheckin(change: MoodCheckinChange): void {
  latest.set(`${change.kind}:${change.start}`, change.row);
  listeners.forEach(listener => listener(change));
}

/** Whether `row` is still the newest one announced for its period. */
export function isLatestMoodCheckin(row: MoodCheckin): boolean {
  return latest.get(`${row.period_kind}:${row.period_start}`) === row;
}

/** Calls `listener` for every announced change; returns the unsubscribe. */
export function onMoodCheckin(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A moment renamed (`to`) or deleted (`to` null) on every check-in carrying it. */
export interface MoodMomentChange {
  from: string;
  to: string | null;
}

type MomentListener = (change: MoodMomentChange) => void;

const momentListeners = new Set<MomentListener>();
const momentChanges: MoodMomentChange[] = [];

const sameMoment = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** `list` with `from` renamed to `to` (or dropped, for null), keeping one of each moment. */
export const replaceMoment = (list: string[], from: string, to: string | null): string[] =>
  list
    .flatMap(t => (sameMoment(t, from) ? (to == null ? [] : [to]) : [t]))
    .filter((t, i, all) => all.findIndex(o => sameMoment(o, t)) === i);

/** `row` after `change`: the same row when it doesn't carry the moment. */
export function withMomentChange(row: MoodCheckin, { from, to }: MoodMomentChange): MoodCheckin {
  return row.tags.some(t => sameMoment(t, from)) ? { ...row, tags: replaceMoment(row.tags, from, to) } : row;
}

export function announceMoodMoment(change: MoodMomentChange): void {
  momentChanges.push(change);
  momentListeners.forEach(listener => listener(change));
}

/** Calls `listener` for every renamed or deleted moment; returns the unsubscribe. */
export function onMoodMoment(listener: MomentListener): () => void {
  momentListeners.add(listener);
  return () => { momentListeners.delete(listener); };
}

/** A getter for `row` with every moment renamed or deleted from now on applied, e.g. for a later Undo. */
export function followMoments(row: MoodCheckin): () => MoodCheckin {
  const seen = momentChanges.length;
  return () => momentChanges.slice(seen).reduce(withMomentChange, row);
}
