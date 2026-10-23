'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, GripVertical, Maximize2, Minimize2, Move, NotebookText, Plus, SquareCheckBig, X, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';
import { longPressTip } from '@/app/components/common/longPressTip';
import { useKeyPress } from '@/app/hooks/useKeyPress';

/**
 * The home page's panels: Tasks and Notes, plus Canvas when the user has it
 * connected. On a wide screen the panels are their own controls: one panel on
 * fills the width, two share the resizable split, three sit in resizable
 * columns. A hidden panel waits as a slim rail at the right edge: tap it to
 * show that panel alone, or its + to add it beside the others. Each panel's
 * header can show it alone (maximize) or hide it, and a panel shown alone can
 * go back to the last split; the last panel on stays on. A phone shows one
 * panel at a time, swiped between or picked from icon tabs, and remembers its
 * pick apart from the wide screen's.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * switch. A phone mounts them all, side by side, so the next one is there to
 * swipe to.
 *
 * The user puts the panels in their own order: on a wide screen by dragging
 * a panel's (or a rail's) grip, or with the arrow keys on it; on a phone by
 * long-pressing a tab and dragging it. A rail dropped among the panels shows
 * that panel there. Panels are placed by CSS order rather than moved in the
 * DOM, so reordering never remounts or reloads one.
 */

export type PanelKey = 'tasks' | 'notes' | 'canvas';
/**
 * The panels on, as profile.home_panels saves them: comma-separated, in
 * PANEL_ORDER ("tasks,canvas"). Older saves named an ordered pair
 * ("canvas,tasks"); those still read as the panels they name.
 */
export type HomePanels = string;

export const PANEL_ORDER: readonly PanelKey[] = ['tasks', 'notes', 'canvas'];
export const DEFAULT_HOME_PANELS: HomePanels = 'tasks,notes';

export const isPanelKey = (c: unknown): c is PanelKey => PANEL_ORDER.includes(c as PanelKey);

/** The panels `value` turns on, in PANEL_ORDER, or null when it isn't a saved set of panels. */
export function parseHomePanels(value: unknown): PanelKey[] | null {
  if (typeof value !== 'string') return null;
  const keys = value.split(',');
  if (!keys.every(isPanelKey) || new Set(keys).size !== keys.length) return null;
  return PANEL_ORDER.filter(k => keys.includes(k));
}

export const isHomePanels = (c: unknown): c is HomePanels => parseHomePanels(c) !== null;

export const toHomePanels = (keys: readonly PanelKey[]): HomePanels => PANEL_ORDER.filter(k => keys.includes(k)).join(',');

/** The order the panels sit in, saved on this device: every panel, once each. */
export function parsePanelOrder(value: unknown): PanelKey[] | null {
  if (!Array.isArray(value) || value.length !== PANEL_ORDER.length) return null;
  return PANEL_ORDER.every(k => value.includes(k)) ? [...value] : null;
}

export const isPanelOrder = (c: unknown): c is PanelKey[] => parsePanelOrder(c) !== null;

/** `keys`, sorted into `order`. */
export const inOrder = (keys: readonly PanelKey[], order: readonly PanelKey[]): PanelKey[] =>
  [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));

/** `order` with `key` moved to just before `target`, or just after it when `after`. */
export function movePanel(order: readonly PanelKey[], key: PanelKey, target: PanelKey, after: boolean): PanelKey[] {
  if (key === target) return [...order];
  const rest = order.filter(k => k !== key);
  rest.splice(rest.indexOf(target) + (after ? 1 : 0), 0, key);
  return rest;
}

/** The panels on a wide screen: the saved ones that are available, or Tasks and Notes when none of them is. */
export function widePanels(value: HomePanels, available: readonly PanelKey[]): PanelKey[] {
  const on = (parseHomePanels(value) ?? []).filter(k => available.includes(k));
  return on.length > 0 ? on : (parseHomePanels(DEFAULT_HOME_PANELS) as PanelKey[]);
}

/** The panels a single shown panel goes back to: the remembered split, when it's still more than one panel. */
export function restorePanels(split: HomePanels, available: readonly PanelKey[]): PanelKey[] | null {
  const keys = (parseHomePanels(split) ?? []).filter(k => available.includes(k));
  return keys.length > 1 ? keys : null;
}

