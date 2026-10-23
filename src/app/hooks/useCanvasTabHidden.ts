'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the user closed the home page's "+ Canvas" tab, the one offered
 * while Canvas isn't connected, remembered on this device. The home page
 * hides it and Settings → Canvas brings it back, so both read it from here
 * and each sees the other's change straight away.
 */

const listeners = new Set<() => void>();
// Where the choice lives when storage can't be written (e.g. private browsing).
const memory = new Map<string, boolean>();

const storageKey = (userId: string | null | undefined) => `tm-home-canvas-tab-hidden:${userId ?? 'guest'}`;

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
};

function read(key: string): boolean {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved !== null) return JSON.parse(saved) === true;
  } catch {
    // malformed or inaccessible storage — fall back to this visit's choice
  }
  return memory.get(key) ?? false;
}

export function useCanvasTabHidden(userId: string | null | undefined) {
  const key = storageKey(userId);
  const hidden = useSyncExternalStore(subscribe, () => read(key), () => false);
  const setHidden = useCallback((next: boolean) => {
    memory.set(key, next);
    try {
      if (next) window.localStorage.setItem(key, JSON.stringify(true));
      else window.localStorage.removeItem(key);
    } catch {
      // e.g. private browsing storage quota — the choice lasts for this visit only
    }
    listeners.forEach(l => l());
  }, [key]);
  return [hidden, setHidden] as const;
}
