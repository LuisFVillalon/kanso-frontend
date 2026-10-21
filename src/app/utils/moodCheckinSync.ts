/**
 * Keeps the places that show a check-in in step when one of them saves,
 * edits or undoes it: the dashboard nudge, the Daily Brief's mood line, the
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

export function announceMoodCheckin(change: MoodCheckinChange): void {
  listeners.forEach(listener => listener(change));
}

/** Calls `listener` for every announced change; returns the unsubscribe. */
export function onMoodCheckin(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
