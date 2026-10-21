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
      className={`card kanso-key-press flex items-center gap-4 px-5 py-3 shadow-product ${
        leaving ? 'animate-fade-out' : 'animate-fade-in'
      }`}
    >
      <KansoMark className="h-12 w-12 flex-shrink-0" />
      <p className="font-display text-h2 text-text-primary">{message}</p>
    </div>
  );
};

/**
 * The brand's key-press moment: the k key presses down once beside a short
 * line, then the card fades away. The press itself (and its reduced-motion
 * fallback) is .kanso-key-press in globals.css. The live region stays
 * mounted so screen readers announce each new message.
 */
const KeyPressMoment: React.FC<KeyPressMomentProps> = ({ moment, onDone }) => (
  <div
    role="status"
    aria-live="polite"
    className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4"
  >
    {moment && <MomentCard key={moment.id} message={moment.message} onDone={onDone} />}
  </div>
);

export default KeyPressMoment;