/** The panel a phone shows: its saved pick, or Tasks when that isn't available. */
export const phonePanel = (value: PanelKey, available: readonly PanelKey[]): PanelKey =>
  available.includes(value) ? value : 'tasks';

const PANEL_META: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: SquareCheckBig },
  notes: { label: 'Notes', icon: NotebookText },
  canvas: { label: 'Canvas', icon: GraduationCap },
};

/** "Tasks + Notes": a set of panels, named. */
const panelsName = (keys: readonly PanelKey[]) => keys.map(k => PANEL_META[k].label).join(' + ');

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

/** The width of each divider between panels, in px (DragHandle's w-2). */
const DIVIDER_PX = 8;
/** The gap between a phone's panels as they're swiped, in px (the track's gap-3). */
const TRACK_GAP_PX = 12;
/** How long a phone's swipe has to rest before it counts as landing on a panel. */
const SWIPE_SETTLE_MS = 100;
/** How long a phone's tab is held before it can be dragged to a new place. */
const TAB_HOLD_MS = 350;
/** How far a held tab can drift before the hold counts as a scroll or swipe instead. */
const TAB_HOLD_SLOP_PX = 8;
/** How long a reorder's panels take to slide into their new places. */
const REFLOW_MS = 220;

export interface PanelCarouselHandle {
  /** Brings `panel` on screen if it isn't showing. */
  show: (panel: PanelKey) => void;
}

interface PanelCarouselProps {
  /** The panels on, on a wide screen. */
  value: HomePanels;
  onChange: (next: HomePanels) => void;
  /** The last split (more than one panel) on a wide screen, which a panel shown alone goes back to. */
  splitValue: HomePanels;
  onSplitChange: (next: HomePanels) => void;
  /** The order the panels sit in, every panel once. */
  order: readonly PanelKey[];
  onOrderChange: (next: PanelKey[]) => void;
  /** The panel a phone shows. */
  phoneValue: PanelKey;
  onPhoneChange: (next: PanelKey) => void;
  /** The panels the user can see; Canvas only while it's connected. */
  available: readonly PanelKey[];
  /** Each panel's share of the split, in %, for `count` panels side by side. */
  panelWidths: (count: number) => number[];
  /** Whether the dividers between `count` panels side by side can be dragged; they're hidden when not. */
  dividersMovable: (count: number) => boolean;
  splitRef: React.RefObject<HTMLDivElement | null>;
  /** Starts dragging divider `index` (0 is the leftmost) between `count` panels. */
  onDividerPointerDown: (count: number, index: number, e: React.PointerEvent) => void;
  /** Renders a panel; `widthPct` is the share of the split it currently fills. */
  renderPanel: (key: PanelKey, slot: { widthPct: number }) => React.ReactNode;
}

const TABS_ID = 'home-panels';
export const panelTabId = (key: PanelKey) => `${TABS_ID}-tab-${key}`;
export const panelTabpanelId = (key: PanelKey) => `${TABS_ID}-tabpanel-${key}`;

