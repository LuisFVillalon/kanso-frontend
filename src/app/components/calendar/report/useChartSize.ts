'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Sizing hooks the report's SVG charts share.

/** Mood › Patterns' charts shrink to fit one screen in a window this short. */
const SHORT_QUERY = '(max-height: 760px)';
const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 280;

/** The element's content width, following resizes, so the SVG is drawn 1:1 and its text never stretches. */
export const useMeasuredWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, Math.max(MIN_WIDTH, width)] as const;
};

const subscribeShort = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(SHORT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isShortNow = () => typeof window.matchMedia === 'function' && window.matchMedia(SHORT_QUERY).matches;

/** Whether the window is short (760px or less), where Mood › Patterns' charts shrink to fit one screen. */
export const useShortWindow = () => useSyncExternalStore(subscribeShort, isShortNow, () => false);
