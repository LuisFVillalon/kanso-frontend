import type { AppMode } from '@/app/components/common/ModeSwitcher';

// Home's mode (Overview, kanso focus or Doodle), shared beyond Home so the
// header's focus bar knows whether Home shows the Focus tile. The shell
// publishes the profile's saved mode once it loads and Home publishes each
// switch; until then it's what Home last saved on this device.

export const HOME_MODE_KEY = 'tm-app-mode';

export const isAppMode = (c: unknown): c is AppMode => c === 'normal' || c === 'focus' || c === 'doodle';

let mode: AppMode | null = null;
const listeners = new Set<() => void>();

/** Home's current mode. */
export function getHomeMode(): AppMode {
  if (mode == null) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(HOME_MODE_KEY) ?? 'null');
      mode = isAppMode(saved) ? saved : 'normal';
    } catch {
      mode = 'normal';
    }
  }
  return mode;
}

/** Records Home's mode and tells every listener. */
export function setHomeMode(next: AppMode): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach(l => l());
}

/** Calls `listener` whenever Home's mode changes. */
export function onHomeModeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
