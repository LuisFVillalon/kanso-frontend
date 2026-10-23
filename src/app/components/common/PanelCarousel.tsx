'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Columns2, GraduationCap, Move, NotebookText, Plus, SquareCheckBig, SquarePlus, X, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';
import { longPressTip } from '@/app/components/common/longPressTip';
import { useKeyPress } from '@/app/hooks/useKeyPress';

/**
 * The home page's panels: Tasks and Notes, plus Canvas when the user has it
 * connected, picked from a strip of tabs like a browser's. On a wide screen
 * each panel has its own tab, and the panels shown side by side share one
 * split tab: its ⧉ part brings the split back, each half shows only its panel,
 * and a half's × takes that panel out of the split. A panel's own tab shows it
 * alone, or with its "open beside" control adds it to the split. The split tab
 * stays in the strip while one panel shows alone, so the way back to the split
 * is always one click. One panel on fills the width, two share the resizable
 * split, three sit in resizable columns; the last panel on stays on.
 *
 * Without Canvas connected, a dashed "+ Canvas" tab opens Settings → Canvas,
 * and its × closes it for someone who doesn't use Canvas.
 *
 * A phone shows one panel at a time, swiped between or picked from labelled
 * tabs, and remembers its pick apart from the wide screen's.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * switch. A phone mounts them all, side by side, so the next one is there to
 * swipe to.
 *
 * The user puts the tabs, and so the panels, in their own order: by dragging
 * a tab (on a phone, after holding it a moment), or with Shift and an arrow
 * key on it. Dragging a half of the split tab moves that panel within the
 * split. A tab's context menu (right-click, the context menu key or
 * Shift+F10) offers what its hover control does, for the keyboard. Panels
 * are placed by CSS order rather than moved in the DOM, so reordering never
 * remounts or reloads one.
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

/**
 * One tab in the wide screen's strip: a panel's own, or the split tab the
 * panels side by side share.
 */
export type StripItem = { split: false; key: PanelKey } | { split: true; keys: PanelKey[] };

/**
 * The wide screen's tabs, left to right: every available panel in `order`,
 * the split's panels gathered into one split tab where the first of them sits.
 */
export function stripItems(available: readonly PanelKey[], split: readonly PanelKey[]): StripItem[] {
  const items: StripItem[] = [];
  for (const key of available) {
    if (!split.includes(key)) items.push({ split: false, key });
    else if (!items.some(it => it.split)) items.push({ split: true, keys: available.filter(k => split.includes(k)) });
  }
  return items;
}

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
/** How long a tab is held under a finger before it can be dragged to a new place. */
const TAB_HOLD_MS = 350;
/** How far a pressed tab moves before a mouse drags it, or a held one counts as a scroll or swipe instead. */
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
  /** Offers Canvas while it isn't available: a "+ Canvas" tab that does this (opens Settings → Canvas). */
  onConnectCanvas?: () => void;
  /** Closes the "+ Canvas" tab, for someone who doesn't use Canvas. */
  onHideCanvasTab?: () => void;
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
export const SPLIT_TAB_ID = `${TABS_ID}-tab-split`;
/** The wide screen's one tab panel, holding whichever panels are on. */
const STRIP_PANEL_ID = `${TABS_ID}-tabpanel`;
const STRIP_HINT_ID = `${TABS_ID}-strip-hint`;
const HALF_HINT_ID = `${TABS_ID}-half-hint`;
const PHONE_HINT_ID = `${TABS_ID}-tab-hint`;

/**
 * A small icon button on a tab, shown while the tab is hovered or focused; the
 * keyboard reaches it through the tab's context menu. One always `visible`
 * (on a tab outside the tablist) is in the Tab order itself.
 */
