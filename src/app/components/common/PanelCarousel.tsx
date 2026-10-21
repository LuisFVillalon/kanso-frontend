'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, NotebookText, SquareCheckBig, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';

/**
 * The home page's panel strip: Tasks, Notes and Canvas sit on a ring, and two
 * neighbours show side by side in the resizable split (one at a time on
 * phones). ‹ and the left arrow key slide the strip left one panel, so the
 * next ring panel enters on the right (Tasks+Notes → Notes+Canvas →
 * Canvas+Tasks → Tasks+Notes); › and the right arrow key go the other way.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * slide.
 */

export type PanelKey = 'tasks' | 'notes' | 'canvas';
export type HomePanels = 'tasks,notes' | 'notes,canvas' | 'canvas,tasks';

export const PANEL_RING: readonly PanelKey[] = ['tasks', 'notes', 'canvas'];
export const DEFAULT_HOME_PANELS: HomePanels = 'tasks,notes';

const HOME_PANELS: readonly HomePanels[] = ['tasks,notes', 'notes,canvas', 'canvas,tasks'];

export const isHomePanels = (c: unknown): c is HomePanels => HOME_PANELS.includes(c as HomePanels);

const ringAt = (i: number) => PANEL_RING[((i % 3) + 3) % 3];
const indexOf = (value: HomePanels) => HOME_PANELS.indexOf(value);

/** The pair after sliding: `dir` 1 slides the strip left (‹), -1 slides it right (›). */
export function slidePanels(value: HomePanels, dir: 1 | -1): HomePanels {
  return HOME_PANELS[(indexOf(value) + dir + 3) % 3];
}

/** The panels on screen: both of the pair, or only the left one on a phone. */
export function shownPanels(value: HomePanels, phone: boolean): PanelKey[] {
  const [left, right] = value.split(',') as PanelKey[];
  return phone ? [left] : [left, right];
}

/**
 * Which way to slide to bring `panel` on screen: it enters from the side it
 * sits on in the ring. 0 when it's already showing.
 */
export function revealDirection(value: HomePanels, panel: PanelKey, phone: boolean): 0 | 1 | -1 {
  const shown = shownPanels(value, phone);
  if (shown.includes(panel)) return 0;
  return panel === ringAt(indexOf(value) + shown.length) ? 1 : -1;
}

const PANEL_META: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: SquareCheckBig },
  notes: { label: 'Notes', icon: NotebookText },
  canvas: { label: 'Canvas', icon: GraduationCap },
};

const names = (keys: PanelKey[]) => keys.map(k => PANEL_META[k].label).join(' + ');

// The gap the drag handle takes between the two panels.
const HANDLE_PX = 8;
// Fallback for a transitionend that never fires (tab hidden mid-slide).
const SLIDE_FALLBACK_MS = 700;

const PHONE_QUERY = '(max-width: 767px)';

const subscribePhone = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhoneNow = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keys typed here belong to the field or widget, not the panel strip. */
const ARROW_KEY_IGNORED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="listbox"], [role="menu"]';

interface Slide {
  /** The panels in the moving track, left to right, with their widths in px. */
  keys: PanelKey[];
  widths: number[];
  viewPx: number;
  from: number;
  to: number;
  running: boolean;
}

export interface PanelCarouselHandle {
  /** Slides `panel` on screen if it isn't showing. */
  show: (panel: PanelKey) => void;
}

