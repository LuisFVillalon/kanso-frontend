'use client';

import React, { useEffect, useState } from 'react';
import { KansoMark } from './KansoLogo';

/** The day-complete line from the brand voice table. */
export const DAY_COMPLETE_COPY = 'Done. Your day, settled.';
/** The focus-mode line: entering focus is one key press. */
export const FOCUS_MODE_COPY = 'Ctrl + Zen';

/** How long the moment stays up, including its fade in and out. */
const VISIBLE_MS = 2400;
const FADE_MS = 200;

export interface KeyPress {
  /** Changes on every play, so the same message can play twice in a row. */
  id: number;
  message: string;
}

interface KeyPressMomentProps {
  moment: KeyPress | null;
  onDone: () => void;
}

/** One showing of the moment; remounted (via key) for every play. */
const MomentCard: React.FC<{ message: string; onDone: () => void }> = ({ message, onDone }) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), VISIBLE_MS - FADE_MS);
    const done = setTimeout(onDone, VISIBLE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className={`card kanso-key-press flex items-center gap-3 sm:p-1 lg:pr-4 shadow-product ${
        leaving ? 'animate-fade-out' : 'animate-fade-in'
      }`}
    >
      <KansoMark className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
      {/* Below lg the header has room for the key only (a smaller one on
          phones); the live region still announces the line. */}
      <p className="sr-only lg:not-sr-only font-display text-h3 font-medium whitespace-nowrap text-text-primary">{message}</p>
    </div>
  );
};

/**
 * The brand's key-press moment: the k key presses down once beside a short
 * line, then the card fades away. The press itself (and its reduced-motion
 * fallback) is .kanso-key-press in globals.css. The live region stays
 * mounted so screen readers announce each new message.
 *
 * It renders inside the page header (which must be position: relative) so it
 * takes no space of its own: centred in the header from sm up, and on phones,
 * where the header stacks, to the right of the header controls on its last row.
 */
const KeyPressMoment: React.FC<KeyPressMomentProps> = ({ moment, onDone }) => (
  <div
    role="status"
    aria-live="polite"
    className="pointer-events-none absolute right-0 bottom-2 z-20 sm:bottom-auto sm:right-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
  >
    {moment && <MomentCard key={moment.id} message={moment.message} onDone={onDone} />}
  </div>
);

export default KeyPressMoment;
