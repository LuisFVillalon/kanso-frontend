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

/**
 * Where a moment plays: 'overlay' floats over the page at any scroll
 * position; 'header' sits in the page header's centre slot.
 */
export type KeyPressPlacement = 'overlay' | 'header';

export interface KeyPress {
  /** Changes on every play, so the same message can play twice in a row. */
  id: number;
  message: string;
  placement: KeyPressPlacement;
}

interface KeyPressMomentProps {
  moment: KeyPress | null;
  /** This mount only plays moments with the same placement. */
  placement: KeyPressPlacement;
  onDone: () => void;
}

/** One showing of the moment; remounted (via key) for every play. */
const MomentCard: React.FC<{ message: string; placement: KeyPressPlacement; onDone: () => void }> = ({
  message,
  placement,
  onDone,
}) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), VISIBLE_MS - FADE_MS);
    const done = setTimeout(onDone, VISIBLE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onDone]);

  const fade = leaving ? 'animate-fade-out' : 'animate-fade-in';

  if (placement === 'overlay') {
    return (
      <div className={`card kanso-key-press flex items-center gap-4 px-5 py-3 shadow-product ${fade}`}>
        <KansoMark className="h-12 w-12 flex-shrink-0" />
        <p className="font-display text-h2 text-text-primary">{message}</p>
      </div>
    );
  }

  return (
    <div
      className={`card kanso-key-press hidden @[3.5rem]:flex items-center gap-3 sm:p-1 @[14rem]:pr-4 shadow-product ${fade}`}
    >
      <KansoMark className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
      {/* When the slot is too narrow for the line, only the key shows; the
          live region still announces the line. */}
      <p className="sr-only @[14rem]:not-sr-only font-display text-h3 font-medium whitespace-nowrap text-text-primary">{message}</p>
    </div>
  );
};

/**
 * The brand's key-press moment: the k key presses down once beside a short
 * line, then the card fades away. The press itself (and its reduced-motion
 * fallback) is .kanso-key-press in globals.css. The live region stays
 * mounted so screen readers announce each new message.
 *
 * The 'header' placement fills its parent, which must be a positioned
 * @container (the header's centre slot), so it takes no space of its own.
 */
const KeyPressMoment: React.FC<KeyPressMomentProps> = ({ moment, placement, onDone }) => (
  <div
    role="status"
    aria-live="polite"
    className={`pointer-events-none flex justify-center ${
      placement === 'overlay' ? 'fixed inset-x-0 top-20 z-[60] px-4' : 'absolute inset-0 items-center'
    }`}
  >
    {moment?.placement === placement && (
      <MomentCard key={moment.id} message={moment.message} placement={placement} onDone={onDone} />
    )}
  </div>
);

export default KeyPressMoment;
