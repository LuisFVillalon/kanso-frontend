'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps a conditionally-rendered subtree mounted for `duration` ms after
 * `show` flips to false, so it can play a CSS exit animation instead of
 * vanishing instantly (as a plain `{show && <X/>}` does). Pair with the
 * `animate-fade-in`/`animate-fade-out` utilities in globals.css, or any
 * animation classes of matching duration.
 */
export function useMountTransition(show: boolean, duration = 200) {
  const [shouldRender, setShouldRender] = useState(show);

  // Showing mounts immediately: adjust state during render rather than in an
  // effect, so there's no extra frame where `show` is true but nothing renders.
  if (show && !shouldRender) setShouldRender(true);

  // Hiding unmounts only after the exit animation has had time to play.
  useEffect(() => {
    if (show) return;
    const timeout = setTimeout(() => setShouldRender(false), duration);
    return () => clearTimeout(timeout);
  }, [show, duration]);

  return shouldRender;
}