interface PanelCarouselProps {
  value: HomePanels;
  onChange: (next: HomePanels) => void;
  /** The left panel's share of the split, in %; carried across slides. */
  leftWidthPct: number;
  splitRef: React.RefObject<HTMLDivElement | null>;
  onSplitterMouseDown: (e: React.MouseEvent) => void;
  /** Renders a panel; `widthPct` is the share of the split it currently fills. */
  renderPanel: (key: PanelKey, slot: { widthPct: number }) => React.ReactNode;
}

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  { value, onChange, leftWidthPct, splitRef, onSplitterMouseDown, renderPanel },
  ref,
) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  const [slide, setSlide] = useState<Slide | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [left, right] = value.split(',') as PanelKey[];
  const onScreen = slide ? slide.keys : [left, right];
  // Panels mount the first time they're shown and then stay mounted.
  const [mounted, setMounted] = useState<PanelKey[]>(() => [left, right]);
  const unmounted = onScreen.filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  const finishSlide = useCallback(() => {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
    setSlide(null);
  }, []);

  useEffect(() => () => { if (fallbackTimer.current) clearTimeout(fallbackTimer.current); }, []);

  const slideBy = useCallback((dir: 1 | -1) => {
    if (slide) return;
    const next = slidePanels(value, dir);
    const viewPx = splitRef.current?.clientWidth ?? 0;
    if (prefersReducedMotion() || viewPx === 0) {
      onChange(next);
      return;
    }
    const index = indexOf(value);
    const first = dir === 1 ? index : index - 1;
    const keys = Array.from({ length: phone ? 2 : 3 }, (_, i) => ringAt(first + i));
    const leftPx = (viewPx * leftWidthPct) / 100;
    const rightPx = viewPx - leftPx - HANDLE_PX;
    // Sliding left, the incoming panel fills what the outgoing one leaves;
    // sliding right, it enters at the left panel's width.
    const widths = phone ? [viewPx, viewPx] : dir === 1 ? [leftPx, rightPx, leftPx] : [leftPx, leftPx, rightPx];
    const offset = -(widths[0] + HANDLE_PX);
    setSlide({ keys, widths, viewPx, from: dir === 1 ? 0 : offset, to: dir === 1 ? offset : 0, running: false });
    // The indicator moves to the new panels while the strip slides.
    onChange(next);
    fallbackTimer.current = setTimeout(finishSlide, SLIDE_FALLBACK_MS);
  }, [slide, value, splitRef, phone, leftWidthPct, onChange, finishSlide]);

  // Start the transition once the track has painted at its start offset: two
  // frames, since the first can land before that paint.
  useEffect(() => {
    if (!slide || slide.running) return;
    let frame = 0;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setSlide(prev => (prev ? { ...prev, running: true } : prev)));
    });
    return () => cancelAnimationFrame(frame);
  }, [slide]);

  const show = useCallback((panel: PanelKey) => {
    const dir = revealDirection(value, panel, phone);
    if (dir !== 0) slideBy(dir);
  }, [value, phone, slideBy]);

  useImperativeHandle(ref, () => ({ show }), [show]);

  const slideByRef = useRef(slideBy);
  useEffect(() => { slideByRef.current = slideBy; }, [slideBy]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(ARROW_KEY_IGNORED)) return;
      // A modal is open over the page.
      if (document.querySelector('.modal-overlay.fixed')) return;
      e.preventDefault();
      slideByRef.current(e.key === 'ArrowLeft' ? 1 : -1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const shown = shownPanels(value, phone);
  const rightWidthPct = 100 - leftWidthPct;

  const slotProps = (key: PanelKey): { className: string; style?: React.CSSProperties; widthPct: number } => {
    if (slide) {
      const i = slide.keys.indexOf(key);
      if (i === -1) return { className: 'hidden', widthPct: 0 };
      return { className: 'split-slot', style: { order: i, width: slide.widths[i] }, widthPct: (slide.widths[i] / slide.viewPx) * 100 };
    }
    if (key === left) return { className: 'split-slot split-left', style: { order: 0 }, widthPct: phone ? 100 : leftWidthPct };
    if (key === right) return { className: 'split-slot split-right hidden md:block', style: { order: 2 }, widthPct: rightWidthPct };
    return { className: 'hidden', widthPct: 0 };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => slideBy(1)}
          aria-label="Slide left"
          title={`Slide left: ${names(shownPanels(slidePanels(value, 1), phone))}`}
          className="w-9 h-9 rounded-full inline-flex items-center justify-center border border-border bg-surface text-text-secondary transition-colors duration-150 hover:border-accent hover:text-accent active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div
          role="group"
          aria-label={`Panels shown: ${names(shown)}`}
          className="inline-flex gap-1 p-1 rounded-full"
          style={{ backgroundColor: 'var(--tm-surface-raised)' }}
        >
          {PANEL_RING.map(key => {
            const { label, icon: Icon } = PANEL_META[key];
            const on = shown.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                aria-label={label}
                title={on ? `${label} (showing)` : `Show ${label}`}
                onClick={() => show(key)}
                className={`w-9 h-8 rounded-full inline-flex items-center justify-center ${on ? 'cursor-default' : 'hover:text-text-primary'}`}
                style={{
                  backgroundColor: on ? 'var(--tm-accent)' : 'transparent',
                  color: on ? 'var(--tm-accent-text)' : 'var(--tm-text-muted)',
                  transition: 'background-color var(--tm-dur-base) var(--tm-ease), color var(--tm-dur-base) var(--tm-ease)',
                }}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => slideBy(-1)}
          aria-label="Slide right"
          title={`Slide right: ${names(shownPanels(slidePanels(value, -1), phone))}`}
          className="w-9 h-9 rounded-full inline-flex items-center justify-center border border-border bg-surface text-text-secondary transition-colors duration-150 hover:border-accent hover:text-accent active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={splitRef}
        data-sliding={slide ? 'true' : undefined}
        className={slide ? 'overflow-hidden' : undefined}
        style={{ ['--tasks-w' as string]: `${leftWidthPct}%` }}
      >
        <div
          data-testid="panel-track"
          className="flex"
          style={slide ? {
            gap: HANDLE_PX,
            transform: `translateX(${slide.running ? slide.to : slide.from}px)`,
            transition: slide.running ? 'transform var(--tm-dur-slow) var(--tm-ease)' : undefined,
            willChange: 'transform',
          } : undefined}
          onTransitionEnd={e => {
            if (e.target === e.currentTarget && e.propertyName === 'transform') finishSlide();
          }}
        >
          {PANEL_RING.filter(key => mounted.includes(key)).map(key => {
            const { className, style, widthPct } = slotProps(key);
            return (
              <div key={key} data-panel={key} className={className} style={style}>
                {renderPanel(key, { widthPct })}
              </div>
            );
          })}
          <div className={slide ? 'hidden' : 'hidden md:flex shrink-0'} style={{ order: 1 }}>
            <DragHandle onMouseDown={onSplitterMouseDown} />
          </div>
        </div>
      </div>
    </div>
  );
});

export default PanelCarousel;
