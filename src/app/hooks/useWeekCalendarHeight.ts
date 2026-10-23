'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';

export const WEEK_HEIGHT_KEY_PREFIX = 'tm-calendar-week-height';

const readSavedHeight = (key: string): number | null => {
  try {
    const saved = Number(JSON.parse(window.localStorage.getItem(key) ?? 'null'));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  } catch {
    return null;
  }
};

/**
 * The calendar page's week view height: its default until the user drags it
 * taller, then that height, remembered on this device per account.
 */
export const useWeekCalendarHeight = () => {
  const { user } = useAuth();
  const storageKey = `${WEEK_HEIGHT_KEY_PREFIX}:${user?.id ?? 'anon'}`;
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const dragged = useRef<number | null>(null);

  // Restored before the first paint, so the grid doesn't jump. (Read in an
  // effect, not during render: the server has no localStorage.)
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeightPx(readSavedHeight(storageKey));
  }, [storageKey]);

  const onResize = useCallback((px: number) => {
    dragged.current = px;
    setHeightPx(px);
  }, []);

  const onResizeEnd = useCallback(() => {
    if (dragged.current === null) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(dragged.current));
    } catch {
      // e.g. private browsing storage quota — the height just won't be remembered
    }
    dragged.current = null;
  }, [storageKey]);

  return { heightPx, onResize, onResizeEnd };
};
