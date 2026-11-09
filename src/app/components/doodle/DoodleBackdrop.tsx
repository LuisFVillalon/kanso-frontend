'use client';

// The saved doodle as a read-only background on every page but Home, which
// has the live DoodleCanvas instead. Lives in AppShell so it stays mounted
// across navigation and never reloads between pages.
//
// It only ever reads: nothing here writes to the backend or the local cache,
// so opening a page cannot change the saved drawing.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { fetchDrawing } from '@/app/lib/backend-api';
import { readCachedDrawing, subscribeToDrawing } from '@/app/lib/doodleDrawing';

const DoodleBackdrop: React.FC = () => {
  const onHome = usePathname() === '/';
  const cached = useSyncExternalStore(subscribeToDrawing, readCachedDrawing, () => null);
  const [fetched, setFetched] = useState<string | null>(null);
  const localChange = useRef(false);
  const fetchStarted = useRef(false);

  // The cache only changes when Home restores or edits the drawing, and from
  // then on it's newer than anything fetched here: the backend save is
  // debounced, so a fetch can still return the strokes before the latest.
  useEffect(() => subscribeToDrawing(() => {
    localChange.current = true;
    setFetched(null);
  }), []);

  // Covers landing on another page first, on a device whose cache is empty
  // or behind the backend. Landing on Home, DoodleCanvas does this instead.
  useEffect(() => {
    if (onHome || fetchStarted.current || localChange.current) return;
    fetchStarted.current = true;
    fetchDrawing()
      .then(drawing => {
        if (drawing && !localChange.current) setFetched(drawing.image_data_url);
      })
      .catch(() => {
        // Backend unreachable — the cached copy is still showing.
      });
  }, [onHome]);

  const drawing = fetched ?? cached;
  if (onHome || !drawing) return null;

  // Sized to the viewport including any scrollbar, as DoodleCanvas is
  // (window.innerWidth), so strokes land where they were drawn. `contain`
  // from the top left keeps the drawing's shape and all of it in view when
  // the window differs from the one it was drawn in. Unlike the canvas it can
  // take a negative z-index, needing no pointer input, which keeps it behind
  // all page content, not only the positioned parts.
  return (
    <div
      aria-hidden="true"
      data-testid="doodle-backdrop"
      className="fixed top-0 left-0 w-screen h-screen -z-10 pointer-events-none"
      style={{ backgroundImage: `url("${drawing}")`, backgroundSize: 'contain', backgroundPosition: 'left top', backgroundRepeat: 'no-repeat' }}
    />
  );
};

export default DoodleBackdrop;
