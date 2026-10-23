'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * An element's width, kept current as it resizes. Returns a callback ref to
 * attach and the width (null until measured, or where ResizeObserver is
 * missing). Measures right away on attach, so layouts that depend on it
 * don't flash the wrong variant first.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number | null] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  const ref = useCallback((el: T | null) => {
    setElement(el);
    if (el) setWidth(el.getBoundingClientRect().width || null);
  }, []);

  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, width];
}