function TabControl({ label, icon: Icon, onClick, visible }: { label: string; icon: LucideIcon; onClick: () => void; visible?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={visible ? 0 : -1}
      aria-label={label}
      data-tip={label}
      {...longPressTip}
      onClick={onClick}
      className={`flex items-center justify-center flex-shrink-0 w-[22px] h-[22px] mr-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-raised transition-[opacity,color,background-color] ${
        visible ? '' : 'opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 [@media(hover:none)]:opacity-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
    </button>
  );
}

/**
 * What a reorder drag picks up and where it can land: a wide screen's tab
 * among the tabs (the split tab as a whole); a half of the split tab among
 * the halves; a phone's tab among the tabs.
 */
type DragFrom = 'strip' | 'half' | 'tab';

/** What's dragged, and where the pointer picked it up. */
interface Drag { key: PanelKey; from: DragFrom; x: number; y: number }
/** Where a drag lands: before `key`, or after `end` (the split tab's last panel, else `key`) when `after`. */
interface Drop { key: PanelKey; end: PanelKey; kind: DragFrom; after: boolean }

const sameDrop = (a: Drop | null, b: Drop | null) =>
  a === b || (!!a && !!b && a.key === b.key && a.kind === b.kind && a.after === b.after);

/** The ghost's place beside the pointer, on whichever side has the room. */
const ghostPlace = (x: number, y: number) => ({
  left: `${x + 12}px`,
  top: `${y - 12}px`,
  transform: x > window.innerWidth / 2 ? 'translateX(calc(-100% - 24px))' : '',
});

/** The drop target of `kind` nearest the pointer among `root`'s, and which side of it the pointer is on. */
function dropAt(root: HTMLElement, kind: DragFrom, x: number, y: number): Drop | null {
  let best: Drop | null = null;
  let bestDist = Infinity;
  for (const el of root.querySelectorAll<HTMLElement>(`[data-drop-kind="${kind}"]`)) {
    const key = el.dataset.dropKey;
    const end = el.dataset.dropEnd ?? key;
    if (!isPanelKey(key) || !isPanelKey(end)) continue;
    const r = el.getBoundingClientRect();
    // 0 while the pointer is over the target, else how far it is from its edge.
    const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (dist >= bestDist) continue;
    best = { key, end, kind, after: x > r.left + r.width / 2 };
    bestDist = dist;
  }
  return best;
}

/** The accent bar showing where a dragged tab will land: before or after a target. */
function DropIndicator({ after }: { after: boolean }) {
  return (
    <span
      aria-hidden
      data-drop-indicator={after ? 'after' : 'before'}
      className={`pointer-events-none absolute z-10 inset-y-1 w-[3px] rounded-full bg-accent ${after ? 'right-0' : 'left-0'}`}
    />
  );
}

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  {
    value, onChange, splitValue, onSplitChange, order, onOrderChange, phoneValue, onPhoneChange, available: availableKeys,
    onConnectCanvas, onHideCanvasTab, panelWidths, dividersMovable, splitRef, onDividerPointerDown, renderPanel,
  },
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
  // The split tab's panels: the ones side by side, or the split a panel shown alone goes back to.
  const splitShown = on.length > 1;
  const split = splitShown ? on : inOrder(restoreTo ?? [], order);
  const items = stripItems(available, split);
  const { press, pressing } = useKeyPress<string>();

  // Panels mount the first time they're shown and then stay mounted; a phone shows them all to swipe between.
  const [mounted, setMounted] = useState<PanelKey[]>(() => shown);
  const unmounted = (phone ? available : shown).filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  /** Shows `next` on a wide screen, remembering the latest split for going back to. */
  const setPanels = (next: readonly PanelKey[]) => {
    if (next.length === 0 || toHomePanels(next) === toHomePanels(on)) return;
    if (next.length > 1) onSplitChange(toHomePanels(next));
    else if (on.length > 1) onSplitChange(toHomePanels(on));
    onChange(toHomePanels(next));
  };

  /** Adds `key` to the split tab (or, with no split yet, beside the panel showing) and shows the split. */
  const addToSplit = (key: PanelKey) => setPanels([...(split.length > 0 ? split : on), key]);

  /** Whether `key`'s own tab can join the split: any tab but the one panel showing with no split to join. */
  const canAdd = (key: PanelKey) => !split.includes(key) && (split.length > 0 || on[0] !== key);

  /** Takes `key` out of the split tab; the panels left side by side stay on, a panel shown alone stays shown. */
  const takeOutOfSplit = (key: PanelKey) => {
    const rest = split.filter(k => k !== key);
    onSplitChange(toHomePanels(rest));
    if (splitShown) onChange(toHomePanels(rest));
  };

  /** What a wide screen's tab for `key` offers besides showing it: taking a half out of the split, or adding a panel to it. */
  const tabAction = (key: PanelKey): { label: string; icon: LucideIcon; run: () => void } | null => {
    const { label } = PANEL_META[key];
    if (split.includes(key)) return { label: `Take ${label} out of the split`, icon: X, run: () => takeOutOfSplit(key) };
    if (!canAdd(key)) return null;
    return {
      label: split.length > 0 ? `Add ${label} to the split` : `Open ${label} beside ${panelsName(on)}`,
      icon: SquarePlus,
      run: () => addToSplit(key),
    };
  };

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
  // A dragged tab's click is its release, not a pick.
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

  /** Moves `key`'s tab one place along the strip, past a neighbouring tab (the split tab as a whole), or within the split. */
  const moveTab = (key: PanelKey, forward: boolean) => {
    if (phone) {
      const target = available[available.indexOf(key) + (forward ? 1 : -1)];
      if (target) reorder(key, movePanel(order, key, target, forward), available);
      return;
    }
    if (split.includes(key)) {
      const target = split[split.indexOf(key) + (forward ? 1 : -1)];
      if (target) reorder(key, movePanel(order, key, target, forward), split);
      return;
    }
    const next = items[items.findIndex(it => !it.split && it.key === key) + (forward ? 1 : -1)];
    if (!next) return;
    const target = !next.split ? next.key : forward ? next.keys[next.keys.length - 1] : next.keys[0];
    reorder(key, movePanel(order, key, target, forward), available);
  };

  const startDrag = (key: PanelKey, from: DragFrom, x: number, y: number) => {
    setDrag({ key, from, x, y });
    setDrop(null);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
  };

  // While dragging: the pointer moves the drop, releasing places the tab, Escape puts it back.
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
      const at = dropAt(rootRef.current, current.from, e.clientX, e.clientY);
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
      // Only the click this release makes, if it makes one at all.
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
      reorder(current.key, movePanel(order, current.key, at.after ? at.end : at.key, at.after), current.from === 'half' ? split : available);
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

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  };
  /**
   * Picking a tab up to drag it: a mouse drags it as soon as it moves; a
   * finger (and every tab on a phone) holds it still for a moment first, so
   * a swipe across the tabs still scrolls.
   */
  const tabDrag = (key: PanelKey, from: DragFrom) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearHold();
      const { clientX: x, clientY: y } = e;
      holdStart.current = { x, y };
      if (phone || e.pointerType === 'touch') {
        holdTimer.current = setTimeout(() => {
          clearHold();
          startDrag(key, from, x, y);
        }, TAB_HOLD_MS);
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = holdStart.current;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAB_HOLD_SLOP_PX) return;
      const held = holdTimer.current !== null;
      clearHold();
      if (!held) startDrag(key, from, e.clientX, e.clientY);
    },
    onPointerUp: clearHold,
    onPointerCancel: clearHold,
    onContextMenu: (e: React.MouseEvent) => {
      if (holdStart.current || dragging) e.preventDefault();
      else if (from !== 'tab' && openMenu(key, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : null)) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  });

  /** Shift and an arrow key on a tab move it, as on a phone. */
  const moveKey = (e: React.KeyboardEvent) => e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');

  // ── A tab's context menu ──────────────────────────────────────────────
  const [menu, setMenu] = useState<{ key: PanelKey; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The tab a closed menu gives focus back to.
  const menuTab = useRef<PanelKey | null>(null);
  const menuAction = menu && tabAction(menu.key);

  /** Opens `key`'s tab's menu at `at`, or under the tab; false when the tab has nothing to offer. */
  const openMenu = (key: PanelKey, at: { x: number; y: number } | null) => {
    if (!tabAction(key)) return false;
    const r = document.getElementById(panelTabId(key))?.getBoundingClientRect();
    setMenu({ key, x: at?.x ?? r?.left ?? 0, y: at?.y ?? r?.bottom ?? 0 });
    return true;
  };
  const closeMenu = (refocusTab: boolean) => {
    if (refocusTab && menu) menuTab.current = menu.key;
    setMenu(null);
  };

  useLayoutEffect(() => {
    if (menu) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      return;
    }
    const key = menuTab.current;
    menuTab.current = null;
    if (key) document.getElementById(panelTabId(key))?.focus();
  }, [menu]);

  // A press anywhere else closes the menu.
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [menu]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(e.target as HTMLElement);
    let next: number;
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
  };

  // On the body, so a transformed ancestor (the page's fade-in) can't offset it.
  const tabMenu = menu && menuAction && createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${PANEL_META[menu.key].label} tab`}
      onKeyDown={onMenuKeyDown}
      onContextMenu={e => e.preventDefault()}
      className="fixed z-[70] min-w-[12rem] rounded-lg border border-border bg-surface p-1 shadow-lg"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
    >
      {[menuAction].map(action => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            closeMenu(true);
            action.run();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] text-text-primary hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
        >
          <action.icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );

  // ── Wide screen: the tab strip ────────────────────────────────────────
  // The tab that's selected: the split tab while the split shows, else the panel shown alone.
  const selectedTabId = splitShown ? SPLIT_TAB_ID : panelTabId(on[0]);
  const stripTabIds = items.flatMap(it => (it.split ? [SPLIT_TAB_ID, ...it.keys.map(panelTabId)] : [panelTabId(it.key)]));
  // Roving tabindex: Tab lands on the selected tab, the arrow keys move between them.
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);
  const tabStop = focusedTabId && stripTabIds.includes(focusedTabId) ? focusedTabId : selectedTabId;
  const tabKeyOf = (id: string) => available.find(k => panelTabId(k) === id) ?? null;

  const onStripKeyDown = (e: React.KeyboardEvent) => {
    const id = (e.target as HTMLElement).id;
    const i = stripTabIds.indexOf(id);
    if (i < 0) return;
    const key = tabKeyOf(id);
    if (moveKey(e)) {
      e.preventDefault();
      if (key) moveTab(key, e.key === 'ArrowRight');
      return;
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      if (key && openMenu(key, null)) e.preventDefault();
      return;
    }
    let next: number;
    if (e.key === 'ArrowRight') next = (i + 1) % stripTabIds.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + stripTabIds.length) % stripTabIds.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = stripTabIds.length - 1;
    else return;
    e.preventDefault();
    document.getElementById(stripTabIds[next])?.focus();
  };

  const tabProps = (id: string, selected: boolean) => ({
    type: 'button' as const,
    role: 'tab',
    id,
    'aria-selected': selected,
    'aria-controls': STRIP_PANEL_ID,
    tabIndex: tabStop === id ? 0 : -1,
    onFocus: () => setFocusedTabId(id),
  });

  /** Whether a tab is joined to the panels below: selected, or (the split tab) holding the panel shown alone. */
  const itemOn = (it: StripItem) => (it.split ? splitShown || it.keys.includes(on[0]) : !splitShown && on[0] === it.key);

  const menuKeys = (key: PanelKey) => (tabAction(key) ? ' ContextMenu Shift+F10' : '');

  const panelTab = (key: PanelKey) => {
    const { label, icon: Icon } = PANEL_META[key];
    const selected = !splitShown && on[0] === key;
    const action = tabAction(key);
    return (
      <div
        key={key}
        role="presentation"
        data-drop-key={key}
        data-drop-kind="strip"
        {...tabDrag(key, 'strip')}
        className={`group/tab relative flex items-center h-9 w-[11.875rem] min-w-0 rounded-t-[10px] select-none transition-[color,background-color,opacity] ${
          selected ? 'panel-tab-on z-[2] text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface/55'
        } ${drag?.key === key ? 'opacity-40' : ''}`}
      >
        <button
          {...tabProps(panelTabId(key), selected)}
          aria-describedby={STRIP_HINT_ID}
          aria-keyshortcuts={`Shift+ArrowLeft Shift+ArrowRight${menuKeys(key)}`}
          onClick={() => setPanels([key])}
          className={`flex items-center gap-2 flex-1 min-w-0 h-full pl-3 pr-1 rounded-t-[10px] text-[0.8125rem] ${selected ? 'font-semibold' : 'font-medium'}`}
        >
          <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
        {action && <TabControl label={action.label} icon={action.icon} onClick={action.run} />}
        {drop?.key === key && drop.kind === 'strip' && <DropIndicator after={drop.after} />}
      </div>
    );
  };

  const splitTab = (keys: PanelKey[]) => {
    const name = `${panelsName(keys)} side by side`;
    return (
      <div
        key="split"
        role="presentation"
        data-split-tab={keys.join(',')}
        data-drop-key={keys[0]}
        data-drop-end={keys[keys.length - 1]}
        data-drop-kind="strip"
        style={{ width: `calc(34px + ${keys.length} * 10.125rem)` }}
        className={`relative flex items-stretch h-9 min-w-0 ${
          splitShown ? 'panel-tab-on z-[2] rounded-t-[10px]' : 'rounded-[10px] outline outline-[1.5px] -outline-offset-4 outline-accent/45'
        }`}
      >
        <button
          {...tabProps(SPLIT_TAB_ID, splitShown)}
          aria-label={name}
          data-tip={splitShown ? name : `Back to ${panelsName(keys)}`}
          {...longPressTip}
          onClick={() => setPanels(keys)}
          className="flex items-center justify-center flex-shrink-0 w-[34px] rounded-tl-[10px] text-accent hover:bg-accent/10 transition-colors"
        >
          <Columns2 className="w-4 h-4" aria-hidden />
        </button>
        {keys.map((key, i) => {
          const { label, icon: Icon } = PANEL_META[key];
          const solo = !splitShown && on[0] === key;
          const action = tabAction(key)!;
          return (
            <div
              key={key}
              role="presentation"
              data-drop-key={key}
              data-drop-kind="half"
              {...tabDrag(key, 'half')}
              className={`group/tab relative flex items-center flex-1 min-w-0 select-none transition-[color,background-color,opacity] ${
                i > 0 && !solo ? 'border-l border-border' : ''
              } ${solo ? 'panel-tab-on z-[2] rounded-t-lg text-text-primary' : splitShown ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'} ${
                drag?.key === key ? 'opacity-40' : ''
              }`}
            >
              <button
                {...tabProps(panelTabId(key), solo)}
                aria-describedby={`${SPLIT_TAB_ID} ${HALF_HINT_ID}`}
                aria-keyshortcuts={`Shift+ArrowLeft Shift+ArrowRight${menuKeys(key)}`}
                onClick={() => setPanels([key])}
                className={`flex items-center gap-2 flex-1 min-w-0 h-full pl-3 pr-1 text-[0.8125rem] ${solo || splitShown ? 'font-semibold' : 'font-medium'}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
              <TabControl label={action.label} icon={action.icon} onClick={action.run} />
              {drop?.key === key && drop.kind === 'half' && <DropIndicator after={drop.after} />}
            </div>
          );
        })}
        {drop?.key === keys[0] && drop.kind === 'strip' && <DropIndicator after={drop.after} />}
      </div>
    );
  };

  // ── Canvas, not connected ─────────────────────────────────────────────
  const canvasGhost = onConnectCanvas && !available.includes('canvas') && (
    <div
      data-canvas-ghost
      className={`group/tab flex items-center flex-shrink-0 ${phone ? 'h-8' : 'h-[30px]'} ml-1.5 rounded-t-[9px] border border-b-0 border-dashed border-border-strong text-text-muted`}
    >
      <button
        type="button"
        aria-label="Connect Canvas"
        data-tip="Connect Canvas in Settings"
        {...longPressTip}
        onClick={onConnectCanvas}
        className={`flex items-center gap-1.5 h-full pl-2.5 ${onHideCanvasTab ? 'pr-1' : 'pr-2.5'} rounded-t-[9px] text-[0.8125rem] font-medium hover:text-text-primary transition-colors`}
      >
        <Plus className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
        <GraduationCap className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span>Canvas</span>
      </button>
      {onHideCanvasTab && <TabControl label="Close the Canvas tab" icon={X} onClick={onHideCanvasTab} visible />}
    </div>
  );

  const strip = (
    <div className="flex items-end h-11 px-2.5 pt-2 min-w-0">
      <div
        role="tablist"
        aria-label="Home panels"
        onKeyDown={onStripKeyDown}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedTabId(null); }}
        className="flex items-end min-w-0"
      >
        {items.map((it, i) => (
          <React.Fragment key={it.split ? 'split' : it.key}>
            {i > 0 && !itemOn(items[i - 1]) && !itemOn(it) && (
              <span aria-hidden className="self-center flex-shrink-0 w-px h-[18px] -mb-0.5 bg-border-strong" />
            )}
            {it.split ? splitTab(it.keys) : panelTab(it.key)}
          </React.Fragment>
        ))}
      </div>
      {canvasGhost}
    </div>
  );

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

  // The tabs follow the track: the tab's paper slides with a swipe, and the panel it rests on is picked.
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
    if (moveKey(e)) {
      e.preventDefault();
      moveTab(phoneShown, e.key === 'ArrowRight');
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
    <div className="flex items-end h-11 px-2.5 pt-2 min-w-0">
      <div role="tablist" aria-label="Home panel" onKeyDown={onTabsKeyDown} className="relative flex items-end flex-1 min-w-0 h-full">
        <span
          ref={barRef}
          aria-hidden
          className="panel-tab-on absolute bottom-0 left-0 h-9 rounded-t-[10px] transition-transform duration-150 ease-out"
          style={{ width: `${100 / available.length}%`, transform: `translateX(${phoneIndex * 100}%)` }}
        />
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
              aria-describedby={PHONE_HINT_ID}
              aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
              tabIndex={selected ? 0 : -1}
              data-drop-key={key}
              data-drop-kind="tab"
              {...tabDrag(key, 'tab')}
              onClick={() => pickTab(i, false)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 min-w-0 h-9 px-1.5 rounded-t-[10px] text-[0.8125rem] select-none [-webkit-touch-callout:none] transition-[color,opacity] ${
                selected ? 'text-text-primary font-semibold' : 'text-text-muted font-medium hover:text-text-primary'
              } ${drag?.key === key ? 'opacity-40' : ''} ${pressing(`tab-${key}`) ? 'key-press-play' : ''}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
              {drop?.key === key && drop.kind === 'tab' && <DropIndicator after={drop.after} />}
            </button>
          );
        })}
      </div>
      {canvasGhost}
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
    <div ref={rootRef} className="rounded-2xl border border-border bg-strip">
      {phone ? phoneTabs : strip}
      <div
        id={phone ? undefined : STRIP_PANEL_ID}
        role={phone ? undefined : 'tabpanel'}
        aria-labelledby={phone ? undefined : selectedTabId}
        className="relative z-[1] -mt-px rounded-b-2xl border-t border-border bg-surface p-2"
      >
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
                  {renderPanel(key, { widthPct: 100 })}
                </div>
              );
            }
            if (i < 0) return <div key={key} data-panel={key} className="hidden">{renderPanel(key, { widthPct: 0 })}</div>;
            // The dividers' width comes out of the panels evenly, so the shares add up to the split.
            return (
              <div
                key={key}
                role="region"
                aria-label={PANEL_META[key].label}
                data-panel={key}
                className="split-slot relative"
                style={{ order: i * 2, ['--slot-w' as string]: `calc(${widths[i]}% - ${dividers / on.length}px)` }}
              >
                {renderPanel(key, { widthPct: widths[i] })}
              </div>
            );
          })}
          {!phone && on.slice(1, dividerCount + 1).map((_, i) => (
            <div key={`divider-${i}`} data-divider={i} className="hidden md:flex shrink-0" style={{ order: i * 2 + 1 }}>
              <DragHandle onPointerDown={e => onDividerPointerDown(on.length, i, e)} />
            </div>
          ))}
        </div>
      </div>
      {ghost}
      {tabMenu}
      <p id={STRIP_HINT_ID} hidden>Drag, or press Shift and an arrow key, to move this tab. Its menu (the context menu key or Shift+F10) can open it beside the others.</p>
      <p id={HALF_HINT_ID} hidden>Drag, or press Shift and an arrow key, to move this panel within the split. Its menu (the context menu key or Shift+F10) takes it out of the split.</p>
      <p id={PHONE_HINT_ID} hidden>Hold and drag, or press Shift and an arrow key, to move this panel.</p>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
});

export default PanelCarousel;
