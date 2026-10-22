'use client';

import { useEffect, useState } from 'react';

/**
 * Persists a single scalar preference (mode, a collapse flag, a view-mode
 * toggle, ...) to localStorage (instant local cache) and, once available, to
 * the backend profile via `onRemoteSave` — same "backend wins once loaded"
 * model as useGridOrder.ts, generalized beyond reorderable arrays.
 *
 * `remoteValue` is the backend-authoritative value (e.g. `profile.appMode`
 * from useProfile) — once it resolves to a valid value it overrides whatever
 * localStorage held. A null/undefined remoteValue just means "not saved
 * there yet", so it never overwrites the local value.
 */
export function usePersistedPref<T>(
  storageKey: string,
  defaultValue: T,
  isValid: (candidate: unknown) => candidate is T,
  remoteValue?: T | null,
  onRemoteSave?: (value: T) => void,
) {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      setValue(isValid(parsed) ? parsed : defaultValue);
    } catch {
      // malformed or inaccessible storage — fall back to defaultValue
      setValue(defaultValue);
    }
    // Only re-check when the storage key itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!isValid(remoteValue)) return;
    setValue(remoteValue);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(remoteValue));
    } catch {
      // e.g. private browsing storage quota — preference just won't persist locally
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteValue]);

  const updateValue = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // e.g. private browsing storage quota — preference just won't persist
    }
    onRemoteSave?.(next);
  };

  return [value, updateValue] as const;
}
