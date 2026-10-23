'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a pressed control keeps .key-press-play: the 300 ms press, plus a little slack. */
const KEY_PRESS_MS = 350;

/**
 * The key press on a group of toggles (globals.css .key-press-play): `press(key)`
 * on a click plays it once on that control, and `pressing(key)` says whether
 * to give it the class. Pressing another control moves the press there.
 */
export function useKeyPress<K extends string>() {
  const [pressed, setPressed] = useState<K | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const press = useCallback((key: K) => {
    if (timer.current) clearTimeout(timer.current);
    setPressed(key);
    timer.current = setTimeout(() => { timer.current = null; setPressed(null); }, KEY_PRESS_MS);
  }, []);

  const pressing = (key: K) => pressed === key;

  return { press, pressing };
}
