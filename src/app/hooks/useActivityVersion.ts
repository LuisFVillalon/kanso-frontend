import { useSyncExternalStore } from 'react';

// Note editing time and past days' habit check-ins reach the calendars and
// Reports only through GET /get-calendar-activity, which each of them reads
// fresh. This counter tells the ones on screen to read again after a note
// editing session closes or a habit check-in on another day is added or removed.

let version = 0;
const listeners = new Set<() => void>();

/** Call after a note session closes or a past day's habit check-in changes, so mounted views reload their activity. */
export function notifyActivityChanged(): void {
  version += 1;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getVersion = () => version;

/** A number that changes whenever notifyActivityChanged is called; put it in an effect's dependencies to reload. */
export function useActivityVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
