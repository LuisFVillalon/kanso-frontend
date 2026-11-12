// The header's focus bar asks Home to open the expanded Focus tile. Home may
// not be mounted yet (the bar navigates there first), so the ask waits here
// until the dashboard's tiles pick it up, and goes stale after a moment so a
// later visit to Home doesn't open it out of the blue.

/** How long an unanswered ask stays good, in ms. */
export const FOCUS_WIDGET_REQUEST_MS = 5_000;

let requestedAt: number | null = null;
const listeners = new Set<() => void>();

/** Asks the dashboard to open the Focus tile. */
export function requestFocusWidget(): void {
  requestedAt = Date.now();
  listeners.forEach(l => l());
}

/** True (once) when an ask is waiting and still fresh; clears it either way. */
export function takeFocusWidgetRequest(): boolean {
  const at = requestedAt;
  requestedAt = null;
  return at != null && Date.now() - at <= FOCUS_WIDGET_REQUEST_MS;
}

/** Calls `listener` on every ask. */
export function onFocusWidgetRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
