'use client';

import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { GraduationCap, NotebookText, SquareCheckBig, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';
import SegmentedTabs, { segmentedTabId, type SegmentedTab } from '@/app/components/common/SegmentedTabs';

/**
 * The home page's panels: Tasks and Notes, plus Canvas when the user has it
 * connected. A wide screen shows a pair side by side in the resizable split,
 * a phone shows one. The tabs above name exactly what's on screen ("Tasks &
 * Notes", or "Tasks" on a phone) and switch it; they're hidden when there's
 * nothing to switch to. On a touch screen a sideways swipe across the panels
 * moves to the next or previous tab too.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * switch.
 */

export type PanelKey = 'tasks' | 'notes' | 'canvas';
export type HomePanels = 'tasks,notes' | 'notes,canvas' | 'canvas,tasks';

export const PANEL_ORDER: readonly PanelKey[] = ['tasks', 'notes', 'canvas'];
export const DEFAULT_HOME_PANELS: HomePanels = 'tasks,notes';

// The values profile.home_panels takes. Each pair has its own left panel,
// which is the one a phone shows.
const HOME_PANELS: readonly HomePanels[] = ['tasks,notes', 'notes,canvas', 'canvas,tasks'];

export const isHomePanels = (c: unknown): c is HomePanels => HOME_PANELS.includes(c as HomePanels);

/** The panels on screen: both of the pair, or only the left one on a phone. */
export function shownPanels(value: HomePanels, phone: boolean): PanelKey[] {
  const [left, right] = value.split(',') as PanelKey[];
  return phone ? [left] : [left, right];
}

/** `value`, unless it would show a panel that isn't available (Canvas, disconnected): then Tasks first. */
export function resolvePanels(value: HomePanels, available: readonly PanelKey[], phone: boolean): HomePanels {
  return shownPanels(value, phone).every(k => available.includes(k)) ? value : DEFAULT_HOME_PANELS;
}

/** What the tabs offer: each available pair on a wide screen, each available panel on a phone. */
export function panelChoices(available: readonly PanelKey[], phone: boolean): HomePanels[] {
  return HOME_PANELS.filter(v => resolvePanels(v, available, phone) === v);
}

const PANEL_META: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: SquareCheckBig },
  notes: { label: 'Notes', icon: NotebookText },
  canvas: { label: 'Canvas', icon: GraduationCap },
};

const choiceTab = (value: HomePanels, phone: boolean): SegmentedTab<HomePanels> => {
  const keys = shownPanels(value, phone);
  return {
    value,
    label: keys.map(k => PANEL_META[k].label).join(' & '),
    icon: keys.length === 1 ? PANEL_META[keys[0]].icon : undefined,
  };
};

const PHONE_QUERY = '(max-width: 767px)';

const subscribePhone = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhoneNow = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

// How far a finger has to travel sideways, and how much straighter than
// vertical, before a touch counts as a swipe rather than a scroll.
const SWIPE_MIN_PX = 60;
const SWIPE_SLOPE = 2;

/** Touches that start here belong to the field or widget, not the panel switch. */
const SWIPE_IGNORED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="dialog"], .modal-overlay';

/** Whether a touch on `el` could be scrolling something sideways inside `boundary`. */
function inSideScroller(el: Element | null, boundary: Element): boolean {
  for (let node = el; node && node !== boundary; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}

export interface PanelCarouselHandle {
  /** Brings `panel` on screen if it isn't showing. */
  show: (panel: PanelKey) => void;
}

interface PanelCarouselProps {
  value: HomePanels;
  onChange: (next: HomePanels) => void;
  /** The panels the user can see; Canvas only while it's connected. */
  available: readonly PanelKey[];
  /** The left panel's share of the split, in %. */
  leftWidthPct: number;
  splitRef: React.RefObject<HTMLDivElement | null>;
  onSplitterMouseDown: (e: React.MouseEvent) => void;
  /** Renders a panel; `widthPct` is the share of the split it currently fills. */
  renderPanel: (key: PanelKey, slot: { widthPct: number }) => React.ReactNode;
}

const TABS_ID = 'home-panels';
const TABPANEL_ID = 'home-panels-tabpanel';

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  { value, onChange, available, leftWidthPct, splitRef, onSplitterMouseDown, renderPanel },
  ref,
) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  const current = resolvePanels(value, available, phone);
  const choices = panelChoices(available, phone);
  const [left, right] = current.split(',') as PanelKey[];
  const shown = shownPanels(current, phone);

  // Panels mount the first time they're shown and then stay mounted.
  const [mounted, setMounted] = useState<PanelKey[]>(() => [left, right]);
  const unmounted = shown.filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  const choose = useCallback((next: HomePanels) => {
    if (next !== current) onChange(next);
  }, [current, onChange]);

  const show = useCallback((panel: PanelKey) => {
    if (shown.includes(panel)) return;
    const next = choices.find(v => shownPanels(v, phone)[0] === panel) ?? choices.find(v => shownPanels(v, phone).includes(panel));
    if (next) choose(next);
  }, [shown, choices, phone, choose]);

  useImperativeHandle(ref, () => ({ show }), [show]);

  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target instanceof Element ? e.target : null;
    const ignored = e.touches.length !== 1 || choices.length < 2
      || !!target?.closest(SWIPE_IGNORED) || inSideScroller(target, e.currentTarget);
    swipeStart.current = ignored ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < SWIPE_SLOPE * Math.abs(dy)) return;
    // Swiping left brings in the next tab, as if pulling it from the right.
    const next = choices[choices.indexOf(current) + (dx < 0 ? 1 : -1)];
    if (next) choose(next);
  };

  const hasTabs = choices.length > 1;

  const slotProps = (key: PanelKey): { className: string; style?: React.CSSProperties; widthPct: number } => {
    if (key === left) return { className: 'split-slot split-left', style: { order: 0 }, widthPct: phone ? 100 : leftWidthPct };
    if (key === right) return { className: 'split-slot split-right hidden md:block', style: { order: 2 }, widthPct: 100 - leftWidthPct };
    return { className: 'hidden', widthPct: 0 };
  };

  return (
    <div className="space-y-2">
      {hasTabs && (
        <SegmentedTabs
          label="Home panels"
          tabs={choices.map(v => choiceTab(v, phone))}
          value={current}
          onChange={choose}
          idBase={TABS_ID}
          panelId={TABPANEL_ID}
        />
      )}

      <div
        ref={splitRef}
        id={TABPANEL_ID}
        role={hasTabs ? 'tabpanel' : undefined}
        aria-labelledby={hasTabs ? segmentedTabId(TABS_ID, current) : undefined}
        className="flex"
        style={{ ['--tasks-w' as string]: `${leftWidthPct}%` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {PANEL_ORDER.filter(key => mounted.includes(key) && available.includes(key)).map(key => {
          const { className, style, widthPct } = slotProps(key);
          return (
            <div key={key} data-panel={key} className={className} style={style}>
              {renderPanel(key, { widthPct })}
            </div>
          );
        })}
        <div className="hidden md:flex shrink-0" style={{ order: 1 }}>
          <DragHandle onMouseDown={onSplitterMouseDown} />
        </div>
      </div>
    </div>
  );
});

export default PanelCarousel;
