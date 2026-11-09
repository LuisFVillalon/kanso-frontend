// The saved doodle's per-device cache in localStorage (see DoodleCanvas.tsx
// for how it relates to the backend copy). Writes go through here so anything
// showing the drawing hears about them: a `storage` event only reaches other
// tabs, never the tab that made the change.

const STORAGE_KEY = 'tm_doodle_drawing';

type DrawingListener = (dataUrl: string | null) => void;

const listeners = new Set<DrawingListener>();
const notify = (dataUrl: string | null) => listeners.forEach(listener => listener(dataUrl));

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
  notify(dataUrl);
}

export function clearCachedDrawing(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify(null);
}

/**
 * Calls `listener` with the new drawing (null once cleared) when it changes,
 * in this tab or another. In this tab that's the drawing as written, which the
 * cache won't hold if the write failed.
 */
export function subscribeToDrawing(listener: DrawingListener): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener(e.newValue);
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
