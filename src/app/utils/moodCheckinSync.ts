/**
 * Keeps the places that show a check-in in step when one of them saves,
 * edits or undoes it: the dashboard's weekly and monthly chips, the Daily Brief's mood chip, the
 * calendar day panel and the form a notification opens. In-memory and
 * per-tab; each place still loads its own rows from the server.
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
