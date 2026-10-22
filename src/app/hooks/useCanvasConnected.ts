'use client';

import { useEffect, useState } from 'react';
import { fetchCanvasConnection } from '@/app/lib/backend-api';

interface UseCanvasConnectedOptions {
  /** Demo sandboxes show the backend's sample Canvas data, so they count as connected. */
  isDemo: boolean;
  /** Bumped by the parent (e.g. when Settings closes) to check again. */
  syncToken?: number;
}

/**
 * Whether the user has a Canvas account connected (Settings → Canvas), so the
 * home page can leave Canvas out for everyone who doesn't. null until the
 * first check answers, and after a check that failed with nothing known yet.
 */
export function useCanvasConnected({ isDemo, syncToken = 0 }: UseCanvasConnectedOptions): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (isDemo) return;
    let live = true;
    fetchCanvasConnection().then(
      conn => { if (live) setConnected(conn.connected); },
      // Keep the last answer; a blip shouldn't hide or show the panel.
      () => {},
    );
    return () => { live = false; };
  }, [isDemo, syncToken]);

  return isDemo ? true : connected;
}
