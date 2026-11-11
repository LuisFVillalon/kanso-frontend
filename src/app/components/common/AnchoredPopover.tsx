'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MODAL_LAYER } from './Modal';

/** Space kept between the popover, its anchor and the viewport's edges. */
const GAP_PX = 8;

/** Lets something inside a popover keep it open while it shows a dialog of its own on top. */
const PopoverHoldContext = createContext<(held: boolean) => void>(() => {});

/**
 * Keeps the popover this is inside open while `held`: a press in a dialog it
 * opened, or the Escape that closes that dialog, then leaves the popover be.
 * Outside a popover it does nothing.
 */
export function useHoldPopover(held: boolean): void {
  const hold = useContext(PopoverHoldContext);
  useEffect(() => {
    if (!held) return;
    hold(true);
    return () => hold(false);
  }, [held, hold]);
}

interface AnchoredPopoverProps {
  /** The box to sit beside, in viewport coordinates (e.g. a clicked block's getBoundingClientRect()). */
  anchor: DOMRect;
  onClose: () => void;
  /** Names the dialog for screen readers. */
  label: string;
  /** A selector inside the popover to focus when it opens; the first focusable element otherwise. */
  initialFocus?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A small non-modal dialog beside an anchor box, like Google Calendar's event
 * card: to the anchor's right, or its left when that runs off screen, kept
 * inside the viewport. Escape or a press outside closes it, and focus goes
 * back where it was. Portaled to <body> so no scrolling box clips it.
 */
const AnchoredPopover: React.FC<AnchoredPopoverProps> = ({ anchor, onClose, label, initialFocus, className = '', children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; });
  // How many things inside are holding it open (see useHoldPopover).
  const holdsRef = useRef(0);
  const hold = useMemo(() => (held: boolean) => { holdsRef.current += held ? 1 : -1; }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: width, offsetHeight: height } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + GAP_PX;
    if (left + width > vw - GAP_PX) left = anchor.left - width - GAP_PX;
    left = Math.max(GAP_PX, Math.min(left, vw - width - GAP_PX));
    const top = Math.max(GAP_PX, Math.min(anchor.top, vh - height - GAP_PX));
    setPosition({ left, top });
  }, [anchor]);

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const target = (initialFocus && el?.querySelector<HTMLElement>(initialFocus))
      || el?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    target?.focus();

    const onPointerDown = (e: PointerEvent) => {
      if (holdsRef.current === 0 && !el?.contains(e.target as Node)) onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && holdsRef.current === 0) onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      // Give focus back only if it went down with the popover, not if something
      // it opened (a modal) has taken it since.
      const focusLost = !document.activeElement || document.activeElement === document.body;
      if (focusLost && returnTo?.isConnected) returnTo.focus();
    };
    // Open once per mount; a new anchor only moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`fixed w-80 max-w-[calc(100vw-16px)] rounded-xl border border-border p-4 ${className}`}
      style={{
        zIndex: MODAL_LAYER.base,
        left: position?.left ?? anchor.right + GAP_PX,
        top: position?.top ?? anchor.top,
        visibility: position ? 'visible' : 'hidden',
        backgroundColor: 'var(--tm-surface-raised)',
        boxShadow: 'var(--tm-shadow-lg)',
      }}
    >
      <PopoverHoldContext.Provider value={hold}>{children}</PopoverHoldContext.Provider>
    </div>,
    document.body,
  );
};

export default AnchoredPopover;
