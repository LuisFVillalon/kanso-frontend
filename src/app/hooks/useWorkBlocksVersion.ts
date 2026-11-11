import { useSyncExternalStore } from 'react';

// Work blocks, like events, have no app-wide store: the calendar, the brief
// and the suggestions read them fresh from the API. This counter tells the
// ones on screen to read again after a block is made, moved or removed.

let version = 0;
const listeners = new Set<() => void>();

/** Call after any work block change succeeds (or a task change that removes its blocks), so mounted views reload them. */
export function notifyWorkBlocksChanged(): void {
  version += 1;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getVersion = () => version;

/** A number that changes whenever notifyWorkBlocksChanged is called. */
export function useWorkBlocksVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
