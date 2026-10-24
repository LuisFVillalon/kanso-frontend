import { useSyncExternalStore } from 'react';

// Events have no app-wide store: each calendar, the brief and the archive
// read them fresh from the API. This counter tells the ones on screen to
// read again after an event is created, edited, archived, deleted or restored.

let version = 0;
const listeners = new Set<() => void>();

/** Call after any event mutation succeeds, so mounted views reload their events. */
export function notifyEventsChanged(): void {
  version += 1;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getVersion = () => version;

/** A number that changes whenever notifyEventsChanged is called; put it in an effect's dependencies to reload. */
export function useEventsVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