/** A small icon button on a panel's header or rail, named by its tooltip. */
function PanelControl({ label, icon: Icon, pressed, onClick, tipSide }: {
  label: string;
  icon: LucideIcon;
  pressed: boolean;
  onClick: () => void;
  tipSide?: 'left';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      data-tip-align={tipSide ? undefined : 'end'}
      data-tip-side={tipSide}
      {...longPressTip}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors ${pressed ? 'key-press-play' : ''}`}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}

/**
 * What a reorder drag picks up and where it can land: a panel among the
 * panels; a rail among the panels (showing it there) or the other rails; a
 * phone's tab among the tabs.
 */
type DragFrom = 'panel' | 'rail' | 'tab';
const DROP_KINDS: Record<DragFrom, readonly DragFrom[]> = { panel: ['panel'], rail: ['panel', 'rail'], tab: ['tab'] };

/** What's dragged, and where the pointer picked it up. */
interface Drag { key: PanelKey; from: DragFrom; x: number; y: number }
interface Drop { key: PanelKey; kind: DragFrom; after: boolean }

const sameDrop = (a: Drop | null, b: Drop | null) =>
  a === b || (!!a && !!b && a.key === b.key && a.kind === b.kind && a.after === b.after);

/** The ghost's place beside the pointer, on whichever side has the room. */
const ghostPlace = (x: number, y: number) => ({
  left: `${x + 12}px`,
  top: `${y - 12}px`,
  transform: x > window.innerWidth / 2 ? 'translateX(calc(-100% - 24px))' : '',
});

/** The drop target nearest the pointer among `root`'s targets of `kinds`, and which side of it the pointer is on. */
function dropAt(root: HTMLElement, kinds: readonly DragFrom[], x: number, y: number): Drop | null {
  let best: Drop | null = null;
  let bestDist = Infinity;
  for (const el of root.querySelectorAll<HTMLElement>('[data-drop-key]')) {
    const key = el.dataset.dropKey;
    const kind = el.dataset.dropKind as DragFrom;
    if (!kinds.includes(kind) || !isPanelKey(key)) continue;
    const r = el.getBoundingClientRect();
    // 0 while the pointer is over the target, else how far it is from its edge.
    const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (dist >= bestDist) continue;
    const across = kind === 'rail' ? y - (r.top + r.height / 2) : x - (r.left + r.width / 2);
    best = { key, kind, after: across > 0 };
    bestDist = dist;
  }
  return best;
}

/** The accent bar showing where a dragged panel will land: before or after a target, across or down. */
function DropIndicator({ after, vertical }: { after: boolean; vertical?: boolean }) {
  const edge = vertical ? (after ? 'bottom-0' : 'top-0') : (after ? 'right-0' : 'left-0');
  return (
    <span
      aria-hidden
      data-drop-indicator={after ? 'after' : 'before'}
      className={`pointer-events-none absolute z-10 rounded-full bg-accent ${edge} ${vertical ? 'inset-x-1 h-[3px]' : 'inset-y-1 w-[3px]'}`}
    />
  );
}

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  { value, onChange, splitValue, onSplitChange, order, onOrderChange, phoneValue, onPhoneChange, available: availableKeys, panelWidths, dividersMovable, splitRef, onDividerPointerDown, renderPanel },
  ref,
) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  // Every list of panels below runs in the user's order.
  const available = inOrder(availableKeys, order);
  const on = inOrder(widePanels(value, available), order);
  const phoneShown = phonePanel(phoneValue, available);
  const shown = phone ? [phoneShown] : on;
  const widths = panelWidths(on.length);
  const dividerCount = dividersMovable(on.length) ? on.length - 1 : 0;
  const restoreTo = restorePanels(splitValue, available);
  const hidden = available.filter(k => !on.includes(k));
  const { press, pressing } = useKeyPress<string>();

  // Panels mount the first time they're shown and then stay mounted; a phone shows them all to swipe between.
  const [mounted, setMounted] = useState<PanelKey[]>(() => shown);
  const unmounted = (phone ? available : shown).filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  /** Shows `next` on a wide screen, remembering the latest split for going back to. */
  const setPanels = (next: readonly PanelKey[]) => {
    if (next.length === 0) return;
    if (next.length > 1) onSplitChange(toHomePanels(next));
    else if (on.length > 1) onSplitChange(toHomePanels(on));
    onChange(toHomePanels(next));
  };
  const act = (pressKey: string, run: () => void) => { press(pressKey); run(); };

  const show = (panel: PanelKey) => {
    if (shown.includes(panel) || !available.includes(panel)) return;
    if (phone) onPhoneChange(panel);
    else setPanels([...on, panel]);
  };

  useImperativeHandle(ref, () => ({ show }));

  // ── Reordering ────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Where each panel sat just before a reorder, so they slide to their new places.
  const reflowFrom = useRef<Map<HTMLElement, DOMRect> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  // A held-and-dragged tab's click is its release, not a pick.
  const swallowClick = useRef(false);
  // The panels' DOM stays put while the pointer moves; only the ghost follows it.
  const ghostRef = useRef<HTMLDivElement>(null);
  // Whatever had focus when a reorder moved it in the DOM, to give focus back to.
  const refocus = useRef<Element | null>(null);

  const reorder = (key: PanelKey, next: PanelKey[], group: readonly PanelKey[]) => {
    if (next.join() === order.join()) return;
    refocus.current = document.activeElement;
    if (!phone && !prefersReducedMotion() && splitRef.current) {
      reflowFrom.current = new Map([...splitRef.current.querySelectorAll<HTMLElement>('.split-slot')].map(el => [el, el.getBoundingClientRect()]));
    }
    onOrderChange(next);
    const placed = inOrder(group, next);
    setAnnouncement(`${PANEL_META[key].label} moved to position ${placed.indexOf(key) + 1} of ${placed.length}.`);
  };

  // FLIP: each panel starts where it was and slides to its new place.
  const orderKey = order.join();
  useLayoutEffect(() => {
    const el = refocus.current;
    refocus.current = null;
    if (el instanceof HTMLElement && el !== document.activeElement && el.isConnected && rootRef.current?.contains(el)) el.focus();
  }, [orderKey]);
  useLayoutEffect(() => {
    const from = reflowFrom.current;
    reflowFrom.current = null;
    if (!from) return;
    const moved: HTMLElement[] = [];
    from.forEach((was, el) => {
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      if (Math.abs(dx) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx}px)`;
      moved.push(el);
    });
    if (moved.length === 0) return;
    moved[0].getBoundingClientRect();
    const raf = requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = `transform ${REFLOW_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
        el.style.transform = '';
        const done = () => { el.style.transition = ''; el.removeEventListener('transitionend', done); };
        el.addEventListener('transitionend', done);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [orderKey]);

  const startDrag = (key: PanelKey, from: DragFrom, x: number, y: number) => {
    setDrag({ key, from, x, y });
    setDrop(null);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
  };

  // While dragging: the pointer moves the drop, releasing places the panel, Escape puts it back.
  const dragging = drag !== null;
  const dragRef = useRef(drag);
  const dropRef = useRef(drop);
  useEffect(() => { dragRef.current = drag; dropRef.current = drop; });
  useEffect(() => {
    if (!dragging) return;
    document.body.style.setProperty('user-select', 'none');
    const end = () => {
      // Cleared at once, so a release right after Escape finds nothing to drop.
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
    };
    const move = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current || !rootRef.current) return;
      e.preventDefault();
      document.body.style.setProperty('cursor', 'grabbing');
      if (ghostRef.current) Object.assign(ghostRef.current.style, ghostPlace(e.clientX, e.clientY));
      const at = dropAt(rootRef.current, DROP_KINDS[current.from], e.clientX, e.clientY);
      const next = at && at.key !== current.key ? at : null;
      if (sameDrop(next, dropRef.current)) return;
      dropRef.current = next;
      setDrop(next);
    };
    const up = () => {
      const current = dragRef.current;
      const at = dropRef.current;
      end();
      if (!current || !at) return;
      if (current.from === 'tab') {
        // Only the click this release makes, if it makes one at all.
        swallowClick.current = true;
        setTimeout(() => { swallowClick.current = false; }, 0);
      }
      const next = movePanel(order, current.key, at.key, at.after);
      const group = current.from === 'tab' ? available : current.from === 'rail' && at.kind === 'rail' ? hidden : on;
      if (current.from === 'rail' && at.kind === 'panel') {
        reorder(current.key, next, [...on, current.key]);
        setPanels([...on, current.key]);
      } else reorder(current.key, next, group);
    };
    const cancel = () => {
      const current = dragRef.current;
      end();
      if (current) setAnnouncement(`Moving ${PANEL_META[current.key].label} cancelled.`);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      cancel();
    };
    // A touch drag mustn't scroll the page out from under it.
    const touchMove = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchmove', touchMove);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
    // Re-bound per drag; the handlers read the drag and drop through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  /** Pressing a grip picks its panel up straight away. */
  const onGripPointerDown = (key: PanelKey, from: DragFrom) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    startDrag(key, from, e.clientX, e.clientY);
  };

  /** The arrow keys on a grip move its panel one place along `group`, Home and End to either end. */
  const onGripKeyDown = (key: PanelKey, group: readonly PanelKey[], vertical: boolean) => (e: React.KeyboardEvent) => {
    const i = group.indexOf(key);
    const back = vertical ? 'ArrowUp' : 'ArrowLeft';
    const forward = vertical ? 'ArrowDown' : 'ArrowRight';
    let target: PanelKey | undefined;
    let after = false;
    if (e.key === back) target = group[i - 1];
    else if (e.key === forward) { target = group[i + 1]; after = true; }
    else if (e.key === 'Home') target = group[0];
    else if (e.key === 'End') { target = group[group.length - 1]; after = true; }
    else return;
    e.preventDefault();
    if (target && target !== key) reorder(key, movePanel(order, key, target, after), group);
  };

  const grip = (key: PanelKey, from: 'panel' | 'rail', group: readonly PanelKey[]) => {
    const { label } = PANEL_META[key];
    const vertical = from === 'rail';
    return (
      <button
        type="button"
        aria-label={`Move ${label}`}
        aria-describedby={`${TABS_ID}-reorder-hint`}
        aria-keyshortcuts={vertical ? 'ArrowUp ArrowDown' : 'ArrowLeft ArrowRight'}
        data-reorder-grip={key}
        data-tip="Drag to reorder"
        data-tip-side={vertical ? 'left' : undefined}
        onPointerDown={onGripPointerDown(key, from)}
        onKeyDown={onGripKeyDown(key, group, vertical)}
        className={`flex items-center justify-center flex-shrink-0 ${vertical ? 'w-7 h-5' : 'w-5 h-7 -ml-1'} rounded-md text-text-muted hover:text-text-primary hover:bg-surface-raised cursor-grab active:cursor-grabbing touch-none transition-colors`}
      >
        <GripVertical className={`w-3.5 h-3.5 ${vertical ? 'rotate-90' : ''}`} aria-hidden />
      </button>
    );
  };

  // A phone's tabs: held still for a moment, a tab picks up and drags to a new place.
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  };
  const tabHold = (key: PanelKey) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearHold();
      const { clientX: x, clientY: y } = e;
      holdStart.current = { x, y };
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        startDrag(key, 'tab', x, y);
      }, TAB_HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = holdStart.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAB_HOLD_SLOP_PX) clearHold();
    },
    onPointerUp: clearHold,
    onPointerCancel: clearHold,
    onContextMenu: (e: React.MouseEvent) => { if (holdStart.current || dragging) e.preventDefault(); },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  });

  // ── Phone: the swipe track and its tabs ───────────────────────────────
  const barRef = useRef<HTMLSpanElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledOnce = useRef(false);
  const phoneIndex = available.indexOf(phoneShown);
  const trackPosition = (track: HTMLElement) => track.scrollLeft / (track.clientWidth + TRACK_GAP_PX);

  // The track follows the tabs: a tab picked (or show()) scrolls to its panel.
  useEffect(() => {
    const track = splitRef.current;
    if (!phone || !track) return;
    const left = phoneIndex * (track.clientWidth + TRACK_GAP_PX);
    if (Math.abs(track.scrollLeft - left) > 1 && typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: scrolledOnce.current && !prefersReducedMotion() ? 'smooth' : 'instant' });
    }
    scrolledOnce.current = true;
  }, [phone, phoneIndex, splitRef]);

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  useEffect(() => { if (!phone) scrolledOnce.current = false; }, [phone]);

  // The tabs follow the track: the underline tracks a swipe, and the panel it rests on is picked.
  const onTrackScroll = () => {
    const track = splitRef.current;
    if (!track) return;
    if (barRef.current) barRef.current.style.transform = `translateX(${trackPosition(track) * 100}%)`;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const landed = available[Math.round(trackPosition(track))];
      if (landed && landed !== phoneShown) onPhoneChange(landed);
    }, SWIPE_SETTLE_MS);
  };

  const pickTab = (index: number, focus: boolean) => {
    const key = available[(index + available.length) % available.length];
    press(`tab-${key}`);
    if (key !== phoneShown) onPhoneChange(key);
    if (focus) document.getElementById(panelTabId(key))?.focus();
  };
  const onTabsKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // Alt and an arrow move the picked panel's tab instead.
      const target = available[phoneIndex + (e.key === 'ArrowRight' ? 1 : -1)];
      e.preventDefault();
      if (target) reorder(phoneShown, movePanel(order, phoneShown, target, e.key === 'ArrowRight'), available);
      return;
    }
    if (e.key === 'ArrowRight') pickTab(phoneIndex + 1, true);
    else if (e.key === 'ArrowLeft') pickTab(phoneIndex - 1, true);
    else if (e.key === 'Home') pickTab(0, true);
    else if (e.key === 'End') pickTab(available.length - 1, true);
    else return;
    e.preventDefault();
  };

  const phoneTabs = (
    <div role="tablist" aria-label="Home panel" onKeyDown={onTabsKeyDown} className="relative flex border-b border-border">
      {available.map((key, i) => {
        const { label, icon: Icon } = PANEL_META[key];
        const selected = key === phoneShown;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            id={panelTabId(key)}
            aria-selected={selected}
            aria-controls={panelTabpanelId(key)}
            aria-label={label}
            aria-describedby={`${TABS_ID}-tab-hint`}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            tabIndex={selected ? 0 : -1}
            data-tip={label}
            data-tip-align={i === available.length - 1 ? 'end' : undefined}
            data-drop-key={key}
            data-drop-kind="tab"
            {...tabHold(key)}
            onClick={() => pickTab(i, false)}
            className={`relative flex-1 flex items-center justify-center h-10 select-none [-webkit-touch-callout:none] transition-[color,opacity] ${
              selected ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            } ${drag?.key === key ? 'opacity-40' : ''} ${pressing(`tab-${key}`) ? 'key-press-play' : ''}`}
          >
            <Icon className="w-[18px] h-[18px]" aria-hidden />
            {drop?.key === key && drop.kind === 'tab' && <DropIndicator after={drop.after} />}
          </button>
        );
      })}
      <span
        ref={barRef}
        aria-hidden
        className="absolute -bottom-px left-0 h-0.5 rounded-full bg-accent transition-transform duration-150 ease-out"
        style={{ width: `${100 / available.length}%`, transform: `translateX(${phoneIndex * 100}%)` }}
      />
    </div>
  );

  const panelHead = (key: PanelKey) => {
    const { label, icon: Icon } = PANEL_META[key];
    return (
      <div className="flex items-center gap-1.5 h-8 mb-1.5 pl-1 text-text-muted">
        {on.length > 1 && grip(key, 'panel', on)}
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide truncate">{label}</span>
        <div role="group" aria-label={`${label} panel`} className="ml-auto flex items-center gap-0.5">
          {on.length > 1 ? (
            <>
              <PanelControl label={`Show only ${label}`} icon={Maximize2} pressed={pressing(`max-${key}`)} onClick={() => act(`max-${key}`, () => setPanels([key]))} />
              <PanelControl label={`Hide ${label}`} icon={X} pressed={pressing(`hide-${key}`)} onClick={() => act(`hide-${key}`, () => setPanels(on.filter(k => k !== key)))} />
            </>
          ) : restoreTo && toHomePanels(restoreTo) !== toHomePanels(on) && (
            <PanelControl label={`Back to ${panelsName(restoreTo)}`} icon={Minimize2} pressed={pressing('restore')} onClick={() => act('restore', () => setPanels(restoreTo))} />
          )}
        </div>
      </div>
    );
  };

  const rails = hidden.length > 0 && (
    <div role="group" aria-label="Hidden panels" className="flex flex-col gap-2 w-10 flex-shrink-0 pt-[2.375rem]">
      {hidden.map(key => {
        const { label, icon: Icon } = PANEL_META[key];
        return (
          <div
            key={key}
            data-rail={key}
            data-drop-key={key}
            data-drop-kind="rail"
            className={`relative flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl border border-dashed border-border-strong bg-surface text-text-muted hover:text-text-primary hover:border-accent transition-[color,border-color,opacity] ${drag?.key === key ? 'opacity-40' : ''}`}
          >
            {drop?.key === key && drop.kind === 'rail' && <DropIndicator after={drop.after} vertical />}
            {grip(key, 'rail', hidden)}
            <PanelControl label={`Add ${label} beside the others`} icon={Plus} tipSide="left" pressed={pressing(`add-${key}`)} onClick={() => act(`add-${key}`, () => setPanels([...on, key]))} />
            <button
              type="button"
              aria-label={`Show only ${label}`}
              data-tip={`Show only ${label}`}
              data-tip-side="left"
              {...longPressTip}
              onClick={() => act(`rail-${key}`, () => setPanels([key]))}
              className={`flex-1 flex flex-col items-center gap-2.5 w-8 py-2 rounded-lg hover:bg-surface-raised transition-colors ${pressing(`rail-${key}`) ? 'key-press-play' : ''}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span aria-hidden className="text-xs font-semibold [writing-mode:vertical-rl]">{label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  // One tree for both layouts, every panel at the same place in it whether
  // it's shown, hidden or swiped to, so switching never remounts one.
  const dividers = DIVIDER_PX * dividerCount;
  // On the body, so a transformed ancestor (the page's fade-in) can't offset it.
  const ghost = drag && (() => {
    const { label, icon: Icon } = PANEL_META[drag.key];
    return createPortal(
      <div
        ref={ghostRef}
        aria-hidden
        className="fixed pointer-events-none z-[70] flex items-center gap-1.5 rounded-lg border border-accent bg-surface px-3 py-1.5 text-xs font-semibold text-accent shadow-lg"
        style={ghostPlace(drag.x, drag.y)}
      >
        <Move className="w-3.5 h-3.5 flex-shrink-0" />
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        Moving {label}
      </div>,
      document.body,
    );
  })();
  return (
    <div ref={rootRef} className={phone ? 'space-y-2' : undefined}>
      {phone && phoneTabs}
      <div className={phone ? undefined : 'flex gap-2'}>
        <div
          ref={splitRef}
          onScroll={phone ? onTrackScroll : undefined}
          className={phone ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain scrollbar-none' : 'flex flex-1 min-w-0'}
        >
          {PANEL_ORDER.filter(key => mounted.includes(key) && available.includes(key)).map(key => {
            const i = on.indexOf(key);
            if (phone) {
              return (
                <div
                  key={key}
                  id={panelTabpanelId(key)}
                  role="tabpanel"
                  aria-labelledby={panelTabId(key)}
                  data-panel={key}
                  className="split-slot snap-start snap-always"
                  style={{ order: available.indexOf(key) }}
                  inert={key !== phoneShown}
                >
                  {null}
                  {renderPanel(key, { widthPct: 100 })}
                </div>
              );
            }
            if (i < 0) return <div key={key} data-panel={key} className="hidden">{null}{renderPanel(key, { widthPct: 0 })}</div>;
            // The dividers' width comes out of the panels evenly, so the shares add up to the split.
            return (
              <div
                key={key}
                role="region"
                aria-label={PANEL_META[key].label}
                data-panel={key}
                data-drop-key={key}
                data-drop-kind="panel"
                className={`split-slot relative transition-opacity ${drag?.key === key ? 'opacity-50' : ''}`}
                style={{ order: i * 2, ['--slot-w' as string]: `calc(${widths[i]}% - ${dividers / on.length}px)` }}
              >
                {panelHead(key)}
                {renderPanel(key, { widthPct: widths[i] })}
                {drop?.key === key && drop.kind === 'panel' && <DropIndicator after={drop.after} />}
              </div>
            );
          })}
          {!phone && on.slice(1, dividerCount + 1).map((_, i) => (
            <div key={`divider-${i}`} data-divider={i} className="hidden md:flex shrink-0" style={{ order: i * 2 + 1 }}>
              <DragHandle onPointerDown={e => onDividerPointerDown(on.length, i, e)} />
            </div>
          ))}
        </div>
        {!phone && rails}
      </div>
      {ghost}
      <p id={`${TABS_ID}-reorder-hint`} hidden>Drag, or press the arrow keys, to move this panel.</p>
      <p id={`${TABS_ID}-tab-hint`} hidden>Hold and drag, or press Alt and an arrow key, to move this panel.</p>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
});

export default PanelCarousel;
