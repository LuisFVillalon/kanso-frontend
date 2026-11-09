// The saved doodle's per-device cache in localStorage (see DoodleCanvas.tsx
// for how it relates to the backend copy). Writes go through here so anything
// showing the drawing hears about them: a `storage` event only reaches other
// tabs, never the tab that made the change.

const STORAGE_KEY = 'tm_doodle_drawing';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export function readCachedDrawing(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function cacheDrawing(dataUrl: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch {
    // Storage full or unavailable (private browsing) — drawing just won't persist locally.
  }
  notify();
}

export function clearCachedDrawing(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

/** Calls `listener` when the cached drawing changes, in this tab or another. */
export function subscribeToDrawing(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    // A null key means the other tab cleared all of localStorage.
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
